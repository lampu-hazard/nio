use std::sync::Arc;
use dashmap::DashMap;

#[derive(Debug, Clone)]
pub struct MessageRecord {
    pub timestamp_ms: i64,
    pub user_id: String,
    pub mentions_count: usize,
    pub urls_count: usize,
}

#[derive(Debug, Clone, Default)]
pub struct ChannelState {
    pub history: Vec<MessageRecord>,
}

impl ChannelState {
    pub fn prune(&mut self, now_ms: i64) {
        let limit = now_ms - 60000; // 60 seconds sliding window
        self.history.retain(|r| r.timestamp_ms > limit);
    }
}

pub type EngineState = Arc<DashMap<String, ChannelState>>;
