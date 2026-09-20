import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { AppLogger } from '../logger/logger.service';
import * as path from 'path';
import * as fs from 'fs';
import {
  PhishingResult,
  SecretResult,
  RaidResult,
  SentinelInspection,
} from './sentinel.interface';

interface NativeSentinel {
  scanPhishingUrl(rawUrl: string): PhishingResult;
  computeSimhashHex(text: string): string;
  calculateSimilarity(hashA: string, hashB: string): number;
  checkRaidMessages(messages: string[], threshold?: number): RaidResult;
  scanAndRedactSecrets(text: string): SecretResult;
}

@Injectable()
export class SentinelService implements OnModuleInit {
  private nativeAddon: NativeSentinel | null = null;
  private isNative = false;

  constructor(@Optional() private readonly logger?: AppLogger) {}

  onModuleInit() {
    this.initNativeAddon();
  }

  private initNativeAddon() {
    const candidates = [
      process.env.SENTINEL_NATIVE_PATH,
      path.resolve(process.cwd(), 'services/sentinel/nio-sentinel.node'),
      path.resolve(process.cwd(), '../../services/sentinel/nio-sentinel.node'),
      path.resolve(__dirname, '../../../../services/sentinel/nio-sentinel.node'),
      path.resolve(__dirname, '../../../services/sentinel/nio-sentinel.node'),
    ].filter(Boolean) as string[];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          this.nativeAddon = require(candidate);
          this.isNative = true;
          this.logger?.log?.(
            `Loaded native Sentinel Rust NAPI engine from: ${candidate}`,
            'SentinelService',
          );
          return;
        } catch (err: any) {
          this.logger?.warn?.(
            `Failed loading Sentinel candidate at ${candidate}: ${err.message}`,
            'SentinelService',
          );
        }
      }
    }

    this.logger?.log?.(
      'Native Sentinel module not found. Operating with in-process TypeScript fallback.',
      'SentinelService',
    );
  }

  get isNativeLoaded(): boolean {
    return this.isNative;
  }

  /**
   * Scans a single URL for phishing, typosquatting, homoglyphs, or zero-width evasion
   */
  scanPhishing(rawUrl: string): PhishingResult {
    if (this.nativeAddon) {
      try {
        return this.nativeAddon.scanPhishingUrl(rawUrl);
      } catch (err: any) {
        this.logger?.error?.(`Native scanPhishingUrl error: ${err.message}`, '', 'SentinelService');
      }
    }

    return this.fallbackScanPhishing(rawUrl);
  }

  /**
   * Computes a 64-bit SimHash hex fingerprint for a text
   */
  computeSimhash(text: string): string {
    if (this.nativeAddon) {
      try {
        return this.nativeAddon.computeSimhashHex(text);
      } catch (err: any) {
        this.logger?.error?.(`Native computeSimhashHex error: ${err.message}`, '', 'SentinelService');
      }
    }

    return this.fallbackComputeSimhash(text);
  }

  /**
   * Computes similarity between two 64-bit SimHash hex strings [0.0 - 1.0]
   */
  calculateSimilarity(hashA: string, hashB: string): number {
    if (this.nativeAddon) {
      try {
        return this.nativeAddon.calculateSimilarity(hashA, hashB);
      } catch (err: any) {
        this.logger?.error?.(`Native calculateSimilarity error: ${err.message}`, '', 'SentinelService');
      }
    }

    return this.fallbackCalculateSimilarity(hashA, hashB);
  }

  /**
   * Detects coordinated raid spam across recent messages using fuzzy hashing
   */
  detectRaid(messages: string[], threshold = 0.85): RaidResult {
    if (this.nativeAddon) {
      try {
        return this.nativeAddon.checkRaidMessages(messages, threshold);
      } catch (err: any) {
        this.logger?.error?.(`Native checkRaidMessages error: ${err.message}`, '', 'SentinelService');
      }
    }

    return this.fallbackDetectRaid(messages, threshold);
  }

  /**
   * Scans for leaked credentials, API keys, tokens, or high-entropy secrets and redacts them
   */
  scanSecrets(text: string): SecretResult {
    if (this.nativeAddon) {
      try {
        return this.nativeAddon.scanAndRedactSecrets(text);
      } catch (err: any) {
        this.logger?.error?.(`Native scanAndRedactSecrets error: ${err.message}`, '', 'SentinelService');
      }
    }

    return this.fallbackScanSecrets(text);
  }

  /**
   * Comprehensive inspect method for message content + extracted URLs
   */
  inspectMessage(content: string, urls: string[] = []): SentinelInspection {
    const phishingFindings: PhishingResult[] = [];
    const reasons: string[] = [];

    // Scan all extracted URLs
    for (const url of urls) {
      const pRes = this.scanPhishing(url);
      if (pRes.isSuspicious) {
        phishingFindings.push(pRes);
        reasons.push(...pRes.reasons);
      }
    }

    // Scan text for secret leaks
    const secretFindings = this.scanSecrets(content);
    if (secretFindings.hasSecrets) {
      for (const det of secretFindings.detections) {
        reasons.push(`SECRET_LEAK: Detected ${det.secretType} (${det.preview})`);
      }
    }

    const hasPhishing = phishingFindings.length > 0;
    const hasSecrets = secretFindings.hasSecrets;

    const threatType: SentinelInspection['threatType'] =
      hasPhishing && hasSecrets
        ? 'MULTIPLE'
        : hasPhishing
        ? 'PHISHING'
        : hasSecrets
        ? 'SECRET_LEAK'
        : 'NONE';

    return {
      isThreat: hasPhishing || hasSecrets,
      threatType,
      phishingFindings,
      secretFindings,
      reasons,
    };
  }

  // --- Fallback implementations ---

  private fallbackScanPhishing(rawUrl: string): PhishingResult {
    const cleaned = rawUrl
      .replace(/[-\s`]/g, '')
      .replace(/^hxxps?:\/\//i, 'https://')
      .trim();

    let domain = '';
    try {
      const parsed = new URL(cleaned.startsWith('http') ? cleaned : `https://${cleaned}`);
      domain = parsed.hostname.toLowerCase();
    } catch {
      domain = cleaned.split('/')[0].split(':')[0].toLowerCase();
    }

    const officialDomains = [
      'discord.com',
      'discord.gg',
      'discordapp.com',
      'discordstatus.com',
      'discord.media',
      'discord.gift',
      'steamcommunity.com',
      'steampowered.com',
      'roblox.com',
      'telegram.org',
      't.me',
    ];

    const isOfficial = officialDomains.some(
      (off) => domain === off || domain.endsWith(`.${off}`),
    );

    if (isOfficial) {
      return {
        isSuspicious: false,
        confidence: 0,
        detectedTarget: null,
        reasons: [],
        normalizedDomain: domain,
      };
    }

    const reasons: string[] = [];
    let detectedTarget: string | null = null;
    let confidence = 0;

    // Check homoglyphs / non-ascii
    const isPunycode = domain.startsWith('xn--') || domain.includes('.xn--');
    const hasNonAscii = /[^\x00-\x7F]/.test(domain);

    if (isPunycode || hasNonAscii || domain.includes('discrod') || domain.includes('dlscord')) {
      reasons.push("HOMOGLYPH_OR_TYPOSQUAT: Domain mimics 'discord.com'");
      detectedTarget = 'discord.com';
      confidence = 0.95;
    } else if (
      (domain.includes('discord') || domain.includes('nitro') || domain.includes('steam')) &&
      !isOfficial
    ) {
      reasons.push("BRAND_IMPERSONATION: Contains protected brand outside official domain");
      detectedTarget = domain.includes('steam') ? 'steamcommunity.com' : 'discord.com';
      confidence = 0.85;
    }

    return {
      isSuspicious: confidence >= 0.75,
      confidence,
      detectedTarget,
      reasons,
      normalizedDomain: domain,
    };
  }

  private fallbackComputeSimhash(text: string): string {
    const tokens = text.toLowerCase().match(/\w{3,}/g) || [];
    if (!tokens.length) return '0000000000000000';

    let hash = 0n;
    for (const t of tokens) {
      let h = 0xcbf29ce484222325n;
      for (let i = 0; i < t.length; i++) {
        h = (h ^ BigInt(t.charCodeAt(i))) * 0x100000001b3n;
      }
      hash ^= h;
    }
    return hash.toString(16).padStart(16, '0');
  }

  private fallbackCalculateSimilarity(hashA: string, hashB: string): number {
    try {
      const a = BigInt(`0x${hashA}`);
      const b = BigInt(`0x${hashB}`);
      const xor = a ^ b;
      let count = 0;
      for (let i = 0n; i < 64n; i++) {
        if ((xor >> i) & 1n) count++;
      }
      return 1 - count / 64;
    } catch {
      return 0;
    }
  }

  private fallbackDetectRaid(messages: string[], threshold: number): RaidResult {
    if (messages.length < 3) {
      return { isRaidDetected: false, largestClusterSize: 0, clusters: [] };
    }
    const hashes = messages.map((m) => this.computeSimhash(m));
    const visited = new Set<number>();
    const clusters: RaidResult['clusters'] = [];

    for (let i = 0; i < messages.length; i++) {
      if (visited.has(i)) continue;
      const matching: number[] = [i];
      let totalSim = 0;
      for (let j = i + 1; j < messages.length; j++) {
        const sim = this.calculateSimilarity(hashes[i], hashes[j]);
        if (sim >= threshold) {
          matching.push(j);
          visited.add(j);
          totalSim += sim;
        }
      }
      if (matching.length >= 3) {
        visited.add(i);
        clusters.push({
          representativeIndex: i,
          matchingIndices: matching,
          averageSimilarity: matching.length > 1 ? totalSim / (matching.length - 1) : 1,
        });
      }
    }

    const largest = clusters.reduce((max, c) => Math.max(max, c.matchingIndices.length), 0);
    return {
      isRaidDetected: largest >= 3,
      largestClusterSize: largest,
      clusters,
    };
  }

  private fallbackScanSecrets(text: string): SecretResult {
    const detections: SecretResult['detections'] = [];
    let redacted = text;

    const patterns = [
      { name: 'DISCORD_BOT_TOKEN', regex: /[MNO][a-zA-Z\d_-]{23,26}\.[a-zA-Z\d_-]{6}\.[a-zA-Z\d_-]{27,38}/g },
      { name: 'OPENAI_API_KEY', regex: /sk-(?:proj-)?[A-Za-z0-9_-]{32,}/g },
      { name: 'ANTHROPIC_API_KEY', regex: /sk-ant-[A-Za-z0-9_-]{32,}/g },
      { name: 'GITHUB_TOKEN', regex: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82}/g },
      { name: 'AWS_ACCESS_KEY', regex: /AKIA[0-9A-Z]{16}/g },
      { name: 'PRIVATE_KEY', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
      { name: 'DATABASE_CONNECTION_URI', regex: /(?:postgres|postgresql|mysql|mongodb|redis):\/\/[^:]+:[^@]+@[^\s/]+/g },
    ];

    for (const pat of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pat.regex.exec(text)) !== null) {
        const matched = match[0];
        const preview =
          matched.length > 10 ? `${matched.slice(0, 4)}...${matched.slice(-4)}` : '[REDACTED]';
        detections.push({
          secretType: pat.name,
          preview,
          confidence: 0.98,
          start: match.index,
          end: match.index + matched.length,
        });
      }
      redacted = redacted.replace(pat.regex, `[REDACTED:${pat.name}]`);
    }

    return {
      hasSecrets: detections.length > 0,
      detections,
      redactedText: redacted,
    };
  }
}
