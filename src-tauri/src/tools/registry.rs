use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

use super::{arxiv, code_executor, custom_tool, file_ops, git, package_manager, shell, web_read, web_search};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub success: bool,
    pub output: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub struct ToolRegistry {
    session_dir: PathBuf,
    /// If set, code execution and file ops use this directory
    /// instead of session_dir/artifacts/
    working_dir: Option<PathBuf>,
}

impl ToolRegistry {
    pub fn new(session_dir: PathBuf, working_dir: Option<PathBuf>) -> Self {
        Self { session_dir, working_dir }
    }

    /// The directory where code should execute and files should be read/written.
    fn code_dir(&self) -> PathBuf {
        match &self.working_dir {
            Some(wd) => wd.clone(),
            None => {
                let artifacts = self.session_dir.join("artifacts");
                let _ = std::fs::create_dir_all(&artifacts);
                artifacts
            }
        }
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
                code_executor::execute_code(&code, &language, timeout, &self.code_dir()).await
            }
            "shell" => {
                let command = input
                    .get("command")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let timeout = input
                    .get("timeout")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(60);
                shell::execute_shell(&command, &self.code_dir(), timeout).await
            }
            "git" => {
                let action = input
                    .get("action")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let args = input
                    .get("args")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                git::git_op(&action, &args, &self.code_dir()).await
            }
            "package_manager" => {
                let action = input
                    .get("action")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let packages: Vec<String> = input
                    .get("packages")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(String::from))
                            .collect()
                    })
                    .unwrap_or_default();
                package_manager::package_op(&action, &packages, &self.code_dir()).await
            }
            "arxiv_search" => {
                let query = input
                    .get("query")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let max_results = input
                    .get("max_results")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(5) as usize;
                arxiv::search_arxiv(&query, max_results).await
            }
            "file_read" => {
                let path = input
                    .get("path")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                file_ops::read_file(&path, &self.code_dir())
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
                file_ops::write_file(&path, &content, &self.code_dir())
            }
            "file_list" | "list_files" => {
                let path = input
                    .get("path")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                file_ops::list_files(&path, &self.code_dir())
            }
            // Handle common LLM aliases
            "file_system" | "filesystem" => {
                let action = input
                    .get("action")
                    .and_then(|v| v.as_str())
                    .unwrap_or("read");
                let path = input
                    .get("path")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                match action {
                    "write" | "create" => {
                        let content = input
                            .get("content")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        file_ops::write_file(&path, &content, &self.code_dir())
                    }
                    "list" | "ls" => {
                        file_ops::list_files(&path, &self.code_dir())
                    }
                    _ => {
                        file_ops::read_file(&path, &self.code_dir())
                    }
                }
            }
            // Fallback: try custom tool
            _ => {
                let input_value = serde_json::to_value(input).unwrap_or(serde_json::Value::Null);
                custom_tool::execute_custom_tool(tool_name, &input_value, &self.code_dir()).await
            }
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
                    desc.push_str("- code_executor: Run code natively on the host machine with full GPU/MPS access. Input: {\"code\": \"print('hello')\", \"language\": \"python\", \"timeout\": 60}. Supported languages: python, javascript, bash, swift.\n");
                }
                "shell" => {
                    desc.push_str("- shell: Execute a shell command in the working directory. Input: {\"command\": \"ls -la\", \"timeout\": 60}. Returns stdout/stderr combined.\n");
                }
                "git" => {
                    desc.push_str("- git: Run git operations. Input: {\"action\": \"status\", \"args\": \"\"}. Allowed actions: clone, status, diff, log, commit, branch, add, checkout.\n");
                }
                "package_manager" => {
                    desc.push_str("- package_manager: Auto-detect and run package manager (pip/npm/cargo). Input: {\"action\": \"install\", \"packages\": [\"numpy\", \"pandas\"]}. Actions: install, uninstall, list.\n");
                }
                "arxiv_search" => {
                    desc.push_str("- arxiv_search: Search arXiv for academic papers. Input: {\"query\": \"transformer attention mechanism\", \"max_results\": 5}. Returns title, authors, abstract, url, published_date.\n");
                }
                "file_read" => {
                    desc.push_str("- file_read: Read a file from the working directory. Input: {\"path\": \"filename.txt\"}\n");
                }
                "file_write" => {
                    desc.push_str("- file_write: Write a file to the working directory. Input: {\"path\": \"filename.txt\", \"content\": \"...\"}\n");
                }
                "file_list" => {
                    desc.push_str("- file_list: List files in the working directory. Input: {\"path\": \"\" } (empty for root, or subdirectory name)\n");
                }
                _ => {
                    desc.push_str(&format!("- {}: Custom tool (run with any JSON input)\n", tool));
                }
            }
        }
        desc
    }
}
