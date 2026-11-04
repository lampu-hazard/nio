import { BadRequestException, Injectable } from '@nestjs/common';
import { isIP } from 'node:net';
import * as ipaddr from 'ipaddr.js';
import { Client, GuildBasedChannel, PermissionFlagsBits } from 'discord.js';
import { Prisma } from '@prisma/client';
import { AgentRoleRule, AgentUserTokenRule } from './agent-policy.types';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialEncryptionService } from '../plugins/credential-encryption.service';
import { UpdateAiAgentSettingsDto } from './dto/update-ai-agent-settings.dto';
import { AgentProfile, AgentScope, parseAgentProfile } from './agent-profile.types';

const DEFAULTS = {
  enabled: false,
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  baseUrl: null as string | null,
  userTokenRules: [] as AgentUserTokenRule[],
  allowedUserIds: [] as string[],
  allowedChannelIds: [] as string[],
  excludedChannelIds: [] as string[],
  accessMode: 'ROLE_QUOTAS',
  dailyGuildTokenLimit: 1000000,
  dailyGuildImageLimit: 100,
  maxOutputTokens: 2048,
  maxRunTokens: 32768,
  imageEnabled: false,
  imageBaseUrl: null as string | null,
  imageModel: null as string | null,
  imageCredentialSource: 'SEPARATE',
  systemPrompt: null as string | null,
  messageRetentionDays: 30,
  allowedToolIds: [] as string[],
  tokenQuotaMode: 'LIMITED',
};

function profileDefaults(profile: AgentProfile) {
  return { ...DEFAULTS, profile,
    tokenQuotaMode: profile === 'ADMIN' ? 'UNLIMITED' : 'LIMITED',
    dailyGuildTokenLimit: profile === 'ADMIN' ? null : DEFAULTS.dailyGuildTokenLimit,
    maxRunTokens: profile === 'ADMIN' ? null : DEFAULTS.maxRunTokens };
}

@Injectable()
export class AiAgentSettingsService {
  private client?: Client;

  constructor(private readonly prisma: PrismaService, private readonly encryption: CredentialEncryptionService) {}

  setClient(client: Client) {
    this.client = client;
  }

  async getSettings(scope: AgentScope) {
    const profile = parseAgentProfile(scope.profile);
    const settings = await this.prisma.discordAgentSettings.findUnique({ where: { guildId_profile: { guildId: scope.guildId, profile } }, include: { roleRules: true } });
    return this.redact(profile, settings);
  }

  async updateSettings(scope: AgentScope, dto: UpdateAiAgentSettingsDto) {
    const { guildId } = scope;
    const profile = parseAgentProfile(scope.profile);
    if (profile === 'ADMIN' && (dto.userTokenRules !== undefined
      || (dto.dailyGuildTokenLimit !== undefined && dto.dailyGuildTokenLimit !== null)
      || (dto.maxRunTokens !== undefined && dto.maxRunTokens !== null))) throw new BadRequestException('ADMIN token quotas are not applicable.');
    const writable = new Set([...Object.keys(DEFAULTS), 'roleRules', 'apiKey', 'clearApiKey', 'imageApiKey', 'clearImageApiKey']);
    if (Object.keys(dto).some((key) => !writable.has(key))) throw new BadRequestException('Unknown AI settings field.');
    const guild = this.client?.guilds.cache.get(guildId);
    const roles = dto.roleRules === undefined ? null : await guild?.roles.fetch().catch(() => null);
    // Serializable protects the complete effective snapshot, including omitted fields.
    const save = () => this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${guildId}, 0))::text`;
      await tx.$queryRaw`SELECT "guildId" FROM "DiscordAgentSettings" WHERE "guildId" = ${guildId} AND "profile" = ${profile} FOR UPDATE`;
      const existing = await tx.discordAgentSettings.findUnique({ where: { guildId_profile: { guildId, profile } }, include: { roleRules: true } });
      const { apiKey, clearApiKey, imageApiKey, clearImageApiKey, roleRules, userTokenRules, ...fields } = dto;
      const update = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
      const defaults = profileDefaults(profile);
      const effective = { ...defaults, ...existing, ...update, profile };
      this.validateEffective(effective);
      if (dto.allowedUserIds !== undefined || (dto.accessMode !== undefined && dto.accessMode !== 'ROLE_QUOTAS')) {
        throw new BadRequestException('Legacy user grants are read-only migration data.');
      }
      for (const ids of [dto.allowedUserIds, dto.allowedChannelIds, dto.excludedChannelIds]) {
        if (ids !== undefined && (!Array.isArray(ids) || ids.length > 500 || ids.some((id) => typeof id !== 'string' || (id !== '*' && !/^\d{5,25}$/.test(id))))) {
          throw new BadRequestException('Discord ID list is invalid.');
        }
      }
      if (roleRules !== undefined) this.validateRoleRules(profile, roleRules, existing?.roleRules ?? [], roles ?? null);
      await this.validateChannels(guildId, effective, roleRules ?? existing?.roleRules ?? []);
      const encrypted: { encryptedApiKey?: string | null; encryptedImageApiKey?: string | null } = {};
      for (const [key, clear, field] of [
        [apiKey, clearApiKey, 'encryptedApiKey'],
        [imageApiKey, clearImageApiKey, 'encryptedImageApiKey'],
      ] as const) {
        if (key !== undefined && (typeof key !== 'string' || !key.trim() || key.length > 512)) throw new BadRequestException('API key is invalid.');
        if (key !== undefined && clear) throw new BadRequestException('Choose either a new API key or clear the existing key.');
        if (clear) encrypted[field] = null;
        if (key) {
          try { encrypted[field] = this.encryption.encrypt(key.trim()); }
          catch { throw new BadRequestException('Gagal mengenkripsi API Key: PLUGIN_CREDENTIALS_ENCRYPTION_KEY belum dikonfigurasi di file .env server (minimal 32 karakter).'); }
        }
      }
      const rules = roleRules?.map(({ roleId, chatEnabled, imageEnabled, dailyTokenLimit, dailyImageLimit }) => ({
        roleId, chatEnabled, imageEnabled, dailyTokenLimit, dailyImageLimit,
      }));
      if (userTokenRules !== undefined) {
        if (!Array.isArray(userTokenRules) || userTokenRules.length > 500) throw new BadRequestException('Personal token rules are invalid.');
        const ids = new Set<string>();
        for (const rule of userTokenRules) {
          if (!rule || typeof rule.userId !== 'string' || !/^\d{5,25}$/.test(rule.userId) || ids.has(rule.userId)
            || (rule.dailyTokenLimit !== null && (!Number.isSafeInteger(rule.dailyTokenLimit) || rule.dailyTokenLimit < 1 || rule.dailyTokenLimit > 100000000))) {
            throw new BadRequestException('Personal token rules are invalid.');
          }
          ids.add(rule.userId);
        }
      }
      const baseData = { ...update, ...encrypted,
        ...(userTokenRules === undefined ? {} : { userTokenRules: userTokenRules.map(({ userId, dailyTokenLimit }) => ({ userId, dailyTokenLimit })) }) };
      const row = await tx.discordAgentSettings.upsert({
        where: { guildId_profile: { guildId, profile } },
        create: {
          guildId,
          ...defaults,
          ...baseData,
          ...(rules === undefined ? {} : { roleRules: { create: rules } }),
          policyRevision: 1n,
        },
        update: {
          ...baseData,
          ...(rules === undefined ? {} : { roleRules: { deleteMany: {}, create: rules } }),
          policyRevision: { increment: 1n },
        },
        include: { roleRules: true },
      });
      return this.redact(profile, row);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    for (let attempt = 0; ; attempt++) {
      try { return await save(); }
      catch (error) {
        if (attempt >= 2 || !error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2034') throw error;
      }
    }
  }

  async getUsage(scope: AgentScope, days = 30) {
    const { guildId } = scope;
    const profile = parseAgentProfile(scope.profile);
    const boundedDays = Number.isFinite(days) ? Math.max(1, Math.min(90, Math.floor(days))) : 30;
    const since = new Date(Date.now() - boundedDays * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.agentInteractionLog.groupBy({
      by: ['userId'],
      where: { guildId, profile, createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { promptTokens: true, completionTokens: true, totalTokens: true },
    });
    const failures = await this.prisma.agentInteractionLog.groupBy({
      by: ['userId'],
      where: { guildId, profile, createdAt: { gte: since }, status: 'FAILED' },
      _count: { _all: true },
    });
    const failedByUser = new Map(failures.map((row) => [row.userId, row._count._all]));

    let guild: any = null;
    if (this.client) {
      try {
        guild = this.client.guilds.cache.get(guildId) || await this.client.guilds.fetch(guildId).catch(() => null);
      } catch {
        guild = null;
      }
    }

    if (guild && typeof guild.members?.fetch === 'function') {
      const missingIds = rows
        .map((r) => r.userId)
        .filter((id) => !guild.members.cache?.has?.(id) && !guild.members.cache?.get?.(id));
      if (missingIds.length > 0) {
        // ponytail: batch member fetch replaces N single fetch calls; upgrade to chunked batches if user count > 100
        await guild.members.fetch({ user: missingIds }).catch(() => null);
      }
    }

    const users = await Promise.all(
      rows.map(async (row) => {
        let displayName = 'Anggota';
        let username = row.userId;
        let avatarUrl: string | null = null;

        if (guild) {
          try {
            let member = guild.members?.cache?.get(row.userId);
            if (!member && typeof guild.members?.fetch === 'function') {
              member = await guild.members.fetch(row.userId).catch(() => null);
            }
            if (member) {
              displayName = member.displayName || member.user?.globalName || member.user?.username || 'Anggota';
              username = member.user?.username || row.userId;
              avatarUrl = typeof member.displayAvatarURL === 'function'
                ? member.displayAvatarURL({ size: 64 })
                : typeof member.user?.displayAvatarURL === 'function'
                  ? member.user.displayAvatarURL({ size: 64 })
                  : null;
            } else if (this.client?.users) {
              const user = this.client.users.cache.get(row.userId) || await this.client.users.fetch(row.userId).catch(() => null);
              if (user) {
                displayName = user.globalName || user.username || 'Anggota';
                username = user.username;
                avatarUrl = typeof user.displayAvatarURL === 'function' ? user.displayAvatarURL({ size: 64 }) : null;
              }
            }
          } catch {
            // Keep fallback values
          }
        } else if (this.client?.users) {
          try {
            const user = this.client.users.cache.get(row.userId) || await this.client.users.fetch(row.userId).catch(() => null);
            if (user) {
              displayName = user.globalName || user.username || 'Anggota';
              username = user.username;
              avatarUrl = typeof user.displayAvatarURL === 'function' ? user.displayAvatarURL({ size: 64 }) : null;
            }
          } catch {
            // Keep fallback values
          }
        }

        return {
          userId: row.userId,
          displayName,
          username,
          avatarUrl,
          requests: row._count._all,
          failures: failedByUser.get(row.userId) || 0,
          promptTokens: row._sum.promptTokens || 0,
          completionTokens: row._sum.completionTokens || 0,
          totalTokens: row._sum.totalTokens || 0,
        };
      }),
    );

    return {
      days: boundedDays,
      users,
    };
  }

  private redact(profile: AgentProfile, row: (Prisma.DiscordAgentSettingsGetPayload<{ include: { roleRules: true } }>) | null) {
    const { encryptedApiKey, encryptedImageApiKey, policyRevision, roleRules, migrationAudit, ...safe } = row ?? {};
    return { ...profileDefaults(profile), ...safe, roleRules: roleRules ?? [], policyRevision: String(policyRevision ?? 0n),
      baseUrl: row?.baseUrl || null, hasCredential: Boolean(encryptedApiKey), hasImageCredential: Boolean(encryptedImageApiKey) };
  }

  private validateEffective(settings: Record<string, unknown>) {
    const invalid = () => { throw new BadRequestException('AI settings are invalid.'); };
    if (!['gemini', 'openai-compatible'].includes(String(settings.provider))) invalid();
    if (settings.accessMode !== 'ROLE_QUOTAS') invalid();
    const profile = parseAgentProfile(settings.profile);
    if (settings.tokenQuotaMode !== (profile === 'ADMIN' ? 'UNLIMITED' : 'LIMITED')) invalid();
    if (profile === 'ADMIN' && (settings.dailyGuildTokenLimit !== null || settings.maxRunTokens !== null)) invalid();
    if (settings.systemPrompt !== null && (typeof settings.systemPrompt !== 'string' || settings.systemPrompt.length > 32000)) invalid();
    if (!Number.isInteger(settings.messageRetentionDays) || Number(settings.messageRetentionDays) < 1 || Number(settings.messageRetentionDays) > 90) invalid();
    if (!Array.isArray(settings.allowedToolIds) || settings.allowedToolIds.length > 500
      || settings.allowedToolIds.some((id) => typeof id !== 'string' || !/^[a-zA-Z0-9_.:-]{1,200}$/.test(id))
      || new Set(settings.allowedToolIds).size !== settings.allowedToolIds.length) invalid();
    if (profile === 'PUBLIC' && (settings.allowedToolIds as string[]).some((id) => !['web_search', 'web_fetch'].includes(id))) invalid();
    if (!['SEPARATE', 'CHAT'].includes(String(settings.imageCredentialSource))) invalid();
    for (const [name, min, max] of [
      ['dailyGuildTokenLimit', 1, 1000000000], ['dailyGuildImageLimit', 0, 10000],
      ['maxOutputTokens', 128, 8192], ['maxRunTokens', 1024, 262144],
    ] as const) {
      if (profile === 'ADMIN' && (name === 'dailyGuildTokenLimit' || name === 'maxRunTokens')) continue;
      const value = settings[name];
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) invalid();
    }
    if (profile === 'PUBLIC' && Number(settings.maxRunTokens) < Number(settings.maxOutputTokens)) invalid();
    if (typeof settings.model !== 'string' || !settings.model.trim() || settings.model.length > 120) invalid();
    if (settings.provider === 'gemini' && settings.baseUrl) throw new BadRequestException('Gemini does not use a custom base URL.');
    if (settings.baseUrl) this.validateBaseUrl(String(settings.baseUrl));
    if (settings.imageBaseUrl) {
      const url = this.validateBaseUrl(String(settings.imageBaseUrl));
      const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
      let publicHost = host !== 'localhost' && !host.endsWith('.localhost') && !host.endsWith('.local');
      if (publicHost && isIP(host)) {
        try { publicHost = ipaddr.parse(host).range() === 'unicast'; } catch { publicHost = false; }
      }
      if (url.protocol !== 'https:' || (url.port && url.port !== '443') || !publicHost || /\/(?:chat\/completions|images\/generations)\/?$/.test(url.pathname)) invalid();
    }
    if (settings.imageEnabled && (settings.accessMode !== 'ROLE_QUOTAS' || !settings.imageBaseUrl
      || typeof settings.imageModel !== 'string' || !settings.imageModel.trim() || settings.imageModel.length > 120)) invalid();
    if (settings.imageCredentialSource === 'CHAT') {
      if (settings.provider !== 'openai-compatible' || !settings.imageBaseUrl) invalid();
      const chat = this.validateBaseUrl(String(settings.baseUrl || 'https://api.openai.com/v1'));
      const image = this.validateBaseUrl(String(settings.imageBaseUrl));
      if (chat.origin !== image.origin) throw new BadRequestException('Shared image credentials require the same chat and image origin.');
    }
  }

  private async validateChannels(guildId: string, effective: Record<string, any>, rules: AgentRoleRule[]) {
    const ids = effective.allowedChannelIds as string[];
    const allowAll = ids.includes('*');
    if (effective.enabled && (!ids.length || !rules.some((rule) => rule.chatEnabled || rule.imageEnabled))) {
      throw new BadRequestException('Enabled profiles require explicit channels and roles.');
    }
    if (!effective.enabled) return;
    const guild = this.client?.guilds.cache.get(guildId);
    const roles = await guild?.roles.fetch().catch(() => null);
    if (!rules.some((rule) => roles?.has(rule.roleId) && (rule.chatEnabled || (effective.imageEnabled && rule.imageEnabled)))) {
      throw new BadRequestException('Select an available role with an enabled capability.');
    }
    const bot = await guild?.members.fetchMe({ force: true }).catch(() => null);
    if (!bot || effective.excludedChannelIds.includes('*')) {
      throw new BadRequestException('Select an available, non-excluded channel where the bot can view and send messages.');
    }
    const channels = new Map<string, GuildBasedChannel>();
    if (allowAll) {
      const fetched: any = await guild?.channels.fetch().catch(() => guild?.channels.cache);
      const entries: any[] = fetched && typeof fetched.values === 'function'
        ? Array.from(fetched.values())
        : fetched && typeof fetched.isTextBased === 'function'
          ? [fetched]
          : Array.from(guild?.channels.cache?.values?.() ?? []);
      for (const channel of entries) {
        if (channel && channel.guildId === guildId && channel.isTextBased()) {
          channels.set(channel.id ?? '*', channel);
        }
      }
    } else {
      for (const id of new Set(ids)) {
        try {
          const channel = await guild?.channels.fetch(id, { force: true });
          if (channel && channel.guildId === guildId && channel.isTextBased()) channels.set(id, channel);
        } catch { /* Unavailable channels cannot activate a profile. */ }
      }
    }
    const candidateIds = allowAll ? [...channels.keys()] : ids;
    const usable = candidateIds.some((id) => {
      const channel = channels.get(id);
      if (!channel || !bot || effective.excludedChannelIds.includes('*') || effective.excludedChannelIds.includes(id)
        || (channel.parentId && effective.excludedChannelIds.includes(channel.parentId))) return false;
      const thread = channel.isThread();
      if (thread && (channel.archived || channel.locked)) return false;
      const permissions = channel.permissionsFor(bot);
      return permissions?.has(PermissionFlagsBits.ViewChannel)
        && permissions.has(thread ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages);
    });
    if (!usable) throw new BadRequestException('Select an available, non-excluded channel where the bot can view and send messages.');
  }

  private validateRoleRules(profile: AgentProfile, rules: AgentRoleRule[], previous: AgentRoleRule[], roles: { has(id: string): boolean } | null) {
    if (!Array.isArray(rules) || rules.length > 100) throw new BadRequestException('At most 100 role rules are allowed.');
    const ids = new Set<string>();
    for (const rule of rules) {
      if (!rule || typeof rule.roleId !== 'string' || !/^\d{5,25}$/.test(rule.roleId) || ids.has(rule.roleId)
        || typeof rule.chatEnabled !== 'boolean' || typeof rule.imageEnabled !== 'boolean'
        || (profile === 'ADMIN' ? rule.dailyTokenLimit !== null : (typeof rule.dailyTokenLimit !== 'number'
          || !Number.isSafeInteger(rule.dailyTokenLimit) || rule.dailyTokenLimit < 0 || rule.dailyTokenLimit > 100000000
          || (rule.chatEnabled && !rule.dailyTokenLimit)))
        || !Number.isSafeInteger(rule.dailyImageLimit) || rule.dailyImageLimit < 0 || rule.dailyImageLimit > 1000
        || (rule.imageEnabled && !rule.dailyImageLimit)) {
        throw new BadRequestException('Role policy is invalid.');
      }
      ids.add(rule.roleId);
      const old = previous.find((entry) => entry.roleId === rule.roleId);
      const unchanged = old && old.chatEnabled === rule.chatEnabled && old.imageEnabled === rule.imageEnabled
        && old.dailyTokenLimit === rule.dailyTokenLimit && old.dailyImageLimit === rule.dailyImageLimit;
      if (!unchanged && !roles?.has(rule.roleId)) throw new BadRequestException('Select an available role in this server.');
    }
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
    return url;
  }
}
