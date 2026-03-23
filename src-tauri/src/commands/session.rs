use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::sync::{watch, Mutex};

use crate::agent::checkpoint::{self, CheckpointInfo};
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

    let model_str = model.as_deref().unwrap_or("Qwen/Qwen2.5-72B-Instruct").to_string();
    let sc = success_criteria.as_deref().unwrap_or("");
    let ml = max_loops.unwrap_or(50);
    let (session_dir, meta) =
        session_dir::create_session_dir(&name, &template_path, &template.name, &question, &model_str, &working_dir, sc, ml)?;

    let api_key_clone = api_key.clone();
    let model_clone = model_str.clone();
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
            api_key: api_key_clone,
            model: model_clone,
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
    let api_key_clone = api_key.clone();
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
    let model_clone = meta.llm_model.clone();

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
            api_key: api_key_clone,
            model: model_clone,
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

/// List all checkpoints for a session.
#[tauri::command]
pub fn list_checkpoints(session_id: String) -> Result<Vec<CheckpointInfo>, String> {
    let entry = global_index::find_by_id(&session_id)?
        .ok_or_else(|| format!("Session not found: {}", session_id))?;
    let canvas_dir = PathBuf::from(&entry.path)
        .join(".autoresearch/canvases/main");
    Ok(checkpoint::list_checkpoints(&canvas_dir))
}

/// Branch from a checkpoint — create a new canvas directory and start a new session from that state.
#[tauri::command]
pub async fn branch_from_checkpoint(
    session_id: String,
    loop_index: u32,
    api_key: String,
    app: AppHandle,
) -> Result<SessionMeta, String> {
    let entry = global_index::find_by_id(&session_id)?
        .ok_or_else(|| format!("Session not found: {}", session_id))?;
    let wd = PathBuf::from(&entry.path);
    let dot_dir = wd.join(".autoresearch");
    let main_canvas_dir = dot_dir.join("canvases").join("main");

    // Load the checkpoint
    let cp = checkpoint::load_checkpoint(&main_canvas_dir, loop_index)?;

    // Find the next branch number
    let canvases_dir = dot_dir.join("canvases");
    let mut branch_num = 1u32;
    loop {
        let candidate = canvases_dir.join(format!("main-branch-{}", branch_num));
        if !candidate.exists() {
            break;
        }
        branch_num += 1;
    }
    let branch_dir = canvases_dir.join(format!("main-branch-{}", branch_num));

    // Create the branch directory structure
    std::fs::create_dir_all(branch_dir.join("loops"))
        .map_err(|e| format!("Failed to create branch dir: {}", e))?;

    // Write the checkpoint state as the branch's starting state
    let branch_canvas = cp.canvas_state;
    let branch_agent = cp.agent_state;
    let branch_session_state = state_writer::SessionState {
        canvas: branch_canvas.clone(),
        agent: branch_agent.clone(),
        chat_messages: Vec::new(),
    };
    state_writer::write_state(&branch_dir, &branch_session_state)?;

    // Read meta to get session info
    let meta_str = std::fs::read_to_string(dot_dir.join("meta.json"))
        .map_err(|e| format!("Failed to read meta.json: {}", e))?;
    let parent_meta: SessionMeta = serde_json::from_str(&meta_str)
        .map_err(|e| format!("Failed to parse meta.json: {}", e))?;

    // Read template
    let template_path = dot_dir.join("template.md");
    let template = parser::parse_template_file(&template_path)?;

    // Set up LLM client
    let api_key_clone = api_key.clone();
    let model_clone = parent_meta.llm_model.clone();
    let llm_client = LlmClient::new(api_key).with_model(parent_meta.llm_model.clone());

    let signal_queue = Arc::new(SignalQueue::new());
    let (control_tx, control_rx) = watch::channel(LoopControl::Run);

    let branch_id = format!("{}-branch-{}", session_id, branch_num);

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
            session_id: branch_id.clone(),
        });
    }

    let branch_meta = SessionMeta {
        id: branch_id,
        name: format!("{} (branch from loop {})", parent_meta.name, loop_index),
        template_name: parent_meta.template_name,
        created_at: chrono::Utc::now().to_rfc3339(),
        last_modified: chrono::Utc::now().to_rfc3339(),
        total_loops: branch_agent.current_loop,
        status: "running".to_string(),
        llm_provider: parent_meta.llm_provider,
        llm_model: parent_meta.llm_model,
        question: parent_meta.question.clone(),
        working_dir: parent_meta.working_dir.clone(),
        success_criteria: parent_meta.success_criteria.clone(),
        max_loops: parent_meta.max_loops,
    };

    let branch_meta_clone = branch_meta.clone();
    let session_name = branch_meta.name.clone();
    let question = parent_meta.question;
    let work_dir = PathBuf::from(&parent_meta.working_dir);
    let sc = parent_meta.success_criteria;
    let ml = parent_meta.max_loops;

    // Spawn the agent loop with checkpoint state
    let app_handle = app.clone();
    tokio::spawn(async move {
        let mut runner = SessionRunner {
            session_dir: branch_dir,
            session_name,
            template,
            canvas_state: branch_canvas,
            agent_state: branch_agent,
            llm_client,
            question,
            signal_queue,
            control_rx,
            working_dir: work_dir,
            max_loops: ml,
            success_criteria: sc,
            completion_count: 0,
            api_key: api_key_clone,
            model: model_clone,
        };

        if let Err(e) = runner.run_loop(&app_handle).await {
            tracing::error!("Branch agent loop ended with error: {}", e);
            let _ = tauri::Emitter::emit(&app_handle, "session-error", serde_json::json!({
                "error": e
            }));
        }
    });

    Ok(branch_meta_clone)
}

/// A canvas entry visible to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasEntry {
    pub id: String,
    pub label: String,
    #[serde(rename = "type")]
    pub canvas_type: String,
    pub status: String,
}

/// List all canvases for a session (main + any sub-agent canvases).
#[tauri::command]
pub fn list_canvases(session_id: String) -> Result<Vec<CanvasEntry>, String> {
    let entry = global_index::find_by_id(&session_id)?
        .ok_or_else(|| format!("Session not found: {}", session_id))?;
    let canvases_dir = PathBuf::from(&entry.path)
        .join(".autoresearch")
        .join("canvases");

    let mut entries = vec![CanvasEntry {
        id: "main".to_string(),
        label: "Main Research".to_string(),
        canvas_type: "main".to_string(),
        status: "active".to_string(),
    }];

    if let Ok(dirs) = std::fs::read_dir(&canvases_dir) {
        for dir_entry in dirs.flatten() {
            let name = dir_entry.file_name().to_string_lossy().to_string();
            if name == "main" {
                continue;
            }
            if dir_entry.path().is_dir() {
                let canvas_type = if name.starts_with("tool-") {
                    "tool"
                } else if name.contains("branch") {
                    "branch"
                } else {
                    "tool"
                };

                // Check state.json for status info
                let state_path = dir_entry.path().join("state.json");
                let status = if state_path.exists() { "ready" } else { "building" };

                entries.push(CanvasEntry {
                    id: name.clone(),
                    label: name.replace('-', " "),
                    canvas_type: canvas_type.to_string(),
                    status: status.to_string(),
                });
            }
        }
    }

    Ok(entries)
}

/// Get the canvas state for a specific canvas.
#[tauri::command]
pub fn get_canvas_state(session_id: String, canvas_id: String) -> Result<serde_json::Value, String> {
    let entry = global_index::find_by_id(&session_id)?
        .ok_or_else(|| format!("Session not found: {}", session_id))?;
    let state_path = PathBuf::from(&entry.path)
        .join(".autoresearch")
        .join("canvases")
        .join(&canvas_id)
        .join("state.json");

    if !state_path.exists() {
        return Ok(serde_json::json!({
            "canvas": { "nodes": [], "edges": [], "clusters": [] },
            "agent": { "current_loop": 0, "recent_history": [], "history_summary": "" },
            "chat_messages": []
        }));
    }

    let state_str = std::fs::read_to_string(&state_path)
        .map_err(|e| format!("Failed to read state.json: {}", e))?;
    let state: serde_json::Value = serde_json::from_str(&state_str)
        .map_err(|e| format!("Failed to parse state.json: {}", e))?;

    Ok(state)
}
