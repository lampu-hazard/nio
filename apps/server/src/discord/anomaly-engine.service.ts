import { Injectable } from '@nestjs/common';

export interface AnomalyFinding {
  kind: number; // 1: PHISHING_LINK, 2: CONTENT_ANOMALY, 3: USER_ANOMALY, 4: GUILD_BASELINE_ANOMALY
  severity: number; // 0: UNSPECIFIED, 1: LOW, 2: MEDIUM, 3: HIGH, 4: CRITICAL
  confidence: number;
  reason: string;
  evidence: Record<string, string>;
}

export interface AnomalyAnalyzeResponse {
  decision: number; // 1: ALLOW, 2: AUDIT, 3: DELETE_MESSAGE, 4: TIMEOUT_USER
  severity: number; // 0: UNSPECIFIED, 1: LOW, 2: MEDIUM, 3: HIGH, 4: CRITICAL
  confidence: number;
  reason: string;
  findings: AnomalyFinding[];
  metrics: Record<string, number>;
}

export interface AnomalyConfig {
  phishingEnabled: boolean;
  contentAnomalyEnabled: boolean;
  userAnomalyEnabled: boolean;
  guildBaselineEnabled: boolean;
  enforcementMode: number;
}

export interface AnomalyAnalyzeRequest {
  guildId: string;
  channelId: string;
  userId: string;
  messageId: string;
  content: string;
  urls: string[];
  timestampMs: number;
  config: AnomalyConfig;
}

interface MessageRecord {
  timestampMs: number;
  userId: string;
  mentionsCount: number;
  urlsCount: number;
}

const PHISHING_KEYWORDS = ['gift', 'nitro', 'airdrop', 'free-discord', 'claim-', 'steam-comm'];
const TRUSTED_DOMAINS = ['discord.com', 'discordapp.com', 'discord.gg', 'steamcommunity.com'];

@Injectable()
export class AnomalyEngineService {
  // ponytail: in-memory channel history resets on process restart; upgrade to Redis sliding windows if multi-instance clustering is deployed.
  private readonly channelHistory = new Map<string, MessageRecord[]>();

  analyze(req: AnomalyAnalyzeRequest): AnomalyAnalyzeResponse {
    const key = `${req.guildId}:${req.channelId}`;
    let history = this.channelHistory.get(key) || [];
    const now = req.timestampMs;

    // Prune entries older than 60s
    const cutoff60s = now - 60000;
    history = history.filter((m) => m.timestampMs > cutoff60s);

    const messagesIn60s = history.length;
    const uniqueUsersIn60s = new Set(history.map((m) => m.userId)).size;

    const metrics: Record<string, number> = {
      messages_in_60s: messagesIn60s,
      unique_users_in_60s: uniqueUsersIn60s,
    };

    const mentionsCount = (req.content.match(/<@/g) || []).length;
    const urlsCount = req.urls.length;

    history.push({
      timestampMs: now,
      userId: req.userId,
      mentionsCount,
      urlsCount,
    });
    this.channelHistory.set(key, history);

    const findings: AnomalyFinding[] = [];

    // 1. Phishing detector
    if (req.config?.phishingEnabled) {
      let detectedPhishing = false;
      let phishingDomain = '';

      for (const url of req.urls) {
        const domain = url.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
        const isTrusted = TRUSTED_DOMAINS.some((td) => domain.includes(td));

        if (!isTrusted) {
          for (const kw of PHISHING_KEYWORDS) {
            if (domain.includes(kw)) {
              detectedPhishing = true;
              phishingDomain = domain;
              break;
            }
          }
        }
        if (detectedPhishing) break;
      }

      if (detectedPhishing) {
        findings.push({
          kind: 1, // FINDING_KIND_PHISHING_LINK
          severity: 4, // CRITICAL
          confidence: 0.95,
          reason: 'Suspicious link containing phishing patterns',
          evidence: { domain: phishingDomain },
        });
      }
    }

    // 2. Content anomaly detector (excessive mentions)
    if (req.config?.contentAnomalyEnabled && mentionsCount >= 5) {
      findings.push({
        kind: 2, // FINDING_KIND_CONTENT_ANOMALY
        severity: 3, // HIGH
        confidence: 0.90,
        reason: 'Excessive mentions in message',
        evidence: { mentions: mentionsCount.toString() },
      });
    }

    // 3. User anomaly detector (user spamming in 60s)
    if (req.config?.userAnomalyEnabled) {
      const userMsgCount = history.filter((m) => m.userId === req.userId).length;
      if (userMsgCount > 10) {
        findings.push({
          kind: 3, // FINDING_KIND_USER_ANOMALY
          severity: 2, // MEDIUM
          confidence: 0.85,
          reason: 'High message volume from user in short window',
          evidence: { messages_in_60s: userMsgCount.toString() },
        });
      }
    }

    // 4. Guild baseline detector (channel traffic burst)
    if (req.config?.guildBaselineEnabled && messagesIn60s > 40) {
      findings.push({
        kind: 4, // FINDING_KIND_GUILD_BASELINE_ANOMALY
        severity: 1, // LOW
        confidence: 0.70,
        reason: 'Channel activity rate significantly above average baseline',
        evidence: { rate: `${messagesIn60s}/min` },
      });
    }

    // Decision aggregation
    let finalDecision = 1; // ALLOW
    let finalSeverity = 0; // UNSPECIFIED
    let maxConfidence = 0.0;
    let reason = 'All checks passed';

    for (const finding of findings) {
      if (finding.confidence > maxConfidence) {
        maxConfidence = finding.confidence;
      }
      if (finding.severity > finalSeverity) {
        finalSeverity = finding.severity;
      }

      if (finding.kind === 1 && finding.severity === 4) {
        finalDecision = 3; // DELETE_MESSAGE
        reason = `Phishing link detected: ${finding.reason}`;
      } else if (finding.severity >= 3 && finalDecision < 2) {
        finalDecision = 2; // AUDIT
        reason = `Content anomaly warning: ${finding.reason}`;
      }
    }

    return {
      decision: finalDecision,
      severity: finalSeverity,
      confidence: maxConfidence,
      reason,
      findings,
      metrics,
    };
  }
}
