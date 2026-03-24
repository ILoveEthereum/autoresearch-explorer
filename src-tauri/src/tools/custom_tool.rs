use super::registry::ToolResult;
use std::path::Path;

/// Execute a custom tool defined by a manifest file.
///
/// Searches for the tool in:
/// 1. `{working_dir}/tools/{tool_name}/manifest.json`
/// 2. `~/.autoresearch/tools/{tool_name}/manifest.json`
///
/// The manifest should contain:
/// ```json
/// {"name": "...", "command": "python tool.py", "description": "..."}
/// ```
pub async fn execute_custom_tool(
    tool_name: &str,
    input: &serde_json::Value,
    working_dir: &Path,
) -> ToolResult {
    if tool_name.is_empty() {
        return ToolResult {
            success: false,
            output: String::new(),
            error: Some("Empty tool name".to_string()),
        };
    }

    // Search for the manifest in both locations
    let local_manifest = working_dir.join("tools").join(tool_name).join("manifest.json");
    let global_manifest = dirs_next::home_dir()
        .map(|h| h.join(".autoresearch").join("tools").join(tool_name).join("manifest.json"));

    let (manifest_path, tool_dir) = if local_manifest.exists() {
        (local_manifest.clone(), working_dir.join("tools").join(tool_name))
    } else if let Some(ref gm) = global_manifest {
        if gm.exists() {
            (gm.clone(), gm.parent().unwrap().to_path_buf())
        } else {
            return ToolResult {
                success: false,
                output: String::new(),
                error: Some(format!(
                    "Custom tool '{}' not found. Searched:\n  - {}\n  - {}",
                    tool_name,
                    local_manifest.display(),
                    global_manifest.as_ref().map(|p| p.display().to_string()).unwrap_or_default()
                )),
            };
        }
    } else {
        return ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!(
                "Custom tool '{}' not found at {}",
                tool_name,
                local_manifest.display()
            )),
        };
    };

    // Read and parse manifest
    let manifest_str = match std::fs::read_to_string(&manifest_path) {
        Ok(s) => s,
        Err(e) => {
            return ToolResult {
                success: false,
                output: String::new(),
                error: Some(format!("Failed to read manifest: {}", e)),
            };
        }
    };

    let manifest: serde_json::Value = match serde_json::from_str(&manifest_str) {
        Ok(v) => v,
        Err(e) => {
            return ToolResult {
                success: false,
                output: String::new(),
                error: Some(format!("Failed to parse manifest: {}", e)),
            };
        }
    };

    let command_str = match manifest.get("command").and_then(|v| v.as_str()) {
        Some(cmd) => cmd,
        None => {
            return ToolResult {
                success: false,
                output: String::new(),
                error: Some("Manifest missing 'command' field".to_string()),
            };
        }
    };

    // Parse the command string into program and arguments
    let command_parts: Vec<&str> = command_str.split_whitespace().collect();
    if command_parts.is_empty() {
        return ToolResult {
            success: false,
            output: String::new(),
            error: Some("Manifest 'command' field is empty".to_string()),
        };
    }

    let program = command_parts[0];
    let mut cmd_args: Vec<&str> = command_parts[1..].to_vec();
    cmd_args.push("--input");
    cmd_args.push("-"); // Convention: read from stdin when "-" is passed

    // Serialize input to JSON string for passing via stdin
    let input_json = serde_json::to_string(input).unwrap_or_else(|_| "{}".to_string());

    // Use structured Command::args() instead of sh -c, pass input via stdin
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(120),
        async {
            let mut child = tokio::process::Command::new(program)
                .args(&cmd_args)
                .current_dir(&tool_dir)
                .stdin(std::process::Stdio::piped())
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()?;

            // Write input JSON to stdin
            if let Some(mut stdin) = child.stdin.take() {
                use tokio::io::AsyncWriteExt;
                let _ = stdin.write_all(input_json.as_bytes()).await;
                // stdin is dropped here, closing the pipe
            }

            child.wait_with_output().await
        },
    )
    .await;

    match result {
        Ok(Ok(output)) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let success = output.status.success();

            let mut combined = String::new();
            if !stdout.is_empty() {
                combined.push_str(&stdout);
            }
            if !stderr.is_empty() && !success {
                if !combined.is_empty() {
                    combined.push_str("\n--- stderr ---\n");
                }
                combined.push_str(&stderr);
            }
            if combined.is_empty() {
                combined = "(no output)".to_string();
            }

            ToolResult {
                success,
                output: combined,
                error: if success {
                    None
                } else {
                    Some(format!("Custom tool '{}' failed", tool_name))
                },
            }
        }
        Ok(Err(e)) => ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("Failed to execute custom tool: {}", e)),
        },
        Err(_) => ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("Custom tool '{}' timed out after 120s", tool_name)),
        },
    }
}
