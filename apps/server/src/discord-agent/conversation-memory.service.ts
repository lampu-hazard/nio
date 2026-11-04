import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { AgentRequestScope, parseAgentProfile } from './agent-profile.types';

export interface ConversationTurn {
  userPrompt: string;
  aiResponse: string;
  timestamp: number;
}

export type ConversationScope = AgentRequestScope;

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

  private buildConversationKey(scope: ConversationScope, botMessageId: string): string {
    const profile = parseAgentProfile(scope.profile);
    return `${KEY_PREFIX}v2:${scope.guildId}:${profile}:${scope.channelId}:${scope.userId}:${botMessageId}`;
  }

  private buildProvenanceKey(botMessageId: string): string {
    return `${KEY_PREFIX}prov:v2:${botMessageId}`;
  }

  async loadHistory(scope: ConversationScope, botMessageId: string): Promise<ConversationTurn[]> {
    return this.loadByKey(this.buildConversationKey(scope, botMessageId));
  }

  async saveConversation(scope: ConversationScope, botMessageId: string, turns: ConversationTurn[]): Promise<void> {
    const normalized: ConversationScope = {
      guildId: scope.guildId,
      profile: parseAgentProfile(scope.profile),
      channelId: scope.channelId,
      userId: scope.userId,
    };
    await this.saveByKey(this.buildConversationKey(normalized, botMessageId), turns);
    try {
      await this.redis.set(this.buildProvenanceKey(botMessageId), JSON.stringify(normalized), 'EX', TTL_SECONDS);
    } catch {
      // Graceful degradation
    }
  }

  async getProvenance(botMessageId: string): Promise<ConversationScope | null> {
    try {
      const raw = await this.redis.get(this.buildProvenanceKey(botMessageId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        typeof parsed.guildId !== 'string' ||
        typeof parsed.channelId !== 'string' ||
        typeof parsed.userId !== 'string'
      ) {
        return null;
      }
      return {
        guildId: parsed.guildId,
        profile: parseAgentProfile(parsed.profile),
        channelId: parsed.channelId,
        userId: parsed.userId,
      };
    } catch {
      return null;
    }
  }

  private async loadByKey(key: string): Promise<ConversationTurn[]> {
    try {
      const raw = await this.redis.get(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch {
      return [];
    }
  }

  private async saveByKey(key: string, turns: ConversationTurn[]): Promise<void> {
    try {
      const trimmed = turns.length > MAX_TURNS ? turns.slice(turns.length - MAX_TURNS) : turns;
      await this.redis.set(key, JSON.stringify(trimmed), 'EX', TTL_SECONDS);
    } catch {
      // Graceful degradation: silently fail, conversation still works without persistence.
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => {});
  }
}
