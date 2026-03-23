use super::registry::ToolResult;
use std::path::Path;

/// Detect the package manager from the working directory and run an operation.
/// Supported: pip (requirements.txt), npm (package.json), cargo (Cargo.toml).
pub async fn package_op(action: &str, packages: &[String], working_dir: &Path) -> ToolResult {
    if action.is_empty() {
        return ToolResult {
            success: false,
            output: String::new(),
            error: Some("Empty package manager action".to_string()),
        };
    }

    let pm = detect_package_manager(working_dir);

    let command = match pm.as_deref() {
        Some("pip") => build_pip_command(action, packages),
        Some("npm") => build_npm_command(action, packages),
        Some("cargo") => build_cargo_command(action, packages),
        _ => {
            return ToolResult {
                success: false,
                output: String::new(),
                error: Some(
                    "Could not detect package manager. Ensure requirements.txt, package.json, or Cargo.toml exists in the working directory.".to_string(),
                ),
            };
        }
    };

    let command = match command {
        Ok(cmd) => cmd,
        Err(e) => {
            return ToolResult {
                success: false,
                output: String::new(),
                error: Some(e),
            };
        }
    };

    let result = tokio::time::timeout(
        std::time::Duration::from_secs(300),
        tokio::process::Command::new("sh")
            .args(["-c", &command])
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
                    Some("Package manager command failed".to_string())
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
            error: Some("Package manager command timed out after 300s".to_string()),
        },
    }
}

fn detect_package_manager(working_dir: &Path) -> Option<String> {
    if working_dir.join("requirements.txt").exists() || working_dir.join("setup.py").exists() || working_dir.join("pyproject.toml").exists() {
        Some("pip".to_string())
    } else if working_dir.join("package.json").exists() {
        Some("npm".to_string())
    } else if working_dir.join("Cargo.toml").exists() {
        Some("cargo".to_string())
    } else {
        None
    }
}

fn build_pip_command(action: &str, packages: &[String]) -> Result<String, String> {
    match action {
        "install" => {
            if packages.is_empty() {
                Ok("pip install -r requirements.txt".to_string())
            } else {
                Ok(format!("pip install {}", packages.join(" ")))
            }
        }
        "uninstall" => {
            if packages.is_empty() {
                Err("No packages specified for uninstall".to_string())
            } else {
                Ok(format!("pip uninstall -y {}", packages.join(" ")))
            }
        }
        "list" => Ok("pip list".to_string()),
        _ => Err(format!("Unknown action '{}'. Use: install, uninstall, list", action)),
    }
}

fn build_npm_command(action: &str, packages: &[String]) -> Result<String, String> {
    match action {
        "install" => {
            if packages.is_empty() {
                Ok("npm install".to_string())
            } else {
                Ok(format!("npm install {}", packages.join(" ")))
            }
        }
        "uninstall" => {
            if packages.is_empty() {
                Err("No packages specified for uninstall".to_string())
            } else {
                Ok(format!("npm uninstall {}", packages.join(" ")))
            }
        }
        "list" => Ok("npm list --depth=0".to_string()),
        _ => Err(format!("Unknown action '{}'. Use: install, uninstall, list", action)),
    }
}

fn build_cargo_command(action: &str, packages: &[String]) -> Result<String, String> {
    match action {
        "install" => {
            if packages.is_empty() {
                Ok("cargo build".to_string())
            } else {
                Ok(format!("cargo add {}", packages.join(" ")))
            }
        }
        "uninstall" => {
            if packages.is_empty() {
                Err("No packages specified for uninstall".to_string())
            } else {
                Ok(format!("cargo remove {}", packages.join(" ")))
            }
        }
        "list" => Ok("cargo metadata --no-deps --format-version 1 | grep -o '\"name\":\"[^\"]*\"'".to_string()),
        _ => Err(format!("Unknown action '{}'. Use: install, uninstall, list", action)),
    }
}
