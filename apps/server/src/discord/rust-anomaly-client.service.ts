import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../logger/logger.service';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';

export interface AnomalyFinding {
  kind: number;
  severity: number;
  confidence: number;
  reason: string;
  evidence: Record<string, string>;
}

export interface RustAnomalyResponse {
  decision: number;
  severity: number;
  confidence: number;
  reason: string;
  findings: AnomalyFinding[];
  metrics: Record<string, number>;
}

@Injectable()
export class RustAnomalyClientService implements OnModuleInit {
  private client: any = null;
  private readonly anomalyEngineUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.anomalyEngineUrl = this.config.get<string>('ANOMALY_ENGINE_URL') || '127.0.0.1:50051';
  }

  onModuleInit() {
    try {
      const protoPath = path.resolve(__dirname, '../../../../services/anomaly-engine/proto/anomaly/v1/anomaly.proto');
      const packageDefinition = protoLoader.loadSync(protoPath, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });
      const proto = grpc.loadPackageDefinition(packageDefinition) as any;
      this.client = new proto.anomaly.v1.AnomalyEngine(
        this.anomalyEngineUrl,
        grpc.credentials.createInsecure(),
      );
      this.logger.log(`Initialized gRPC Anomaly client pointing to: ${this.anomalyEngineUrl}`, 'RustAnomalyClient');
    } catch (err: any) {
      this.logger.error(`Failed to load anomaly proto / client: ${err.message}`, err.stack, 'RustAnomalyClient');
    }
  }

  async analyze(request: {
    guildId: string;
    channelId: string;
    userId: string;
    messageId: string;
    content: string;
    urls: string[];
    timestampMs: number;
    config: {
      phishingEnabled: boolean;
      contentAnomalyEnabled: boolean;
      userAnomalyEnabled: boolean;
      guildBaselineEnabled: boolean;
      enforcementMode: number;
    };
  }): Promise<RustAnomalyResponse | null> {
    if (!this.client) {
      return null;
    }

    return new Promise((resolve) => {
      // Map to exact snake_case expected by protobuf contract
      const grpcRequest = {
        guild_id: request.guildId,
        channel_id: request.channelId,
        user_id: request.userId,
        message_id: request.messageId,
        content: request.content,
        urls: request.urls,
        timestamp_ms: request.timestampMs,
        config: {
          phishing_enabled: request.config.phishingEnabled,
          content_anomaly_enabled: request.config.contentAnomalyEnabled,
          user_anomaly_enabled: request.config.userAnomalyEnabled,
          guild_baseline_enabled: request.config.guildBaselineEnabled,
          enforcement_mode: request.config.enforcementMode,
        },
      };

      const deadline = new Date(Date.now() + 200); // 200ms timeout limit
      this.client.AnalyzeMessage(
        grpcRequest,
        { deadline },
        (err: grpc.ServiceError | null, response: RustAnomalyResponse) => {
          if (err) {
            this.logger.error(`Anomaly engine gRPC call error: ${err.message}`, '', 'RustAnomalyClient');
            resolve(null);
          } else {
            resolve(response);
          }
        },
      );
    });
  }
}
