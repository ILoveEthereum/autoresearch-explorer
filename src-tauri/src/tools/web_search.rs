use super::registry::ToolResult;

/// Search the web using DuckDuckGo's HTML page (no API key needed).
/// Falls back to a simple scrape of DuckDuckGo search results.
pub async fn search(query: &str, max_results: usize) -> ToolResult {
    if query.is_empty() {
        return ToolResult {
            success: false,
            output: String::new(),
            error: Some("Empty search query".to_string()),
        };
    }

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
        .build()
        .unwrap();

    // Use DuckDuckGo HTML search (no API key required)
    let url = format!(
        "https://html.duckduckgo.com/html/?q={}",
        urlencoded(query)
    );

    match client.get(&url).send().await {
        Ok(response) => {
            match response.text().await {
                Ok(html) => {
                    let results = parse_ddg_results(&html, max_results);
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

/// Simple URL encoding
fn urlencoded(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            ' ' => '+'.to_string(),
            c if c.is_alphanumeric() || "-_.~".contains(c) => c.to_string(),
            c => format!("%{:02X}", c as u32),
        })
        .collect()
}

/// Parse DuckDuckGo HTML results into a readable format.
fn parse_ddg_results(html: &str, max_results: usize) -> String {
    let mut results = Vec::new();
    let mut pos = 0;

    while results.len() < max_results {
        // Find result links: <a rel="nofollow" class="result__a" href="...">
        let marker = "class=\"result__a\"";
        match html[pos..].find(marker) {
            Some(idx) => {
                let start = pos + idx;
                pos = start + marker.len();

                // Extract href
                let href = extract_attr(&html[start - 100..start + 200], "href");

                // Extract title (text inside the <a> tag)
                let title = extract_tag_text(&html[start..], "a");

                // Find snippet: class="result__snippet"
                let snippet = if let Some(snip_idx) = html[pos..].find("class=\"result__snippet\"") {
                    let snip_start = pos + snip_idx;
                    extract_tag_text(&html[snip_start..], "a")
                        .or_else(|| extract_tag_text(&html[snip_start..], "span"))
                } else {
                    None
                };

                if let Some(title) = title {
                    let title_clean = strip_html(&title);
                    if !title_clean.is_empty() {
                        let mut entry = format!("{}. {}", results.len() + 1, title_clean);
                        if let Some(ref href) = href {
                            // DuckDuckGo wraps URLs in redirect, try to extract the actual URL
                            let clean_url = extract_ddg_url(href);
                            entry.push_str(&format!("\n   URL: {}", clean_url));
                        }
                        if let Some(ref snippet) = snippet {
                            let snippet_clean = strip_html(snippet);
                            if !snippet_clean.is_empty() {
                                entry.push_str(&format!("\n   {}", snippet_clean));
                            }
                        }
                        results.push(entry);
                    }
                }
            }
            None => break,
        }
    }

    results.join("\n\n")
}

fn extract_attr(html: &str, attr: &str) -> Option<String> {
    let pattern = format!("{}=\"", attr);
    if let Some(start) = html.find(&pattern) {
        let val_start = start + pattern.len();
        if let Some(end) = html[val_start..].find('"') {
            return Some(html[val_start..val_start + end].to_string());
        }
    }
    None
}

fn extract_tag_text(html: &str, _tag: &str) -> Option<String> {
    // Find first > then collect text until next <
    if let Some(start) = html.find('>') {
        let text_start = start + 1;
        if let Some(end) = html[text_start..].find('<') {
            let text = html[text_start..text_start + end].trim().to_string();
            if !text.is_empty() {
                return Some(text);
            }
        }
    }
    None
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
    // Decode common HTML entities
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

fn extract_ddg_url(href: &str) -> String {
    // DuckDuckGo URLs look like: //duckduckgo.com/l/?uddg=https%3A%2F%2F...&rut=...
    if let Some(start) = href.find("uddg=") {
        let url_start = start + 5;
        let url_end = href[url_start..]
            .find('&')
            .map(|i| url_start + i)
            .unwrap_or(href.len());
        let encoded = &href[url_start..url_end];
        // Simple percent-decode
        return percent_decode(encoded);
    }
    href.to_string()
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
