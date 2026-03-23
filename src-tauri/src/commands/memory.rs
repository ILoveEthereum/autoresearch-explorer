use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::memory::database::{MemoryDb, MemoryEntry};

/// Search the memory database for past sessions matching a query.
#[tauri::command]
pub fn search_memory(query: String) -> Result<Vec<MemoryEntry>, String> {
    if query.trim().is_empty() {
        // Return recent sessions if no query
        let db = MemoryDb::open()?;
        return Ok(db.list_all(20));
    }
    let db = MemoryDb::open()?;
    Ok(db.search(&query, 20))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolManifest {
    pub name: String,
    pub description: String,
    pub path: String,
}

/// List available custom tools from ~/.autoresearch/tools/ and {working_dir}/tools/.
#[tauri::command]
pub fn list_available_tools(working_dir: Option<String>) -> Result<Vec<ToolManifest>, String> {
    let mut tools = Vec::new();

    // Scan ~/.autoresearch/tools/
    if let Some(home) = dirs_next::home_dir() {
        let global_tools = home.join(".autoresearch").join("tools");
        scan_tools_dir(&global_tools, &mut tools);
    }

    // Scan {working_dir}/tools/
    if let Some(wd) = working_dir {
        let local_tools = PathBuf::from(&wd).join("tools");
        scan_tools_dir(&local_tools, &mut tools);
    }

    Ok(tools)
}

fn scan_tools_dir(dir: &PathBuf, tools: &mut Vec<ToolManifest>) {
    if !dir.exists() {
        return;
    }

    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            // Look for a manifest.json or tool.json inside
            let dir_name = entry.file_name().to_string_lossy().to_string();
            let manifest_path = path.join("manifest.json");
            if manifest_path.exists() {
                if let Ok(content) = std::fs::read_to_string(&manifest_path) {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                        tools.push(ToolManifest {
                            name: val
                                .get("name")
                                .and_then(|v| v.as_str())
                                .unwrap_or(&dir_name)
                                .to_string(),
                            description: val
                                .get("description")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            path: path.to_string_lossy().to_string(),
                        });
                    }
                }
            } else {
                // No manifest, use directory name
                tools.push(ToolManifest {
                    name: dir_name.clone(),
                    description: format!("Custom tool: {}", dir_name),
                    path: path.to_string_lossy().to_string(),
                });
            }
        }
    }
}
