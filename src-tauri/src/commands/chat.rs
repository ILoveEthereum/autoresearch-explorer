use tauri::{AppHandle, Manager};

use crate::agent::signals::HumanSignal;
use crate::commands::session::AppState;

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
