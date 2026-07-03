use crate::types::{AnalyzeRequest, AnalyzeResponse, SlowmodeLevel, TrafficMetrics};
use crate::state::ChannelTraffic;

pub fn analyze_channel(
    req: &AnalyzeRequest,
    traffic: &mut ChannelTraffic,
) -> AnalyzeResponse {
    let now = req.timestamp_ms;

    // Skip recording system periodic checkups as regular messages
    if req.user_id != "SYSTEM" {
        traffic.record(now, req.user_id.clone());
    }

    traffic.prune(now);

    let (m10, m60, u60) = traffic.get_metrics(now);

    let metrics = TrafficMetrics {
        messages_in_10s: m10,
        messages_in_60s: m60,
        unique_users_in_60s: u60,
    };

    // Determine target slowmode level
    let (level, recommended_seconds, reason) = if m10 >= 8 || m60 >= 30 {
        (
            SlowmodeLevel::Busy,
            req.config.busy_seconds,
            format!("Traffic burst detected ({} msgs in 10s)", m10)
        )
    } else if m10 >= 3 || m60 >= 10 {
        (
            SlowmodeLevel::Normal,
            req.config.normal_seconds,
            format!("Moderate steady traffic ({} msgs in 60s)", m60)
        )
    } else if m60 == 0 || (req.user_id == "SYSTEM" && m10 == 0) {
        (
            SlowmodeLevel::Quiet,
            req.config.quiet_seconds,
            "Channel is quiet".to_string()
        )
    } else {
        if req.current_slowmode_seconds == req.config.quiet_seconds {
            (SlowmodeLevel::Quiet, req.config.quiet_seconds, "Channel is quiet".to_string())
        } else if req.current_slowmode_seconds == req.config.busy_seconds {
            (SlowmodeLevel::Normal, req.config.normal_seconds, "Slowing down from busy traffic".to_string())
        } else {
            (SlowmodeLevel::Normal, req.config.normal_seconds, "Regular channel conversation".to_string())
        }
    };

    let should_apply = recommended_seconds != req.current_slowmode_seconds;

    AnalyzeResponse {
        level,
        recommended_seconds,
        should_apply,
        reason,
        metrics,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::SlowmodeConfig;

    fn test_config() -> SlowmodeConfig {
        SlowmodeConfig {
            quiet_seconds: 0,
            normal_seconds: 5,
            busy_seconds: 15,
        }
    }

    #[test]
    fn test_quiet_initially() {
        let mut traffic = ChannelTraffic::default();
        let config = test_config();

        // System query initially
        let req = AnalyzeRequest {
            guild_id: "g1".to_string(),
            channel_id: "c1".to_string(),
            user_id: "SYSTEM".to_string(),
            timestamp_ms: 10000,
            current_slowmode_seconds: 0,
            config: config.clone(),
        };

        let resp = analyze_channel(&req, &mut traffic);
        assert!(matches!(resp.level, SlowmodeLevel::Quiet));
        assert_eq!(resp.recommended_seconds, 0);
        assert!(!resp.should_apply); // current is 0, recommended is 0
    }

    #[test]
    fn test_normal_transition() {
        let mut traffic = ChannelTraffic::default();
        let config = test_config();

        // Send 3 messages within 10 seconds
        for i in 0..3 {
            let req = AnalyzeRequest {
                guild_id: "g1".to_string(),
                channel_id: "c1".to_string(),
                user_id: format!("user_{}", i),
                timestamp_ms: 1000 + i * 1000,
                current_slowmode_seconds: 0,
                config: config.clone(),
            };
            let resp = analyze_channel(&req, &mut traffic);
            if i < 2 {
                assert!(matches!(resp.level, SlowmodeLevel::Quiet));
                assert_eq!(resp.recommended_seconds, 0);
                assert!(!resp.should_apply);
            } else if i == 2 {
                assert!(matches!(resp.level, SlowmodeLevel::Normal));
                assert_eq!(resp.recommended_seconds, 5);
                assert!(resp.should_apply); // transition from 0 to 5
            }
        }
    }

    #[test]
    fn test_busy_transition() {
        let mut traffic = ChannelTraffic::default();
        let config = test_config();

        // Send 8 messages within 10 seconds
        for i in 0..8 {
            let req = AnalyzeRequest {
                guild_id: "g1".to_string(),
                channel_id: "c1".to_string(),
                user_id: format!("user_{}", i),
                timestamp_ms: 1000 + i * 500, // 3.5 seconds total
                current_slowmode_seconds: 5,
                config: config.clone(),
            };
            let resp = analyze_channel(&req, &mut traffic);
            if i == 7 {
                assert!(matches!(resp.level, SlowmodeLevel::Busy));
                assert_eq!(resp.recommended_seconds, 15);
                assert!(resp.should_apply); // transition from 5 to 15
            }
        }
    }

    #[test]
    fn test_system_message_not_recorded() {
        let mut traffic = ChannelTraffic::default();
        let config = test_config();

        // Send a system query
        let req = AnalyzeRequest {
            guild_id: "g1".to_string(),
            channel_id: "c1".to_string(),
            user_id: "SYSTEM".to_string(),
            timestamp_ms: 1000,
            current_slowmode_seconds: 0,
            config: config.clone(),
        };
        let resp = analyze_channel(&req, &mut traffic);
        assert_eq!(resp.metrics.messages_in_60s, 0); // System queries shouldn't count as traffic
    }
}
