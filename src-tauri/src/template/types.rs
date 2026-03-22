use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedTemplate {
    pub name: String,
    #[serde(default)]
    pub domain: Option<String>,
    #[serde(default)]
    pub version: Option<u32>,
    pub process: ProcessConfig,
    pub canvas: CanvasSchema,
    /// The freeform Markdown body (agent instructions)
    #[serde(skip_deserializing)]
    pub instructions: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessConfig {
    pub description: String,
    pub r#loop: Vec<LoopStep>,
    #[serde(default = "default_tools")]
    pub tools: Vec<String>,
    #[serde(default = "default_stop_conditions")]
    pub stop_conditions: Vec<String>,
}

fn default_tools() -> Vec<String> {
    vec!["web_search".to_string()]
}

fn default_stop_conditions() -> Vec<String> {
    vec!["Human sends stop signal".to_string()]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoopStep {
    pub step: String,
    pub description: String,
    #[serde(default)]
    pub constraints: Option<Vec<String>>,
    #[serde(default)]
    pub tools: Option<Vec<String>>,
    #[serde(default)]
    pub output: Option<String>,
    #[serde(default)]
    pub timeout: Option<String>,
    #[serde(default)]
    pub artifact: Option<String>,
    // Allow extra fields without failing
    #[serde(flatten)]
    pub extra: HashMap<String, serde_yaml::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasSchema {
    #[serde(default)]
    pub description: Option<String>,
    pub node_types: HashMap<String, NodeTypeDef>,
    pub edge_types: HashMap<String, EdgeTypeDef>,
    pub layout: LayoutConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeTypeDef {
    pub shape: String,
    #[serde(default)]
    pub fields: Vec<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub color_rule: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdgeTypeDef {
    pub description: String,
    pub style: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayoutConfig {
    pub primary_axis: LayoutAxis,
    #[serde(default)]
    pub branching: Option<String>,
    #[serde(default)]
    pub clustering: Option<String>,
    #[serde(default)]
    pub semantic_zoom: Option<SemanticZoomConfig>,
    // Allow extra fields
    #[serde(flatten)]
    pub extra: HashMap<String, serde_yaml::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LayoutAxis {
    LeftToRight,
    TopToBottom,
    Radial,
    Freeform,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticZoomConfig {
    #[serde(default)]
    pub far: Option<String>,
    #[serde(default)]
    pub mid: Option<String>,
    #[serde(default)]
    pub close: Option<String>,
}

/// Summary info for listing templates without full parsing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateSummary {
    pub name: String,
    pub domain: Option<String>,
    pub path: String,
}
