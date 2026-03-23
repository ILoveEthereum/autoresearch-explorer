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

    // Reject PDF URLs upfront
    if is_pdf_url(url) {
        return ToolResult {
            success: false,
            output: String::new(),
            error: Some(
                "This is a PDF file. Use the arxiv_search tool for papers, or the pdf_reader tool for local PDFs."
                    .to_string(),
            ),
        };
    }

    let client = build_client();

    // Handle arXiv URLs specially
    if is_arxiv_abstract_url(url) {
        return handle_arxiv(url, session_dir, &client).await;
    }

    fetch_and_extract(url, session_dir, &client).await
}

fn build_client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) \
             AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        .timeout(std::time::Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .unwrap()
}

/// Check if a URL points to a PDF.
fn is_pdf_url(url: &str) -> bool {
    let lower = url.to_lowercase();
    lower.ends_with(".pdf") || lower.contains(".pdf?") || lower.contains(".pdf#")
}

/// Check if this is an arXiv abstract page (e.g. arxiv.org/abs/2310.11453).
fn is_arxiv_abstract_url(url: &str) -> bool {
    url.contains("arxiv.org/abs/")
}

/// Extract the arXiv paper ID from a URL like https://arxiv.org/abs/2310.11453 or https://arxiv.org/abs/2310.11453v2
fn extract_arxiv_id(url: &str) -> Option<&str> {
    if let Some(idx) = url.find("arxiv.org/abs/") {
        let after = &url[idx + "arxiv.org/abs/".len()..];
        // Trim any trailing query/fragment
        let id = after.split(&['?', '#', '/'][..]).next().unwrap_or(after);
        if !id.is_empty() {
            return Some(id);
        }
    }
    None
}

/// Handle arXiv URLs: try HTML viewer first, then fall back to API.
async fn handle_arxiv(url: &str, session_dir: &Path, client: &reqwest::Client) -> ToolResult {
    let arxiv_id = match extract_arxiv_id(url) {
        Some(id) => id.to_string(),
        None => return fetch_and_extract(url, session_dir, client).await,
    };

    // Attempt 1: Try arXiv HTML viewer
    let html_url = format!("https://arxiv.org/html/{}", arxiv_id);
    let result = fetch_and_extract(&html_url, session_dir, client).await;
    if result.success && !result.output.trim().is_empty() {
        return result;
    }

    // Attempt 2: Fall back to arXiv API
    let api_url = format!("http://export.arxiv.org/api/query?id_list={}", arxiv_id);
    match client.get(&api_url).send().await {
        Ok(response) if response.status().is_success() => {
            match response.text().await {
                Ok(xml) => {
                    let text = extract_arxiv_api_text(&xml);
                    if text.trim().is_empty() {
                        return ToolResult {
                            success: false,
                            output: String::new(),
                            error: Some("Could not extract text content from arXiv API response".to_string()),
                        };
                    }

                    cache_source(session_dir, url, text.len());

                    ToolResult {
                        success: true,
                        output: text,
                        error: None,
                    }
                }
                Err(e) => ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(format!("Failed to read arXiv API response: {}", e)),
                },
            }
        }
        Ok(response) => ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("arXiv API returned HTTP {}", response.status())),
        },
        Err(e) => ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("arXiv API request failed: {}", e)),
        },
    }
}

/// Parse the arXiv Atom API XML and extract title, authors, abstract, etc.
fn extract_arxiv_api_text(xml: &str) -> String {
    let mut result = String::new();

    // Extract title (first <title> inside <entry>, skip feed title)
    if let Some(entry_start) = xml.find("<entry>") {
        let entry = &xml[entry_start..];

        if let Some(title) = extract_xml_tag(entry, "title") {
            result.push_str(&format!("Title: {}\n\n", title.trim()));
        }

        // Extract authors
        let mut authors = Vec::new();
        let mut search_from = 0;
        while let Some(author_start) = entry[search_from..].find("<author>") {
            let abs_start = search_from + author_start;
            if let Some(name) = extract_xml_tag(&entry[abs_start..], "name") {
                authors.push(name.trim().to_string());
            }
            search_from = abs_start + 8; // skip past "<author>"
        }
        if !authors.is_empty() {
            result.push_str(&format!("Authors: {}\n\n", authors.join(", ")));
        }

        if let Some(summary) = extract_xml_tag(entry, "summary") {
            result.push_str(&format!("Abstract: {}\n\n", normalize_whitespace(summary.trim())));
        }

        if let Some(published) = extract_xml_tag(entry, "published") {
            result.push_str(&format!("Published: {}\n", published.trim()));
        }
    }

    result
}

/// Extract text between <tag> and </tag>.
fn extract_xml_tag<'a>(xml: &'a str, tag: &str) -> Option<&'a str> {
    let open = format!("<{}", tag);
    if let Some(start) = xml.find(&open) {
        // Find end of opening tag (handle attributes)
        let after_open = &xml[start + open.len()..];
        if let Some(gt) = after_open.find('>') {
            let content_start = start + open.len() + gt + 1;
            let close = format!("</{}>", tag);
            if let Some(end) = xml[content_start..].find(&close) {
                return Some(&xml[content_start..content_start + end]);
            }
        }
    }
    None
}

/// Fetch a URL and extract readable text, with PDF content-type detection.
async fn fetch_and_extract(url: &str, session_dir: &Path, client: &reqwest::Client) -> ToolResult {
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

            // Check Content-Type for PDF
            if let Some(ct) = response.headers().get(reqwest::header::CONTENT_TYPE) {
                if let Ok(ct_str) = ct.to_str() {
                    if ct_str.contains("application/pdf") {
                        return ToolResult {
                            success: false,
                            output: String::new(),
                            error: Some(
                                "This is a PDF file. Use the arxiv_search tool for papers, or the pdf_reader tool for local PDFs."
                                    .to_string(),
                            ),
                        };
                    }
                }
            }

            match response.text().await {
                Ok(body) => {
                    let text = extract_readable_text(&body);

                    if text.trim().is_empty() {
                        return ToolResult {
                            success: false,
                            output: String::new(),
                            error: Some("Could not extract text content from this URL".to_string()),
                        };
                    }

                    cache_source(session_dir, url, text.len());

                    let total_len = text.len();
                    let truncated = if total_len > 8000 {
                        format!(
                            "{}... (truncated, {} chars total)",
                            &text[..8000],
                            total_len
                        )
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

fn cache_source(session_dir: &Path, url: &str, content_length: usize) {
    let hash = simple_hash(url);
    let sources_dir = session_dir.join("sources");
    let _ = std::fs::create_dir_all(&sources_dir);
    let source_path = sources_dir.join(format!("{}.json", hash));
    let source_data = serde_json::json!({
        "url": url,
        "fetched_at": chrono::Utc::now().to_rfc3339(),
        "content_length": content_length,
    });
    let _ = std::fs::write(
        &source_path,
        serde_json::to_string_pretty(&source_data).unwrap_or_default(),
    );
}

/// Extract readable text from HTML, stripping tags, scripts, styles, and nav elements.
fn extract_readable_text(html: &str) -> String {
    let mut text = String::new();
    let mut in_tag = false;
    let mut skip_depth: i32 = 0; // depth counter for skipped elements
    let mut tag_name = String::new();
    let mut collecting_tag = false;
    let mut is_closing = false;

    // Tags whose entire content should be skipped
    const SKIP_TAGS: &[&str] = &["script", "style", "nav", "header", "footer", "noscript", "svg"];

    for c in html.chars() {
        match c {
            '<' => {
                in_tag = true;
                collecting_tag = true;
                is_closing = false;
                tag_name.clear();
            }
            '>' => {
                in_tag = false;
                collecting_tag = false;

                let tag_lower = tag_name.to_lowercase();

                if is_closing {
                    // Closing tag
                    if SKIP_TAGS.contains(&tag_lower.as_str()) && skip_depth > 0 {
                        skip_depth -= 1;
                    }
                } else {
                    // Opening tag (or self-closing)
                    if SKIP_TAGS.contains(&tag_lower.as_str()) {
                        skip_depth += 1;
                    }
                }

                // Add newline for block elements (only when not skipping)
                if skip_depth == 0 {
                    if matches!(
                        tag_lower.as_str(),
                        "p" | "div" | "br" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
                            | "li" | "tr" | "article" | "section" | "blockquote" | "pre"
                            | "figcaption" | "dt" | "dd"
                    ) {
                        text.push('\n');
                    }
                }
            }
            '/' if in_tag && collecting_tag && tag_name.is_empty() => {
                is_closing = true;
            }
            _ if in_tag => {
                if collecting_tag && c != ' ' && c != '/' && c != '\n' && c != '\r' {
                    tag_name.push(c);
                } else {
                    collecting_tag = false;
                }
            }
            _ if skip_depth == 0 => {
                text.push(c);
            }
            _ => {}
        }
    }

    // Clean up: decode common HTML entities
    let text = text
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
        .replace("&#x27;", "'")
        .replace("&#x2F;", "/");

    normalize_whitespace(&text)
}

/// Collapse multiple newlines and whitespace.
fn normalize_whitespace(text: &str) -> String {
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
