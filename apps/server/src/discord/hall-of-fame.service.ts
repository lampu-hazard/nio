import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ChannelType,
  Client,
  EmbedBuilder,
  Message,
  MessageReaction,
  PartialMessage,
  PartialMessageReaction,
  PermissionsBitField,
} from 'discord.js';
import { AppLogger } from '../logger/logger.service';
import { PrismaService } from '../prisma/prisma.service';

const STAR = '⭐';
const NO_MENTIONS = { parse: [] as never[], users: [] as string[], roles: [] as string[], repliedUser: false };

@Injectable()
export class HallOfFameService {
  private client: Client | null = null;
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  setClient(client: Client) {
    this.client = client;
  }

  async validateChannel(guildId: string, channelId: string) {
    const guild = await this.client?.guilds.fetch(guildId).catch(() => null);
    const channel = await guild?.channels.fetch(channelId).catch(() => null);
    if (!guild || !channel || !channel.isTextBased() || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
      throw new BadRequestException('Hall of Fame channel must be a text or announcement channel.');
    }

    const me = guild.members.me || await guild.members.fetchMe();
    const permissions = channel.permissionsFor(me);
    const required = [
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.ReadMessageHistory,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.EmbedLinks,
    ];
    if (required.some((permission) => !permissions?.has(permission))) {
      throw new BadRequestException('Bot needs View Channel, Read Message History, Send Messages, and Embed Links permissions in the Hall of Fame channel.');
    }
  }

  handleReaction(reaction: MessageReaction | PartialMessageReaction) {
    return this.enqueueReaction(reaction);
  }

  handleReactionRemoveAll(message: Message | PartialMessage) {
    return this.enqueueMessage(message);
  }

  handleMessageDelete(message: Message | PartialMessage) {
    if (!message.guildId || !message.id) return Promise.resolve();
    const key = `${message.guildId}:${message.channelId}:${message.id}`;
    return this.serialize(key, () => this.removeSource(message.guildId!, message.channelId, message.id));
  }

  async cleanupGuild(guildId: string, mirrorChannelId?: string | null) {
    const entries = await this.prisma.hallOfFameEntry.findMany({
      where: { guildId, ...(mirrorChannelId ? { mirrorChannelId } : {}) },
    });
    const guild = await this.client?.guilds.fetch(guildId).catch(() => null);
    for (const entry of entries) {
      const channel = await guild?.channels.fetch(entry.mirrorChannelId).catch(() => null);
      if (channel?.isTextBased()) {
        const mirror = await channel.messages.fetch(entry.mirrorMessageId).catch(() => null);
        await mirror?.delete().catch(() => null);
      }
    }
    await this.prisma.hallOfFameEntry.deleteMany({
      where: { guildId, ...(mirrorChannelId ? { mirrorChannelId } : {}) },
    });
  }

  private async enqueueReaction(input: MessageReaction | PartialMessageReaction) {
    let reaction = input;
    if (reaction.partial) reaction = await reaction.fetch().catch(() => reaction);
    if (reaction.emoji.name !== STAR) return;
    let message = reaction.message;
    if (message.partial) message = await message.fetch().catch(() => message);
    return this.enqueueMessage(message);
  }

  private enqueueMessage(message: Message | PartialMessage) {
    if (!message.guildId || !message.id) return Promise.resolve();
    const key = `${message.guildId}:${message.channelId}:${message.id}`;
    return this.serialize(key, () => this.reconcile(message.guildId!, message.channelId, message.id));
  }

  private serialize(key: string, task: () => Promise<void>) {
    const next = (this.queues.get(key) || Promise.resolve()).catch(() => undefined).then(task);
    this.queues.set(key, next);
    return next.finally(() => {
      if (this.queues.get(key) === next) this.queues.delete(key);
    });
  }

  private async reconcile(guildId: string, sourceChannelId: string, sourceMessageId: string) {
    const settings = await this.prisma.guildSettings.findUnique({
      where: { guildId },
      select: { hallOfFameEnabled: true, hallOfFameChannelId: true, hallOfFameThreshold: true },
    });
    const existing = await this.prisma.hallOfFameEntry.findUnique({
      where: { guildId_sourceChannelId_sourceMessageId: { guildId, sourceChannelId, sourceMessageId } },
    });

    if (!settings?.hallOfFameEnabled || !settings.hallOfFameChannelId || sourceChannelId === settings.hallOfFameChannelId) {
      if (existing) await this.deleteEntry(existing);
      return;
    }

    const guild = await this.client?.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;
    const sourceChannel = await guild.channels.fetch(sourceChannelId).catch(() => null);
    if (!sourceChannel?.isTextBased()) {
      if (existing) await this.deleteEntry(existing);
      return;
    }
    const source = await sourceChannel.messages.fetch(sourceMessageId).catch(() => null);
    if (!source || source.author.bot) {
      if (existing) await this.deleteEntry(existing);
      return;
    }

    const star = source.reactions.cache.find((item) => item.emoji.name === STAR);
    const users = star ? await star.users.fetch().catch(() => null) : null;
    const count = users ? users.filter((user) => !user.bot).size : 0;
    if (count < settings.hallOfFameThreshold) {
      if (existing) await this.deleteEntry(existing);
      return;
    }

    const destination = await guild.channels.fetch(settings.hallOfFameChannelId).catch(() => null);
    if (!destination?.isTextBased()) return;
    if (!await this.hasPublishPermissions(guild, destination)) {
      this.logger.warn(`Missing Hall of Fame permissions in channel ${settings.hallOfFameChannelId}`, 'HallOfFame');
      return;
    }

    const payload = this.render(source, count);
    if (existing) {
      const oldChannel = await guild.channels.fetch(existing.mirrorChannelId).catch(() => null);
      const mirror = oldChannel?.isTextBased() ? await oldChannel.messages.fetch(existing.mirrorMessageId).catch(() => null) : null;
      if (mirror && existing.mirrorChannelId === destination.id) {
        await mirror.edit(payload);
        await this.prisma.hallOfFameEntry.update({
          where: { id: existing.id },
          data: { starCount: count },
        });
        return;
      }
      await mirror?.delete().catch(() => null);
      await this.prisma.hallOfFameEntry.delete({ where: { id: existing.id } }).catch(() => null);
    }

    const mirror = await destination.send(payload);
    try {
      await this.prisma.hallOfFameEntry.create({
        data: { guildId, sourceChannelId, sourceMessageId, mirrorChannelId: destination.id, mirrorMessageId: mirror.id, starCount: count },
      });
    } catch (error: any) {
      await mirror.delete().catch(() => null);
      if (error?.code !== 'P2002') throw error;
      const winner = await this.prisma.hallOfFameEntry.findUnique({
        where: { guildId_sourceChannelId_sourceMessageId: { guildId, sourceChannelId, sourceMessageId } },
      });
      if (winner) {
        const winnerChannel = await guild.channels.fetch(winner.mirrorChannelId).catch(() => null);
        const winnerMirror = winnerChannel?.isTextBased() ? await winnerChannel.messages.fetch(winner.mirrorMessageId).catch(() => null) : null;
        await winnerMirror?.edit(payload).catch(() => null);
      }
    }
  }

  private render(source: Message, count: number) {
    const description = source.content?.slice(0, 4096) || '*No text content*';
    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setAuthor({ name: source.author.displayName, iconURL: source.author.displayAvatarURL() })
      .setDescription(description)
      .addFields({ name: 'Source', value: `[Jump to message](${source.url})` })
      .setFooter({ text: `${STAR} ${count}` })
      .setTimestamp(source.createdAt);
    const image = source.attachments.find((attachment) => attachment.contentType?.startsWith('image/'));
    if (image) embed.setImage(image.url);
    return { embeds: [embed], allowedMentions: NO_MENTIONS };
  }

  private async deleteEntry(entry: any) {
    const guild = await this.client?.guilds.fetch(entry.guildId).catch(() => null);
    const channel = await guild?.channels.fetch(entry.mirrorChannelId).catch(() => null);
    const mirror = channel?.isTextBased() ? await channel.messages.fetch(entry.mirrorMessageId).catch(() => null) : null;
    await mirror?.delete().catch(() => null);
    await this.prisma.hallOfFameEntry.delete({ where: { id: entry.id } }).catch(() => null);
  }

  private async removeSource(guildId: string, sourceChannelId: string, sourceMessageId: string) {
    const entry = await this.prisma.hallOfFameEntry.findUnique({
      where: { guildId_sourceChannelId_sourceMessageId: { guildId, sourceChannelId, sourceMessageId } },
    });
    if (entry) await this.deleteEntry(entry);
  }

  private async hasPublishPermissions(guild: any, channel: any) {
    const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
    const permissions = me && channel.permissionsFor(me);
    return Boolean(permissions?.has(PermissionsBitField.Flags.ViewChannel)
      && permissions.has(PermissionsBitField.Flags.ReadMessageHistory)
      && permissions.has(PermissionsBitField.Flags.SendMessages)
      && permissions.has(PermissionsBitField.Flags.EmbedLinks));
  }
}
