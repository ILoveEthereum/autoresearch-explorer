use crate::template::parser;
use crate::template::types::{ParsedTemplate, TemplateSummary};
use std::path::PathBuf;

/// Returns the directory where bundled templates are stored.
fn templates_dir() -> PathBuf {
    let mut dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    dir.push("templates");
    dir
}

#[tauri::command]
pub fn list_templates() -> Result<Vec<TemplateSummary>, String> {
    let dir = templates_dir();
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut templates = Vec::new();
    let entries = std::fs::read_dir(&dir)
        .map_err(|e| format!("Failed to read templates directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();

        if path.extension().and_then(|e| e.to_str()) == Some("md") {
            match parser::parse_template_file(&path) {
                Ok(template) => {
                    templates.push(TemplateSummary {
                        name: template.name,
                        domain: template.domain,
                        path: path.to_string_lossy().to_string(),
                    });
                }
                Err(e) => {
                    tracing::warn!("Skipping invalid template {:?}: {}", path, e);
                }
            }
        }
    }

    Ok(templates)
}

#[tauri::command]
pub fn parse_template(path: String) -> Result<ParsedTemplate, String> {
    let path = PathBuf::from(path);
    parser::parse_template_file(&path)
}
