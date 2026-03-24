use super::registry::ToolResult;
use std::path::Path;

/// Validate that a package name is safe (alphanumeric, hyphens, underscores, dots, slashes, @).
/// Blocks shell metacharacters and injection attempts.
fn is_valid_package_name(name: &str) -> bool {
    if name.is_empty() {
        return false;
    }
    // Allow: alphanumeric, hyphen, underscore, dot, slash (for scoped packages), @
    // This covers npm scoped packages like @scope/package, pip packages, and cargo crates
    name.chars().all(|c| {
        c.is_alphanumeric() || c == '-' || c == '_' || c == '.' || c == '/' || c == '@'
    })
}

/// Validate all package names in a list, returning an error message if any are invalid.
fn validate_packages(packages: &[String]) -> Result<(), String> {
    for pkg in packages {
        if !is_valid_package_name(pkg) {
            return Err(format!(
                "Invalid package name '{}'. Only alphanumeric characters, hyphens, underscores, dots, slashes, and @ are allowed.",
                pkg
            ));
        }
    }
    Ok(())
}

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

    // Validate all package names before proceeding
    if let Err(e) = validate_packages(packages) {
        tracing::warn!("Blocked package operation with invalid package name: {}", e);
        return ToolResult {
            success: false,
            output: String::new(),
            error: Some(e),
        };
    }

    let pm = detect_package_manager(working_dir);

    let (program, args) = match pm.as_deref() {
        Some("pip") => build_pip_args(action, packages),
        Some("npm") => build_npm_args(action, packages),
        Some("cargo") => build_cargo_args(action, packages),
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

    let (program, args) = match (program, args) {
        (Ok(p), Ok(a)) => (p, a),
        (Err(e), _) | (_, Err(e)) => {
            return ToolResult {
                success: false,
                output: String::new(),
                error: Some(e),
            };
        }
    };

    let result = tokio::time::timeout(
        std::time::Duration::from_secs(300),
        tokio::process::Command::new(&program)
            .args(&args)
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

/// Return (program, args) for pip commands using structured arguments.
fn build_pip_args(action: &str, packages: &[String]) -> (Result<String, String>, Result<Vec<String>, String>) {
    match action {
        "install" => {
            if packages.is_empty() {
                (Ok("pip".to_string()), Ok(vec!["install".to_string(), "-r".to_string(), "requirements.txt".to_string()]))
            } else {
                let mut args = vec!["install".to_string()];
                args.extend(packages.iter().cloned());
                (Ok("pip".to_string()), Ok(args))
            }
        }
        "uninstall" => {
            if packages.is_empty() {
                (Err("No packages specified for uninstall".to_string()), Ok(vec![]))
            } else {
                let mut args = vec!["uninstall".to_string(), "-y".to_string()];
                args.extend(packages.iter().cloned());
                (Ok("pip".to_string()), Ok(args))
            }
        }
        "list" => (Ok("pip".to_string()), Ok(vec!["list".to_string()])),
        _ => (Err(format!("Unknown action '{}'. Use: install, uninstall, list", action)), Ok(vec![])),
    }
}

/// Return (program, args) for npm commands using structured arguments.
fn build_npm_args(action: &str, packages: &[String]) -> (Result<String, String>, Result<Vec<String>, String>) {
    match action {
        "install" => {
            if packages.is_empty() {
                (Ok("npm".to_string()), Ok(vec!["install".to_string()]))
            } else {
                let mut args = vec!["install".to_string()];
                args.extend(packages.iter().cloned());
                (Ok("npm".to_string()), Ok(args))
            }
        }
        "uninstall" => {
            if packages.is_empty() {
                (Err("No packages specified for uninstall".to_string()), Ok(vec![]))
            } else {
                let mut args = vec!["uninstall".to_string()];
                args.extend(packages.iter().cloned());
                (Ok("npm".to_string()), Ok(args))
            }
        }
        "list" => (Ok("npm".to_string()), Ok(vec!["list".to_string(), "--depth=0".to_string()])),
        _ => (Err(format!("Unknown action '{}'. Use: install, uninstall, list", action)), Ok(vec![])),
    }
}

/// Return (program, args) for cargo commands using structured arguments.
fn build_cargo_args(action: &str, packages: &[String]) -> (Result<String, String>, Result<Vec<String>, String>) {
    match action {
        "install" => {
            if packages.is_empty() {
                (Ok("cargo".to_string()), Ok(vec!["build".to_string()]))
            } else {
                let mut args = vec!["add".to_string()];
                args.extend(packages.iter().cloned());
                (Ok("cargo".to_string()), Ok(args))
            }
        }
        "uninstall" => {
            if packages.is_empty() {
                (Err("No packages specified for uninstall".to_string()), Ok(vec![]))
            } else {
                let mut args = vec!["remove".to_string()];
                args.extend(packages.iter().cloned());
                (Ok("cargo".to_string()), Ok(args))
            }
        }
        "list" => (Ok("cargo".to_string()), Ok(vec!["metadata".to_string(), "--no-deps".to_string(), "--format-version".to_string(), "1".to_string()])),
        _ => (Err(format!("Unknown action '{}'. Use: install, uninstall, list", action)), Ok(vec![])),
    }
}
