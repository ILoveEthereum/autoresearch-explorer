use super::registry::ToolResult;
use std::path::Path;

/// Read a file from the session's artifacts directory.
pub fn read_file(path: &str, session_dir: &Path) -> ToolResult {
    let full_path = session_dir.join("artifacts").join(path);

    // Security: ensure the path doesn't escape the artifacts directory
    if !full_path.starts_with(session_dir.join("artifacts")) {
        return ToolResult {
            success: false,
            output: String::new(),
            error: Some("Path traversal not allowed".to_string()),
        };
    }

    match std::fs::read_to_string(&full_path) {
        Ok(content) => ToolResult {
            success: true,
            output: content,
            error: None,
        },
        Err(e) => ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("Failed to read file: {}", e)),
        },
    }
}

/// Write a file to the session's artifacts directory.
pub fn write_file(path: &str, content: &str, session_dir: &Path) -> ToolResult {
    let full_path = session_dir.join("artifacts").join(path);

    // Security: ensure the path doesn't escape the artifacts directory
    if !full_path.starts_with(session_dir.join("artifacts")) {
        return ToolResult {
            success: false,
            output: String::new(),
            error: Some("Path traversal not allowed".to_string()),
        };
    }

    // Create parent directories if needed
    if let Some(parent) = full_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    match std::fs::write(&full_path, content) {
        Ok(()) => ToolResult {
            success: true,
            output: format!("Written {} bytes to {}", content.len(), path),
            error: None,
        },
        Err(e) => ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("Failed to write file: {}", e)),
        },
    }
}
