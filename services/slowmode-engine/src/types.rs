use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SlowmodeConfig {
    pub quiet_seconds: u32,
    pub normal_seconds: u32,
    pub busy_seconds: u32,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeRequest {
    pub guild_id: String,
    pub channel_id: String,
    pub user_id: String,
    pub timestamp_ms: u64,
    pub current_slowmode_seconds: u32,
    pub config: SlowmodeConfig,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TrafficMetrics {
    pub messages_in_10s: usize,
    pub messages_in_60s: usize,
    pub unique_users_in_60s: usize,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "UPPERCASE")]
pub enum SlowmodeLevel {
    Quiet,
    Normal,
    Busy,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeResponse {
    pub level: SlowmodeLevel,
    pub recommended_seconds: u32,
    pub should_apply: bool,
    pub reason: String,
    pub metrics: TrafficMetrics,
}
