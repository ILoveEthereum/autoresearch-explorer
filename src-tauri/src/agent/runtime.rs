use std::path::PathBuf;

use tauri::{AppHandle, Emitter};

use crate::canvas::state::CanvasState;
use crate::llm::client::LlmClient;
use crate::llm::context;
use crate::storage::loop_writer;
use crate::storage::session_dir;
use crate::storage::state_writer::{self, AgentState, LoopSummary, SessionState};
use crate::template::types::ParsedTemplate;

/// Run a single agent loop iteration.
pub async fn run_single_loop(
    app: &AppHandle,
    session_dir: &PathBuf,
    template: &ParsedTemplate,
    canvas_state: &mut CanvasState,
    agent_state: &mut AgentState,
    llm_client: &LlmClient,
    question: &str,
) -> Result<(), String> {
    let loop_index = agent_state.current_loop + 1;

    // Emit status: building context
    let _ = app.emit("agent-status", serde_json::json!({
        "status": "building_context",
        "loop": loop_index
    }));

    // Build prompts
    let system_prompt = context::build_system_prompt(template);
    let user_message = context::build_user_message(canvas_state, agent_state, question);

    // Emit status: calling LLM
    let _ = app.emit("agent-status", serde_json::json!({
        "status": "calling_llm",
        "loop": loop_index
    }));

    // Call LLM
    let (response, usage) = llm_client.call(&system_prompt, &user_message).await?;

    tracing::info!(
        "Loop {} complete. Plan: {}. Canvas ops: {}. Tokens: {:?}",
        loop_index,
        response.plan,
        response.canvas_operations.len(),
        usage.as_ref().map(|u| u.total_tokens)
    );

    // Apply canvas operations
    canvas_state.apply_ops(&response.canvas_operations, loop_index);

    // Emit canvas ops to frontend
    let _ = app.emit("canvas-ops", &response.canvas_operations);

    // Emit status: writing loop
    let _ = app.emit("agent-status", serde_json::json!({
        "status": "writing_loop",
        "loop": loop_index
    }));

    // Write loop files to disk
    loop_writer::write_loop(session_dir, loop_index, &response, &[])?;

    // Update agent state
    agent_state.current_loop = loop_index;
    agent_state.recent_history.push(LoopSummary {
        loop_index,
        plan: response.plan.clone(),
        outcome: format!(
            "{} canvas ops emitted",
            response.canvas_operations.len()
        ),
    });

    // Keep only last 5 in recent history
    if agent_state.recent_history.len() > 5 {
        let drained: Vec<_> = agent_state.recent_history.drain(..agent_state.recent_history.len() - 5).collect();
        for h in drained {
            agent_state.history_summary.push_str(&format!(
                "Loop {}: {} — {}\n",
                h.loop_index, h.plan, h.outcome
            ));
        }
    }

    // Save state.json
    let session_state = SessionState {
        canvas: canvas_state.clone(),
        agent: agent_state.clone(),
    };
    state_writer::write_state(session_dir, &session_state)?;

    // Update meta.json
    let meta_path = session_dir.join("meta.json");
    if let Ok(meta_str) = std::fs::read_to_string(&meta_path) {
        if let Ok(mut meta) = serde_json::from_str::<session_dir::SessionMeta>(&meta_str) {
            meta.total_loops = loop_index;
            meta.last_modified = chrono::Utc::now().to_rfc3339();
            meta.status = "running".to_string();
            let _ = session_dir::update_meta(session_dir, &meta);
        }
    }

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
