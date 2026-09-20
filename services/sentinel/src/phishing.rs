use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PhishingScanResult {
    pub is_suspicious: bool,
    pub confidence: f64,
    pub detected_target: Option<String>,
    pub reasons: Vec<String>,
    pub normalized_domain: String,
}

const PROTECTED_BRANDS: &[(&str, &str)] = &[
    ("discord", "discord.com"),
    ("discordapp", "discordapp.com"),
    ("steamcommunity", "steamcommunity.com"),
    ("steampowered", "steampowered.com"),
    ("roblox", "roblox.com"),
    ("telegram", "telegram.org"),
];

const OFFICIAL_DOMAINS: &[&str] = &[
    "discord.com",
    "discord.gg",
    "discordapp.com",
    "discordstatus.com",
    "discord.media",
    "discord.gift",
    "steamcommunity.com",
    "steampowered.com",
    "roblox.com",
    "telegram.org",
    "t.me",
];

const SUSPICIOUS_KEYWORDS: &[&str] = &[
    "nitro", "airdrop", "gift", "claim", "free-discord", "steam-comm",
    "free-nitro", "discord-nitro", "trade-offer", "drop-nitro", "claim-nitro",
    "discrod", "dlscord",
];

/// Extract and clean domain from URL
pub fn extract_domain(raw_url: &str) -> String {
    // Strip zero-width characters and spaces
    let cleaned: String = raw_url
        .chars()
        .filter(|c| !matches!(*c, '\u{200B}' | '\u{200C}' | '\u{200D}' | '\u{FEFF}' | ' ' | '\t' | '`'))
        .collect();

    // Strip scheme
    let without_scheme = if let Some(stripped) = cleaned.strip_prefix("https://") {
        stripped
    } else if let Some(stripped) = cleaned.strip_prefix("http://") {
        stripped
    } else if let Some(stripped) = cleaned.strip_prefix("hxxps://") {
        stripped
    } else if let Some(stripped) = cleaned.strip_prefix("hxxp://") {
        stripped
    } else {
        &cleaned
    };

    // Strip path, query, port
    let domain_part = without_scheme
        .split('/')
        .next()
        .unwrap_or("")
        .split('?')
        .next()
        .unwrap_or("")
        .split('#')
        .next()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("");

    domain_part.trim_matches('.').to_lowercase()
}

pub fn is_official_domain(domain: &str) -> bool {
    let lower = domain.to_lowercase();
    for official in OFFICIAL_DOMAINS {
        if lower == *official || lower.ends_with(&format!(".{}", official)) {
            return true;
        }
    }
    false
}

/// Compute Levenshtein distance
pub fn levenshtein_distance(a: &str, b: &str) -> usize {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let len_b = b_chars.len();

    if a_chars.is_empty() {
        return len_b;
    }
    if len_b == 0 {
        return a_chars.len();
    }

    let mut prev_row: Vec<usize> = (0..=len_b).collect();
    let mut curr_row: Vec<usize> = vec![0; len_b + 1];

    for (i, ca) in a_chars.iter().enumerate() {
        curr_row[0] = i + 1;
        for (j, cb) in b_chars.iter().enumerate() {
            let cost = if ca == cb { 0 } else { 1 };
            curr_row[j + 1] = (prev_row[j + 1] + 1)
                .min(curr_row[j] + 1)
                .min(prev_row[j] + cost);
        }
        prev_row.copy_from_slice(&curr_row);
    }

    prev_row[len_b]
}

pub fn scan_url(raw_url: &str) -> PhishingScanResult {
    let domain = extract_domain(raw_url);
    if domain.is_empty() {
        return PhishingScanResult {
            is_suspicious: false,
            confidence: 0.0,
            detected_target: None,
            reasons: vec![],
            normalized_domain: String::new(),
        };
    }

    let has_non_ascii = domain.chars().any(|c| !c.is_ascii());
    let is_punycode = domain.starts_with("xn--") || domain.contains(".xn--");

    // Normalize Unicode homoglyphs (e.g. Cyrillic 'і' -> 'i')
    let transliterated = deunicode::deunicode(&domain).to_lowercase();

    // Check if the domain itself is official
    if is_official_domain(&domain) && !has_non_ascii && !is_punycode {
        return PhishingScanResult {
            is_suspicious: false,
            confidence: 0.0,
            detected_target: None,
            reasons: vec![],
            normalized_domain: domain,
        };
    }

    let mut reasons = Vec::new();
    let mut max_confidence: f64 = 0.0;
    let mut detected_target = None;

    // 1. Homoglyph / Punycode Attack Check
    if has_non_ascii || is_punycode {
        for &(brand, official) in PROTECTED_BRANDS {
            if transliterated.contains(brand) || transliterated == official || transliterated.ends_with(&format!(".{}", official)) {
                reasons.push(format!("HOMOGLYPH_IMPERSONATION: Domain uses non-ASCII or Punycode characters that mimic '{}'", official));
                max_confidence = max_confidence.max(0.98);
                detected_target = Some(official.to_string());
            }
        }
    }

    // 2. Typosquatting Check (Levenshtein distance 1-2 on brand labels)
    let domain_parts: Vec<&str> = transliterated.split('.').collect();
    for part in &domain_parts {
        if part.len() >= 4 {
            for &(brand, official) in PROTECTED_BRANDS {
                if *part != brand {
                    let dist = levenshtein_distance(part, brand);
                    if dist <= 2 {
                        reasons.push(format!("TYPOSQUATTING: Part '{}' has edit distance {} from '{}'", part, dist, brand));
                        max_confidence = max_confidence.max(0.92);
                        if detected_target.is_none() {
                            detected_target = Some(official.to_string());
                        }
                    }
                }
            }
        }
    }

    // 3. Brand Impersonation in Non-Official Domain
    for &(brand, official) in PROTECTED_BRANDS {
        if transliterated.contains(brand) && !is_official_domain(&transliterated) {
            reasons.push(format!("BRAND_IMPERSONATION: Contains brand '{}' outside official domain", brand));
            max_confidence = max_confidence.max(0.85);
            if detected_target.is_none() {
                detected_target = Some(official.to_string());
            }
        }
    }

    // 4. Suspicious Phishing Keywords
    for &kw in SUSPICIOUS_KEYWORDS {
        if transliterated.contains(kw) && !is_official_domain(&transliterated) {
            reasons.push(format!("SUSPICIOUS_KEYWORD: Contains phishing keyword '{}'", kw));
            max_confidence = max_confidence.max(0.80);
        }
    }

    // High confidence boost if brand + suspicious keyword combined
    let has_brand = PROTECTED_BRANDS.iter().any(|&(b, _)| transliterated.contains(b));
    let has_keyword = SUSPICIOUS_KEYWORDS.iter().any(|&k| transliterated.contains(k));
    if has_brand && has_keyword && !is_official_domain(&transliterated) {
        max_confidence = max_confidence.max(0.96);
    }

    let is_suspicious = max_confidence >= 0.75;

    PhishingScanResult {
        is_suspicious,
        confidence: max_confidence,
        detected_target,
        reasons,
        normalized_domain: transliterated,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_official_discord_domains() {
        let res = scan_url("https://discord.com/channels/123/456");
        assert!(!res.is_suspicious);

        let res2 = scan_url("https://discord.gg/invite123");
        assert!(!res2.is_suspicious);

        let res3 = scan_url("https://support.discord.com/hc/en-us");
        assert!(!res3.is_suspicious);
    }

    #[test]
    fn test_homoglyph_detection() {
        // Cyrillic 'і' (U+0456) instead of Latin 'i'
        let fake = "https://d\u{0456}scord.com/nitro";
        let res = scan_url(fake);
        assert!(res.is_suspicious);
        assert!(res.confidence >= 0.95);
        assert_eq!(res.detected_target.as_deref(), Some("discord.com"));
        assert!(res.reasons.iter().any(|r| r.contains("HOMOGLYPH_IMPERSONATION")));
    }

    #[test]
    fn test_typosquatting_detection() {
        let fake = "https://discrod.com/free-gift";
        let res = scan_url(fake);
        assert!(res.is_suspicious);
        assert!(res.confidence >= 0.90);
        assert!(res.reasons.iter().any(|r| r.contains("TYPOSQUATTING")));
    }

    #[test]
    fn test_brand_keyword_combination() {
        let fake = "https://discord-nitro-gift.ru/claim";
        let res = scan_url(fake);
        assert!(res.is_suspicious);
        assert!(res.confidence >= 0.95);
        assert_eq!(res.detected_target.as_deref(), Some("discord.com"));
    }

    #[test]
    fn test_zero_width_space_evasion() {
        let fake = "https://disc\u{200B}ord-airdrop.xyz/claim";
        let res = scan_url(fake);
        assert!(res.is_suspicious);
        assert_eq!(res.normalized_domain, "discord-airdrop.xyz");
    }
}
