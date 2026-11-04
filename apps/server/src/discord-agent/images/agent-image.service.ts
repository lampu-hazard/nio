import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AgentAccessService } from '../agent-access.service';
import { AgentQuotaService } from '../quota/agent-quota.service';
import { AgentQuotaError, Lease } from '../quota/agent-quota.types';
import { ImageProviderError, OpenAiImageProvider } from './openai-image.provider';
import { AiAgentSettingsService } from '../ai-agent-settings.service';
import { AgentRunService } from '../agent-run.service';
import { AgentProfile, parseAgentProfile } from '../agent-profile.types';

export type AgentImageInput = {
  guildId: string;
  profile?: AgentProfile;
  channelId: string;
  userId: string;
  messageId: string;
  prompt: string;
  attachmentLimit: number;
  canAttach: boolean;
  signal?: AbortSignal;
};
export type AgentImageReply = {
  content: string;
  files?: { name: string; attachment: Buffer; description: string }[];
};

@Injectable()
export class AgentImageService {
  constructor(
    private readonly access: AgentAccessService,
    private readonly quota: AgentQuotaService,
    private readonly provider: OpenAiImageProvider,
    private readonly settings: AiAgentSettingsService,
    @Optional() private readonly agentRuns?: AgentRunService,
  ) {}

  private async resolveAdmission(guildId: string, profile: AgentProfile, channelId: string, userId: string) {
    return (this.access.resolve as any).length >= 3
      ? (this.access.resolve as any)(guildId, channelId, userId, 'IMAGE')
      : this.access.resolve({ guildId, profile, channelId, userId }, 'IMAGE');
  }

  async handle(input: AgentImageInput): Promise<AgentImageReply> {
    const profile = parseAgentProfile(input.profile ?? 'PUBLIC');
    let lease: Lease | undefined;
    let run: { id: string } | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    const controller = new AbortController();
    const abort = () => controller.abort();
    input.signal?.addEventListener('abort', abort, { once: true });
    if (input.signal?.aborted) abort();
    const deadline = setTimeout(abort, 120000);
    deadline.unref?.();
    try {
      if (!input.prompt.trim() || input.prompt.length > 4000) throw new AgentQuotaError('IMAGE_PROMPT_INVALID');
      if (!input.canAttach || !Number.isSafeInteger(input.attachmentLimit) || input.attachmentLimit < 1) {
        throw new AgentQuotaError('ATTACHMENT_PERMISSION_REQUIRED');
      }
      for (let retries = 0; ; retries++) {
        if (controller.signal.aborted) throw new AgentQuotaError('IMAGE_ABORTED');
        const admission = await this.resolveAdmission(input.guildId, profile, input.channelId, input.userId);
        if (!admission.allowed) throw new AgentQuotaError(admission.code);
        const config = admission.settings;
        if (!config || config.accessMode !== 'ROLE_QUOTAS' || !config.imageEnabled || !config.imageBaseUrl || !config.imageModel) {
          throw new AgentQuotaError('IMAGE_CONFIGURATION_INVALID');
        }
        let encrypted = config.encryptedImageApiKey;
        if (config.imageCredentialSource === 'CHAT') {
          if (
            !['openai', 'openai-compatible', 'openrouter', 'groq', 'ollama'].includes(config.provider.toLowerCase()) ||
            !config.baseUrl ||
            new URL(config.baseUrl).origin !== new URL(config.imageBaseUrl).origin
          ) {
            throw new AgentQuotaError('IMAGE_CONFIGURATION_INVALID');
          }
          encrypted = config.encryptedApiKey;
        }
        const apiKey = this.settings.decryptApiKey(encrypted) ?? '';
        const isPollinations = (() => {
          try {
            const host = new URL(config.imageBaseUrl).hostname.toLowerCase();
            return host === 'pollinations.ai' || host.endsWith('.pollinations.ai');
          } catch {
            return false;
          }
        })();
        if (!apiKey && !isPollinations) throw new AgentQuotaError('IMAGE_CREDENTIAL_MISSING');
        if (!lease) {
          lease = await this.quota.acquireLease({ guildId: input.guildId, profile }, input.userId, input.messageId);
          let running = false;
          timer = setInterval(() => {
            if (running) return;
            running = true;
            void this.quota
              .heartbeat(lease!)
              .catch(abort)
              .finally(() => {
                running = false;
              });
          }, 15000);
          timer.unref?.();
          // Renew membership and configuration after acquiring the cross-capability lease.
          continue;
        }
        if (!run) {
          run = await this.agentRuns?.start(
            { guildId: input.guildId, profile, channelId: input.channelId, userId: input.userId },
            (config as { retentionDays?: number }).retentionDays ?? 30,
          );
        }
        const attemptId = randomUUID();
        try {
          await this.quota.reserve({
            attemptId,
            requestKey: `${input.guildId}:${profile}:${input.messageId}:IMAGE`,
            runId: run?.id,
            lease,
            profile,
            capability: 'IMAGE',
            policyRevision: config.policyRevision,
            memberLimit: admission.allowance.dailyImageLimit,
            guildLimit: config.dailyGuildImageLimit,
            tokens: 0,
            images: 1,
            runTokensUsed: 0,
            runTokenLimit: 0,
          });
        } catch (error) {
          if (error instanceof AgentQuotaError && error.code === 'POLICY_CHANGED' && retries < 3) continue;
          throw error;
        }
        let dispatched = false;
        let image: Awaited<ReturnType<OpenAiImageProvider['generate']>>;
        try {
          if (controller.signal.aborted) throw new AgentQuotaError('IMAGE_ABORTED');
          image = await this.provider.generate({
            baseUrl: config.imageBaseUrl,
            model: config.imageModel,
            apiKey,
            prompt: input.prompt,
            maxImageBytes: Math.min(8388608, input.attachmentLimit),
            signal: controller.signal,
            onBeforeDispatch: async () => {
              await this.quota.markDispatched(attemptId, lease!);
              dispatched = true;
            },
          });
        } catch (error) {
          const definite = error instanceof ImageProviderError && error.definiteRejection;
          const local = !dispatched || (error instanceof ImageProviderError && !error.dispatched);
          const code = error instanceof ImageProviderError || error instanceof AgentQuotaError ? error.code : 'IMAGE_PROVIDER_ERROR';
          await this.quota.finalize(attemptId, {
            kind: definite ? 'REJECTED' : local ? 'LOCAL_FAILURE' : 'UNCERTAIN',
            code,
            definiteRejection: definite,
          });
          if (!dispatched && error instanceof AgentQuotaError && error.code === 'POLICY_CHANGED' && retries < 3) continue;
          throw error;
        }
        // Never return attachment bytes before durable accounting. A failed commit is recovered, never replayed.
        await this.quota.finalize(attemptId, { kind: 'REPORTED', images: 1, code: 'OK' });
        if (run) await this.agentRuns?.finish(run.id, 'COMPLETED', 'Gambar selesai dibuat.').catch(() => undefined);
        return {
          content: 'Gambar selesai dibuat.',
          files: [
            {
              name: `nio-generated.${image.extension}`,
              attachment: image.buffer,
              description: 'Gambar yang dibuat oleh AI berdasarkan permintaan member.',
            },
          ],
        };
      }
    } catch (error) {
      const code =
        error instanceof AgentQuotaError || error instanceof ImageProviderError
          ? error.code
          : error && typeof error === 'object' && 'code' in error && error.code === 'P2002'
            ? 'DUPLICATE_IMAGE_REQUEST'
            : 'IMAGE_UNAVAILABLE';
      if (run) await this.agentRuns?.finish(run.id, 'FAILED', code).catch(() => undefined);
      return { content: this.explain(code) };
    } finally {
      clearTimeout(deadline);
      if (timer) clearInterval(timer);
      controller.abort();
      input.signal?.removeEventListener('abort', abort);
      if (lease) await this.quota.releaseLease(lease).catch(() => undefined);
    }
  }

  private explain(code: string): string {
    if (code === 'DUPLICATE_IMAGE_REQUEST') return '⚠️ Permintaan gambar ini sudah diproses. Kirim pesan baru untuk membuat gambar lain.';
    if (code === 'BUSY') return '⚠️ Permintaan AI kamu sebelumnya masih berjalan. Tunggu sampai selesai.';
    if (code === 'QUOTA_EXHAUSTED') return '⚠️ Kuota gambar harian member atau server habis. Kuota direset pukul 00:00 UTC.';
    if (code === 'ROLE_DENIED' || code === 'USER_DENIED') return '⚠️ Role kamu tidak memiliki izin membuat gambar.';
    if (code === 'ATTACHMENT_PERMISSION_REQUIRED') return '⚠️ Bot memerlukan izin melihat channel, mengirim pesan, dan melampirkan file di channel ini.';
    if (code === 'IMAGE_PROMPT_INVALID') return '⚠️ Gunakan @nio gambar <prompt> dengan prompt 1–4.000 karakter.';
    if (['IMAGES_DISABLED', 'ROLE_MODE_REQUIRED', 'DISABLED', 'IMAGE_CONFIGURATION_INVALID', 'IMAGE_CREDENTIAL_MISSING'].includes(code)) {
      return '⚠️ Pembuatan gambar belum aktif atau konfigurasi provider/key belum lengkap. Periksa pengaturan AI Agent.';
    }
    if (/^IMAGE_HTTP_4/.test(code)) return '⚠️ Provider menolak permintaan gambar. Periksa model, key, dan dukungan endpoint images/generations.';
    return '⚠️ Gambar tidak dapat dikirim. Jika permintaan sudah diterima provider, satu kuota gambar dapat tetap terpakai. Tidak ada percobaan ulang otomatis.';
  }
}
