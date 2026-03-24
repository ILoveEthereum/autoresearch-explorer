use super::registry::ToolResult;
use std::path::Path;

const MAX_OUTPUT_CHARS: usize = 10000;

/// Dangerous shell patterns that indicate command injection attempts.
const DANGEROUS_PATTERNS: &[&str] = &[
    "; rm", ";rm", "&& rm", "&&rm", "|| rm", "||rm",
    "| rm", "|rm", "; sudo", ";sudo", "&& sudo", "&&sudo",
    "; curl", ";curl", "&& curl", "&&curl",
    "; wget", ";wget", "&& wget", "&&wget",
    "; chmod", ";chmod", "&& chmod", "&&chmod",
    "; mkfs", ";mkfs", "; dd ", ";dd ",
    "; shutdown", ";shutdown", "; reboot", ";reboot",
    ">/dev/sd", ">/dev/null", "| sh", "|sh",
    "| bash", "|bash", "| zsh", "|zsh",
];

/// Check if a command contains shell injection patterns.
fn contains_dangerous_pattern(command: &str) -> Option<&'static str> {
    let lower = command.to_lowercase();

    // Check for backtick subshells
    if lower.contains('`') {
        return Some("backtick subshell");
    }

    // Check for $() subshells
    if lower.contains("$(") {
        return Some("$() subshell");
    }

    // Check for known dangerous patterns
    for pattern in DANGEROUS_PATTERNS {
        if lower.contains(pattern) {
            return Some(pattern);
        }
    }

    None
}

/// Execute a shell command in the given working directory with a timeout.
pub async fn execute_shell(command: &str, working_dir: &Path, timeout_secs: u64) -> ToolResult {
    if command.is_empty() {
        return ToolResult {
            success: false,
            output: String::new(),
            error: Some("Empty command".to_string()),
        };
    }

    // Check for dangerous patterns
    if let Some(pattern) = contains_dangerous_pattern(command) {
        tracing::warn!(
            "Blocked shell command containing dangerous pattern '{}': {}",
            pattern,
            command
        );
        return ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!(
                "Command blocked: contains dangerous pattern '{}'. Shell metacharacters, subshells, and destructive commands are not allowed.",
                pattern
            )),
        };
    }

    let _ = std::fs::create_dir_all(working_dir);

    let result = tokio::time::timeout(
        std::time::Duration::from_secs(timeout_secs),
        tokio::process::Command::new("sh")
            .args(["-c", command])
            .current_dir(working_dir)
            .output(),
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
            if !stderr.is_empty() {
                if !combined.is_empty() {
                    combined.push_str("\n--- stderr ---\n");
                }
                combined.push_str(&stderr);
            }
            if combined.is_empty() {
                combined = "(no output)".to_string();
            }

            // Truncate if too long
            if combined.len() > MAX_OUTPUT_CHARS {
                combined = format!(
                    "{}...\n\n[Output truncated at {} characters]",
                    &combined[..MAX_OUTPUT_CHARS],
                    MAX_OUTPUT_CHARS
                );
            }

            ToolResult {
                success,
                output: combined,
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
