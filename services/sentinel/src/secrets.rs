use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::OnceLock;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SecretDetection {
    pub secret_type: String,
    pub preview: String,
    pub confidence: f64,
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SecretScanResult {
    pub has_secrets: bool,
    pub detections: Vec<SecretDetection>,
    pub redacted_text: String,
}

pub fn shannon_entropy(s: &str) -> f64 {
    if s.is_empty() {
        return 0.0;
    }
    let mut counts = HashMap::new();
    let mut total_chars = 0;
    for c in s.chars() {
        *counts.entry(c).or_insert(0usize) += 1;
        total_chars += 1;
    }

    let len = total_chars as f64;
    let mut entropy = 0.0;
    for &count in counts.values() {
        let p = (count as f64) / len;
        entropy -= p * p.log2();
    }
    entropy
}

struct SecretRule {
    name: &'static str,
    regex: &'static str,
    confidence: f64,
}

static RULES: &[SecretRule] = &[
    SecretRule {
        name: "DISCORD_BOT_TOKEN",
        regex: r#"[MNO][a-zA-Z\d_-]{23,26}\.[a-zA-Z\d_-]{6}\.[a-zA-Z\d_-]{27,38}"#,
        confidence: 0.99,
    },
    SecretRule {
        name: "OPENAI_API_KEY",
        regex: r#"sk-(?:proj-)?[A-Za-z0-9_-]{32,}"#,
        confidence: 0.98,
    },
    SecretRule {
        name: "ANTHROPIC_API_KEY",
        regex: r#"sk-ant-[A-Za-z0-9_-]{32,}"#,
        confidence: 0.98,
    },
    SecretRule {
        name: "GITHUB_TOKEN",
        regex: r#"(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82}"#,
        confidence: 0.98,
    },
    SecretRule {
        name: "AWS_ACCESS_KEY",
        regex: r#"AKIA[0-9A-Z]{16}"#,
        confidence: 0.95,
    },
    SecretRule {
        name: "PRIVATE_KEY",
        regex: r#"-----BEGIN [A-Z ]*PRIVATE KEY-----"#,
        confidence: 0.99,
    },
    SecretRule {
        name: "DATABASE_CONNECTION_URI",
        regex: r#"(?:postgres|postgresql|mysql|mongodb|redis)://[^:]+:[^@]+@[^\s/]+"#,
        confidence: 0.96,
    },
];

static COMPILED_RULES: OnceLock<Vec<(&'static str, Regex, f64)>> = OnceLock::new();

fn get_compiled_rules() -> &'static Vec<(&'static str, Regex, f64)> {
    COMPILED_RULES.get_or_init(|| {
        RULES
            .iter()
            .filter_map(|r| {
                Regex::new(r.regex).ok().map(|re| (r.name, re, r.confidence))
            })
            .collect()
    })
}

pub fn scan_secrets(text: &str) -> SecretScanResult {
    let rules = get_compiled_rules();
    let mut detections = Vec::new();
    let mut redacted_spans: Vec<(usize, usize, String)> = Vec::new();

    // 1. Pattern matching with regex
    for (name, re, conf) in rules {
        for mat in re.find_iter(text) {
            let start = mat.start();
            let end = mat.end();
            let matched_str = mat.as_str();

            let preview = if matched_str.len() > 10 {
                format!("{}...{}", &matched_str[..4], &matched_str[matched_str.len() - 4..])
            } else {
                "[REDACTED]".to_string()
            };

            detections.push(SecretDetection {
                secret_type: name.to_string(),
                preview,
                confidence: *conf,
                start,
                end,
            });

            redacted_spans.push((start, end, format!("[REDACTED:{}]", name)));
        }
    }

    // 2. High-entropy token detection on individual words
    for word in text.split_whitespace() {
        let clean_word = word.trim_matches(|c: char| !c.is_alphanumeric() && c != '-' && c != '_');
        if clean_word.len() >= 24 {
            let entropy = shannon_entropy(clean_word);
            // High entropy threshold for secrets like hex/base64 strings
            if entropy >= 4.3 {
                if let Some(pos) = text.find(clean_word) {
                    let end = pos + clean_word.len();
                    let already_detected = detections.iter().any(|d| d.start <= pos && d.end >= end);
                    if !already_detected {
                        let preview = format!("{}...{}", &clean_word[..4], &clean_word[clean_word.len() - 4..]);
                        detections.push(SecretDetection {
                            secret_type: "HIGH_ENTROPY_STRING".to_string(),
                            preview,
                            confidence: 0.85,
                            start: pos,
                            end,
                        });
                        redacted_spans.push((pos, end, "[REDACTED:HIGH_ENTROPY]".to_string()));
                    }
                }
            }
        }
    }

    // Sort spans by start descending to replace cleanly from right to left
    redacted_spans.sort_by(|a, b| b.0.cmp(&a.0));

    let mut redacted_text = text.to_string();
    for (start, end, replacement) in redacted_spans {
        if start < redacted_text.len() && end <= redacted_text.len() && start <= end {
            redacted_text.replace_range(start..end, &replacement);
        }
    }

    let has_secrets = !detections.is_empty();

    SecretScanResult {
        has_secrets,
        detections,
        redacted_text,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shannon_entropy() {
        let low = "aaaaaaaaaaaaaaaaaaaaaaaa";
        assert!(shannon_entropy(low) < 0.1);

        let high = "A9f8G2kL1xZ7bQ5mP3wT6vR8sY0uI4";
        assert!(shannon_entropy(high) > 4.0);
    }

    #[test]
    fn test_detect_openai_key() {
        let fake_key = format!("sk-{}", "abcdef1234567890abcdef1234567890");
        let input = format!("Check out my key: {} for testing", fake_key);
        let res = scan_secrets(&input);
        assert!(res.has_secrets);
        assert_eq!(res.detections[0].secret_type, "OPENAI_API_KEY");
        assert!(res.redacted_text.contains("[REDACTED:OPENAI_API_KEY]"));
        assert!(!res.redacted_text.contains(&fake_key));
    }

    #[test]
    fn test_detect_database_uri() {
        let fake_pwd = "dummy_pass_123";
        let input = format!("connection string is postgres://admin:{}@postgres-host:5432/nio-db", fake_pwd);
        let res = scan_secrets(&input);
        assert!(res.has_secrets);
        assert!(res.detections.iter().any(|d| d.secret_type == "DATABASE_CONNECTION_URI"));
        assert!(res.redacted_text.contains("[REDACTED:DATABASE_CONNECTION_URI]"));
    }

    #[test]
    fn test_clean_text() {
        let input = "Hello world, this is a normal message about gaming!";
        let res = scan_secrets(input);
        assert!(!res.has_secrets);
        assert_eq!(res.redacted_text, input);
    }
}
