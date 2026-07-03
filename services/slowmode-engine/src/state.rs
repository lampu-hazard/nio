use std::sync::Arc;
use dashmap::DashMap;

#[derive(Debug, Clone)]
pub struct MessageRecord {
    pub timestamp_ms: u64,
    pub user_id: String,
}

#[derive(Debug, Clone, Default)]
pub struct ChannelTraffic {
    pub history: Vec<MessageRecord>,
}

impl ChannelTraffic {
    pub fn prune(&mut self, current_time_ms: u64) {
        // Keep only messages from the last 60 seconds
        let limit = current_time_ms.saturating_sub(60000);
        self.history.retain(|r| r.timestamp_ms > limit);
    }

    pub fn record(&mut self, timestamp_ms: u64, user_id: String) {
        self.history.push(MessageRecord { timestamp_ms, user_id });
    }

    pub fn get_metrics(&self, current_time_ms: u64) -> (usize, usize, usize) {
        let limit_10s = current_time_ms.saturating_sub(10000);

        let messages_in_10s = self.history.iter()
            .filter(|r| r.timestamp_ms > limit_10s)
            .count();

        let messages_in_60s = self.history.len();

        let mut unique_users = self.history.iter()
            .map(|r| &r.user_id)
            .collect::<Vec<_>>();
        unique_users.sort();
        unique_users.dedup();
        let unique_users_in_60s = unique_users.len();

        (messages_in_10s, messages_in_60s, unique_users_in_60s)
    }
}

pub type AppState = Arc<DashMap<String, ChannelTraffic>>;
