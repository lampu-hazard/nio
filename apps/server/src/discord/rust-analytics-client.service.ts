import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../logger/logger.service';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import * as fs from 'fs';

export interface LeaderboardEntryDto {
  rank: number;
  userId: string;
  score: number;
}

@Injectable()
export class RustAnalyticsClientService implements OnModuleInit {
  private client: any = null;
  private readonly analyticsEngineUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.analyticsEngineUrl = this.config.get<string>('ANALYTICS_ENGINE_URL') || '127.0.0.1:50053';
  }

  onModuleInit() {
    try {
      const protoPath = this.resolveProtoPath();
      const packageDefinition = protoLoader.loadSync(protoPath, {
        keepCase: true,
        longs: Number,
        defaults: true,
        oneofs: true,
      });
      const proto = grpc.loadPackageDefinition(packageDefinition) as any;
      this.client = new proto.analytics.v1.AnalyticsEngine(
        this.analyticsEngineUrl,
        grpc.credentials.createInsecure(),
      );
      this.logger.log(`Initialized gRPC Analytics client pointing to: ${this.analyticsEngineUrl}`, 'RustAnalyticsClient');
    } catch (err: any) {
      this.logger.error(`Failed to load analytics proto / client: ${err.message}`, err.stack, 'RustAnalyticsClient');
    }
  }

  private resolveProtoPath(): string {
    const configuredPath = this.config.get<string>('ANALYTICS_PROTO_PATH');
    const candidates = [
      configuredPath,
      path.resolve(process.cwd(), 'proto/analytics/v1/analytics.proto'),
      path.resolve(process.cwd(), 'apps/server/proto/analytics/v1/analytics.proto'),
      path.resolve(__dirname, '../../../../proto/analytics/v1/analytics.proto'),
    ].filter(Boolean) as string[];

    const protoPath = candidates.find((candidate) => fs.existsSync(candidate));
    if (!protoPath) {
      throw new Error(`Could not locate analytics.proto. Checked: ${candidates.join(', ')}`);
    }

    return protoPath;
  }

  async ingestMessage(request: {
    messageId: string;
    guildId: string;
    channelId: string;
    authorId: string;
    content: string;
    timestampMs: number;
  }): Promise<boolean> {
    if (!this.client) return false;

    return new Promise((resolve) => {
      const grpcRequest = {
        message_id: request.messageId,
        guild_id: request.guildId,
        channel_id: request.channelId,
        author_id: request.authorId,
        content: request.content,
        timestamp_ms: request.timestampMs,
      };

      const deadline = new Date(Date.now() + 500); // 500ms timeout
      this.client.IngestMessage(
        grpcRequest,
        { deadline },
        (err: grpc.ServiceError | null, response: { success: boolean }) => {
          if (err) {
            this.logger.error(`Analytics IngestMessage gRPC call error: ${err.message}`, '', 'RustAnalyticsClient');
            resolve(false);
          } else {
            resolve(response?.success || false);
          }
        },
      );
    });
  }

  async ingestVoiceState(request: {
    guildId: string;
    userId: string;
    channelId: string;
    eventType: number; // 1 = JOIN, 2 = LEAVE, 3 = MOVE
    timestampMs: number;
  }): Promise<boolean> {
    if (!this.client) return false;

    return new Promise((resolve) => {
      const grpcRequest = {
        guild_id: request.guildId,
        user_id: request.userId,
        channel_id: request.channelId,
        event_type: request.eventType,
        timestamp_ms: request.timestampMs,
      };

      const deadline = new Date(Date.now() + 500); // 500ms timeout
      this.client.IngestVoiceState(
        grpcRequest,
        { deadline },
        (err: grpc.ServiceError | null, response: { success: boolean }) => {
          if (err) {
            this.logger.error(`Analytics IngestVoiceState gRPC call error: ${err.message}`, '', 'RustAnalyticsClient');
            resolve(false);
          } else {
            resolve(response?.success || false);
          }
        },
      );
    });
  }

  async getChatLeaderboard(guildId: string, days: string, limit: number): Promise<LeaderboardEntryDto[] | null> {
    if (!this.client) return null;

    return new Promise((resolve) => {
      const grpcRequest = {
        guild_id: guildId,
        days: days,
        limit: limit,
      };

      const deadline = new Date(Date.now() + 1000); // 1000ms timeout
      this.client.GetChatLeaderboard(
        grpcRequest,
        { deadline },
        (err: grpc.ServiceError | null, response: { entries: any[] }) => {
          if (err) {
            this.logger.error(`Analytics GetChatLeaderboard gRPC call error: ${err.message}`, '', 'RustAnalyticsClient');
            resolve(null);
          } else {
            const entries = (response?.entries || []).map((e) => ({
              rank: e.rank,
              userId: e.user_id,
              score: Number(e.score),
            }));
            resolve(entries);
          }
        },
      );
    });
  }

  async getVoiceLeaderboard(guildId: string, days: string, limit: number): Promise<LeaderboardEntryDto[] | null> {
    if (!this.client) return null;

    return new Promise((resolve) => {
      const grpcRequest = {
        guild_id: guildId,
        days: days,
        limit: limit,
      };

      const deadline = new Date(Date.now() + 1000); // 1000ms timeout
      this.client.GetVoiceLeaderboard(
        grpcRequest,
        { deadline },
        (err: grpc.ServiceError | null, response: { entries: any[] }) => {
          if (err) {
            this.logger.error(`Analytics GetVoiceLeaderboard gRPC call error: ${err.message}`, '', 'RustAnalyticsClient');
            resolve(null);
          } else {
            const entries = (response?.entries || []).map((e) => ({
              rank: e.rank,
              userId: e.user_id,
              score: Number(e.score),
            }));
            resolve(entries);
          }
        },
      );
    });
  }
}
