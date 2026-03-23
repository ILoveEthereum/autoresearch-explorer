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

    // Scan app data dir tools/
    let global_tools = crate::storage::app_data_dir().join("tools");
    scan_tools_dir(&global_tools, &mut tools);

    // Scan {working_dir}/tools/
    if let Some(wd) = working_dir {
        let local_tools = PathBuf::from(&wd).join("tools");
        scan_tools_dir(&local_tools, &mut tools);
    }

    Ok(tools)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillDocEntry {
    pub name: String,
    pub path: String,
    pub created_at: String,
    pub times_used: u32,
}

/// List skill documents from the app data directory's skills/ folder.
#[tauri::command]
pub fn list_skill_docs() -> Result<Vec<SkillDocEntry>, String> {
    let skills_dir = crate::storage::app_data_dir().join("skills");
    if !skills_dir.exists() {
        return Ok(vec![]);
    }

    let mut docs = Vec::new();
    let entries = std::fs::read_dir(&skills_dir)
        .map_err(|e| format!("Failed to read skills dir: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("md") {
            let content = match std::fs::read_to_string(&path) {
                Ok(c) => c,
                Err(_) => continue,
            };

            let file_name = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("unknown")
                .to_string();

            // Try to parse frontmatter (simple YAML between --- markers)
            let mut name = file_name.clone();
            let mut created_at = String::new();
            let mut times_used: u32 = 0;

            if content.starts_with("---") {
                if let Some(end) = content[3..].find("---") {
                    let frontmatter = &content[3..3 + end];
                    for line in frontmatter.lines() {
                        let line = line.trim();
                        if let Some(val) = line.strip_prefix("name:") {
                            name = val.trim().trim_matches('"').to_string();
                        } else if let Some(val) = line.strip_prefix("created_at:") {
                            created_at = val.trim().trim_matches('"').to_string();
                        } else if let Some(val) = line.strip_prefix("times_used:") {
                            times_used = val.trim().parse().unwrap_or(0);
                        }
                    }
                }
            }

            // If no created_at from frontmatter, use file metadata
            if created_at.is_empty() {
                if let Ok(meta) = std::fs::metadata(&path) {
                    if let Ok(modified) = meta.modified() {
                        let datetime: chrono::DateTime<chrono::Utc> = modified.into();
                        created_at = datetime.to_rfc3339();
                    }
                }
            }

            docs.push(SkillDocEntry {
                name,
                path: path.to_string_lossy().to_string(),
                created_at,
                times_used,
            });
        }
    }

    // Sort by created_at descending
    docs.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    Ok(docs)
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
