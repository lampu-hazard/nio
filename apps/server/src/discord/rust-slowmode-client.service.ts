import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../logger/logger.service';

export interface RustAnalyzeResponse {
  level: 'QUIET' | 'NORMAL' | 'BUSY';
  recommendedSeconds: number;
  shouldApply: boolean;
  reason: string;
  metrics: {
    messagesIn10s: number;
    messagesIn60s: number;
    uniqueUsersIn60s: number;
  };
}

@Injectable()
export class RustSlowmodeClientService {
  private readonly engineUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.engineUrl = this.config.get<string>('SLOWMODE_ENGINE_URL') || '';
  }

  async analyze(
    guildId: string,
    channelId: string,
    userId: string,
    timestampMs: number,
    currentSlowmodeSeconds: number,
    config: { quietSeconds: number; normalSeconds: number; busySeconds: number },
  ): Promise<RustAnalyzeResponse | null> {
    if (!this.engineUrl) {
      return null;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 200); // 200ms timeout limit

    try {
      const response = await fetch(`${this.engineUrl}/v1/slowmode/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guildId,
          channelId,
          userId,
          timestampMs,
          currentSlowmodeSeconds,
          config,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        this.logger.error(
          `Slowmode engine HTTP error: ${response.status}`,
          '',
          'RustSlowmodeClient',
        );
        return null;
      }

      return (await response.json()) as RustAnalyzeResponse;
    } catch (err: any) {
      clearTimeout(timeoutId);
      this.logger.error(
        `Failed to reach slowmode engine: ${err.message}`,
        err.stack,
        'RustSlowmodeClient',
      );
      return null;
    }
  }
}
