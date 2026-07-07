import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

export interface ConversationTurn {
  userPrompt: string;
  aiResponse: string;
  timestamp: number;
}

export const MAX_TURNS = 20;
export const TTL_SECONDS = 1800;
export const KEY_PREFIX = 'agent:conv:';

@Injectable()
export class ConversationMemoryService implements OnModuleDestroy {
  private redis: Redis;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    this.redis.on('error', () => {});
    this.redis.connect().catch(() => {});
  }

  async loadHistory(guildId: string, botMessageId: string): Promise<ConversationTurn[]> {
    try {
      const raw = await this.redis.get(`${KEY_PREFIX}${guildId}:${botMessageId}`);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch {
      return [];
    }
  }

  async saveConversation(guildId: string, botMessageId: string, turns: ConversationTurn[]): Promise<void> {
    try {
      const trimmed = turns.length > MAX_TURNS ? turns.slice(turns.length - MAX_TURNS) : turns;
      await this.redis.set(
        `${KEY_PREFIX}${guildId}:${botMessageId}`,
        JSON.stringify(trimmed),
        'EX',
        TTL_SECONDS,
      );
    } catch {
      // Graceful degradation: silently fail, conversation still works without persistence.
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => {});
  }
}
