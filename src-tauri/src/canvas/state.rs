use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::operations::{CanvasOp, EdgeData, FieldDef};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeTypeDefinition {
    pub type_name: String,
    pub label: String,
    pub shape: String,
    pub color: String,
    pub fields: Vec<FieldDef>,
    pub description: String,
}

/// Generate a deterministic color from a type name by hashing it.
pub fn default_color_for_type(type_name: &str) -> String {
    let hash: u32 = type_name
        .bytes()
        .fold(0u32, |acc, b| acc.wrapping_mul(31).wrapping_add(b as u32));
    let hue = hash % 360;
    format!("hsl({}, 65%, 55%)", hue)
}

/// Built-in node type definitions that match the original fixed types.
pub fn builtin_node_types() -> Vec<NodeTypeDefinition> {
    vec![
        NodeTypeDefinition {
            type_name: "question".into(),
            label: "Question".into(),
            shape: "diamond".into(),
            color: "#3b82f6".into(),
            fields: vec![
                FieldDef { name: "text".into(), field_type: "text".into(), description: "The research question".into() },
                FieldDef { name: "status".into(), field_type: "text".into(), description: "Question status (open/resolved)".into() },
            ],
            description: "A research question to investigate".into(),
        },
        NodeTypeDefinition {
            type_name: "finding".into(),
            label: "Finding".into(),
            shape: "rounded".into(),
            color: "#f59e0b".into(),
            fields: vec![
                FieldDef { name: "claim".into(), field_type: "text".into(), description: "The finding claim".into() },
                FieldDef { name: "confidence".into(), field_type: "number".into(), description: "Confidence level (1-5)".into() },
            ],
            description: "A conclusion or finding from research".into(),
        },
        NodeTypeDefinition {
            type_name: "source".into(),
            label: "Source".into(),
            shape: "box".into(),
            color: "#22c55e".into(),
            fields: vec![
                FieldDef { name: "title".into(), field_type: "text".into(), description: "Source title".into() },
                FieldDef { name: "url".into(), field_type: "url".into(), description: "Source URL".into() },
                FieldDef { name: "relevance".into(), field_type: "number".into(), description: "Relevance score".into() },
            ],
            description: "A source of information (paper, article, etc.)".into(),
        },
        NodeTypeDefinition {
            type_name: "experiment".into(),
            label: "Experiment".into(),
            shape: "box".into(),
            color: "#8b5cf6".into(),
            fields: vec![
                FieldDef { name: "hypothesis".into(), field_type: "text".into(), description: "What is being tested".into() },
                FieldDef { name: "result".into(), field_type: "text".into(), description: "Experiment result".into() },
            ],
            description: "An experiment or test".into(),
        },
        NodeTypeDefinition {
            type_name: "checkpoint".into(),
            label: "Checkpoint".into(),
            shape: "box".into(),
            color: "#f97316".into(),
            fields: vec![
                FieldDef { name: "summary".into(), field_type: "text".into(), description: "Checkpoint summary".into() },
            ],
            description: "A research checkpoint".into(),
        },
        NodeTypeDefinition {
            type_name: "tool_building".into(),
            label: "Tool Building".into(),
            shape: "box".into(),
            color: "#06b6d4".into(),
            fields: vec![
                FieldDef { name: "tool_name".into(), field_type: "text".into(), description: "Name of the tool".into() },
                FieldDef { name: "status".into(), field_type: "text".into(), description: "Build status".into() },
            ],
            description: "A tool being built during research".into(),
        },
        NodeTypeDefinition {
            type_name: "gap".into(),
            label: "Gap".into(),
            shape: "dashed_box".into(),
            color: "#ec4899".into(),
            fields: vec![
                FieldDef { name: "description".into(), field_type: "text".into(), description: "What is missing".into() },
                FieldDef { name: "importance".into(), field_type: "text".into(), description: "How important this gap is".into() },
            ],
            description: "A gap in knowledge or research".into(),
        },
    ]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasState {
    pub nodes: Vec<StoredNode>,
    pub edges: Vec<EdgeData>,
    pub clusters: Vec<ClusterData>,
    #[serde(default = "builtin_node_types")]
    pub node_types: Vec<NodeTypeDefinition>,
}

impl Default for CanvasState {
    fn default() -> Self {
        Self {
            nodes: Vec::new(),
            edges: Vec::new(),
            clusters: Vec::new(),
            node_types: builtin_node_types(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredNode {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub title: String,
    pub summary: String,
    pub status: String,
    pub fields: HashMap<String, serde_json::Value>,
    pub cluster: Option<String>,
    pub created_at: String,
    pub loop_index: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClusterData {
    pub id: String,
    pub label: String,
    pub children: Vec<String>,
    pub collapsed: bool,
}

impl CanvasState {
    pub fn apply_ops(&mut self, ops: &[CanvasOp], loop_index: u32) {
        for op in ops {
            self.apply_op(op, loop_index);
        }
    }

    fn apply_op(&mut self, op: &CanvasOp, loop_index: u32) {
        match op {
            CanvasOp::ADD_NODE { node } => {
                let stored = StoredNode {
                    id: node.id.clone(),
                    node_type: node.node_type.clone(),
                    title: node.display_title(),
                    summary: node.display_summary(),
                    status: node.status.clone(),
                    fields: node.fields.clone(),
                    cluster: node.position_hint.as_ref().and_then(|h| h.cluster.clone()),
                    created_at: chrono::Utc::now().to_rfc3339(),
                    loop_index: Some(loop_index),
                };
                self.nodes.push(stored);
            }
            CanvasOp::UPDATE_NODE {
                id,
                status,
                summary,
                fields,
            } => {
                if let Some(node) = self.nodes.iter_mut().find(|n| &n.id == id) {
                    if let Some(s) = status {
                        node.status = s.clone();
                    }
                    if let Some(s) = summary {
                        node.summary = s.clone();
                    }
                    if let Some(f) = fields {
                        node.fields.extend(f.clone());
                    }
                }
            }
            CanvasOp::REMOVE_NODE { id } => {
                self.nodes.retain(|n| n.id != *id);
                self.edges.retain(|e| e.from != *id && e.to != *id);
            }
            CanvasOp::ADD_EDGE { edge } => {
                self.edges.push(edge.clone());
            }
            CanvasOp::REMOVE_EDGE { from, to } => {
                self.edges.retain(|e| !(e.from == *from && e.to == *to));
            }
            CanvasOp::ADD_CLUSTER {
                id,
                label,
                children,
            } => {
                self.clusters.push(ClusterData {
                    id: id.clone(),
                    label: label.clone(),
                    children: children.clone(),
                    collapsed: false,
                });
            }
            CanvasOp::DEFINE_NODE_TYPE {
                type_name,
                label,
                shape,
                color,
                fields,
                description,
            } => {
                let resolved_color = color
                    .clone()
                    .unwrap_or_else(|| default_color_for_type(type_name));
                let resolved_shape = shape.clone().unwrap_or_else(|| "box".to_string());

                // Replace if already exists, otherwise push
                if let Some(existing) = self.node_types.iter_mut().find(|t| &t.type_name == type_name) {
                    existing.label = label.clone();
                    existing.shape = resolved_shape;
                    existing.color = resolved_color;
                    existing.fields = fields.clone();
                    existing.description = description.clone();
                } else {
                    self.node_types.push(NodeTypeDefinition {
                        type_name: type_name.clone(),
                        label: label.clone(),
                        shape: resolved_shape,
                        color: resolved_color,
                        fields: fields.clone(),
                        description: description.clone(),
                    });
                }
            }
            CanvasOp::SET_FOCUS { .. } | CanvasOp::SNAPSHOT => {
                // These don't modify state
            }
        }
    }
}
