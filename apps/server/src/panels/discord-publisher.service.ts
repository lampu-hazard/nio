import { Injectable } from '@nestjs/common';
import { Guild, PermissionsBitField, TextChannel } from 'discord.js';
import { AppError } from '../common/errors/app-error';
import { AppLogger } from '../logger/logger.service';
import { DiscordBotService } from '../discord/discord-bot.service';
import { PanelRendererService } from './panel-renderer.service';

@Injectable()
export class DiscordPublisherService {
  constructor(
    private readonly bot: DiscordBotService,
    private readonly renderer: PanelRendererService,
    private readonly logger: AppLogger,
  ) {}

  async publish(panel: any) {
    const guild = await this.bot.client.guilds.fetch(panel.guildId);
    const channel = await guild.channels.fetch(panel.channelId);
    if (!channel || !channel.isTextBased()) throw new AppError('INVALID_CHANNEL', 'Channel tidak valid atau bukan text channel', 400);

    const textChannel = channel as TextChannel;
    await this.ensureChannelPermissions(guild, textChannel);

    const payload = this.renderer.render(panel, guild);
    const message = panel.messageId ? await textChannel.messages.fetch(panel.messageId).catch(() => null) : null;
    if (message) {
      try {
        const updated = await message.edit(payload);
        this.logger.log(`Panel updated in #${textChannel.name}: ${panel.name}`, 'Publisher');
        return updated;
      } catch (error) {
        if (!this.isUnknownMessage(error)) throw error;
        this.logger.warn(`Stored message missing, republishing panel in #${textChannel.name}: ${panel.name}`, 'Publisher');
      }
    }
    const sent = await textChannel.send(payload);
    this.logger.log(`Panel published to #${textChannel.name}: ${panel.name}`, 'Publisher');
    return sent;
  }

  async deletePublishedMessage(panel: any) {
    if (!panel.messageId) return null;

    const guild = await this.bot.client.guilds.fetch(panel.guildId);
    const channel = await guild.channels.fetch(panel.channelId);
    if (!channel || !channel.isTextBased()) throw new AppError('INVALID_CHANNEL', 'Channel tidak valid atau bukan text channel', 400);

    const textChannel = channel as TextChannel;
    await this.ensureChannelPermissions(guild, textChannel);

    const message = await textChannel.messages.fetch(panel.messageId).catch((error) => {
      if (this.isUnknownMessage(error)) return null;
      throw error;
    });

    if (!message) {
      this.logger.warn(`Published message already missing in #${textChannel.name}: ${panel.name}`, 'Publisher');
      return null;
    }

    try {
      await message.delete();
      this.logger.log(`Panel message deleted from #${textChannel.name}: ${panel.name}`, 'Publisher');
      return message;
    } catch (error) {
      if (!this.isUnknownMessage(error)) throw error;
      this.logger.warn(`Published message already deleted in #${textChannel.name}: ${panel.name}`, 'Publisher');
      return null;
    }
  }

  private async ensureChannelPermissions(guild: Guild, textChannel: TextChannel) {
    const me = guild.members.me || await guild.members.fetchMe();
    const permissions = textChannel.permissionsFor(me);
    const missing = [
      { flag: PermissionsBitField.Flags.ViewChannel, label: 'View Channel' },
      { flag: PermissionsBitField.Flags.SendMessages, label: 'Send Messages' },
      { flag: PermissionsBitField.Flags.EmbedLinks, label: 'Embed Links' },
    ].filter((permission) => !permissions?.has(permission.flag)).map((permission) => permission.label);

    if (missing.length) {
      throw new AppError(
        'DISCORD_MISSING_PERMISSIONS',
        `Bot belum punya permission di #${textChannel.name}: ${missing.join(', ')}`,
        403,
        { channelId: textChannel.id, channelName: textChannel.name, missing },
      );
    }
  }

  private isUnknownMessage(error: unknown) {
    const discordError = error as { code?: number; rawError?: { code?: number } };
    return discordError.code === 10008 || discordError.rawError?.code === 10008;
  }
}
