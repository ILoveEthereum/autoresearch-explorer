use super::registry::ToolResult;

/// Search the web using Brave Search API (free tier: 2000 queries/month).
/// Falls back to a simple Google scrape if no API key is configured.
pub async fn search(query: &str, max_results: usize) -> ToolResult {
    if query.is_empty() {
        return ToolResult {
            success: false,
            output: String::new(),
            error: Some("Empty search query".to_string()),
        };
    }

    // Try Brave Search API first
    let brave_key = std::env::var("BRAVE_SEARCH_API_KEY").ok()
        .or_else(|| {
            let config_path = crate::storage::app_data_dir().join("config.json");
            if let Ok(content) = std::fs::read_to_string(&config_path) {
                if let Ok(config) = serde_json::from_str::<serde_json::Value>(&content) {
                    return config["brave_search_api_key"].as_str().map(String::from);
                }
            }
            None
        });

    if let Some(key) = brave_key {
        return brave_search(query, max_results, &key).await;
    }

    // Fallback: use Google search scraping
    google_scrape_search(query, max_results).await
}

async fn brave_search(query: &str, max_results: usize, api_key: &str) -> ToolResult {
    let client = reqwest::Client::builder()
        .user_agent("Autoresearch/1.0")
        .build()
        .unwrap();

    let url = format!(
        "https://api.search.brave.com/res/v1/web/search?q={}&count={}",
        urlencoded(query),
        max_results.min(20)
    );

    match client.get(&url)
        .header("Accept", "application/json")
        .header("Accept-Encoding", "gzip")
        .header("X-Subscription-Token", api_key)
        .send()
        .await
    {
        Ok(response) => {
            match response.json::<serde_json::Value>().await {
                Ok(data) => {
                    let results = data["web"]["results"]
                        .as_array()
                        .map(|arr| {
                            arr.iter()
                                .take(max_results)
                                .enumerate()
                                .map(|(i, r)| {
                                    let title = r["title"].as_str().unwrap_or("");
                                    let url = r["url"].as_str().unwrap_or("");
                                    let desc = r["description"].as_str().unwrap_or("");
                                    format!("{}. {}\n   URL: {}\n   {}", i + 1, title, url, desc)
                                })
                                .collect::<Vec<_>>()
                                .join("\n\n")
                        })
                        .unwrap_or_default();

                    if results.is_empty() {
                        ToolResult {
                            success: true,
                            output: "No results found.".to_string(),
                            error: None,
                        }
                    } else {
                        ToolResult {
                            success: true,
                            output: results,
                            error: None,
                        }
                    }
                }
                Err(e) => ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(format!("Failed to parse Brave search response: {}", e)),
                },
            }
        }
        Err(e) => ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("Brave search request failed: {}", e)),
        },
    }
}

/// Fallback: scrape Google search results
async fn google_scrape_search(query: &str, max_results: usize) -> ToolResult {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .unwrap();

    let url = format!(
        "https://www.google.com/search?q={}&num={}",
        urlencoded(query),
        max_results.min(10)
    );

    match client.get(&url).send().await {
        Ok(response) => {
            match response.text().await {
                Ok(html) => {
                    let results = parse_google_results(&html, max_results);
                    if results.is_empty() {
                        ToolResult {
                            success: true,
                            output: "No results found. Try a different search query.".to_string(),
                            error: None,
                        }
                    } else {
                        ToolResult {
                            success: true,
                            output: results,
                            error: None,
                        }
                    }
                }
                Err(e) => ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(format!("Failed to read search response: {}", e)),
                },
            }
        }
        Err(e) => ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("Search request failed: {}", e)),
        },
    }
}

fn parse_google_results(html: &str, max_results: usize) -> String {
    let mut results = Vec::new();

    // Google wraps results in <div class="g"> or similar
    // Look for <a href="/url?q=..." patterns
    let mut pos = 0;
    while results.len() < max_results {
        // Find links with /url?q= pattern (Google's redirect wrapper)
        match html[pos..].find("/url?q=") {
            Some(idx) => {
                let start = pos + idx + 7; // skip "/url?q="
                pos = start;

                // Extract URL (until &)
                let url_end = html[start..].find('&').unwrap_or(200);
                let url = percent_decode(&html[start..start + url_end]);

                // Skip google internal URLs
                if url.contains("google.com") || url.contains("accounts.google") || url.is_empty() {
                    continue;
                }

                // Try to find a nearby title (text in <h3> tag)
                let title = if let Some(h3_idx) = html[pos..].find("<h3") {
                    let h3_start = pos + h3_idx;
                    extract_tag_content(&html[h3_start..], "h3")
                } else {
                    None
                };

                let title_str = title.as_deref().unwrap_or(&url);
                let title_clean = strip_html(title_str);

                if !title_clean.is_empty() && !results.iter().any(|r: &String| r.contains(&url)) {
                    results.push(format!("{}. {}\n   URL: {}", results.len() + 1, title_clean, url));
                }
            }
            None => break,
        }
    }

    results.join("\n\n")
}

fn extract_tag_content(html: &str, tag: &str) -> Option<String> {
    let close_tag = format!("</{}>", tag);
    if let Some(start) = html.find('>') {
        let text_start = start + 1;
        if let Some(end) = html[text_start..].find(&close_tag) {
            let text = strip_html(&html[text_start..text_start + end]).trim().to_string();
            if !text.is_empty() {
                return Some(text);
            }
        }
    }
    None
}

fn urlencoded(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            ' ' => '+'.to_string(),
            c if c.is_alphanumeric() || "-_.~".contains(c) => c.to_string(),
            c => format!("%{:02X}", c as u32),
        })
        .collect()
}

fn strip_html(s: &str) -> String {
    let mut result = String::new();
    let mut in_tag = false;
    for c in s.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => result.push(c),
            _ => {}
        }
    }
    result
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
        .trim()
        .to_string()
}

fn percent_decode(s: &str) -> String {
    let mut result = String::new();
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '%' {
            let hex: String = chars.by_ref().take(2).collect();
            if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                result.push(byte as char);
            }
        } else if c == '+' {
            result.push(' ');
        } else {
            result.push(c);
        }
    }
    result
}
