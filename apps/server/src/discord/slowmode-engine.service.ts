import { Injectable } from '@nestjs/common';

export type SlowmodeLevel = 'QUIET' | 'NORMAL' | 'BUSY';

export interface SlowmodeAnalyzeResponse {
  level: SlowmodeLevel;
  recommendedSeconds: number;
  shouldApply: boolean;
  reason: string;
  metrics: {
    messagesIn10s: number;
    messagesIn60s: number;
    uniqueUsersIn60s: number;
  };
}

export interface SlowmodeConfig {
  quietSeconds: number;
  normalSeconds: number;
  busySeconds: number;
}

interface MessageRecord {
  timestampMs: number;
  userId: string;
}

@Injectable()
export class SlowmodeEngineService {
  // ponytail: in-memory map resets on process restart; upgrade to Redis sorted sets (ZADD/ZREMRANGEBYSCORE) if multi-instance clustering is deployed.
  private readonly channelHistory = new Map<string, MessageRecord[]>();

  analyze(
    guildId: string,
    channelId: string,
    userId: string,
    timestampMs: number,
    currentSlowmodeSeconds: number,
    config: SlowmodeConfig,
  ): SlowmodeAnalyzeResponse {
    const key = `${guildId}:${channelId}`;
    let history = this.channelHistory.get(key) || [];

    if (userId !== 'SYSTEM') {
      history.push({ timestampMs, userId });
    }

    const cutoff60s = timestampMs - 60000;
    const cutoff10s = timestampMs - 10000;
    history = history.filter((m) => m.timestampMs > cutoff60s);

    if (history.length > 0) {
      this.channelHistory.set(key, history);
    } else {
      this.channelHistory.delete(key);
    }

    let messagesIn10s = 0;
    const uniqueUsers = new Set<string>();
    for (const msg of history) {
      if (msg.timestampMs > cutoff10s) {
        messagesIn10s++;
      }
      uniqueUsers.add(msg.userId);
    }

    const messagesIn60s = history.length;
    const uniqueUsersIn60s = uniqueUsers.size;

    let level: SlowmodeLevel;
    let recommendedSeconds: number;
    let reason: string;

    if (messagesIn10s >= 8 || messagesIn60s >= 30) {
      level = 'BUSY';
      recommendedSeconds = config.busySeconds;
      reason = `Traffic burst detected (${messagesIn10s} msgs in 10s)`;
    } else if (messagesIn10s >= 3 || messagesIn60s >= 10) {
      level = 'NORMAL';
      recommendedSeconds = config.normalSeconds;
      reason = `Moderate activity (${messagesIn10s} msgs in 10s)`;
    } else {
      level = 'QUIET';
      recommendedSeconds = config.quietSeconds;
      reason = 'Low activity';
    }

    return {
      level,
      recommendedSeconds,
      shouldApply: recommendedSeconds !== currentSlowmodeSeconds,
      reason,
      metrics: {
        messagesIn10s,
        messagesIn60s,
        uniqueUsersIn60s,
      },
    };
  }
}
