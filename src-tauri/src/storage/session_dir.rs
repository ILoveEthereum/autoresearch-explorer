use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

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
    #[serde(default)]
    pub working_dir: Option<String>,
}

/// Get the research directory (project root / research /)
pub fn research_dir() -> PathBuf {
    let mut dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    dir.push("research");
    dir
}

/// Create a new session directory with all subdirectories.
pub fn create_session_dir(
    name: &str,
    template_path: &Path,
    template_name: &str,
    question: &str,
    model: &str,
    working_dir: Option<&str>,
) -> Result<(PathBuf, SessionMeta), String> {
    let session_id = format!(
        "{}-{}",
        slug(name),
        &uuid::Uuid::new_v4().to_string()[..8]
    );

    let dir = research_dir().join(&session_id);

    // Create directory structure
    std::fs::create_dir_all(dir.join("loops"))
        .map_err(|e| format!("Failed to create session directory: {}", e))?;
    std::fs::create_dir_all(dir.join("sources"))
        .map_err(|e| format!("Failed to create sources directory: {}", e))?;
    std::fs::create_dir_all(dir.join("artifacts"))
        .map_err(|e| format!("Failed to create artifacts directory: {}", e))?;

    // Copy template
    std::fs::copy(template_path, dir.join("template.md"))
        .map_err(|e| format!("Failed to copy template: {}", e))?;

    // Create meta.json
    let now = chrono::Utc::now().to_rfc3339();
    let meta = SessionMeta {
        id: session_id,
        name: name.to_string(),
        template_name: template_name.to_string(),
        created_at: now.clone(),
        last_modified: now,
        total_loops: 0,
        status: "created".to_string(),
        llm_provider: "openrouter".to_string(),
        llm_model: model.to_string(),
        question: question.to_string(),
        working_dir: working_dir.map(|s| s.to_string()),
    };

    let meta_json = serde_json::to_string_pretty(&meta)
        .map_err(|e| format!("Failed to serialize meta: {}", e))?;
    std::fs::write(dir.join("meta.json"), meta_json)
        .map_err(|e| format!("Failed to write meta.json: {}", e))?;

    // Create empty overview.md
    std::fs::write(
        dir.join("overview.md"),
        format!("# {} — Research Overview\n\n**Status:** Starting...\n", name),
    )
    .map_err(|e| format!("Failed to write overview.md: {}", e))?;

    Ok((dir, meta))
}

/// Update the meta.json file
pub fn update_meta(session_dir: &Path, meta: &SessionMeta) -> Result<(), String> {
    let meta_json = serde_json::to_string_pretty(meta)
        .map_err(|e| format!("Failed to serialize meta: {}", e))?;
    std::fs::write(session_dir.join("meta.json"), meta_json)
        .map_err(|e| format!("Failed to write meta.json: {}", e))?;
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
