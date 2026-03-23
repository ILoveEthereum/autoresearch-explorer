use crate::canvas::state::CanvasState;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedChatMessage {
    pub id: String,
    pub from: String,  // "user", "agent", "system"
    pub text: String,
    #[serde(default)]
    pub referenced_nodes: Vec<String>,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionState {
    pub canvas: CanvasState,
    pub agent: AgentState,
    #[serde(default)]
    pub chat_messages: Vec<SavedChatMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentState {
    pub current_loop: u32,
    pub recent_history: Vec<LoopSummary>,
    pub history_summary: String,
    pub focus_node_id: Option<String>,
    /// Injected by the watchdog when the agent appears stuck.
    /// Consumed (set to None) after being appended to the next user message.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub replan_hint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoopSummary {
    pub loop_index: u32,
    pub plan: String,
    pub outcome: String,
}

impl Default for AgentState {
    fn default() -> Self {
        Self {
            current_loop: 0,
            recent_history: Vec::new(),
            history_summary: String::new(),
            focus_node_id: None,
            replan_hint: None,
        }
    }
}

pub fn write_state(session_dir: &Path, state: &SessionState) -> Result<(), String> {
    let json = serde_json::to_string_pretty(state)
        .map_err(|e| format!("Failed to serialize state: {}", e))?;
    std::fs::write(session_dir.join("state.json"), json)
        .map_err(|e| format!("Failed to write state.json: {}", e))?;
    Ok(())
}
