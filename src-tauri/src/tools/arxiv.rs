use super::registry::ToolResult;

/// Search arXiv for papers matching a query.
/// Returns a JSON array of results with title, authors, abstract, url, and published date.
pub async fn search_arxiv(query: &str, max_results: usize) -> ToolResult {
    if query.is_empty() {
        return ToolResult {
            success: false,
            output: String::new(),
            error: Some("Empty search query".to_string()),
        };
    }

    let max_results = max_results.min(50); // Cap at 50
    let encoded_query = urlencoded(query);
    let url = format!(
        "http://export.arxiv.org/api/query?search_query=all:{}&max_results={}",
        encoded_query, max_results
    );

    let client = reqwest::Client::builder()
        .user_agent("Autoresearch/0.1")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap();

    match client.get(&url).send().await {
        Ok(response) => match response.text().await {
            Ok(xml) => {
                let papers = parse_arxiv_xml(&xml);
                if papers.is_empty() {
                    ToolResult {
                        success: true,
                        output: "No results found.".to_string(),
                        error: None,
                    }
                } else {
                    match serde_json::to_string_pretty(&papers) {
                        Ok(json) => ToolResult {
                            success: true,
                            output: json,
                            error: None,
                        },
                        Err(e) => ToolResult {
                            success: false,
                            output: String::new(),
                            error: Some(format!("Failed to serialize results: {}", e)),
                        },
                    }
                }
            }
            Err(e) => ToolResult {
                success: false,
                output: String::new(),
                error: Some(format!("Failed to read arXiv response: {}", e)),
            },
        },
        Err(e) => ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("arXiv request failed: {}", e)),
        },
    }
}

#[derive(serde::Serialize)]
struct ArxivPaper {
    title: String,
    authors: Vec<String>,
    r#abstract: String,
    url: String,
    published_date: String,
}

/// Parse the Atom XML response from arXiv using simple string matching.
fn parse_arxiv_xml(xml: &str) -> Vec<ArxivPaper> {
    let mut papers = Vec::new();

    // Split by <entry> tags
    let entries: Vec<&str> = xml.split("<entry>").collect();

    for entry in entries.iter().skip(1) {
        let end = entry.find("</entry>").unwrap_or(entry.len());
        let entry = &entry[..end];

        let title = extract_xml_tag(entry, "title")
            .map(|t| t.split_whitespace().collect::<Vec<_>>().join(" "))
            .unwrap_or_default();

        let abstract_text = extract_xml_tag(entry, "summary")
            .map(|t| t.split_whitespace().collect::<Vec<_>>().join(" "))
            .unwrap_or_default();

        let published = extract_xml_tag(entry, "published").unwrap_or_default();

        // Extract the arXiv abs link
        let url = extract_arxiv_link(entry).unwrap_or_default();

        // Extract authors
        let authors = extract_authors(entry);

        if !title.is_empty() {
            papers.push(ArxivPaper {
                title,
                authors,
                r#abstract: abstract_text,
                url,
                published_date: published,
            });
        }
    }

    papers
}

fn extract_xml_tag(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{}", tag);
    let close = format!("</{}>", tag);

    let start_pos = xml.find(&open)?;
    // Find the end of the opening tag (after attributes)
    let content_start = xml[start_pos..].find('>')? + start_pos + 1;
    let end_pos = xml[content_start..].find(&close)? + content_start;

    Some(xml[content_start..end_pos].trim().to_string())
}

fn extract_arxiv_link(entry: &str) -> Option<String> {
    // Look for <id> tag which contains the arXiv URL
    extract_xml_tag(entry, "id")
}

fn extract_authors(entry: &str) -> Vec<String> {
    let mut authors = Vec::new();
    let mut pos = 0;

    while let Some(start) = entry[pos..].find("<author>") {
        let author_start = pos + start;
        if let Some(end) = entry[author_start..].find("</author>") {
            let author_block = &entry[author_start..author_start + end];
            if let Some(name) = extract_xml_tag(author_block, "name") {
                authors.push(name);
            }
            pos = author_start + end;
        } else {
            break;
        }
    }

    authors
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
