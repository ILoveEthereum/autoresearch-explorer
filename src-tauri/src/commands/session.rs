use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::sync::{watch, Mutex};

use crate::agent::runtime::{LoopControl, SessionRunner};
use crate::agent::signals::SignalQueue;
use crate::canvas::state::CanvasState;
use crate::llm::client::LlmClient;
use crate::storage::session_dir::{self, SessionMeta};
use crate::storage::global_index;
use crate::storage::state_writer::{self, AgentState};
use crate::template::parser;

/// Shared state for the active session, managed by Tauri.
pub struct AppState {
    pub active: Mutex<Option<ActiveSession>>,
}

pub struct ActiveSession {
    pub control_tx: watch::Sender<LoopControl>,
    pub signal_queue: Arc<SignalQueue>,
    pub session_id: String,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            active: Mutex::new(None),
        }
    }
}

#[tauri::command]
pub async fn create_session(
    name: String,
    template_path: String,
    question: String,
    api_key: String,
    model: Option<String>,
    working_dir: String,
    success_criteria: Option<String>,
    max_loops: Option<u32>,
    app: AppHandle,
) -> Result<SessionMeta, String> {
    let template_path = PathBuf::from(&template_path);
    let template = parser::parse_template_file(&template_path)?;

    let model_str = model.as_deref().unwrap_or("Qwen/Qwen2.5-72B-Instruct");
    let sc = success_criteria.as_deref().unwrap_or("");
    let ml = max_loops.unwrap_or(50);
    let (session_dir, meta) =
        session_dir::create_session_dir(&name, &template_path, &template.name, &question, model_str, &working_dir, sc, ml)?;

    let mut llm_client = LlmClient::new(api_key);
    if let Some(m) = model {
        llm_client = llm_client.with_model(m);
    }
    let signal_queue = Arc::new(SignalQueue::new());
    let (control_tx, control_rx) = watch::channel(LoopControl::Run);

    // Stop any existing session first
    {
        let state = app.state::<AppState>();
        let mut guard = state.active.lock().await;
        if let Some(old) = guard.take() {
            let _ = old.control_tx.send(LoopControl::Stop);
        }
        *guard = Some(ActiveSession {
            control_tx,
            signal_queue: signal_queue.clone(),
            session_id: meta.id.clone(),
        });
    }

    let meta_clone = meta.clone();
    let session_name = name.clone();
    let work_dir = PathBuf::from(&working_dir);
    let sc_owned = sc.to_string();

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
            working_dir: work_dir,
            max_loops: ml,
            success_criteria: sc_owned,
            completion_count: 0,
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
    let state = app.state::<AppState>();
    let guard = state.active.lock().await;
    if let Some(active) = guard.as_ref() {
        let _ = active.control_tx.send(LoopControl::Pause);
        Ok(())
    } else {
        Err("No active session".to_string())
    }
}

#[tauri::command]
pub async fn resume_session(app: AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let guard = state.active.lock().await;
    if let Some(active) = guard.as_ref() {
        let _ = active.control_tx.send(LoopControl::Run);
        Ok(())
    } else {
        Err("No active session".to_string())
    }
}

#[tauri::command]
pub async fn stop_session(app: AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut guard = state.active.lock().await;
    if let Some(active) = guard.take() {
        let _ = active.control_tx.send(LoopControl::Stop);
        Ok(())
    } else {
        Err("No active session".to_string())
    }
}

/// Get canvas operations for a specific loop.
#[tauri::command]
pub fn get_loop_ops(session_id: String, loop_index: u32) -> Result<serde_json::Value, String> {
    let entry = global_index::find_by_id(&session_id)?
        .ok_or_else(|| format!("Session not found: {}", session_id))?;
    let ops_path = PathBuf::from(&entry.path)
        .join(".autoresearch/canvases/main/loops")
        .join(format!("{:03}", loop_index))
        .join("canvas-ops.json");

    if !ops_path.exists() {
        return Ok(serde_json::json!([]));
    }

    let ops_str = std::fs::read_to_string(&ops_path)
        .map_err(|e| format!("Failed to read canvas-ops.json: {}", e))?;
    let ops: serde_json::Value = serde_json::from_str(&ops_str)
        .map_err(|e| format!("Failed to parse canvas-ops.json: {}", e))?;

    Ok(ops)
}

/// Load a saved session's canvas state (for viewing, not resuming the loop).
#[tauri::command]
pub fn load_session(session_id: String) -> Result<serde_json::Value, String> {
    let entry = global_index::find_by_id(&session_id)?
        .ok_or_else(|| format!("Session not found: {}", session_id))?;
    let state_path = PathBuf::from(&entry.path)
        .join(".autoresearch/canvases/main/state.json");

    if !state_path.exists() {
        return Err(format!("Session state not found: {}", session_id));
    }

    let state_str = std::fs::read_to_string(&state_path)
        .map_err(|e| format!("Failed to read state.json: {}", e))?;
    let state: serde_json::Value = serde_json::from_str(&state_str)
        .map_err(|e| format!("Failed to parse state.json: {}", e))?;

    Ok(state)
}

#[tauri::command]
pub fn list_sessions() -> Result<Vec<SessionMeta>, String> {
    let entries = global_index::read_index()?;
    let mut sessions = Vec::new();

    for entry in entries {
        let meta_path = PathBuf::from(&entry.path)
            .join(".autoresearch")
            .join("meta.json");
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

/// Resume a saved session — re-create the agent loop from saved state.
#[tauri::command]
pub async fn resume_saved_session(
    session_id: String,
    api_key: String,
    app: AppHandle,
) -> Result<SessionMeta, String> {
    let entry = global_index::find_by_id(&session_id)?
        .ok_or_else(|| format!("Session not found: {}", session_id))?;
    let wd = PathBuf::from(&entry.path);
    let dot_dir = wd.join(".autoresearch");
    let canvas_dir = dot_dir.join("canvases").join("main");

    if !dot_dir.exists() {
        return Err(format!("Session not found: {}", session_id));
    }

    // Read meta
    let meta_str = std::fs::read_to_string(dot_dir.join("meta.json"))
        .map_err(|e| format!("Failed to read meta.json: {}", e))?;
    let mut meta: session_dir::SessionMeta = serde_json::from_str(&meta_str)
        .map_err(|e| format!("Failed to parse meta.json: {}", e))?;

    // Read state
    let state_path = canvas_dir.join("state.json");
    let (canvas_state, agent_state) = if state_path.exists() {
        let state_str = std::fs::read_to_string(&state_path)
            .map_err(|e| format!("Failed to read state.json: {}", e))?;
        let state: state_writer::SessionState = serde_json::from_str(&state_str)
            .map_err(|e| format!("Failed to parse state.json: {}", e))?;
        (state.canvas, state.agent)
    } else {
        (CanvasState::default(), AgentState::default())
    };

    // Read template
    let template_path = dot_dir.join("template.md");
    let template = parser::parse_template_file(&template_path)?;

    // Set up LLM client
    let llm_client = LlmClient::new(api_key).with_model(meta.llm_model.clone());

    let signal_queue = Arc::new(SignalQueue::new());
    let (control_tx, control_rx) = watch::channel(LoopControl::Run);

    // Stop any existing session
    {
        let state = app.state::<AppState>();
        let mut guard = state.active.lock().await;
        if let Some(old) = guard.take() {
            let _ = old.control_tx.send(LoopControl::Stop);
        }
        *guard = Some(ActiveSession {
            control_tx,
            signal_queue: signal_queue.clone(),
            session_id: meta.id.clone(),
        });
    }

    // Update meta status
    meta.status = "running".to_string();
    meta.last_modified = chrono::Utc::now().to_rfc3339();
    let _ = session_dir::update_meta(&wd, &meta);

    let meta_clone = meta.clone();
    let session_name = meta.name.clone();
    let question = meta.question.clone();
    let work_dir = PathBuf::from(&meta.working_dir);
    let session_max_loops = meta.max_loops;
    let session_success_criteria = meta.success_criteria.clone();
    let session_dir_clone = canvas_dir.clone();

    // Spawn the agent loop
    let app_handle = app.clone();
    tokio::spawn(async move {
        let mut runner = SessionRunner {
            session_dir: session_dir_clone,
            session_name,
            template,
            canvas_state,
            agent_state,
            llm_client,
            question,
            signal_queue,
            control_rx,
            working_dir: work_dir,
            max_loops: session_max_loops,
            success_criteria: session_success_criteria,
            completion_count: 0,
        };

        if let Err(e) = runner.run_loop(&app_handle).await {
            tracing::error!("Resumed agent loop ended with error: {}", e);
            let _ = tauri::Emitter::emit(&app_handle, "session-error", serde_json::json!({
                "error": e
            }));
        }
    });

    Ok(meta_clone)
}
