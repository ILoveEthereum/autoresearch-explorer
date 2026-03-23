use std::path::Path;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::canvas::state::CanvasState;
use crate::llm::client::LlmClient;
use crate::storage::{loop_writer, state_writer};
use crate::storage::state_writer::{AgentState, SessionState};
use crate::tools::registry::ToolRegistry;

use super::tool_builder;

/// Configuration for spawning a sub-agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubAgentConfig {
    /// Unique id, e.g. "tool-arxiv-scraper"
    pub id: String,
    /// Human label, e.g. "Build: arxiv_scraper"
    pub label: String,
    /// The prompt describing what to build
    pub prompt: String,
    /// Maximum number of loops (default 20)
    pub max_loops: u32,
}

/// Spawn a sub-agent that runs in its own canvas directory.
///
/// The sub-agent gets its own SessionRunner-like loop with an independent
/// canvas state, loop counter, and agent state. It emits events prefixed
/// with the canvas id so the frontend can route them.
pub async fn spawn_sub_agent(
    config: SubAgentConfig,
    working_dir: &Path,
    api_key: &str,
    model: &str,
    app: &AppHandle,
) -> Result<(), String> {
    let canvas_dir = working_dir
        .join("autoresearch")
        .join("canvases")
        .join(&config.id);

    std::fs::create_dir_all(canvas_dir.join("loops"))
        .map_err(|e| format!("Failed to create sub-agent canvas dir: {}", e))?;

    // Emit spawned event so frontend adds the canvas entry
    let _ = app.emit(
        "sub-agent-spawned",
        serde_json::json!({
            "canvas_id": config.id,
            "label": config.label,
            "status": "building",
        }),
    );

    let config_clone = config.clone();
    let working_dir = working_dir.to_path_buf();
    let api_key = api_key.to_string();
    let model = model.to_string();
    let app_handle = app.clone();

    tokio::spawn(async move {
        let result = run_sub_agent_loop(
            &config_clone,
            &canvas_dir,
            &working_dir,
            &api_key,
            &model,
            &app_handle,
        )
        .await;

        let status = match &result {
            Ok(_) => "ready",
            Err(_) => "failed",
        };

        let _ = app_handle.emit(
            "sub-agent-completed",
            serde_json::json!({
                "canvas_id": config_clone.id,
                "label": config_clone.label,
                "status": status,
                "error": result.as_ref().err().map(|e| e.to_string()),
            }),
        );

        if let Err(e) = result {
            tracing::error!("Sub-agent '{}' failed: {}", config_clone.id, e);
        }
    });

    Ok(())
}

/// The inner loop for a sub-agent. Similar to SessionRunner::run_loop but
/// simplified — no watchdog, no pause/resume, no signals, no overview.
async fn run_sub_agent_loop(
    config: &SubAgentConfig,
    canvas_dir: &Path,
    working_dir: &Path,
    api_key: &str,
    model: &str,
    app: &AppHandle,
) -> Result<(), String> {
    let llm_client = LlmClient::new(api_key.to_string()).with_model(model.to_string());

    // Load or create a simple template for tool-building
    let tool_prompt = tool_builder::build_tool_prompt(&config.prompt, &working_dir.display().to_string());

    let mut canvas_state = CanvasState::default();
    let mut agent_state = AgentState::default();

    // Add an initial node to the sub-agent canvas
    let init_node = crate::canvas::state::StoredNode {
        id: "tool-goal".to_string(),
        node_type: "question".to_string(),
        title: config.label.clone(),
        summary: config.prompt.clone(),
        status: "active".to_string(),
        fields: std::collections::HashMap::new(),
        cluster: None,
        created_at: chrono::Utc::now().to_rfc3339(),
        loop_index: Some(0),
    };
    canvas_state.nodes.push(init_node);

    let canvas_id = &config.id;

    for loop_index in 1..=config.max_loops {
        // Emit status with canvas_id
        let _ = app.emit(
            "canvas-agent-status",
            serde_json::json!({
                "canvas_id": canvas_id,
                "status": "calling_llm",
                "loop": loop_index,
            }),
        );

        // Build context
        let system_prompt = tool_prompt.clone();
        let user_message = build_sub_agent_user_message(&canvas_state, &agent_state);

        // Call LLM
        let (mut response, _usage) = llm_client.call(&system_prompt, &user_message).await?;

        tracing::info!(
            "Sub-agent '{}' loop {} — Plan: {}. Tool calls: {}. Canvas ops: {}",
            canvas_id,
            loop_index,
            response.plan,
            response.tool_calls.len(),
            response.canvas_operations.len(),
        );

        // Execute tools
        let mut tool_results_text = Vec::new();
        if !response.tool_calls.is_empty() {
            let tool_registry =
                ToolRegistry::new(canvas_dir.to_path_buf(), Some(working_dir.to_path_buf()));

            for tc in &response.tool_calls {
                tracing::info!("Sub-agent '{}' executing tool: {}", canvas_id, tc.tool);
                let result = tool_registry.execute(&tc.tool, &tc.input).await;

                tool_results_text.push(format!(
                    "Tool: {}\nSuccess: {}\nOutput:\n{}\n{}",
                    tc.tool,
                    result.success,
                    result.output,
                    result.error.as_ref().map(|e| format!("Error: {}", e)).unwrap_or_default()
                ));
            }

            // Second LLM call with tool results
            let followup_message = format!(
                "{}\n\n== TOOL RESULTS ==\n{}\n\nBased on these tool results, take your next action. Write files, run tests, update the canvas.",
                user_message,
                tool_results_text.join("\n---\n")
            );

            match llm_client.call(&system_prompt, &followup_message).await {
                Ok((followup_response, _)) => {
                    // Execute followup tools
                    if !followup_response.tool_calls.is_empty() {
                        for tc in &followup_response.tool_calls {
                            let result = tool_registry.execute(&tc.tool, &tc.input).await;
                            tool_results_text.push(format!(
                                "Tool: {}\nSuccess: {}\nOutput:\n{}\n{}",
                                tc.tool, result.success, result.output,
                                result.error.as_ref().map(|e| format!("Error: {}", e)).unwrap_or_default()
                            ));
                        }
                    }
                    response.canvas_operations.extend(followup_response.canvas_operations);
                    response.reasoning = format!(
                        "{}\n\n[After tools]\n{}",
                        response.reasoning, followup_response.reasoning
                    );
                }
                Err(e) => {
                    tracing::warn!("Sub-agent followup call failed: {}", e);
                }
            }
        }

        // Apply canvas operations
        canvas_state.apply_ops(&response.canvas_operations, loop_index);

        // Emit canvas ops for the sub-agent canvas.
        // Only apply to the frontend if this canvas is active.
        let _ = app.emit(
            "sub-agent-canvas-ops",
            serde_json::json!({
                "canvas_id": canvas_id,
                "ops": &response.canvas_operations,
            }),
        );

        // Write loop files
        let _ = loop_writer::write_loop(canvas_dir, loop_index, &response, &tool_results_text);

        // Update agent state
        agent_state.current_loop = loop_index;
        agent_state.recent_history.push(state_writer::LoopSummary {
            loop_index,
            plan: response.plan.clone(),
            outcome: format!("{} canvas ops emitted", response.canvas_operations.len()),
        });

        if agent_state.recent_history.len() > 5 {
            let drained: Vec<_> = agent_state
                .recent_history
                .drain(..agent_state.recent_history.len() - 5)
                .collect();
            for h in drained {
                agent_state.history_summary.push_str(&format!(
                    "Loop {}: {} — {}\n",
                    h.loop_index, h.plan, h.outcome
                ));
            }
        }

        // Save state
        let session_state = SessionState {
            canvas: canvas_state.clone(),
            agent: agent_state.clone(),
            chat_messages: Vec::new(),
        };
        let _ = state_writer::write_state(canvas_dir, &session_state);

        // Emit loop completed with canvas_id
        let _ = app.emit(
            "canvas-loop-completed",
            serde_json::json!({
                "canvas_id": canvas_id,
                "loop": loop_index,
                "plan": response.plan,
            }),
        );

        // Check if the agent indicates completion (plan contains "complete" or similar)
        let plan_lower = response.plan.to_lowercase();
        if plan_lower.contains("tests pass") || plan_lower.contains("tool is complete") || plan_lower.contains("work is complete") {
            tracing::info!("Sub-agent '{}' self-reported completion at loop {}", canvas_id, loop_index);
            break;
        }

        // Small delay
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }

    Ok(())
}

/// Build a simplified user message for the sub-agent loop.
fn build_sub_agent_user_message(canvas_state: &CanvasState, agent_state: &AgentState) -> String {
    let mut msg = String::new();

    msg.push_str("== CURRENT STATE ==\n");
    msg.push_str(&format!("Loop: {}\n", agent_state.current_loop));
    msg.push_str(&format!("Nodes: {}\n", canvas_state.nodes.len()));

    if !agent_state.history_summary.is_empty() {
        msg.push_str("\n== PAST WORK ==\n");
        msg.push_str(&agent_state.history_summary);
    }

    if !agent_state.recent_history.is_empty() {
        msg.push_str("\n== RECENT LOOPS ==\n");
        for h in &agent_state.recent_history {
            msg.push_str(&format!("Loop {}: {} — {}\n", h.loop_index, h.plan, h.outcome));
        }
    }

    msg.push_str("\n== CANVAS STATE ==\n");
    for node in &canvas_state.nodes {
        msg.push_str(&format!(
            "- [{}] {} ({}): {}\n",
            node.node_type, node.title, node.status, node.summary
        ));
    }

    msg.push_str("\nWhat should you do next? Respond with JSON containing plan, reasoning, tool_calls, and canvas_operations.");
    msg
}
