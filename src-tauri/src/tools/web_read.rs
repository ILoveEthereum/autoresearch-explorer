use super::registry::ToolResult;
use std::path::Path;

/// Fetch a URL and extract readable text content.
pub async fn read_url(url: &str, session_dir: &Path) -> ToolResult {
    if url.is_empty() {
        return ToolResult {
            success: false,
            output: String::new(),
            error: Some("Empty URL".to_string()),
        };
    }

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap();

    match client.get(url).send().await {
        Ok(response) => {
            let status = response.status();
            if !status.is_success() {
                return ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(format!("HTTP {}", status)),
                };
            }

            match response.text().await {
                Ok(body) => {
                    let text = extract_readable_text(&body);

                    // Cache the source
                    let hash = simple_hash(url);
                    let source_path = session_dir.join("sources").join(format!("{}.json", hash));
                    let source_data = serde_json::json!({
                        "url": url,
                        "fetched_at": chrono::Utc::now().to_rfc3339(),
                        "content_length": text.len(),
                    });
                    let _ = std::fs::write(&source_path, serde_json::to_string_pretty(&source_data).unwrap_or_default());

                    // Truncate if too long (keep first 8000 chars for context window)
                    let truncated = if text.len() > 8000 {
                        format!("{}...\n\n[Content truncated at 8000 characters]", &text[..8000])
                    } else {
                        text
                    };

                    ToolResult {
                        success: true,
                        output: truncated,
                        error: None,
                    }
                }
                Err(e) => ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(format!("Failed to read response body: {}", e)),
                },
            }
        }
        Err(e) => ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("Request failed: {}", e)),
        },
    }
}

/// Extract readable text from HTML, stripping tags and scripts.
fn extract_readable_text(html: &str) -> String {
    let mut text = String::new();
    let mut in_tag = false;
    let mut in_script = false;
    let mut in_style = false;
    let mut tag_name = String::new();
    let mut collecting_tag = false;

    for c in html.chars() {
        match c {
            '<' => {
                in_tag = true;
                collecting_tag = true;
                tag_name.clear();
            }
            '>' => {
                in_tag = false;
                collecting_tag = false;

                let tag_lower = tag_name.to_lowercase();
                if tag_lower.starts_with("script") {
                    in_script = true;
                } else if tag_lower.starts_with("/script") {
                    in_script = false;
                } else if tag_lower.starts_with("style") {
                    in_style = true;
                } else if tag_lower.starts_with("/style") {
                    in_style = false;
                }

                // Add newline for block elements
                if matches!(
                    tag_lower.trim_start_matches('/').split_whitespace().next(),
                    Some("p" | "div" | "br" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "li" | "tr" | "article" | "section")
                ) {
                    text.push('\n');
                }
            }
            _ if in_tag => {
                if collecting_tag && c != ' ' && c != '/' {
                    tag_name.push(c);
                } else {
                    collecting_tag = false;
                }
            }
            _ if !in_script && !in_style => {
                text.push(c);
            }
            _ => {}
        }
    }

    // Clean up: decode entities, collapse whitespace
    let text = text
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ");

    // Collapse multiple newlines and spaces
    let mut result = String::new();
    let mut prev_newline = false;
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            if !prev_newline {
                result.push('\n');
                prev_newline = true;
            }
        } else {
            result.push_str(trimmed);
            result.push('\n');
            prev_newline = false;
        }
    }

    result.trim().to_string()
}

fn simple_hash(s: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    s.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}
