use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op")]
#[allow(non_camel_case_types)]
pub enum CanvasOp {
    ADD_NODE {
        node: NodeData,
    },
    UPDATE_NODE {
        #[serde(alias = "nodeId")]
        id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        status: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        summary: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        fields: Option<HashMap<String, serde_json::Value>>,
    },
    REMOVE_NODE {
        id: String,
    },
    ADD_EDGE {
        edge: EdgeData,
    },
    REMOVE_EDGE {
        from: String,
        to: String,
    },
    ADD_CLUSTER {
        id: String,
        label: String,
        children: Vec<String>,
    },
    SET_FOCUS {
        #[serde(rename = "nodeId", alias = "id")]
        node_id: String,
    },
    SNAPSHOT,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeData {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    /// Title of the node. Falls back to `text` or `name` if not provided.
    #[serde(default)]
    pub title: Option<String>,
    /// Some LLMs use "text" instead of "title"
    #[serde(default)]
    pub text: Option<String>,
    /// Some LLMs use "name" instead of "title"
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default = "default_status")]
    pub status: String,
    #[serde(default)]
    pub fields: HashMap<String, serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position_hint: Option<PositionHint>,
}

impl NodeData {
    /// Get the display title, falling back through text → name → id
    pub fn display_title(&self) -> String {
        self.title
            .clone()
            .or_else(|| self.text.clone())
            .or_else(|| self.name.clone())
            .unwrap_or_else(|| self.id.clone())
    }

    /// Get the display summary, falling back to description
    pub fn display_summary(&self) -> String {
        if !self.summary.is_empty() {
            self.summary.clone()
        } else {
            self.description.clone().unwrap_or_default()
        }
    }
}

fn default_status() -> String {
    "queued".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PositionHint {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub after: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub near: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cluster: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdgeData {
    pub id: String,
    pub from: String,
    pub to: String,
    #[serde(rename = "type")]
    pub edge_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style: Option<String>,
}
