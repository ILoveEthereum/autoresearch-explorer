use super::registry::ToolResult;
use std::path::Path;

/// Read a file from the working directory.
/// If working_dir is a custom directory, files are read directly from it.
/// If it's a session directory, files are read from artifacts/.
pub fn read_file(path: &str, working_dir: &Path) -> ToolResult {
    let full_path = working_dir.join(path);

    match std::fs::read_to_string(&full_path) {
        Ok(content) => ToolResult {
            success: true,
            output: content,
            error: None,
        },
        Err(e) => ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("Failed to read file '{}': {}", full_path.display(), e)),
        },
    }
}

/// Write a file to the working directory.
pub fn write_file(path: &str, content: &str, working_dir: &Path) -> ToolResult {
    let full_path = working_dir.join(path);

    // Create parent directories if needed
    if let Some(parent) = full_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    match std::fs::write(&full_path, content) {
        Ok(()) => ToolResult {
            success: true,
            output: format!("Written {} bytes to {}", content.len(), full_path.display()),
            error: None,
        },
        Err(e) => ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("Failed to write file '{}': {}", full_path.display(), e)),
        },
    }
}

/// List files in the working directory.
pub fn list_files(path: &str, working_dir: &Path) -> ToolResult {
    let target = if path.is_empty() {
        working_dir.to_path_buf()
    } else {
        working_dir.join(path)
    };

    match std::fs::read_dir(&target) {
        Ok(entries) => {
            let mut files = Vec::new();
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                let meta = entry.metadata().ok();
                let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
                let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
                if is_dir {
                    files.push(format!("  {}/ (dir)", name));
                } else {
                    files.push(format!("  {} ({} bytes)", name, size));
                }
            }
            if files.is_empty() {
                files.push("  (empty directory)".to_string());
            }
            ToolResult {
                success: true,
                output: format!("Contents of {}:\n{}", target.display(), files.join("\n")),
                error: None,
            }
        }
        Err(e) => ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("Failed to list '{}': {}", target.display(), e)),
        },
    }
}
