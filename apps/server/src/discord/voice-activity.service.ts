import { BadRequestException, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ChannelType, Client, escapeMarkdown, Guild, GuildMember, VoiceState } from 'discord.js';
import { PrismaService } from '../prisma/prisma.service';
import { AppLogger } from '../logger/logger.service';
import { renderVoiceLevelCard } from './voice-level-card';

export function voiceLevel(xp: bigint): number {
  let level = BigInt(Math.floor(Math.sqrt(Number(xp / 100n))));
  while (100n * (level + 1n) ** 2n <= xp) level++;
  while (100n * level ** 2n > xp) level--;
  return Number(level);
}

export function accrueVoiceXp(xp: bigint, remainder: number, elapsedMs: number, rate: number) {
  const units = BigInt(remainder) + BigInt(Math.max(0, Math.floor(elapsedMs))) * BigInt(rate);
  return { xp: xp + units / 60000n, remainder: Number(units % 60000n) };
}

type MemberState = { member: GuildMember; channelId: string; eligible: boolean };
type Config = { enabled: boolean; rate: number; channelId: string | null; rewards: { level: number; roleId: string }[] };
type Tracking = { guild: Guild; members: MemberState[]; since: number; config: Config };
type Pending = { guild: Guild; member: GuildMember; units: bigint; rewards: Config['rewards'] };

@Injectable()
export class VoiceActivityService implements OnModuleDestroy {
  private client: Client | null = null;
  private timer: NodeJS.Timeout | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private connected = new Set<number>();
  private tracking = new Map<string, Tracking>();
  private pending = new Map<string, Pending>();

  constructor(private readonly prisma: PrismaService, private readonly logger: AppLogger) {}

  setClient(client: Client) { this.client = client; }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work);
    this.queue = result.catch((err) => this.log('Voice processing', err));
    return result;
  }

  private log(context: string, err: unknown) {
    this.logger.error(`${context}: ${err instanceof Error ? err.message : String(err)}`, undefined, 'VoiceActivity');
  }

  private snapshot(guild: Guild): MemberState[] {
    return [...guild.voiceStates.cache.values()].flatMap((state) => {
      if (!state.channelId || !state.member || state.member.user.bot) return [];
      return [{
        member: state.member, channelId: state.channelId,
        eligible: state.channel?.type === ChannelType.GuildVoice && state.channelId !== guild.afkChannelId
          && !state.selfMute && !state.serverMute && !state.selfDeaf && !state.serverDeaf,
      }];
    });
  }

  private async config(guildId: string): Promise<Config> {
    const settings = await this.prisma.guildSettings.findUnique({ where: { guildId } });
    const rewards = await this.prisma.voiceXpReward.findMany({ where: { guildId }, orderBy: { level: 'asc' } });
    return { enabled: settings?.voiceXpEnabled ?? false, rate: settings?.voiceXpPerMinute ?? 10, channelId: settings?.voiceNotificationChannelId ?? null, rewards };
  }

  async start(shardId?: number): Promise<void> {
    const now = Date.now();
    const guilds = [...(this.client?.guilds.cache.values() ?? [])]
      .filter((g) => shardId === undefined || g.shardId === shardId)
      .map((guild) => ({ guild, members: this.snapshot(guild) }));
    await this.serialize(async () => {
      for (const { guild, members } of guilds) {
        if (this.connected.has(guild.shardId) && this.tracking.has(guild.id)) continue;
        this.tracking.set(guild.id, { guild, members, since: now, config: await this.config(guild.id) });
      }
      for (const { guild } of guilds) this.connected.add(guild.shardId);
      if (!this.timer) {
        this.timer = setInterval(() => { void this.flush().catch((err) => this.log('Voice XP timer', err)); }, 60000);
        this.timer.unref();
      }
    });
  }

  private settle(tracking: Tracking, now: number) {
    const elapsed = Math.max(0, now - tracking.since);
    tracking.since = Math.max(tracking.since, now);
    if (!tracking.config.enabled || elapsed === 0) return;
    const counts = new Map<string, number>();
    for (const m of tracking.members) if (m.eligible) counts.set(m.channelId, (counts.get(m.channelId) ?? 0) + 1);
    for (const m of tracking.members) {
      if (!m.eligible || (counts.get(m.channelId) ?? 0) < 2) continue;
      const key = `${tracking.guild.id}:${m.member.id}`;
      const previous = this.pending.get(key);
      this.pending.set(key, { guild: tracking.guild, member: m.member, units: (previous?.units ?? 0n) + BigInt(elapsed) * BigInt(tracking.config.rate), rewards: tracking.config.rewards });
    }
  }

  private async persist() {
    const candidates = new Map<string, { guild: Guild; member: GuildMember; rewards: Config['rewards'] }>();
    // ponytail: one gateway owner accrues each guild; add distributed ownership before running duplicate bot replicas.
    for (const [key, pending] of this.pending) {
      let levelUp: { previousLevel: number; level: number; xp: bigint } | null;
      try {
        levelUp = await this.prisma.$transaction(async (tx) => {
          const where = { guildId_userId: { guildId: pending.guild.id, userId: pending.member.id } };
          const balance = await tx.voiceXpBalance.findUnique({ where });
          const units = BigInt(balance?.remainder ?? 0) + pending.units;
          const data = { xp: (balance?.xp ?? 0n) + units / 60000n, remainder: Number(units % 60000n) };
          await tx.voiceXpBalance.upsert({ where, create: { guildId: pending.guild.id, userId: pending.member.id, ...data }, update: data });
          const level = voiceLevel(data.xp);
          const previousLevel = voiceLevel(balance?.xp ?? 0n);
          return level > previousLevel ? { previousLevel, level, xp: data.xp } : null;
        });
        this.pending.delete(key);
        candidates.set(key, pending);
      } catch (err) { this.log('Voice XP persistence', err); continue; }
      if (levelUp === null) continue;
      // ponytail: best-effort after commit; add an outbox if durable delivery is needed.
      try {
        const settings = await this.prisma.guildSettings.findUnique({ where: { guildId: pending.guild.id } });
        const channelId = settings?.voiceLevelUpChannelId;
        if (!channelId) continue;
        await this.validateNotificationChannel(pending.guild.id, channelId);
        const channel = await pending.guild.channels.fetch(channelId);
        if (channel?.type !== ChannelType.GuildText && channel?.type !== ChannelType.GuildAnnouncement) continue;
        const embed = { title: 'Level Up', description: `${this.plain(pending.member.displayName)} reached level ${levelUp.level}` };
        const allowedMentions = { parse: [] as [], users: [], roles: [], repliedUser: false };
        try {
          const image = await renderVoiceLevelCard({
            name: pending.member.displayName, ...levelUp,
            avatarUrl: pending.member.displayAvatarURL?.({ extension: 'png', size: 128 }) ?? null,
          });
          const nextXp = 100n * (BigInt(levelUp.level) + 1n) ** 2n;
          await channel.send({
            embeds: [{ ...embed, image: { url: 'attachment://voice-level-up.png' } }], allowedMentions,
            files: [{ attachment: image, name: 'voice-level-up.png', description: `${pending.member.displayName.slice(0, 100)}: level ${levelUp.previousLevel} → ${levelUp.level}. Total XP ${levelUp.xp}. Next level ${levelUp.level + 1}: ${nextXp} XP.` }],
          });
        } catch (err) {
          this.log('Voice level-up card', err);
          await channel.send({ embeds: [embed], allowedMentions });
        }
      } catch (err) { this.log('Voice level-up notification', err); }
    }
    for (const tracking of this.tracking.values()) {
      if (!tracking.config.enabled) continue;
      for (const { member } of tracking.members) {
        candidates.set(`${tracking.guild.id}:${member.id}`, { guild: tracking.guild, member, rewards: tracking.config.rewards });
      }
    }
    for (const { guild, member, rewards } of candidates.values()) {
      try {
        const balance = await this.prisma.voiceXpBalance.findUnique({ where: { guildId_userId: { guildId: guild.id, userId: member.id } } });
        if (!balance) continue;
        for (const reward of rewards) {
          if (reward.level > voiceLevel(balance.xp) || member.roles.cache.has(reward.roleId)) continue;
          try {
            await this.validateRewardRoles(guild.id, [reward.roleId]);
            await member.roles.add(reward.roleId, 'Voice level reward');
          } catch (err) { this.log('Voice level reward', err); }
        }
      } catch (err) { this.log('Voice level lookup', err); }
    }
  }

  async flush(): Promise<void> {
    const now = Date.now();
    await this.serialize(async () => {
      for (const tracking of this.tracking.values()) this.settle(tracking, now);
      await this.persist();
    });
  }

  async disconnect(shardId?: number): Promise<void> {
    const now = Date.now();
    await this.serialize(async () => {
      for (const [id, tracking] of this.tracking) {
        if (shardId !== undefined && tracking.guild.shardId !== shardId) continue;
        this.settle(tracking, now);
        this.tracking.delete(id);
        this.connected.delete(tracking.guild.shardId);
      }
      await this.persist();
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.disconnect();
  }

  async withGuildSettingsUpdate<T>(guildId: string, update: () => Promise<T>): Promise<T> {
    return this.serialize(async () => {
      const previous = this.tracking.get(guildId);
      if (previous) this.settle(previous, Date.now());
      await this.persist();
      const result = await update();
      const guild = previous?.guild ?? this.client?.guilds.cache.get(guildId);
      if (guild && (this.connected.has(guild.shardId) || this.client?.isReady())) {
        const config = await this.config(guildId);
        this.connected.add(guild.shardId);
        this.tracking.set(guildId, { guild, members: this.snapshot(guild), since: Date.now(), config });
      }
      return result;
    });
  }

  async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    const member = newState.member ?? oldState.member;
    if (member?.user.bot) return;
    const guild = newState.guild;
    const now = Date.now();
    const members = this.snapshot(guild);
    const name = this.plain(member?.displayName ?? 'Unknown');
    const from = oldState.channelId;
    const to = newState.channelId;
    const fromName = this.plain(oldState.channel?.name ?? 'Unknown');
    const toName = this.plain(newState.channel?.name ?? 'Unknown');
    const notification = from === to ? null : !from
      ? { title: 'Voice Join', description: `${name} joined voice ${toName}` }
      : !to ? { title: 'Voice Leave', description: `${name} left voice ${fromName}` }
        : { title: 'Voice Move', description: `${name} moved from ${fromName} to ${toName}` };
    await this.serialize(async () => {
      let tracking = this.tracking.get(guild.id);
      if (tracking) {
        this.settle(tracking, now);
        tracking.members = members;
      } else if (this.connected.has(guild.shardId)) {
        tracking = { guild, members, since: now, config: await this.config(guild.id) };
        this.tracking.set(guild.id, tracking);
      }
      await this.persist();
    });
    if (!notification || !member) return;
    try {
      const config = await this.config(guild.id);
      if (!config.channelId) return;
      await this.validateNotificationChannel(guild.id, config.channelId);
      const channel = await guild.channels.fetch(config.channelId);
      if (channel?.type !== ChannelType.GuildText && channel?.type !== ChannelType.GuildAnnouncement) return;
      await channel.send({ embeds: [notification], allowedMentions: { parse: [], users: [], roles: [], repliedUser: false } });
    } catch (err) { this.log('Voice notification', err); }
  }

  private plain(value: string) {
    return escapeMarkdown(value.replace(/</g, '‹').replace(/>/g, '›').replace(/[\r\n]/g, ' '), { maskedLink: true });
  }

  async validateNotificationChannel(guildId: string, channelId: string): Promise<void> {
    const guild = this.client?.guilds.cache.get(guildId);
    const channel = await guild?.channels.fetch(channelId).catch(() => null);
    if (!guild || !channel || channel.guild.id !== guildId || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
      throw new BadRequestException('Select a text channel in this server for voice notifications.');
    }
    const me = guild.members.me ?? await guild.members.fetchMe();
    if (!channel.permissionsFor(me)?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
      throw new BadRequestException('Bot needs View Channel, Send Messages and Embed Links in the voice notification channel.');
    }
  }

  async validateRewardRoles(guildId: string, roleIds: string[]): Promise<void> {
    if (!roleIds.length) return;
    const guild = this.client?.guilds.cache.get(guildId);
    if (!guild) throw new BadRequestException('Bot is not in this server.');
    const me = guild.members.me ?? await guild.members.fetchMe();
    if (!me.permissions.has('ManageRoles')) throw new BadRequestException('Bot needs Manage Roles for voice rewards.');
    for (const id of roleIds) {
      const role = await guild.roles.fetch(id).catch(() => null);
      if (!role || role.guild.id !== guildId || role.id === guildId || role.managed || role.comparePositionTo(me.roles.highest) >= 0) {
        throw new BadRequestException('Voice reward roles must be assignable roles below the bot’s highest role.');
      }
    }
  }
}
