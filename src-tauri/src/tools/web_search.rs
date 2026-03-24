use super::registry::ToolResult;

/// Search priority:
/// 1. SearXNG (if configured — self-hosted, best quality, no rate limits)
/// 2. Brave Search API (if API key set — good quality, 2000 free/month)
/// 3. DuckDuckGo HTML scraping (always available, no key needed)
pub async fn search(query: &str, max_results: usize) -> ToolResult {
    if query.is_empty() {
        return ToolResult {
            success: false,
            output: String::new(),
            error: Some("Empty search query".to_string()),
        };
    }

    // 1. Try SearXNG first
    let searxng_url = std::env::var("SEARXNG_URL").ok()
        .or_else(|| {
            let config_path = crate::storage::app_data_dir().join("config.json");
            if let Ok(content) = std::fs::read_to_string(&config_path) {
                if let Ok(config) = serde_json::from_str::<serde_json::Value>(&content) {
                    return config["searxng_url"].as_str().map(String::from);
                }
            }
            None
        });

    if let Some(url) = searxng_url {
        let result = searxng_search(query, max_results, &url).await;
        if result.success && !result.output.contains("No results found") {
            return result;
        }
        tracing::warn!("SearXNG returned no results, falling back to next provider");
    }

    // 2. Try Brave Search API
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
        let result = brave_search(query, max_results, &key).await;
        if result.success && !result.output.contains("No results found") {
            return result;
        }
        tracing::warn!("Brave Search returned no results, falling back to DuckDuckGo");
    }

    // 3. Fallback: DuckDuckGo HTML search
    duckduckgo_search(query, max_results).await
}

/// SearXNG — self-hosted metasearch engine. Best quality, no rate limits.
/// Set SEARXNG_URL env var or searxng_url in config.json.
/// Default port is 8080: http://localhost:8080
async fn searxng_search(query: &str, max_results: usize, base_url: &str) -> ToolResult {
    let client = reqwest::Client::builder()
        .user_agent("Autoresearch/1.0")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .unwrap();

    let url = format!(
        "{}/search?q={}&format=json&engines=google,bing,duckduckgo,brave&language=en&safesearch=0&categories=general",
        base_url.trim_end_matches('/'),
        urlencoded(query),
    );

    match client.get(&url).send().await {
        Ok(response) => {
            if !response.status().is_success() {
                return ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(format!("SearXNG returned status {}", response.status())),
                };
            }

            match response.json::<serde_json::Value>().await {
                Ok(data) => {
                    let results = data["results"]
                        .as_array()
                        .map(|arr| {
                            arr.iter()
                                .take(max_results)
                                .enumerate()
                                .filter_map(|(i, r)| {
                                    let title = r["title"].as_str().unwrap_or("").trim();
                                    let url = r["url"].as_str().unwrap_or("").trim();
                                    let content = r["content"].as_str().unwrap_or("").trim();
                                    let engine = r["engine"].as_str().unwrap_or("");

                                    if title.is_empty() || url.is_empty() {
                                        return None;
                                    }

                                    if content.is_empty() {
                                        Some(format!(
                                            "{}. {} [{}]\n   URL: {}",
                                            i + 1, title, engine, url
                                        ))
                                    } else {
                                        Some(format!(
                                            "{}. {} [{}]\n   URL: {}\n   {}",
                                            i + 1, title, engine, url, content
                                        ))
                                    }
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
                    error: Some(format!("Failed to parse SearXNG response: {}", e)),
                },
            }
        }
        Err(e) => ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("SearXNG request failed: {}. Is SearXNG running at {}?", e, base_url)),
        },
    }
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

/// Fallback: scrape DuckDuckGo HTML search results
async fn duckduckgo_search(query: &str, max_results: usize) -> ToolResult {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .unwrap();

    let url = format!(
        "https://html.duckduckgo.com/html/?q={}",
        urlencoded(query),
    );

    match client.get(&url).send().await {
        Ok(response) => {
            match response.text().await {
                Ok(html) => {
                    let results = parse_duckduckgo_results(&html, max_results);
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

fn parse_duckduckgo_results(html: &str, max_results: usize) -> String {
    use scraper::{Html, Selector};

    let document = Html::parse_document(html);
    let result_sel = Selector::parse("div.result").unwrap();
    let title_sel = Selector::parse("a.result__a").unwrap();
    let snippet_sel = Selector::parse("a.result__snippet").unwrap();

    let mut results = Vec::new();

    for element in document.select(&result_sel) {
        if results.len() >= max_results {
            break;
        }

        let title_el = match element.select(&title_sel).next() {
            Some(el) => el,
            None => continue,
        };

        let title = title_el.text().collect::<String>().trim().to_string();
        let raw_href = title_el.value().attr("href").unwrap_or("").to_string();

        // DuckDuckGo wraps URLs through a redirect; extract the actual URL
        let url = if raw_href.contains("uddg=") {
            raw_href
                .split("uddg=")
                .nth(1)
                .unwrap_or(&raw_href)
                .split('&')
                .next()
                .map(|u| percent_decode(u))
                .unwrap_or(raw_href.clone())
        } else {
            raw_href
        };

        if title.is_empty() || url.is_empty() {
            continue;
        }

        let snippet = element
            .select(&snippet_sel)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_string())
            .unwrap_or_default();

        if snippet.is_empty() {
            results.push(format!("{}. {}\n   URL: {}", results.len() + 1, title, url));
        } else {
            results.push(format!(
                "{}. {}\n   URL: {}\n   {}",
                results.len() + 1,
                title,
                url,
                snippet
            ));
        }
    }

    results.join("\n\n")
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
