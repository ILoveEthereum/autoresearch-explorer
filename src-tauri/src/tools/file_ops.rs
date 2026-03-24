use super::registry::ToolResult;
use std::path::Path;

/// Validate that a resolved path is safely within the working directory.
/// Blocks path traversal via `..`, absolute paths, and symlinks that escape.
fn validate_path(path: &str, working_dir: &Path) -> Result<std::path::PathBuf, String> {
    // Block absolute paths
    if path.starts_with('/') || path.starts_with('\\') {
        return Err(format!(
            "Absolute paths are not allowed: '{}'",
            path
        ));
    }

    // Block explicit .. traversal in the raw input
    if path.contains("..") {
        return Err(format!(
            "Path traversal ('..') is not allowed: '{}'",
            path
        ));
    }

    let joined = working_dir.join(path);

    // Canonicalize the working directory (must exist)
    let canonical_working_dir = working_dir.canonicalize().map_err(|e| {
        format!(
            "Failed to resolve working directory '{}': {}",
            working_dir.display(),
            e
        )
    })?;

    // For read/list operations the target must exist, so canonicalize it.
    // For write operations the target may not exist yet, so we canonicalize
    // the nearest existing ancestor and then re-append the remaining segments.
    let canonical_path = if joined.exists() {
        joined.canonicalize().map_err(|e| {
            format!("Failed to resolve path '{}': {}", joined.display(), e)
        })?
    } else {
        // Walk up to find the nearest existing ancestor
        let mut existing = joined.clone();
        let mut remaining = Vec::new();
        while !existing.exists() {
            if let Some(file_name) = existing.file_name() {
                remaining.push(file_name.to_os_string());
            }
            match existing.parent() {
                Some(parent) => existing = parent.to_path_buf(),
                None => break,
            }
        }
        let mut canonical = existing.canonicalize().map_err(|e| {
            format!("Failed to resolve path '{}': {}", joined.display(), e)
        })?;
        for segment in remaining.into_iter().rev() {
            canonical.push(segment);
        }
        canonical
    };

    // Verify the resolved path starts with the working directory
    if !canonical_path.starts_with(&canonical_working_dir) {
        return Err(format!(
            "Access denied: path '{}' resolves outside the working directory",
            path
        ));
    }

    Ok(canonical_path)
}

/// Read a file from the working directory.
/// If working_dir is a custom directory, files are read directly from it.
/// If it's a session directory, files are read from artifacts/.
pub fn read_file(path: &str, working_dir: &Path) -> ToolResult {
    let full_path = match validate_path(path, working_dir) {
        Ok(p) => p,
        Err(e) => {
            return ToolResult {
                success: false,
                output: String::new(),
                error: Some(e),
            };
        }
    };

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
    let full_path = match validate_path(path, working_dir) {
        Ok(p) => p,
        Err(e) => {
            return ToolResult {
                success: false,
                output: String::new(),
                error: Some(e),
            };
        }
    };

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
        match working_dir.canonicalize() {
            Ok(p) => p,
            Err(e) => {
                return ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(format!("Failed to resolve working directory: {}", e)),
                };
            }
        }
    } else {
        match validate_path(path, working_dir) {
            Ok(p) => p,
            Err(e) => {
                return ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(e),
                };
            }
        }
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
