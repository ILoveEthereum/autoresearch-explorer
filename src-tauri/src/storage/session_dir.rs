use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use super::global_index::{self, SessionEntry};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionMeta {
    pub id: String,
    pub name: String,
    pub template_name: String,
    pub created_at: String,
    pub last_modified: String,
    pub total_loops: u32,
    pub status: String,
    pub llm_provider: String,
    pub llm_model: String,
    #[serde(default)]
    pub question: String,
    /// The user-chosen working directory — this IS the session root.
    pub working_dir: String,
    #[serde(default)]
    pub success_criteria: String,
    #[serde(default = "default_max_loops")]
    pub max_loops: u32,
}

fn default_max_loops() -> u32 {
    50
}

/// Create a new session inside `working_dir`.
///
/// Directory layout:
///   {working_dir}/.autoresearch/meta.json
///   {working_dir}/.autoresearch/canvases/main/loops/
///   {working_dir}/.autoresearch/canvases/main/state.json
///   {working_dir}/.autoresearch/chat.json
///   {working_dir}/.autoresearch/sources/
///   {working_dir}/overview.md
pub fn create_session_dir(
    name: &str,
    template_path: &Path,
    template_name: &str,
    question: &str,
    model: &str,
    working_dir: &str,
    success_criteria: &str,
    max_loops: u32,
) -> Result<(PathBuf, SessionMeta), String> {
    let session_id = format!(
        "{}-{}",
        slug(name),
        &uuid::Uuid::new_v4().to_string()[..8]
    );

    let wd = PathBuf::from(working_dir);
    let dot_dir = wd.join(".autoresearch");
    let canvas_dir = dot_dir.join("canvases").join("main");

    // Create directory structure
    std::fs::create_dir_all(canvas_dir.join("loops"))
        .map_err(|e| format!("Failed to create session directory: {}", e))?;
    std::fs::create_dir_all(dot_dir.join("sources"))
        .map_err(|e| format!("Failed to create sources directory: {}", e))?;

    // Copy template
    std::fs::copy(template_path, dot_dir.join("template.md"))
        .map_err(|e| format!("Failed to copy template: {}", e))?;

    // Create empty state.json
    std::fs::write(canvas_dir.join("state.json"), "{}")
        .map_err(|e| format!("Failed to write initial state.json: {}", e))?;

    // Create empty chat.json
    std::fs::write(dot_dir.join("chat.json"), "[]")
        .map_err(|e| format!("Failed to write initial chat.json: {}", e))?;

    // Create meta.json
    let now = chrono::Utc::now().to_rfc3339();
    let meta = SessionMeta {
        id: session_id,
        name: name.to_string(),
        template_name: template_name.to_string(),
        created_at: now.clone(),
        last_modified: now.clone(),
        total_loops: 0,
        status: "created".to_string(),
        llm_provider: "openrouter".to_string(),
        llm_model: model.to_string(),
        question: question.to_string(),
        working_dir: working_dir.to_string(),
        success_criteria: success_criteria.to_string(),
        max_loops,
    };

    let meta_json = serde_json::to_string_pretty(&meta)
        .map_err(|e| format!("Failed to serialize meta: {}", e))?;
    std::fs::write(dot_dir.join("meta.json"), meta_json)
        .map_err(|e| format!("Failed to write meta.json: {}", e))?;

    // Create overview.md in the working dir root (visible to user)
    std::fs::write(
        wd.join("overview.md"),
        format!("# {} — Research Overview\n\n**Status:** Starting...\n", name),
    )
    .map_err(|e| format!("Failed to write overview.md: {}", e))?;

    // Register in global index
    global_index::add_to_index(SessionEntry {
        id: meta.id.clone(),
        name: meta.name.clone(),
        path: working_dir.to_string(),
        last_modified: now,
        status: "created".to_string(),
        llm_model: model.to_string(),
        question: question.to_string(),
    })?;

    // Return the internal session dir (.autoresearch/canvases/main/)
    Ok((canvas_dir, meta))
}

/// Update the meta.json file inside .autoresearch/
pub fn update_meta(working_dir: &Path, meta: &SessionMeta) -> Result<(), String> {
    let meta_path = working_dir.join(".autoresearch").join("meta.json");
    let meta_json = serde_json::to_string_pretty(meta)
        .map_err(|e| format!("Failed to serialize meta: {}", e))?;
    std::fs::write(&meta_path, meta_json)
        .map_err(|e| format!("Failed to write meta.json: {}", e))?;

    // Also update the global index
    let _ = global_index::update_in_index(
        &meta.id,
        Some(&meta.status),
        Some(&meta.last_modified),
    );

    Ok(())
}

fn slug(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}
