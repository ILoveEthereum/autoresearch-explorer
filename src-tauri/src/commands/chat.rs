use tauri::{AppHandle, Manager};

use std::path::PathBuf;

use crate::agent::signals::HumanSignal;
use crate::commands::session::AppState;
use crate::storage::global_index;

#[tauri::command]
pub async fn send_chat(
    text: String,
    referenced_nodes: Vec<String>,
    app: AppHandle,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let guard = state.active.lock().await;
    if let Some(active) = guard.as_ref() {
        active.signal_queue.push(HumanSignal::Chat {
            text,
            referenced_nodes,
        });
        Ok(())
    } else {
        Err("No active session".to_string())
    }
}

/// Save chat messages to chat.json in the session directory.
#[tauri::command]
pub fn save_chat(session_id: String, messages: serde_json::Value) -> Result<(), String> {
    let entry = global_index::find_by_id(&session_id)?
        .ok_or_else(|| format!("Session not found: {}", session_id))?;
    let chat_path = PathBuf::from(&entry.path).join("autoresearch/chat.json");
    let json = serde_json::to_string_pretty(&messages)
        .map_err(|e| format!("Failed to serialize chat: {}", e))?;
    std::fs::write(&chat_path, json)
        .map_err(|e| format!("Failed to write chat.json: {}", e))?;
    Ok(())
}

/// Load chat messages from chat.json in the session directory.
#[tauri::command]
pub fn load_chat(session_id: String) -> Result<serde_json::Value, String> {
    let entry = global_index::find_by_id(&session_id)?
        .ok_or_else(|| format!("Session not found: {}", session_id))?;
    let chat_path = PathBuf::from(&entry.path).join("autoresearch/chat.json");
    if !chat_path.exists() {
        return Ok(serde_json::json!([]));
    }
    let json_str = std::fs::read_to_string(&chat_path)
        .map_err(|e| format!("Failed to read chat.json: {}", e))?;
    let messages: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse chat.json: {}", e))?;
    Ok(messages)
}

#[tauri::command]
pub async fn send_signal(
    signal_type: String,
    node_id: Option<String>,
    text: Option<String>,
    from_id: Option<String>,
    to_id: Option<String>,
    app: AppHandle,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let guard = state.active.lock().await;
    let active = guard.as_ref().ok_or("No active session")?;

    let signal = match signal_type.as_str() {
        "prioritize" => HumanSignal::Prioritize {
            node_id: node_id.ok_or("node_id required for prioritize")?,
        },
        "deprioritize" => HumanSignal::Deprioritize {
            node_id: node_id.ok_or("node_id required for deprioritize")?,
        },
        "challenge" => HumanSignal::Challenge {
            node_id: node_id.ok_or("node_id required for challenge")?,
        },
        "annotate" => HumanSignal::Annotate {
            text: text.ok_or("text required for annotate")?,
            near_node_id: node_id.ok_or("node_id required for annotate")?,
        },
        "investigate" => HumanSignal::Investigate {
            from_id: from_id.ok_or("from_id required for investigate")?,
            to_id: to_id.ok_or("to_id required for investigate")?,
        },
        _ => return Err(format!("Unknown signal type: {}", signal_type)),
    };

    active.signal_queue.push(signal);
    Ok(())
}
