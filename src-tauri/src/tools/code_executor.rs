use super::registry::ToolResult;
use std::path::Path;

/// Execute code natively on the host machine.
/// Runs in the provided working directory with full access to
/// system resources (CPU, RAM, GPU/MPS).
pub async fn execute_code(
    code: &str,
    language: &str,
    timeout_secs: u64,
    working_dir: &Path,
) -> ToolResult {
    if code.is_empty() {
        return ToolResult {
            success: false,
            output: String::new(),
            error: Some("Empty code".to_string()),
        };
    }

    let _ = std::fs::create_dir_all(working_dir);

    let (filename, command) = match language {
        "python" | "py" => ("_run.py", vec!["python3", "_run.py"]),
        "javascript" | "js" | "node" => ("_run.js", vec!["node", "_run.js"]),
        "bash" | "sh" => ("_run.sh", vec!["bash", "_run.sh"]),
        "swift" => ("_run.swift", vec!["swift", "_run.swift"]),
        _ => {
            return ToolResult {
                success: false,
                output: String::new(),
                error: Some(format!("Unsupported language: {}", language)),
            };
        }
    };

    // Write the code file
    let code_path = working_dir.join(filename);
    if let Err(e) = std::fs::write(&code_path, code) {
        return ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("Failed to write code file: {}", e)),
        };
    }

    // Execute with timeout
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(timeout_secs),
        run_command(&command[0], &command[1..], working_dir),
    )
    .await;

    // Clean up the temp file
    let _ = std::fs::remove_file(&code_path);

    match result {
        Ok(Ok((stdout, stderr, success))) => {
            let mut output = String::new();
            if !stdout.is_empty() {
                output.push_str(&stdout);
            }
            if !stderr.is_empty() {
                if !output.is_empty() {
                    output.push_str("\n--- stderr ---\n");
                }
                output.push_str(&stderr);
            }
            if output.is_empty() {
                output = "(no output)".to_string();
            }

            ToolResult {
                success,
                output,
                error: if success {
                    None
                } else {
                    Some("Process exited with non-zero status".to_string())
                },
            }
        }
        Ok(Err(e)) => ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("Failed to execute: {}", e)),
        },
        Err(_) => ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("Execution timed out after {}s", timeout_secs)),
        },
    }
}

async fn run_command(
    cmd: &str,
    args: &[&str],
    working_dir: &Path,
) -> Result<(String, String, bool), String> {
    let output = tokio::process::Command::new(cmd)
        .args(args)
        .current_dir(working_dir)
        .output()
        .await
        .map_err(|e| format!("Failed to spawn process: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    Ok((stdout, stderr, output.status.success()))
}
