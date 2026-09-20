export interface PhishingResult {
  isSuspicious: boolean;
  confidence: number;
  detectedTarget?: string | null;
  reasons: string[];
  normalizedDomain: string;
}

export interface SecretDetectionItem {
  secretType: string;
  preview: string;
  confidence: number;
  start: number;
  end: number;
}

export interface SecretResult {
  hasSecrets: boolean;
  detections: SecretDetectionItem[];
  redactedText: string;
}

export interface RaidClusterItem {
  representativeIndex: number;
  matchingIndices: number[];
  averageSimilarity: number;
}

export interface RaidResult {
  isRaidDetected: boolean;
  largestClusterSize: number;
  clusters: RaidClusterItem[];
}

export interface SentinelInspection {
  isThreat: boolean;
  threatType: 'NONE' | 'PHISHING' | 'SECRET_LEAK' | 'MULTIPLE';
  phishingFindings: PhishingResult[];
  secretFindings?: SecretResult;
  reasons: string[];
}
