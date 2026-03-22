use std::path::PathBuf;
use tauri::AppHandle;

use crate::agent::runtime;
use crate::canvas::state::CanvasState;
use crate::llm::client::LlmClient;
use crate::storage::session_dir::{self, SessionMeta};
use crate::storage::state_writer::AgentState;
use crate::template::parser;

#[tauri::command]
pub async fn create_session(
    name: String,
    template_path: String,
    question: String,
    api_key: String,
    app: AppHandle,
) -> Result<SessionMeta, String> {
    let template_path = PathBuf::from(&template_path);

    // Parse template to get its name
    let template = parser::parse_template_file(&template_path)?;

    // Create session directory
    let (session_dir, meta) =
        session_dir::create_session_dir(&name, &template_path, &template.name)?;

    // Run the first loop
    let llm_client = LlmClient::new(api_key);
    let mut canvas_state = CanvasState::default();
    let mut agent_state = AgentState::default();

    runtime::run_single_loop(
        &app,
        &session_dir,
        &template,
        &mut canvas_state,
        &mut agent_state,
        &llm_client,
        &question,
    )
    .await?;

    Ok(meta)
}

#[tauri::command]
pub fn list_sessions() -> Result<Vec<SessionMeta>, String> {
    let research = session_dir::research_dir();
    if !research.exists() {
        return Ok(vec![]);
    }

    let mut sessions = Vec::new();
    let entries = std::fs::read_dir(&research)
        .map_err(|e| format!("Failed to read research directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let meta_path = entry.path().join("meta.json");
        if meta_path.exists() {
            if let Ok(meta_str) = std::fs::read_to_string(&meta_path) {
                if let Ok(meta) = serde_json::from_str::<SessionMeta>(&meta_str) {
                    sessions.push(meta);
                }
            }
        }
    }

    sessions.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(sessions)
}
