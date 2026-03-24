use serde::{Deserialize, Serialize};

const OPENROUTER_MODELS_URL: &str = "https://openrouter.ai/api/v1/models";
const SEARXNG_CONTAINER_NAME: &str = "autoresearch-searxng";
const SEARXNG_IMAGE: &str = "searxng/searxng";
const SEARXNG_PORT: u16 = 8080;

#[derive(Debug, Serialize)]
pub struct ModelPricing {
    pub prompt: String,
    pub completion: String,
}

#[derive(Debug, Serialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub context_length: u64,
    pub pricing: ModelPricing,
}

#[tauri::command]
pub async fn fetch_models(api_key: String) -> Result<Vec<ModelInfo>, String> {
    let client = reqwest::Client::new();

    let response = client
        .get(OPENROUTER_MODELS_URL)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("HTTP-Referer", "https://autoresearch.app")
        .header("X-Title", "Autoresearch")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch models: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!("OpenRouter API error ({}): {}", status, body));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse models response: {}", e))?;

    let data = body
        .get("data")
        .and_then(|d| d.as_array())
        .ok_or("Invalid models response: missing data array")?;

    let mut models: Vec<ModelInfo> = data
        .iter()
        .filter_map(|m| {
            let id = m.get("id")?.as_str()?.to_string();
            let name = m.get("name")?.as_str()?.to_string();
            let context_length = m.get("context_length")?.as_u64().unwrap_or(0);
            let pricing_obj = m.get("pricing")?;
            let prompt = pricing_obj
                .get("prompt")
                .and_then(|p| p.as_str())
                .unwrap_or("0")
                .to_string();
            let completion = pricing_obj
                .get("completion")
                .and_then(|p| p.as_str())
                .unwrap_or("0")
                .to_string();

            Some(ModelInfo {
                id,
                name,
                context_length,
                pricing: ModelPricing { prompt, completion },
            })
        })
        .collect();

    models.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(models)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearxngStatus {
    pub docker_installed: bool,
    pub container_running: bool,
    pub url: Option<String>,
    pub message: String,
}

/// Check if Docker is installed and if the SearXNG container is running.
#[tauri::command]
pub async fn searxng_status() -> Result<SearxngStatus, String> {
    // Check Docker
    let docker_check = tokio::process::Command::new("docker")
        .args(["info"])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .await;

    let docker_installed = docker_check.map(|s| s.success()).unwrap_or(false);

    if !docker_installed {
        return Ok(SearxngStatus {
            docker_installed: false,
            container_running: false,
            url: None,
            message: "Docker is not installed or not running.".to_string(),
        });
    }

    // Check if container exists and is running
    let output = tokio::process::Command::new("docker")
        .args(["inspect", "-f", "{{.State.Running}}", SEARXNG_CONTAINER_NAME])
        .output()
        .await
        .map_err(|e| format!("Failed to check container: {}", e))?;

    let running = String::from_utf8_lossy(&output.stdout).trim() == "true";

    Ok(SearxngStatus {
        docker_installed: true,
        container_running: running,
        url: if running { Some(format!("http://localhost:{}", SEARXNG_PORT)) } else { None },
        message: if running {
            format!("SearXNG running on port {}", SEARXNG_PORT)
        } else {
            "SearXNG is not running.".to_string()
        },
    })
}

/// Start the SearXNG container. Pulls the image if needed.
#[tauri::command]
pub async fn searxng_start() -> Result<SearxngStatus, String> {
    // Check Docker first
    let docker_check = tokio::process::Command::new("docker")
        .args(["info"])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .await;

    if !docker_check.map(|s| s.success()).unwrap_or(false) {
        return Ok(SearxngStatus {
            docker_installed: false,
            container_running: false,
            url: None,
            message: "Docker is not installed or not running. Install Docker Desktop from https://docker.com/products/docker-desktop".to_string(),
        });
    }

    // Check if container already exists
    let exists = tokio::process::Command::new("docker")
        .args(["inspect", SEARXNG_CONTAINER_NAME])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .await
        .map(|s| s.success())
        .unwrap_or(false);

    if exists {
        // Start existing container
        let output = tokio::process::Command::new("docker")
            .args(["start", SEARXNG_CONTAINER_NAME])
            .output()
            .await
            .map_err(|e| format!("Failed to start container: {}", e))?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to start SearXNG: {}", err));
        }
    } else {
        // Pull and create new container
        let pull = tokio::process::Command::new("docker")
            .args(["pull", SEARXNG_IMAGE])
            .output()
            .await
            .map_err(|e| format!("Failed to pull SearXNG image: {}", e))?;

        if !pull.status.success() {
            let err = String::from_utf8_lossy(&pull.stderr);
            return Err(format!("Failed to pull SearXNG image: {}", err));
        }

        let output = tokio::process::Command::new("docker")
            .args([
                "run", "-d",
                "--name", SEARXNG_CONTAINER_NAME,
                "-p", &format!("{}:8080", SEARXNG_PORT),
                "--restart", "unless-stopped",
                SEARXNG_IMAGE,
            ])
            .output()
            .await
            .map_err(|e| format!("Failed to start SearXNG: {}", e))?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to start SearXNG: {}", err));
        }
    }

    // Save URL to config
    let url = format!("http://localhost:{}", SEARXNG_PORT);
    let config_path = crate::storage::app_data_dir().join("config.json");
    let mut config: serde_json::Value = std::fs::read_to_string(&config_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(serde_json::json!({}));
    config["searxng_url"] = serde_json::Value::String(url.clone());
    let _ = std::fs::write(&config_path, serde_json::to_string_pretty(&config).unwrap_or_default());

    Ok(SearxngStatus {
        docker_installed: true,
        container_running: true,
        url: Some(url),
        message: format!("SearXNG started on port {}", SEARXNG_PORT),
    })
}

/// Stop the SearXNG container.
#[tauri::command]
pub async fn searxng_stop() -> Result<SearxngStatus, String> {
    let output = tokio::process::Command::new("docker")
        .args(["stop", SEARXNG_CONTAINER_NAME])
        .output()
        .await
        .map_err(|e| format!("Failed to stop SearXNG: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to stop SearXNG: {}", err));
    }

    Ok(SearxngStatus {
        docker_installed: true,
        container_running: false,
        url: None,
        message: "SearXNG stopped.".to_string(),
    })
}
