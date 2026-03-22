use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum HumanSignal {
    Chat { text: String, referenced_nodes: Vec<String> },
    Prioritize { node_id: String },
    Deprioritize { node_id: String },
    Challenge { node_id: String },
    Annotate { text: String, near_node_id: String },
    Investigate { from_id: String, to_id: String },
}

/// Thread-safe queue for human signals.
pub struct SignalQueue {
    signals: Mutex<Vec<HumanSignal>>,
}

impl SignalQueue {
    pub fn new() -> Self {
        Self {
            signals: Mutex::new(Vec::new()),
        }
    }

    pub fn push(&self, signal: HumanSignal) {
        let mut signals = self.signals.lock().unwrap();
        signals.push(signal);
    }

    /// Drain all pending signals.
    pub fn drain(&self) -> Vec<HumanSignal> {
        let mut signals = self.signals.lock().unwrap();
        std::mem::take(&mut *signals)
    }
}
