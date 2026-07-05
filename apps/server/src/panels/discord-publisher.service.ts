import { Injectable } from '@nestjs/common';
import { ChannelType, Guild, PermissionsBitField, TextChannel } from 'discord.js';
import type { APIEmbed, MessageCreateOptions } from 'discord.js';
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
    if (!panel.channelId) {
      throw new AppError('PANEL_CHANNEL_REQUIRED', 'Select a target channel before publishing this panel.', 400);
    }

    const guild = await this.bot.client.guilds.fetch(panel.guildId);
    const channel = await guild.channels.fetch(panel.channelId);
    const textChannel = this.asPublishableTextChannel(channel);

    await this.ensureChannelPermissions(guild, textChannel);

    const payload = this.renderer.render(panel, guild);
    this.validatePublishPayload(panel, payload);

    try {
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
    } catch (error) {
      this.throwPublishError(error);
    }
  }

  async deletePublishedMessage(panel: any) {
    if (!panel.messageId) return null;

    const guild = await this.bot.client.guilds.fetch(panel.guildId);
    const channel = await guild.channels.fetch(panel.channelId);
    const textChannel = this.asPublishableTextChannel(channel);

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

  private asPublishableTextChannel(channel: any): TextChannel {
    if (!channel || !channel.isTextBased() || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
      throw new AppError('INVALID_CHANNEL', 'Select a standard text or announcement channel before publishing this panel.', 400);
    }

    return channel as TextChannel;
  }

  private validatePublishPayload(panel: any, payload: MessageCreateOptions) {
    const firstEmbed = payload.embeds?.[0] as ({ toJSON?: () => APIEmbed } | APIEmbed | undefined);
    const embed = typeof firstEmbed?.toJSON === 'function' ? firstEmbed.toJSON() : firstEmbed as APIEmbed | undefined;
    const titleLength = embed?.title?.length ?? 0;
    const descriptionLength = embed?.description?.length ?? 0;
    const footerLength = embed?.footer?.text?.length ?? 0;
    const authorLength = embed?.author?.name?.length ?? 0;
    const totalEmbedLength = titleLength + descriptionLength + footerLength + authorLength;

    if (titleLength > 256) {
      throw new AppError('PANEL_TITLE_TOO_LONG', 'Panel title must be 256 characters or fewer before publishing.', 400, { titleLength });
    }

    if (descriptionLength > 4096) {
      throw new AppError('PANEL_DESCRIPTION_TOO_LONG', 'Panel description is too long for Discord. Keep it under 4,096 characters, including role lines.', 400, { descriptionLength });
    }

    if (totalEmbedLength > 6000) {
      throw new AppError('PANEL_CONTENT_TOO_LONG', 'Panel content is too long for Discord. Shorten the title, description, or role descriptions.', 400, { totalEmbedLength });
    }

    const roles = panel.roles || [];
    for (const role of roles) {
      if ((role.label?.length ?? 0) > 80) {
        throw new AppError('PANEL_ROLE_LABEL_TOO_LONG', 'Role option labels must be 80 characters or fewer before publishing.', 400, { roleId: role.roleId, labelLength: role.label?.length ?? 0 });
      }

      if ((role.description?.length ?? 0) > 100) {
        throw new AppError('PANEL_ROLE_DESCRIPTION_TOO_LONG', 'Dropdown role descriptions must be 100 characters or fewer before publishing.', 400, { roleId: role.roleId, descriptionLength: role.description?.length ?? 0 });
      }
    }
  }

  private throwPublishError(error: unknown): never {
    if (error instanceof AppError) throw error;

    const discordError = error as {
      code?: number;
      status?: number;
      message?: string;
      rawError?: { code?: number; message?: string; errors?: unknown };
    };

    if (discordError.code === 50035 || discordError.rawError?.code === 50035) {
      throw new AppError(
        'DISCORD_INVALID_PANEL_PAYLOAD',
        'Discord rejected this panel content. Check for invalid emoji, overly long labels, or unsupported image URLs.',
        400,
        { discordMessage: discordError.rawError?.message || discordError.message, errors: discordError.rawError?.errors },
      );
    }

    throw error;
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
        `The bot is missing permissions in #${textChannel.name}: ${missing.join(', ')}`,
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
