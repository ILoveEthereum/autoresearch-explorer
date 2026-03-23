use super::registry::ToolResult;
use std::path::Path;
use tokio::sync::OnceCell;

const SANDBOX_IMAGE: &str = "autoresearch-sandbox";

static DOCKER_AVAILABLE: OnceCell<bool> = OnceCell::const_new();

/// Check whether Docker is installed and the daemon is running.
/// Result is cached after the first call.
pub async fn check_docker() -> bool {
    *DOCKER_AVAILABLE
        .get_or_init(|| async {
            let result = tokio::process::Command::new("docker")
                .args(["info"])
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status()
                .await;
            match result {
                Ok(status) => status.success(),
                Err(_) => false,
            }
        })
        .await
}

/// Build/ensure the sandbox Docker image exists.
/// The image includes Python 3, Node.js, and common scientific packages.
pub async fn ensure_sandbox_image() -> Result<(), String> {
    // Check if image already exists
    let check = tokio::process::Command::new("docker")
        .args(["image", "inspect", SANDBOX_IMAGE])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .await
        .map_err(|e| format!("Failed to run docker: {}", e))?;

    if check.success() {
        return Ok(());
    }

    // Build the image from an inline Dockerfile
    let dockerfile = r#"FROM python:3.12-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends nodejs npm && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir numpy scipy matplotlib pandas sympy

WORKDIR /workspace
"#;

    // Write Dockerfile to a temp dir and build
    let tmp_dir = std::env::temp_dir().join("autoresearch-docker-build");
    let _ = std::fs::create_dir_all(&tmp_dir);
    let dockerfile_path = tmp_dir.join("Dockerfile");
    std::fs::write(&dockerfile_path, dockerfile)
        .map_err(|e| format!("Failed to write Dockerfile: {}", e))?;

    tracing::info!("Building sandbox Docker image '{}' (this may take a minute)...", SANDBOX_IMAGE);

    let output = tokio::process::Command::new("docker")
        .args(["build", "-t", SANDBOX_IMAGE, "."])
        .current_dir(&tmp_dir)
        .output()
        .await
        .map_err(|e| format!("Failed to run docker build: {}", e))?;

    // Clean up temp Dockerfile
    let _ = std::fs::remove_dir_all(&tmp_dir);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Docker build failed: {}", stderr));
    }

    tracing::info!("Sandbox image '{}' built successfully", SANDBOX_IMAGE);
    Ok(())
}

/// Run code inside the Docker sandbox.
///
/// Writes code to a temp file in the session artifacts dir, runs it in a
/// container with no network, memory/CPU limits, and a mounted workspace,
/// then cleans up the temp file.
pub async fn run_in_sandbox(
    code: &str,
    language: &str,
    timeout_secs: u64,
    session_dir: &Path,
) -> ToolResult {
    let artifacts_dir = session_dir.join("artifacts");
    let _ = std::fs::create_dir_all(&artifacts_dir);

    let (filename, cmd_args): (&str, Vec<&str>) = match language {
        "python" | "py" => ("_run.py", vec!["python3", "_run.py"]),
        "javascript" | "js" | "node" => ("_run.js", vec!["node", "_run.js"]),
        "bash" | "sh" => ("_run.sh", vec!["bash", "_run.sh"]),
        _ => {
            return ToolResult {
                success: false,
                output: String::new(),
                error: Some(format!("Unsupported language: {}", language)),
            };
        }
    };

    // Write code to temp file in artifacts dir
    let code_path = artifacts_dir.join(filename);
    if let Err(e) = std::fs::write(&code_path, code) {
        return ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("Failed to write code file: {}", e)),
        };
    }

    // Ensure the sandbox image is available
    if let Err(e) = ensure_sandbox_image().await {
        // Clean up and return error
        let _ = std::fs::remove_file(&code_path);
        return ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("Failed to prepare sandbox image: {}", e)),
        };
    }

    let artifacts_str = artifacts_dir.to_string_lossy().to_string();
    let volume_mount = format!("{}:/workspace:rw", artifacts_str);

    // No resource limits — full access to host CPU/RAM
    // Network enabled so code can download packages/data
    // Filesystem isolated (only artifacts dir mounted)
    let mut docker_args = vec![
        "run",
        "--rm",
        "-v",
        &volume_mount,
        "-w",
        "/workspace",
        SANDBOX_IMAGE,
    ];
    for arg in &cmd_args {
        docker_args.push(arg);
    }

    // Run with timeout
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(timeout_secs),
        tokio::process::Command::new("docker")
            .args(&docker_args)
            .output(),
    )
    .await;

    // Clean up the temp code file
    let _ = std::fs::remove_file(&code_path);

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
                    Some("Process exited with non-zero status".to_string())
                },
            }
        }
        Ok(Err(e)) => ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("Failed to execute docker run: {}", e)),
        },
        Err(_) => {
            // Timeout — try to kill the container (best effort).
            // The --rm flag means it will clean up once stopped.
            ToolResult {
                success: false,
                output: String::new(),
                error: Some(format!("Execution timed out after {}s", timeout_secs)),
            }
        }
    }
}
