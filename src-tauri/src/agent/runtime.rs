use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::watch;

use tauri::{AppHandle, Emitter};

use crate::canvas::state::CanvasState;
use crate::llm::client::LlmClient;
use crate::llm::context;
use crate::storage::{loop_writer, overview_writer, session_dir};
use crate::storage::state_writer::{self, AgentState, LoopSummary, SessionState};
use crate::template::types::ParsedTemplate;
use crate::tools::registry::ToolRegistry;

use super::signals::SignalQueue;

/// Control commands sent to the agent loop.
#[derive(Debug, Clone, PartialEq)]
pub enum LoopControl {
    Run,
    Pause,
    Stop,
}

/// All the state needed by a running agent session.
pub struct SessionRunner {
    pub session_dir: PathBuf,
    pub session_name: String,
    pub template: ParsedTemplate,
    pub canvas_state: CanvasState,
    pub agent_state: AgentState,
    pub llm_client: LlmClient,
    pub question: String,
    pub signal_queue: Arc<SignalQueue>,
    pub control_rx: watch::Receiver<LoopControl>,
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

            // Small delay between loops to avoid hammering the API
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }

        Ok(())
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

        // Build prompts
        let system_prompt = context::build_system_prompt(&self.template);
        let user_message = context::build_user_message_with_signals(
            &self.canvas_state,
            &self.agent_state,
            &self.question,
            &signals,
        );

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
            let tool_registry = ToolRegistry::new(self.session_dir.clone());

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
                "{}\n\n== TOOL RESULTS ==\n{}\n\nBased on these tool results, update the canvas with your findings. Create appropriate nodes and edges.",
                user_message,
                tool_results_text.join("\n---\n")
            );

            match self.llm_client.call(&system_prompt, &followup_message).await {
                Ok((followup_response, _)) => {
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
        };
        state_writer::write_state(&self.session_dir, &session_state)?;

        // Update meta.json
        let meta_path = self.session_dir.join("meta.json");
        if let Ok(meta_str) = std::fs::read_to_string(&meta_path) {
            if let Ok(mut meta) = serde_json::from_str::<session_dir::SessionMeta>(&meta_str) {
                meta.total_loops = loop_index;
                meta.last_modified = chrono::Utc::now().to_rfc3339();
                meta.status = "running".to_string();
                let _ = session_dir::update_meta(&self.session_dir, &meta);
            }
        }

        // Update overview.md
        let _ = app.emit("agent-status", serde_json::json!({
            "status": "updating_overview",
            "loop": loop_index
        }));
        let _ = overview_writer::update_overview(
            &self.session_dir,
            loop_index,
            &self.session_name,
            &self.llm_client,
        ).await;
        let _ = app.emit("overview-updated", serde_json::json!({
            "path": self.session_dir.join("overview.md").to_string_lossy()
        }));

        // Emit loop completed
        let _ = app.emit("loop-completed", serde_json::json!({
            "loop": loop_index,
            "plan": response.plan,
            "canvas_ops_count": response.canvas_operations.len(),
        }));

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
