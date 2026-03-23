use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionEntry {
    pub id: String,
    pub name: String,
    /// The working directory path — this IS the session root.
    pub path: String,
    pub last_modified: String,
    pub status: String,
    pub llm_model: String,
    #[serde(default)]
    pub question: String,
}

/// Returns the path to sessions.json in the app data directory.
pub fn index_path() -> Result<PathBuf, String> {
    let dir = super::app_data_dir();
    Ok(dir.join("sessions.json"))
}

/// Read the global session index. Returns empty vec if file doesn't exist.
pub fn read_index() -> Result<Vec<SessionEntry>, String> {
    let path = index_path()?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let data = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read sessions.json: {}", e))?;
    let entries: Vec<SessionEntry> = serde_json::from_str(&data)
        .map_err(|e| format!("Failed to parse sessions.json: {}", e))?;
    Ok(entries)
}

/// Write the full index back to disk.
fn write_index(entries: &[SessionEntry]) -> Result<(), String> {
    let path = index_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create app data dir: {}", e))?;
    }
    let json = serde_json::to_string_pretty(entries)
        .map_err(|e| format!("Failed to serialize sessions index: {}", e))?;
    std::fs::write(&path, json)
        .map_err(|e| format!("Failed to write sessions.json: {}", e))?;
    Ok(())
}

/// Add or update an entry in the index (dedup by id).
pub fn add_to_index(entry: SessionEntry) -> Result<(), String> {
    let mut entries = read_index()?;
    // Remove existing entry with same id
    entries.retain(|e| e.id != entry.id);
    entries.insert(0, entry);
    write_index(&entries)
}

/// Update fields for an existing entry by id.
pub fn update_in_index(
    id: &str,
    status: Option<&str>,
    last_modified: Option<&str>,
) -> Result<(), String> {
    let mut entries = read_index()?;
    if let Some(entry) = entries.iter_mut().find(|e| e.id == id) {
        if let Some(s) = status {
            entry.status = s.to_string();
        }
        if let Some(lm) = last_modified {
            entry.last_modified = lm.to_string();
        }
    }
    write_index(&entries)
}

/// Look up a session entry by id.
pub fn find_by_id(id: &str) -> Result<Option<SessionEntry>, String> {
    let entries = read_index()?;
    Ok(entries.into_iter().find(|e| e.id == id))
}
