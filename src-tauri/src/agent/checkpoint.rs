use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::canvas::state::CanvasState;
use crate::storage::state_writer::AgentState;

use super::watchdog::WatchdogVerdict;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckpointInfo {
    pub loop_index: u32,
    pub created_at: String,
    pub verdict: WatchdogVerdict,
    pub node_count: usize,
    pub edge_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Checkpoint {
    pub info: CheckpointInfo,
    pub canvas_state: CanvasState,
    pub agent_state: AgentState,
}

/// Save a checkpoint before the watchdog takes corrective action.
pub fn save_checkpoint(
    canvas_dir: &Path,
    loop_index: u32,
    canvas_state: &CanvasState,
    agent_state: &AgentState,
    verdict: &WatchdogVerdict,
) -> Result<PathBuf, String> {
    let checkpoint_dir = canvas_dir.join("checkpoints");
    std::fs::create_dir_all(&checkpoint_dir)
        .map_err(|e| format!("Failed to create checkpoints dir: {}", e))?;

    let path = checkpoint_dir.join(format!("loop-{:06}.json", loop_index));

    let checkpoint = Checkpoint {
        info: CheckpointInfo {
            loop_index,
            created_at: chrono::Utc::now().to_rfc3339(),
            verdict: verdict.clone(),
            node_count: canvas_state.nodes.len(),
            edge_count: canvas_state.edges.len(),
        },
        canvas_state: canvas_state.clone(),
        agent_state: agent_state.clone(),
    };

    let json = serde_json::to_string_pretty(&checkpoint)
        .map_err(|e| format!("Failed to serialize checkpoint: {}", e))?;
    std::fs::write(&path, json)
        .map_err(|e| format!("Failed to write checkpoint: {}", e))?;

    Ok(path)
}

/// List all checkpoints for a canvas.
pub fn list_checkpoints(canvas_dir: &Path) -> Vec<CheckpointInfo> {
    let checkpoint_dir = canvas_dir.join("checkpoints");
    if !checkpoint_dir.exists() {
        return vec![];
    }

    let mut infos = vec![];
    if let Ok(entries) = std::fs::read_dir(&checkpoint_dir) {
        for entry in entries.flatten() {
            if let Ok(content) = std::fs::read_to_string(entry.path()) {
                if let Ok(cp) = serde_json::from_str::<Checkpoint>(&content) {
                    infos.push(cp.info);
                }
            }
        }
    }
    infos.sort_by_key(|i| i.loop_index);
    infos
}

/// Load a full checkpoint.
pub fn load_checkpoint(canvas_dir: &Path, loop_index: u32) -> Result<Checkpoint, String> {
    let path = canvas_dir
        .join("checkpoints")
        .join(format!("loop-{:06}.json", loop_index));
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read checkpoint: {}", e))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse checkpoint: {}", e))
}
