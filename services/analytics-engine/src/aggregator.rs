use std::sync::Arc;
use dashmap::DashMap;
use chrono::{DateTime, Utc};

#[derive(Clone, Default)]
pub struct Aggregator {
    // chat_leaderboard: GuildId -> UserID -> Count
    pub chat_leaderboard: Arc<DashMap<String, DashMap<String, u64>>>,
    // voice_leaderboard: GuildId -> UserID -> Seconds
    pub voice_leaderboard: Arc<DashMap<String, DashMap<String, u64>>>,
    // active_voice_sessions: (GuildId, UserId) -> (ChannelId, JoinTime)
    pub active_voice_sessions: Arc<DashMap<(String, String), (String, DateTime<Utc>)>>,
}

impl Aggregator {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn record_message(&self, guild_id: &str, author_id: &str) {
        let guild_map = self.chat_leaderboard.entry(guild_id.to_string()).or_default();
        let mut count = guild_map.entry(author_id.to_string()).or_default();
        *count += 1;
    }

    pub fn record_voice_join(&self, guild_id: &str, user_id: &str, channel_id: &str, time: DateTime<Utc>) {
        self.active_voice_sessions.insert(
            (guild_id.to_string(), user_id.to_string()),
            (channel_id.to_string(), time),
        );
    }

    pub fn record_voice_leave(&self, guild_id: &str, user_id: &str, time: DateTime<Utc>) -> Option<u64> {
        if let Some((_, (_, join_time))) = self.active_voice_sessions.remove(&(guild_id.to_string(), user_id.to_string())) {
            let duration = time.signed_duration_since(join_time).num_seconds();
            let secs = if duration > 0 { duration as u64 } else { 0 };

            let guild_map = self.voice_leaderboard.entry(guild_id.to_string()).or_default();
            let mut total = guild_map.entry(user_id.to_string()).or_default();
            *total += secs;
            return Some(secs);
        }
        None
    }

    pub fn get_leaderboard(&self, is_voice: bool, guild_id: &str, limit: usize) -> Vec<(String, u64)> {
        let source_map = if is_voice {
            self.voice_leaderboard.get(guild_id)
        } else {
            self.chat_leaderboard.get(guild_id)
        };

        if let Some(map) = source_map {
            let mut entries: Vec<(String, u64)> = map.iter().map(|kv| (kv.key().clone(), *kv.value())).collect();
            entries.sort_by(|a, b| b.1.cmp(&a.1));
            entries.truncate(limit);
            return entries;
        }
        vec![]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn test_record_message() {
        let agg = Aggregator::new();
        agg.record_message("g1", "u1");
        agg.record_message("g1", "u1");
        agg.record_message("g1", "u2");

        let chat_lead = agg.get_leaderboard(false, "g1", 10);
        assert_eq!(chat_lead.len(), 2);
        assert_eq!(chat_lead[0], ("u1".to_string(), 2));
        assert_eq!(chat_lead[1], ("u2".to_string(), 1));
    }

    #[test]
    fn test_voice_session() {
        let agg = Aggregator::new();
        let t1 = Utc.timestamp_opt(1600000000, 0).unwrap();
        let t2 = Utc.timestamp_opt(1600003600, 0).unwrap(); // 1 hour later

        agg.record_voice_join("g1", "u1", "c1", t1);
        let duration = agg.record_voice_leave("g1", "u1", t2);
        assert_eq!(duration, Some(3600));

        let voice_lead = agg.get_leaderboard(true, "g1", 10);
        assert_eq!(voice_lead.len(), 1);
        assert_eq!(voice_lead[0], ("u1".to_string(), 3600));
    }
}
