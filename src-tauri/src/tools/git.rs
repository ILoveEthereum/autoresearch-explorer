use super::registry::ToolResult;
use std::path::Path;

const ALLOWED_ACTIONS: &[&str] = &[
    "clone", "status", "diff", "log", "commit", "branch", "add", "checkout", "push", "pull",
];

/// Execute a git operation in the given working directory.
/// Only a safe subset of git commands is allowed.
/// Uses structured arguments instead of shell interpolation.
pub async fn git_op(action: &str, args: &str, working_dir: &Path) -> ToolResult {
    if action.is_empty() {
        return ToolResult {
            success: false,
            output: String::new(),
            error: Some("Empty git action".to_string()),
        };
    }

    if !ALLOWED_ACTIONS.contains(&action) {
        return ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!(
                "Git action '{}' is not allowed. Allowed actions: {}",
                action,
                ALLOWED_ACTIONS.join(", ")
            )),
        };
    }

    let _ = std::fs::create_dir_all(working_dir);

    // Build structured argument list instead of using sh -c
    let mut cmd_args: Vec<&str> = vec![action];
    let parsed_args: Vec<&str> = if args.is_empty() {
        vec![]
    } else {
        args.split_whitespace().collect()
    };
    cmd_args.extend(&parsed_args);

    let result = tokio::time::timeout(
        std::time::Duration::from_secs(120),
        tokio::process::Command::new("git")
            .args(&cmd_args)
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

            ToolResult {
                success,
                output: combined,
                error: if success {
                    None
                } else {
                    Some(format!("git {} failed", action))
                },
            }
        }
        Ok(Err(e)) => ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("Failed to execute git: {}", e)),
        },
        Err(_) => ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("git {} timed out after 120s", action)),
        },
    }
}
