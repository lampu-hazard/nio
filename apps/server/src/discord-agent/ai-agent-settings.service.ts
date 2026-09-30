import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialEncryptionService } from '../plugins/credential-encryption.service';
import { UpdateAiAgentSettingsDto } from './dto/update-ai-agent-settings.dto';

const DEFAULTS = {
  enabled: false,
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  baseUrl: null as string | null,
  allowedUserIds: [] as string[],
  allowedChannelIds: [] as string[],
  excludedChannelIds: [] as string[],
};

@Injectable()
export class AiAgentSettingsService {
  constructor(private readonly prisma: PrismaService, private readonly encryption: CredentialEncryptionService) {}

  async getSettings(guildId: string) {
    const settings = await this.prisma.discordAgentSettings.findUnique({ where: { guildId } });
    const { encryptedApiKey, ...safeSettings } = settings || {};
    return { ...DEFAULTS, ...safeSettings, baseUrl: settings?.baseUrl || null, hasCredential: Boolean(encryptedApiKey) };
  }

  async updateSettings(guildId: string, dto: UpdateAiAgentSettingsDto) {
    if (dto.provider && !['gemini', 'openai-compatible'].includes(dto.provider)) throw new BadRequestException('Unsupported AI provider.');
    const effectiveProvider = dto.provider || (await this.prisma.discordAgentSettings.findUnique({ where: { guildId } }))?.provider || DEFAULTS.provider;
    if (effectiveProvider === 'gemini' && dto.baseUrl) throw new BadRequestException('Gemini does not use a custom base URL.');
    if (effectiveProvider === 'openai-compatible' && dto.baseUrl) this.validateBaseUrl(dto.baseUrl);
    for (const ids of [dto.allowedUserIds, dto.allowedChannelIds, dto.excludedChannelIds]) {
      if (ids && (ids.length > 500 || ids.some((id) => !/^\d{5,25}$/.test(id)))) throw new BadRequestException('Discord ID list is invalid.');
    }
    if (dto.apiKey !== undefined && (!dto.apiKey.trim() || dto.apiKey.length > 512)) throw new BadRequestException('API key is invalid.');
    if (dto.apiKey && dto.clearApiKey) throw new BadRequestException('Choose either a new API key or clear the existing key.');

    const { apiKey, clearApiKey, ...fields } = dto;
    const update: Record<string, unknown> = { ...fields };
    if (apiKey) update.encryptedApiKey = this.encryption.encrypt(apiKey.trim());
    if (clearApiKey) update.encryptedApiKey = null;
    const row = await this.prisma.discordAgentSettings.upsert({
      where: { guildId },
      create: { guildId, ...DEFAULTS, ...update },
      update,
    });
    const { encryptedApiKey, ...safeRow } = row;
    return { ...DEFAULTS, ...safeRow, baseUrl: row.baseUrl || null, hasCredential: Boolean(encryptedApiKey) };
  }

  async getUsage(guildId: string, days = 30) {
    const boundedDays = Number.isFinite(days) ? Math.max(1, Math.min(90, Math.floor(days))) : 30;
    const since = new Date(Date.now() - boundedDays * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.agentInteractionLog.groupBy({
      by: ['userId'],
      where: { guildId, createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { promptTokens: true, completionTokens: true, totalTokens: true },
    });
    const failures = await this.prisma.agentInteractionLog.groupBy({
      by: ['userId'],
      where: { guildId, createdAt: { gte: since }, status: 'FAILED' },
      _count: { _all: true },
    });
    const failedByUser = new Map(failures.map((row) => [row.userId, row._count._all]));
    return {
      days: boundedDays,
      users: rows.map((row) => ({
        userId: row.userId,
        requests: row._count._all,
        failures: failedByUser.get(row.userId) || 0,
        promptTokens: row._sum.promptTokens || 0,
        completionTokens: row._sum.completionTokens || 0,
        totalTokens: row._sum.totalTokens || 0,
      })),
    };
  }

  decryptApiKey(encryptedApiKey: string | null | undefined) {
    return encryptedApiKey ? this.encryption.decrypt(encryptedApiKey) : '';
  }

  private validateBaseUrl(value: string) {
    let url: URL;
    try { url = new URL(value); } catch { throw new BadRequestException('Base URL must be a valid URL.'); }
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new BadRequestException('Base URL must use HTTP or HTTPS.');
    }
    if (url.username || url.password || url.search || url.hash) throw new BadRequestException('Base URL cannot include credentials, query, or fragment.');
  }
}
