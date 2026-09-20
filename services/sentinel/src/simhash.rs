use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SimHashResult {
    pub hash: String, // Hex representation of 64-bit hash
    pub tokens_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RaidCluster {
    pub representative_index: usize,
    pub matching_indices: Vec<usize>,
    pub average_similarity: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RaidDetectionResult {
    pub is_raid_detected: bool,
    pub largest_cluster_size: usize,
    pub clusters: Vec<RaidCluster>,
}

const FNV_OFFSET_BASIS_64: u64 = 0xcbf29ce484222325;
const FNV_PRIME_64: u64 = 0x100000001b3;

/// 64-bit FNV-1a hash
#[inline]
pub fn fnv1a_64(bytes: &[u8]) -> u64 {
    let mut hash = FNV_OFFSET_BASIS_64;
    for &byte in bytes {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(FNV_PRIME_64);
    }
    hash
}

/// Tokenize string into character 3-grams and words
pub fn tokenize(text: &str) -> Vec<String> {
    let cleaned: String = text
        .to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == ' ')
        .collect();

    let words: Vec<&str> = cleaned.split_whitespace().collect();
    let mut tokens = Vec::new();

    // Word tokens
    for word in &words {
        tokens.push((*word).to_string());
    }

    // 3-grams across text
    let chars: Vec<char> = cleaned.chars().filter(|c| !c.is_whitespace()).collect();
    if chars.len() >= 3 {
        for window in chars.windows(3) {
            tokens.push(window.iter().collect::<String>());
        }
    }

    tokens
}

/// Compute 64-bit SimHash
pub fn compute_simhash(text: &str) -> u64 {
    let tokens = tokenize(text);
    if tokens.is_empty() {
        return 0;
    }

    let mut v = [0i32; 64];

    for token in tokens {
        let h = fnv1a_64(token.as_bytes());
        for i in 0..64 {
            let bit = (h >> i) & 1;
            if bit == 1 {
                v[i] += 1;
            } else {
                v[i] -= 1;
            }
        }
    }

    let mut fingerprint: u64 = 0;
    for i in 0..64 {
        if v[i] > 0 {
            fingerprint |= 1 << i;
        }
    }

    fingerprint
}

/// Calculate Hamming distance between two 64-bit SimHashes
#[inline]
pub fn hamming_distance(a: u64, b: u64) -> u32 {
    (a ^ b).count_ones()
}

/// Calculate similarity score in range [0.0, 1.0]
#[inline]
pub fn similarity_score(a: u64, b: u64) -> f64 {
    let dist = hamming_distance(a, b);
    1.0 - (dist as f64 / 64.0)
}

/// Detect coordinated raid patterns from a batch of recent messages
pub fn detect_raid_similarity(messages: &[String], threshold: f64) -> RaidDetectionResult {
    if messages.len() < 3 {
        return RaidDetectionResult {
            is_raid_detected: false,
            largest_cluster_size: 0,
            clusters: vec![],
        };
    }

    let hashes: Vec<u64> = messages.iter().map(|m| compute_simhash(m)).collect();
    let mut visited = vec![false; messages.len()];
    let mut clusters = Vec::new();

    for i in 0..messages.len() {
        if visited[i] || hashes[i] == 0 {
            continue;
        }

        let mut matching_indices = vec![i];
        let mut sim_sum = 0.0;
        let mut comparisons = 0;

        for j in (i + 1)..messages.len() {
            if visited[j] || hashes[j] == 0 {
                continue;
            }

            let sim = similarity_score(hashes[i], hashes[j]);
            if sim >= threshold {
                matching_indices.push(j);
                visited[j] = true;
                sim_sum += sim;
                comparisons += 1;
            }
        }

        if matching_indices.len() >= 3 {
            visited[i] = true;
            let avg_sim = if comparisons > 0 {
                sim_sum / comparisons as f64
            } else {
                1.0
            };

            clusters.push(RaidCluster {
                representative_index: i,
                matching_indices,
                average_similarity: avg_sim,
            });
        }
    }

    let largest_cluster_size = clusters.iter().map(|c| c.matching_indices.len()).max().unwrap_or(0);
    let is_raid_detected = largest_cluster_size >= 3;

    RaidDetectionResult {
        is_raid_detected,
        largest_cluster_size,
        clusters,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_identical_messages_simhash() {
        let msg = "Free Discord Nitro giveaway join now";
        let h1 = compute_simhash(msg);
        let h2 = compute_simhash(msg);
        assert_eq!(h1, h2);
        assert_eq!(hamming_distance(h1, h2), 0);
        assert_eq!(similarity_score(h1, h2), 1.0);
    }

    #[test]
    fn test_near_duplicate_messages() {
        let msg1 = "Free Discord Nitro giveaway join here: https://discord.gift/123";
        let msg2 = "Free Discord Nitro giveaway join here: https://discord.gift/987";
        let h1 = compute_simhash(msg1);
        let h2 = compute_simhash(msg2);

        let sim = similarity_score(h1, h2);
        assert!(sim >= 0.85, "Expected high similarity, got {}", sim);
    }

    #[test]
    fn test_completely_different_messages() {
        let msg1 = "Hey guys what time are we playing Valorant tonight?";
        let msg2 = "I'm baking some chocolate chip cookies right now.";
        let h1 = compute_simhash(msg1);
        let h2 = compute_simhash(msg2);

        let sim = similarity_score(h1, h2);
        assert!(sim < 0.70, "Expected low similarity, got {}", sim);
    }

    #[test]
    fn test_raid_cluster_detection() {
        let messages = vec![
            "Free nitro claim now link in bio 1".to_string(),
            "Free nitro claim now link in bio 2".to_string(),
            "Free nitro claim now link in bio 3".to_string(),
            "Totally innocent normal user conversation".to_string(),
            "Free nitro claim now link in bio 4".to_string(),
        ];

        let result = detect_raid_similarity(&messages, 0.85);
        assert!(result.is_raid_detected);
        assert_eq!(result.largest_cluster_size, 4);
        assert_eq!(result.clusters.len(), 1);
    }
}
