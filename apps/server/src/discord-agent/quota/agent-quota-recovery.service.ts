import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AgentQuotaService } from './agent-quota.service';

@Injectable()
export class AgentQuotaRecoveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentQuotaRecoveryService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(private readonly quota: AgentQuotaService) {}

  async onModuleInit(): Promise<void> {
    this.timer = setInterval(() => { void this.sweep(); }, 30000);
    this.timer.unref?.();
    await this.sweep();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.quota.recoverExpired();
      await this.quota.cleanup();
    } catch {
      this.logger.error('Quota recovery failed; pending accounting remains durable for the next pass.');
    } finally {
      this.running = false;
    }
  }
}
