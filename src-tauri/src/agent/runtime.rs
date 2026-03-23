use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::watch;

use tauri::{AppHandle, Emitter};

use crate::canvas::state::CanvasState;
use crate::llm::client::LlmClient;
use crate::llm::context;
use crate::memory;
use crate::storage::{loop_writer, overview_writer, session_dir};
use crate::storage::state_writer::{self, AgentState, LoopSummary, SessionState};
use crate::template::types::ParsedTemplate;
use crate::tools::registry::ToolRegistry;

use crate::telegram::bot::TelegramBot;

use super::checkpoint;
use super::signals::SignalQueue;
use super::sub_agent::{self, SubAgentConfig};
use super::watchdog::{self, LoopSnapshot, WatchdogVerdict};

/// Control commands sent to the agent loop.
#[derive(Debug, Clone, PartialEq)]
pub enum LoopControl {
    Run,
    Pause,
    Stop,
}

/// All the state needed by a running agent session.
pub struct SessionRunner {
    pub session_id: String,
    pub session_dir: PathBuf,
    pub session_name: String,
    pub template: ParsedTemplate,
    pub canvas_state: CanvasState,
    pub agent_state: AgentState,
    pub llm_client: LlmClient,
    pub question: String,
    pub signal_queue: Arc<SignalQueue>,
    pub control_rx: watch::Receiver<LoopControl>,
    /// The user-chosen working directory — this IS the session root.
    pub working_dir: PathBuf,
    /// Maximum number of loops (0 = unlimited).
    pub max_loops: u32,
    /// Success criteria for watchdog completion detection.
    pub success_criteria: String,
    /// Consecutive "phase_complete" verdicts from the watchdog.
    pub completion_count: u32,
    /// API key for creating sub-agent LLM clients.
    pub api_key: String,
    /// Model name for creating sub-agent LLM clients.
    pub model: String,
    /// Skill doc paths from past sessions to inject as context.
    pub past_experience: Vec<String>,
    /// Consecutive loops where the agent's reasoning mentions completion.
    pub completion_mentions: u32,
    /// Last loop's reasoning text, used for repeated-completion detection.
    pub last_reasoning: String,
    /// Optional Telegram bot for remote notifications and control.
    pub telegram: Option<Arc<TelegramBot>>,
}

impl SessionRunner {
    /// Run the continuous agent loop. This blocks until stopped or an error occurs.
    pub async fn run_loop(&mut self, app: &AppHandle) -> Result<(), String> {
        // Give the frontend time to set up event listeners
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        tracing::info!("Agent loop starting for session: {}", self.session_name);

        loop {
            // 1. Check control signal
            let control = self.control_rx.borrow().clone();
            match control {
                LoopControl::Stop => {
                    let _ = app.emit("agent-status", serde_json::json!({
                        "status": "stopped",
                        "loop": self.agent_state.current_loop
                    }));
                    break;
                }
                LoopControl::Pause => {
                    let _ = app.emit("agent-status", serde_json::json!({
                        "status": "paused",
                        "loop": self.agent_state.current_loop
                    }));
                    // Wait for control to change
                    let mut rx = self.control_rx.clone();
                    loop {
                        if rx.changed().await.is_err() {
                            return Ok(()); // channel closed
                        }
                        let new_control = rx.borrow().clone();
                        if new_control != LoopControl::Pause {
                            break;
                        }
                    }
                    continue; // Re-check control (might be Stop or Run)
                }
                LoopControl::Run => {
                    // Continue to execute a loop iteration
                }
            }

            // 2. Execute one loop iteration
            if let Err(e) = self.run_single_loop(app).await {
                let _ = app.emit("session-error", serde_json::json!({
                    "error": e,
                    "loop": self.agent_state.current_loop
                }));
                tracing::error!("Loop {} failed: {}", self.agent_state.current_loop + 1, e);
                // Don't stop on error — pause and let the user decide
                let _ = app.emit("agent-status", serde_json::json!({
                    "status": "error",
                    "loop": self.agent_state.current_loop
                }));
                // Wait a bit before retrying to avoid tight error loops
                tokio::time::sleep(std::time::Duration::from_secs(3)).await;
            }

            // 2b. Check if agent keeps saying it's done
            {
                let reasoning_lower = self.last_reasoning.to_lowercase();
                if reasoning_lower.contains("completed")
                    || reasoning_lower.contains("finished")
                    || reasoning_lower.contains("ready for use")
                {
                    self.completion_mentions += 1;
                } else {
                    self.completion_mentions = 0;
                }

                if self.completion_mentions >= 3 {
                    tracing::info!(
                        "Agent mentioned completion 3 times in a row — auto-stopping"
                    );
                    let _ = app.emit(
                        "session-completed",
                        serde_json::json!({
                            "reason": "Agent repeatedly stated work is complete"
                        }),
                    );
                    break;
                }
            }

            // 3. Watchdog evaluation every 3 loops
            let current = self.agent_state.current_loop;
            if current > 0 && current % 3 == 0 {
                let snapshots = self.build_loop_snapshots();
                match watchdog::evaluate(
                    &self.llm_client,
                    &self.canvas_state,
                    &snapshots,
                    &self.success_criteria,
                    current,
                )
                .await
                {
                    Ok(verdict) => {
                        tracing::info!("Watchdog verdict at loop {}: {:?}", current, verdict);

                        let _ = app.emit(
                            "watchdog-verdict",
                            serde_json::json!({
                                "loop": current,
                                "verdict": serde_json::to_value(&verdict).unwrap_or_default()
                            }),
                        );

                        // Save checkpoint before corrective action
                        match &verdict {
                            WatchdogVerdict::Progressing | WatchdogVerdict::PhaseComplete { .. } => {}
                            _ => {
                                match checkpoint::save_checkpoint(
                                    &self.session_dir,
                                    current,
                                    &self.canvas_state,
                                    &self.agent_state,
                                    &verdict,
                                ) {
                                    Ok(path) => {
                                        tracing::info!("Checkpoint saved at loop {}: {:?}", current, path);

                                        // Add a checkpoint node to the canvas
                                        let cp_node = crate::canvas::state::StoredNode {
                                            id: format!("checkpoint-{}", current),
                                            node_type: "checkpoint".to_string(),
                                            title: format!("Checkpoint @ Loop {}", current),
                                            summary: format!("Watchdog: {:?}", verdict),
                                            status: "checkpoint".to_string(),
                                            fields: std::collections::HashMap::new(),
                                            cluster: None,
                                            created_at: chrono::Utc::now().to_rfc3339(),
                                            loop_index: Some(current),
                                        };
                                        self.canvas_state.nodes.push(cp_node);

                                        let _ = app.emit("checkpoint-created", serde_json::json!({
                                            "loop_index": current,
                                            "verdict": serde_json::to_value(&verdict).unwrap_or_default(),
                                        }));
                                    }
                                    Err(e) => {
                                        tracing::warn!("Failed to save checkpoint: {}", e);
                                    }
                                }
                            }
                        }

                        match &verdict {
                            WatchdogVerdict::PhaseComplete { reason } => {
                                self.completion_count += 1;
                                if self.completion_count >= 2 {
                                    // Telegram: notify completion
                                    if let Some(tg) = &self.telegram {
                                        if tg.config().notify_on_complete {
                                            tg.send_completion(&self.session_name, reason).await;
                                        }
                                    }
                                    let _ = app.emit(
                                        "session-completed",
                                        serde_json::json!({ "reason": reason }),
                                    );
                                    break;
                                }
                            }
                            WatchdogVerdict::StuckLooping { repeated_action } => {
                                self.agent_state.replan_hint = Some(format!(
                                    "WATCHDOG ALERT: You've been repeating '{}'. Try a completely different approach.",
                                    repeated_action
                                ));
                                self.completion_count = 0;
                            }
                            WatchdogVerdict::StuckNoInfo { ref description } => {
                                self.agent_state.replan_hint = Some(
                                    "WATCHDOG ALERT: You appear stuck. Try a different strategy or tool.".to_string(),
                                );
                                self.completion_count = 0;

                                // Attempt to spawn a tool-builder sub-agent
                                self.maybe_spawn_tool_builder(
                                    app,
                                    &format!("Agent is stuck: {}. Build a tool that can help.", description),
                                ).await;
                            }
                            WatchdogVerdict::StuckCodeError { ref error } => {
                                self.agent_state.replan_hint = Some(
                                    "WATCHDOG ALERT: You appear stuck. Try a different strategy or tool.".to_string(),
                                );
                                self.completion_count = 0;

                                // Attempt to spawn a tool-builder sub-agent
                                self.maybe_spawn_tool_builder(
                                    app,
                                    &format!("Agent is stuck on code error: {}. Build a tool to solve this.", error),
                                ).await;
                            }
                            WatchdogVerdict::NeedsHuman { question } => {
                                // Telegram: notify stuck/needs human
                                if let Some(tg) = &self.telegram {
                                    if tg.config().notify_on_stuck {
                                        tg.send_stuck(&self.session_name, question).await;
                                    }
                                }
                                let _ = app.emit(
                                    "chat-message",
                                    serde_json::json!({
                                        "from": "watchdog",
                                        "text": question
                                    }),
                                );
                                self.completion_count = 0;
                            }
                            _ => {
                                self.completion_count = 0;
                            }
                        }
                    }
                    Err(e) => tracing::warn!("Watchdog error: {}", e),
                }
            }

            // Check max_loops stop condition (0 = unlimited)
            if self.max_loops > 0 && self.agent_state.current_loop >= self.max_loops {
                tracing::info!(
                    "Reached max_loops limit ({}) — stopping",
                    self.max_loops
                );
                let _ = app.emit("agent-status", serde_json::json!({
                    "status": "stopped",
                    "loop": self.agent_state.current_loop,
                    "reason": "max_loops_reached"
                }));
                break;
            }

            // Small delay between loops to avoid hammering the API
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }

        // Generate skill doc on session end
        self.generate_and_save_skill_doc().await;

        Ok(())
    }

    /// Generate a skill document and save it to the memory database.
    async fn generate_and_save_skill_doc(&self) {
        tracing::info!("Generating skill document for session: {}", self.session_name);

        let skill_result = memory::skill_doc::generate_skill_doc(
            &self.llm_client,
            &self.session_name,
            &self.question,
            &self.canvas_state,
        )
        .await;

        match skill_result {
            Ok((skill_doc, summary)) => {
                // Save skill doc to ~/.autoresearch/skills/{slug}.md
                let home = dirs_next::home_dir().unwrap_or_default();
                let skills_dir = home.join(".autoresearch").join("skills");
                let _ = std::fs::create_dir_all(&skills_dir);
                let slug = self
                    .session_name
                    .to_lowercase()
                    .replace(|c: char| !c.is_alphanumeric(), "-");
                let skill_path = skills_dir.join(format!("{}.md", slug));
                let _ = std::fs::write(&skill_path, &skill_doc);

                // Add to memory database
                if let Ok(db) = memory::database::MemoryDb::open() {
                    let entry = memory::database::MemoryEntry {
                        id: self.session_id.clone(),
                        name: self.session_name.clone(),
                        question: self.question.clone(),
                        summary,
                        skill_doc_path: Some(skill_path.to_string_lossy().to_string()),
                        created_at: chrono::Utc::now().to_rfc3339(),
                    };
                    if let Err(e) = db.add_session(&entry) {
                        tracing::warn!("Failed to add session to memory DB: {}", e);
                    } else {
                        tracing::info!("Skill doc saved and indexed for session: {}", self.session_name);
                    }
                } else {
                    tracing::warn!("Failed to open memory database");
                }
            }
            Err(e) => {
                tracing::warn!("Failed to generate skill doc: {}", e);
            }
        }
    }

    /// Build loop snapshots from recent history for the watchdog.
    fn build_loop_snapshots(&self) -> Vec<LoopSnapshot> {
        self.agent_state
            .recent_history
            .iter()
            .map(|h| LoopSnapshot {
                loop_index: h.loop_index,
                plan: h.plan.clone(),
                tools_called: Vec::new(), // Tool names aren't stored in LoopSummary
                canvas_ops_count: 0,      // Not tracked in LoopSummary; plan/outcome suffice
            })
            .collect()
    }

    /// Ask the LLM what tool would help, then spawn a sub-agent to build it.
    async fn maybe_spawn_tool_builder(&self, app: &AppHandle, context: &str) {
        // Quick LLM call to determine what tool is needed
        let prompt = format!(
            r#"A research agent is stuck. Context: {}

Suggest a specific tool that could help. Reply with ONLY valid JSON:
{{"tool_name": "snake_case_name", "description": "one line description of what the tool should do"}}

If no specific tool would help, reply: {{"tool_name": "none", "description": "none"}}"#,
            context
        );

        let tool_suggestion = match self
            .llm_client
            .call_raw_with_max_tokens(&prompt, 150)
            .await
        {
            Ok(text) => text,
            Err(e) => {
                tracing::warn!("Failed to get tool suggestion: {}", e);
                return;
            }
        };

        // Parse the suggestion
        let suggestion: serde_json::Value = match serde_json::from_str(
            tool_suggestion
                .trim()
                .trim_start_matches("```json")
                .trim_start_matches("```")
                .trim_end_matches("```")
                .trim(),
        ) {
            Ok(v) => v,
            Err(_) => {
                tracing::warn!("Could not parse tool suggestion: {}", tool_suggestion);
                return;
            }
        };

        let tool_name = suggestion
            .get("tool_name")
            .and_then(|v| v.as_str())
            .unwrap_or("none");

        if tool_name == "none" {
            tracing::info!("Watchdog: no tool suggestion for stuck agent");
            return;
        }

        let description = suggestion
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let sub_id = format!("tool-{}", tool_name);

        // Check if this sub-agent canvas already exists
        let canvas_dir = self
            .working_dir
            .join("autoresearch")
            .join("canvases")
            .join(&sub_id);
        if canvas_dir.exists() {
            tracing::info!("Sub-agent '{}' already exists, skipping spawn", sub_id);
            return;
        }

        let config = SubAgentConfig {
            id: sub_id.clone(),
            label: format!("Build: {}", tool_name),
            prompt: description.to_string(),
            max_loops: 20,
        };

        // Add a tool-building node to the main canvas
        let tb_node = crate::canvas::state::StoredNode {
            id: format!("sub-agent-{}", tool_name),
            node_type: "finding".to_string(),
            title: format!("Tool Builder: {}", tool_name),
            summary: format!("Sub-agent building tool: {}", description),
            status: "active".to_string(),
            fields: {
                let mut f = std::collections::HashMap::new();
                f.insert(
                    "sub_agent_id".to_string(),
                    serde_json::Value::String(sub_id),
                );
                f
            },
            cluster: None,
            created_at: chrono::Utc::now().to_rfc3339(),
            loop_index: Some(self.agent_state.current_loop),
        };

        // We can't mutate self.canvas_state here since we only have &self,
        // so we just emit the node as a canvas op for the frontend
        let _ = app.emit(
            "canvas-ops",
            serde_json::json!([{
                "op": "ADD_NODE",
                "node": {
                    "id": tb_node.id,
                    "type": tb_node.node_type,
                    "title": tb_node.title,
                    "summary": tb_node.summary,
                    "status": tb_node.status,
                    "fields": tb_node.fields,
                }
            }]),
        );

        if let Err(e) = sub_agent::spawn_sub_agent(
            config,
            &self.working_dir,
            &self.api_key,
            &self.model,
            app,
        )
        .await
        {
            tracing::error!("Failed to spawn sub-agent: {}", e);
        }
    }

    /// Run a single agent loop iteration.
    async fn run_single_loop(&mut self, app: &AppHandle) -> Result<(), String> {
        let loop_index = self.agent_state.current_loop + 1;

        // Collect human signals
        let signals = self.signal_queue.drain();

        // Emit status
        let _ = app.emit("agent-status", serde_json::json!({
            "status": "building_context",
            "loop": loop_index
        }));

        // Build prompts — include any custom node types the agent has defined
        let custom_types: Vec<_> = self.canvas_state.node_types.iter()
            .filter(|nt| !self.template.canvas.node_types.contains_key(&nt.type_name))
            .cloned()
            .collect();
        let system_prompt = context::build_system_prompt_full(
            &self.template,
            Some(self.working_dir.as_path()),
            &self.past_experience,
            &custom_types,
        );
        let user_message = context::build_user_message_with_signals(
            &self.canvas_state,
            &self.agent_state,
            &self.question,
            &signals,
        );

        // Consume the replan hint after it has been included in the user message
        self.agent_state.replan_hint = None;

        // Call LLM
        let _ = app.emit("agent-status", serde_json::json!({
            "status": "calling_llm",
            "loop": loop_index
        }));

        let (mut response, usage) = self.llm_client.call(&system_prompt, &user_message).await?;

        tracing::info!(
            "Loop {} — Plan: {}. Tool calls: {}. Canvas ops: {}. Tokens: {:?}",
            loop_index,
            response.plan,
            response.tool_calls.len(),
            response.canvas_operations.len(),
            usage.as_ref().map(|u| u.total_tokens)
        );

        // Execute tools if any were called
        let mut tool_results_text = Vec::new();
        if !response.tool_calls.is_empty() {
            let tool_registry = ToolRegistry::new(self.session_dir.clone(), Some(self.working_dir.clone()));

            for tc in &response.tool_calls {
                let _ = app.emit("agent-status", serde_json::json!({
                    "status": format!("executing_{}", tc.tool),
                    "loop": loop_index,
                    "tool": tc.tool
                }));

                tracing::info!("Executing tool: {}", tc.tool);
                let result = tool_registry.execute(&tc.tool, &tc.input).await;
                tracing::info!("Tool {} result: success={}, output_len={}", tc.tool, result.success, result.output.len());

                tool_results_text.push(format!(
                    "Tool: {}\nSuccess: {}\nOutput:\n{}\n{}",
                    tc.tool,
                    result.success,
                    result.output,
                    result.error.as_ref().map(|e| format!("Error: {}", e)).unwrap_or_default()
                ));
            }

            // Second LLM call with tool results
            let _ = app.emit("agent-status", serde_json::json!({
                "status": "calling_llm",
                "loop": loop_index,
                "phase": "tool_results"
            }));

            let followup_message = format!(
                "{}\n\n== TOOL RESULTS ==\n{}\n\nBased on these tool results, you MUST now take action. If the directory is empty, use file_write to create code files. If you found information, use file_write to save it. You can call more tools now (file_write, code_executor, etc). Update the canvas with your findings.",
                user_message,
                tool_results_text.join("\n---\n")
            );

            match self.llm_client.call(&system_prompt, &followup_message).await {
                Ok((followup_response, _)) => {
                    // Execute any additional tool calls from the followup
                    if !followup_response.tool_calls.is_empty() {
                        for tc in &followup_response.tool_calls {
                            tracing::info!("Executing followup tool: {}", tc.tool);
                            let result = tool_registry.execute(&tc.tool, &tc.input).await;
                            tracing::info!("Followup tool {} result: success={}, output_len={}", tc.tool, result.success, result.output.len());
                            tool_results_text.push(format!(
                                "Tool: {}\nSuccess: {}\nOutput:\n{}\n{}",
                                tc.tool, result.success, result.output,
                                result.error.as_ref().map(|e| format!("Error: {}", e)).unwrap_or_default()
                            ));
                        }
                    }
                    // Merge canvas operations from both calls
                    response.canvas_operations.extend(followup_response.canvas_operations);
                    response.reasoning = format!("{}\n\n[After tools]\n{}", response.reasoning, followup_response.reasoning);
                    if followup_response.chat_message.is_some() {
                        response.chat_message = followup_response.chat_message;
                    }
                }
                Err(e) => {
                    tracing::warn!("Second LLM call failed: {}", e);
                    // Continue with the first response's canvas ops
                }
            }
        }

        // Store reasoning for repeated-completion detection
        self.last_reasoning = response.reasoning.clone();

        // Apply canvas operations
        self.canvas_state.apply_ops(&response.canvas_operations, loop_index);

        // Emit canvas ops to frontend
        let _ = app.emit("canvas-ops", &response.canvas_operations);

        // Write loop files
        let _ = app.emit("agent-status", serde_json::json!({
            "status": "writing_loop",
            "loop": loop_index
        }));
        loop_writer::write_loop(&self.session_dir, loop_index, &response, &tool_results_text)?;

        // Update agent state
        self.agent_state.current_loop = loop_index;
        self.agent_state.recent_history.push(LoopSummary {
            loop_index,
            plan: response.plan.clone(),
            outcome: format!("{} canvas ops emitted", response.canvas_operations.len()),
        });

        // Keep only last 5 in recent history
        if self.agent_state.recent_history.len() > 5 {
            let drained: Vec<_> = self.agent_state.recent_history
                .drain(..self.agent_state.recent_history.len() - 5)
                .collect();
            for h in drained {
                self.agent_state.history_summary.push_str(&format!(
                    "Loop {}: {} — {}\n", h.loop_index, h.plan, h.outcome
                ));
            }
        }

        // Save state.json
        let session_state = SessionState {
            canvas: self.canvas_state.clone(),
            agent: self.agent_state.clone(),
            chat_messages: Vec::new(),
        };
        state_writer::write_state(&self.session_dir, &session_state)?;

        // Update meta.json
        let meta_path = self.working_dir.join("autoresearch").join("meta.json");
        if let Ok(meta_str) = std::fs::read_to_string(&meta_path) {
            if let Ok(mut meta) = serde_json::from_str::<session_dir::SessionMeta>(&meta_str) {
                meta.total_loops = loop_index;
                meta.last_modified = chrono::Utc::now().to_rfc3339();
                meta.status = "running".to_string();
                let _ = session_dir::update_meta(&self.working_dir, &meta);
            }
        }

        // Update overview.md
        let _ = app.emit("agent-status", serde_json::json!({
            "status": "updating_overview",
            "loop": loop_index
        }));
        let overview_path = self.working_dir.join("overview.md");
        let _ = overview_writer::update_overview(
            &self.session_dir,
            &overview_path,
            loop_index,
            &self.session_name,
            &self.llm_client,
        ).await;
        let _ = app.emit("overview-updated", serde_json::json!({
            "path": overview_path.to_string_lossy()
        }));

        // Emit loop completed
        let _ = app.emit("loop-completed", serde_json::json!({
            "loop": loop_index,
            "plan": response.plan,
            "canvas_ops_count": response.canvas_operations.len(),
        }));

        // Telegram: periodic progress notification
        if let Some(tg) = &self.telegram {
            let every = tg.config().notify_every_n_loops;
            if every > 0 && loop_index % every == 0 {
                let summary = format!(
                    "Plan: {}\nCanvas: {} nodes, {} edges\n{} canvas ops this loop",
                    response.plan,
                    self.canvas_state.nodes.len(),
                    self.canvas_state.edges.len(),
                    response.canvas_operations.len()
                );
                tg.send_progress(&self.session_name, loop_index, &summary).await;
            }
        }

        // Emit chat message if present
        if let Some(msg) = &response.chat_message {
            let _ = app.emit("chat-message", serde_json::json!({
                "from": "agent",
                "text": msg
            }));
        }

        // Emit idle
        let _ = app.emit("agent-status", serde_json::json!({
            "status": "idle",
            "loop": loop_index
        }));

        Ok(())
    }
}
