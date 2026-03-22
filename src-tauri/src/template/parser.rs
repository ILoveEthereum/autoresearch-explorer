use super::types::ParsedTemplate;
use std::path::Path;

/// Parse a prompt template file into a ParsedTemplate.
///
/// The file format is:
/// ```text
/// ---
/// YAML frontmatter
/// ---
/// # Markdown body (agent instructions)
/// ```
pub fn parse_template_file(path: &Path) -> Result<ParsedTemplate, String> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read template file: {}", e))?;

    parse_template_str(&content)
}

pub fn parse_template_str(content: &str) -> Result<ParsedTemplate, String> {
    let (frontmatter, body) = split_frontmatter(content)?;

    let mut template: ParsedTemplate = serde_yaml::from_str(&frontmatter)
        .map_err(|e| format!("Failed to parse YAML frontmatter: {}", e))?;

    template.instructions = body.trim().to_string();

    super::schema::validate(&template)?;

    Ok(template)
}

/// Split a template file into YAML frontmatter and Markdown body.
/// Expects the file to start with `---` and have a closing `---`.
fn split_frontmatter(content: &str) -> Result<(String, String), String> {
    let trimmed = content.trim_start();

    if !trimmed.starts_with("---") {
        return Err("Template must start with YAML frontmatter delimited by ---".to_string());
    }

    // Skip the opening ---
    let after_opening = &trimmed[3..];
    let after_opening = after_opening.trim_start_matches(['\r', '\n']);

    // Find the closing ---
    let closing_pos = after_opening
        .find("\n---")
        .ok_or("No closing --- found for YAML frontmatter")?;

    let frontmatter = after_opening[..closing_pos].to_string();
    let body = after_opening[closing_pos + 4..].to_string();

    Ok((frontmatter, body))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_template() {
        let content = r#"---
name: "Test Template"
process:
  description: "A test process"
  loop:
    - step: search
      description: "Search for things"
  tools:
    - web_search
canvas:
  node_types:
    source:
      shape: box
      fields: [title, url, summary]
  edge_types:
    supports:
      description: "This supports that"
      style: solid_arrow
  layout:
    primary_axis: radial
---

# Agent Instructions

Search for things and report back.
"#;

        let template = parse_template_str(content).unwrap();
        assert_eq!(template.name, "Test Template");
        assert_eq!(template.process.r#loop.len(), 1);
        assert_eq!(template.process.r#loop[0].step, "search");
        assert!(template.canvas.node_types.contains_key("source"));
        assert!(template.canvas.edge_types.contains_key("supports"));
        assert!(template.instructions.contains("Search for things"));
    }

    #[test]
    fn test_split_frontmatter() {
        let content = "---\nname: test\n---\n# Body\nHello";
        let (fm, body) = split_frontmatter(content).unwrap();
        assert_eq!(fm, "name: test");
        assert!(body.contains("# Body"));
    }

    #[test]
    fn test_no_frontmatter() {
        let content = "# No frontmatter here";
        assert!(split_frontmatter(content).is_err());
    }
}
