use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::sync::watch;

use crate::agent::runtime::{LoopControl, SessionRunner};
use crate::agent::signals::SignalQueue;
use crate::canvas::state::CanvasState;
use crate::llm::client::LlmClient;
use crate::storage::session_dir::{self, SessionMeta};
use crate::storage::state_writer::AgentState;
use crate::template::parser;

/// Shared state managed by Tauri for the active session.
pub struct ActiveSession {
    pub control_tx: watch::Sender<LoopControl>,
    pub signal_queue: Arc<SignalQueue>,
    pub session_id: String,
}

#[tauri::command]
pub async fn create_session(
    name: String,
    template_path: String,
    question: String,
    api_key: String,
    app: AppHandle,
) -> Result<SessionMeta, String> {
    let template_path = PathBuf::from(&template_path);
    let template = parser::parse_template_file(&template_path)?;

    let (session_dir, meta) =
        session_dir::create_session_dir(&name, &template_path, &template.name)?;

    let llm_client = LlmClient::new(api_key);
    let signal_queue = Arc::new(SignalQueue::new());
    let (control_tx, control_rx) = watch::channel(LoopControl::Run);

    // Store the active session state in Tauri's managed state
    let active = ActiveSession {
        control_tx,
        signal_queue: signal_queue.clone(),
        session_id: meta.id.clone(),
    };

    // Replace any existing active session
    app.manage(Arc::new(tokio::sync::Mutex::new(Some(active))));

    let meta_clone = meta.clone();
    let session_name = name.clone();

    // Spawn the continuous loop in a background task
    let app_handle = app.clone();
    tokio::spawn(async move {
        let mut runner = SessionRunner {
            session_dir,
            session_name,
            template,
            canvas_state: CanvasState::default(),
            agent_state: AgentState::default(),
            llm_client,
            question,
            signal_queue,
            control_rx,
        };

        if let Err(e) = runner.run_loop(&app_handle).await {
            tracing::error!("Agent loop ended with error: {}", e);
            let _ = tauri::Emitter::emit(&app_handle, "session-error", serde_json::json!({
                "error": e
            }));
        }
    });

    Ok(meta_clone)
}

#[tauri::command]
pub async fn pause_session(app: AppHandle) -> Result<(), String> {
    if let Some(state) = app.try_state::<Arc<tokio::sync::Mutex<Option<ActiveSession>>>>() {
        let guard = state.lock().await;
        if let Some(active) = guard.as_ref() {
            let _ = active.control_tx.send(LoopControl::Pause);
            return Ok(());
        }
    }
    Err("No active session".to_string())
}

#[tauri::command]
pub async fn resume_session(app: AppHandle) -> Result<(), String> {
    if let Some(state) = app.try_state::<Arc<tokio::sync::Mutex<Option<ActiveSession>>>>() {
        let guard = state.lock().await;
        if let Some(active) = guard.as_ref() {
            let _ = active.control_tx.send(LoopControl::Run);
            return Ok(());
        }
    }
    Err("No active session".to_string())
}

#[tauri::command]
pub async fn stop_session(app: AppHandle) -> Result<(), String> {
    if let Some(state) = app.try_state::<Arc<tokio::sync::Mutex<Option<ActiveSession>>>>() {
        let mut guard = state.lock().await;
        if let Some(active) = guard.take() {
            let _ = active.control_tx.send(LoopControl::Stop);
            return Ok(());
        }
    }
    Err("No active session".to_string())
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
