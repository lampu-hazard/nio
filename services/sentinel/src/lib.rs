pub mod phishing;
pub mod secrets;
pub mod simhash;

use napi_derive::napi;

#[napi(object)]
pub struct PhishingResult {
    pub is_suspicious: bool,
    pub confidence: f64,
    pub detected_target: Option<String>,
    pub reasons: Vec<String>,
    pub normalized_domain: String,
}

#[napi(object)]
pub struct SecretDetectionItem {
    pub secret_type: String,
    pub preview: String,
    pub confidence: f64,
    pub start: u32,
    pub end: u32,
}

#[napi(object)]
pub struct SecretResult {
    pub has_secrets: bool,
    pub detections: Vec<SecretDetectionItem>,
    pub redacted_text: String,
}

#[napi(object)]
pub struct RaidClusterItem {
    pub representative_index: u32,
    pub matching_indices: Vec<u32>,
    pub average_similarity: f64,
}

#[napi(object)]
pub struct RaidResult {
    pub is_raid_detected: bool,
    pub largest_cluster_size: u32,
    pub clusters: Vec<RaidClusterItem>,
}

#[napi]
pub fn scan_phishing_url(raw_url: String) -> PhishingResult {
    let res = phishing::scan_url(&raw_url);
    PhishingResult {
        is_suspicious: res.is_suspicious,
        confidence: res.confidence,
        detected_target: res.detected_target,
        reasons: res.reasons,
        normalized_domain: res.normalized_domain,
    }
}

#[napi]
pub fn compute_simhash_hex(text: String) -> String {
    let hash = simhash::compute_simhash(&text);
    format!("{:016x}", hash)
}

#[napi]
pub fn calculate_similarity(hash_a: String, hash_b: String) -> f64 {
    let a = u64::from_str_radix(&hash_a, 16).unwrap_or(0);
    let b = u64::from_str_radix(&hash_b, 16).unwrap_or(0);
    simhash::similarity_score(a, b)
}

#[napi]
pub fn check_raid_messages(messages: Vec<String>, threshold: Option<f64>) -> RaidResult {
    let thresh = threshold.unwrap_or(0.85);
    let res = simhash::detect_raid_similarity(&messages, thresh);
    RaidResult {
        is_raid_detected: res.is_raid_detected,
        largest_cluster_size: res.largest_cluster_size as u32,
        clusters: res
            .clusters
            .into_iter()
            .map(|c| RaidClusterItem {
                representative_index: c.representative_index as u32,
                matching_indices: c.matching_indices.into_iter().map(|i| i as u32).collect(),
                average_similarity: c.average_similarity,
            })
            .collect(),
    }
}

#[napi]
pub fn scan_and_redact_secrets(text: String) -> SecretResult {
    let res = secrets::scan_secrets(&text);
    SecretResult {
        has_secrets: res.has_secrets,
        detections: res
            .detections
            .into_iter()
            .map(|d| SecretDetectionItem {
                secret_type: d.secret_type,
                preview: d.preview,
                confidence: d.confidence,
                start: d.start as u32,
                end: d.end as u32,
            })
            .collect(),
        redacted_text: res.redacted_text,
    }
}
