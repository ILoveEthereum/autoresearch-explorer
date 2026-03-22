use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::operations::{CanvasOp, EdgeData};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CanvasState {
    pub nodes: Vec<StoredNode>,
    pub edges: Vec<EdgeData>,
    pub clusters: Vec<ClusterData>,
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
                    title: node.title.clone(),
                    summary: node.summary.clone(),
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
            CanvasOp::SET_FOCUS { .. } | CanvasOp::SNAPSHOT => {
                // These don't modify state
            }
        }
    }
}
