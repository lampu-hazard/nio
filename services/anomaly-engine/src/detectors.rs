use crate::proto::{AnalyzeMessageRequest, AnalyzeMessageResponse, Decision, Severity, Finding, FindingKind};
use crate::state::EngineState;
use std::collections::HashMap;

pub fn analyze(req: &AnalyzeMessageRequest, state: &EngineState) -> AnalyzeMessageResponse {
    let mut findings = vec![];
    let mut metrics = HashMap::new();
    let now = req.timestamp_ms;

    let key = format!("{}:{}", req.guild_id, req.channel_id);
    let mut channel_entry = state.entry(key).or_default();
    let channel_state = channel_entry.value_mut();

    // Prune old history
    channel_state.prune(now);

    // Calculate metrics
    let messages_in_60s = channel_state.history.len();
    let unique_users_in_60s = {
        let mut users: Vec<String> = channel_state.history.iter().map(|m| m.user_id.clone()).collect();
        users.sort();
        users.dedup();
        users.len()
    };

    metrics.insert("messages_in_60s".to_string(), messages_in_60s as f64);
    metrics.insert("unique_users_in_60s".to_string(), unique_users_in_60s as f64);

    // Record the current message in state (skip system periodic checks if any)
    let urls_count = req.urls.len();
    let mentions_count = req.content.matches("<@").count();

    channel_state.history.push(crate::state::MessageRecord {
        timestamp_ms: now,
        user_id: req.user_id.clone(),
        mentions_count,
        urls_count,
    });

    // 1. Phishing Detector
    if let Some(config) = &req.config {
        if config.phishing_enabled {
            let mut detected_phishing = false;
            let mut phishing_domain = String::new();

            // Check for typical discord gift/nitro/airdrop phishing domain keywords
            let phishing_keywords = vec!["gift", "nitro", "airdrop", "free-discord", "claim-", "steam-comm"];
            for url in &req.urls {
                let domain = url.replace("http://", "").replace("https://", "");
                let domain_parts: Vec<&str> = domain.split('/').collect();
                let actual_domain = domain_parts[0].to_lowercase();

                // Simple check for keyword matches outside of discordapp.com / discord.gg / discord.com
                let is_trusted = actual_domain.contains("discord.com")
                    || actual_domain.contains("discordapp.com")
                    || actual_domain.contains("discord.gg")
                    || actual_domain.contains("steamcommunity.com");

                if !is_trusted {
                    for kw in &phishing_keywords {
                        if actual_domain.contains(kw) {
                            detected_phishing = true;
                            phishing_domain = actual_domain.clone();
                            break;
                        }
                    }
                }
            }

            if detected_phishing {
                let mut evidence = HashMap::new();
                evidence.insert("domain".to_string(), phishing_domain);
                findings.push(Finding {
                    kind: FindingKind::PhishingLink as i32,
                    severity: Severity::Critical as i32,
                    confidence: 0.95,
                    reason: "Suspicious link containing phishing patterns".to_string(),
                    evidence,
                });
            }
        }
    }

    // 2. Content Anomaly Detector
    if let Some(config) = &req.config {
        if config.content_anomaly_enabled {
            // Check for excessive mentions
            if mentions_count >= 5 {
                let mut evidence = HashMap::new();
                evidence.insert("mentions".to_string(), mentions_count.to_string());
                findings.push(Finding {
                    kind: FindingKind::ContentAnomaly as i32,
                    severity: Severity::High as i32,
                    confidence: 0.90,
                    reason: "Excessive mentions in message".to_string(),
                    evidence,
                });
            }
        }
    }

    // 3. User Anomaly Detector
    if let Some(config) = &req.config {
        if config.user_anomaly_enabled {
            // Check if user is spamming messages in last 60s
            let user_msg_count = channel_state.history.iter().filter(|m| m.user_id == req.user_id).count();
            if user_msg_count > 10 {
                let mut evidence = HashMap::new();
                evidence.insert("messages_in_60s".to_string(), user_msg_count.to_string());
                findings.push(Finding {
                    kind: FindingKind::UserAnomaly as i32,
                    severity: Severity::Medium as i32,
                    confidence: 0.85,
                    reason: "High message volume from user in short window".to_string(),
                    evidence,
                });
            }
        }
    }

    // 4. Guild Baseline Anomaly Detector
    if let Some(config) = &req.config {
        if config.guild_baseline_enabled {
            // Sudden burst in general channel activity
            if messages_in_60s > 40 {
                let mut evidence = HashMap::new();
                evidence.insert("rate".to_string(), format!("{}/min", messages_in_60s));
                findings.push(Finding {
                    kind: FindingKind::GuildBaselineAnomaly as i32,
                    severity: Severity::Low as i32,
                    confidence: 0.70,
                    reason: "Channel activity rate significantly above average baseline".to_string(),
                    evidence,
                });
            }
        }
    }

    // Decision Aggregation
    let mut final_decision = Decision::Allow;
    let mut final_severity = Severity::Unspecified;
    let mut max_confidence = 0.0;
    let mut reason = "All checks passed".to_string();

    for finding in &findings {
        if finding.confidence > max_confidence {
            max_confidence = finding.confidence;
        }

        if finding.severity > final_severity as i32 {
            final_severity = match finding.severity {
                1 => Severity::Low,
                2 => Severity::Medium,
                3 => Severity::High,
                4 => Severity::Critical,
                _ => Severity::Unspecified,
            };
        }

        // Action routing based on detector config
        if finding.kind == FindingKind::PhishingLink as i32 && finding.severity == Severity::Critical as i32 {
            final_decision = Decision::DeleteMessage;
            reason = format!("Phishing link detected: {}", finding.reason);
        } else if finding.severity >= Severity::High as i32 && (final_decision as i32) < (Decision::Audit as i32) {
            final_decision = Decision::Audit;
            reason = format!("Content anomaly warning: {}", finding.reason);
        }
    }

    AnalyzeMessageResponse {
        decision: final_decision as i32,
        severity: final_severity as i32,
        confidence: max_confidence,
        reason,
        findings,
        metrics,
    }
}
