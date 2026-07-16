use std::sync::Arc;
use dashmap::DashMap;
use chrono::{DateTime, Utc, Duration as ChronoDuration};

#[derive(Clone)]
pub struct MessageEvent {
    pub author_id: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone)]
pub struct VoiceEvent {
    pub user_id: String,
    pub duration_secs: u64,
    pub joined_at: DateTime<Utc>,
}

#[derive(Clone, Default)]
pub struct Aggregator {
    // 30-day raw event lists for dynamic filtering
    pub chat_events: Arc<DashMap<String, Vec<MessageEvent>>>,
    pub voice_events: Arc<DashMap<String, Vec<VoiceEvent>>>,

    // Cumulative counters for "all time"
    pub chat_all_time: Arc<DashMap<String, DashMap<String, u64>>>,
    pub voice_all_time: Arc<DashMap<String, DashMap<String, u64>>>,

    // active_voice_sessions: (GuildId, UserId) -> (ChannelId, JoinTime)
    pub active_voice_sessions: Arc<DashMap<(String, String), (String, DateTime<Utc>)>>,
}

impl Aggregator {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn record_message(&self, guild_id: &str, author_id: &str, time: DateTime<Utc>) {
        // 1. Add to 30-day raw list
        let mut events = self.chat_events.entry(guild_id.to_string()).or_default();
        events.push(MessageEvent {
            author_id: author_id.to_string(),
            created_at: time,
        });

        // 2. Increment all time
        let guild_all = self.chat_all_time.entry(guild_id.to_string()).or_default();
        let mut count = guild_all.entry(author_id.to_string()).or_default();
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

            // 1. Add to 30-day raw list
            let mut events = self.voice_events.entry(guild_id.to_string()).or_default();
            events.push(VoiceEvent {
                user_id: user_id.to_string(),
                duration_secs: secs,
                joined_at: join_time,
            });

            // 2. Increment all time
            let guild_all = self.voice_all_time.entry(guild_id.to_string()).or_default();
            let mut total = guild_all.entry(user_id.to_string()).or_default();
            *total += secs;
            return Some(secs);
        }
        None
    }

    pub fn get_leaderboard(&self, is_voice: bool, guild_id: &str, days: &str, limit: usize) -> Vec<(String, u64)> {
        if days == "all" {
            let all_time_map = if is_voice {
                self.voice_all_time.get(guild_id)
            } else {
                self.chat_all_time.get(guild_id)
            };
            if let Some(map) = all_time_map {
                let mut entries: Vec<(String, u64)> = map.iter().map(|kv| (kv.key().clone(), *kv.value())).collect();
                entries.sort_by(|a, b| b.1.cmp(&a.1));
                entries.truncate(limit);
                return entries;
            }
            return vec![];
        }

        let num_days = days.parse::<i64>().unwrap_or(7);
        let cutoff = Utc::now() - ChronoDuration::days(num_days);

        let mut user_scores: std::collections::HashMap<String, u64> = std::collections::HashMap::new();

        if is_voice {
            if let Some(events_ref) = self.voice_events.get(guild_id) {
                for event in events_ref.iter() {
                    if event.joined_at >= cutoff {
                        *user_scores.entry(event.user_id.clone()).or_default() += event.duration_secs;
                    }
                }
            }
        } else {
            if let Some(events_ref) = self.chat_events.get(guild_id) {
                for event in events_ref.iter() {
                    if event.created_at >= cutoff {
                        *user_scores.entry(event.author_id.clone()).or_default() += 1;
                    }
                }
            }
        }

        let mut entries: Vec<(String, u64)> = user_scores.into_iter().collect();
        entries.sort_by(|a, b| b.1.cmp(&a.1));
        entries.truncate(limit);
        entries
    }

    pub fn prune_old_events(&self) {
        let cutoff = Utc::now() - ChronoDuration::days(30);

        for mut entry in self.chat_events.iter_mut() {
            let events = entry.value_mut();
            events.retain(|e| e.created_at >= cutoff);
        }

        for mut entry in self.voice_events.iter_mut() {
            let events = entry.value_mut();
            events.retain(|e| e.joined_at >= cutoff);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn test_record_message() {
        let agg = Aggregator::new();
        let now = Utc::now();
        agg.record_message("g1", "u1", now);
        agg.record_message("g1", "u1", now);
        agg.record_message("g1", "u2", now);

        let chat_lead = agg.get_leaderboard(false, "g1", "7", 10);
        assert_eq!(chat_lead.len(), 2);
        assert_eq!(chat_lead[0], ("u1".to_string(), 2));
        assert_eq!(chat_lead[1], ("u2".to_string(), 1));

        let chat_all = agg.get_leaderboard(false, "g1", "all", 10);
        assert_eq!(chat_all[0], ("u1".to_string(), 2));
    }
}
