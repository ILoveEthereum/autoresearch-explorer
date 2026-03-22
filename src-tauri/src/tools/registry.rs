use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

use super::{code_executor, file_ops, web_read, web_search};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub success: bool,
    pub output: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub struct ToolRegistry {
    session_dir: PathBuf,
}

impl ToolRegistry {
    pub fn new(session_dir: PathBuf) -> Self {
        Self { session_dir }
    }

    /// Execute a tool by name with the given input.
    pub async fn execute(
        &self,
        tool_name: &str,
        input: &HashMap<String, serde_json::Value>,
    ) -> ToolResult {
        match tool_name {
            "web_search" => {
                let query = input
                    .get("query")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let max_results = input
                    .get("max_results")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(5) as usize;
                web_search::search(&query, max_results).await
            }
            "web_read" => {
                let url = input
                    .get("url")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                web_read::read_url(&url, &self.session_dir).await
            }
            "code_executor" => {
                let code = input
                    .get("code")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let language = input
                    .get("language")
                    .and_then(|v| v.as_str())
                    .unwrap_or("python")
                    .to_string();
                let timeout = input
                    .get("timeout")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(60);
                code_executor::execute_code(&code, &language, timeout, &self.session_dir).await
            }
            "file_read" => {
                let path = input
                    .get("path")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                file_ops::read_file(&path, &self.session_dir)
            }
            "file_write" => {
                let path = input
                    .get("path")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let content = input
                    .get("content")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                file_ops::write_file(&path, &content, &self.session_dir)
            }
            _ => ToolResult {
                success: false,
                output: String::new(),
                error: Some(format!("Unknown tool: {}", tool_name)),
            },
        }
    }

    /// Get tool descriptions for the LLM system prompt.
    pub fn tool_descriptions(available_tools: &[String]) -> String {
        let mut desc = String::new();
        for tool in available_tools {
            match tool.as_str() {
                "web_search" => {
                    desc.push_str("- web_search: Search the web. Input: {\"query\": \"search terms\", \"max_results\": 5}\n");
                }
                "web_read" => {
                    desc.push_str("- web_read: Fetch and read a web page. Input: {\"url\": \"https://...\"}\n");
                }
                "code_executor" => {
                    desc.push_str("- code_executor: Run code in a sandbox. Input: {\"code\": \"print('hello')\", \"language\": \"python\", \"timeout\": 60}\n");
                }
                "file_read" => {
                    desc.push_str("- file_read: Read a file from the session artifacts. Input: {\"path\": \"filename.txt\"}\n");
                }
                "file_write" => {
                    desc.push_str("- file_write: Write a file to the session artifacts. Input: {\"path\": \"filename.txt\", \"content\": \"...\"}\n");
                }
                _ => {
                    desc.push_str(&format!("- {}: (no description available)\n", tool));
                }
            }
        }
        desc
    }
}
