import { Injectable, OnModuleInit } from '@nestjs/common';
import { Client, Events, GatewayIntentBits, GuildMember, Message, Partials, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { AppLogger } from '../logger/logger.service';
import { DiscordInteractionService } from './discord-interaction.service';
import { StickersService } from '../stickers/stickers.service';
import { DiscordSlowmodeService } from './discord-slowmode.service';
import { DiscordAnomalyService } from './discord-anomaly.service';
import { BoosterRoleService } from '../booster-role/booster-role.service';
import { TakoService } from '../tako/tako.service';
import { DiscordAgentService } from '../discord-agent/discord-agent.service';
import { DiscordAgentContextService } from '../discord-agent/discord-agent-context.service';
import { DiscordMessageLogService } from '../discord-agent/discord-message-log.service';
import { AgentActionProposalService } from '../discord-agent/agent-action-proposal.service';
import { DiscordAgentToolExecutorService } from '../discord-agent/discord-agent-tool-executor.service';

@Injectable()
export class DiscordBotService implements OnModuleInit {
  readonly client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.GuildMember],
    allowedMentions: { parse: [], users: [], roles: [], repliedUser: false },
  });

  constructor(
    private readonly interactions: DiscordInteractionService,
    private readonly stickers: StickersService,
    private readonly logger: AppLogger,
    private readonly slowmode: DiscordSlowmodeService,
    private readonly anomaly: DiscordAnomalyService,
    private readonly boosterRoles: BoosterRoleService,
    private readonly tako: TakoService,
    private readonly agent: DiscordAgentService,
    private readonly agentContext: DiscordAgentContextService,
    private readonly messageLogs: DiscordMessageLogService,
    private readonly actionProposals: AgentActionProposalService,
    private readonly agentToolExecutor: DiscordAgentToolExecutorService,
  ) {}

  async onModuleInit() {
    this.slowmode.setClient(this.client);
    this.boosterRoles.setClient(this.client);
    this.tako.setClient(this.client);
    this.agentContext.setClient(this.client);
    this.actionProposals.setClient(this.client);
    this.actionProposals.setSlowmodeService(this.slowmode);
    this.actionProposals.setAnomalyService(this.anomaly);
    this.agentToolExecutor.setClient(this.client);

    const token = process.env.DISCORD_BOT_TOKEN;
    const clientId = process.env.DISCORD_CLIENT_ID;
    if (!token || !clientId) {
      this.logger.warn('DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID missing; Discord bot not started.', 'DiscordBot');
      return;
    }

    this.client.once(Events.ClientReady, () => this.logger.log(`Discord bot online as ${this.client.user?.tag}`, 'DiscordBot'));
    this.client.on('interactionCreate', (interaction) => this.interactions.handle(interaction).catch(
      (err) => this.logger.error(`Interaction error: ${err?.message ?? err}`, err?.stack, 'DiscordBot'),
    ));

    this.client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
      const oldGuildMember = oldMember as GuildMember;
      const newGuildMember = newMember as GuildMember;
      const wasBoosting = this.isBoosting(oldGuildMember);
      const isBoosting = this.isBoosting(newGuildMember);
      if (wasBoosting === isBoosting) return;

      this.boosterRoles.handleBoosterStatusChange(newGuildMember.guild.id, newGuildMember.id, wasBoosting, isBoosting).catch(
        (err) => this.logger.error(`Booster role status update error: ${err?.message ?? err}`, err?.stack, 'DiscordBot'),
      );
    });

    this.client.on('messageCreate', (message) => {
      this.slowmode.handleMessage(message).catch(
        (err) => this.logger.error(`Slowmode service error: ${err?.message ?? err}`, err?.stack, 'DiscordBot'),
      );

      this.anomaly.handleMessage(message).catch(
        (err) => this.logger.error(`Anomaly service error: ${err?.message ?? err}`, err?.stack, 'DiscordBot'),
      );

      if (message.author.bot || !message.guild) return;

      this.handleAgentMessage(message).catch(
        (err) => this.logger.error(`Discord agent message error: ${err?.message ?? err}`, err?.stack, 'DiscordBot'),
      );

      const name = message.content.trim().toLowerCase();
      if (!name || name.length > 32) return;
      const url = this.stickers.getCachedUrl(message.guild.id, name);
      if (!url) return;

      const ext = url.split('?')[0].split('.').pop() || 'png';
      message.channel.send({
        files: [{
          attachment: url,
          name: `${name}.${ext}`,
        }],
      }).catch(
        (err) => this.logger.error(`Sticker send error: ${err?.message ?? err}`, err?.stack, 'DiscordBot'),
      );
    });

    this.client.on(Events.MessageUpdate, (oldMessage, newMessage) => {
      if (!newMessage.guild || !newMessage.id) return;
      this.messageLogs.logUpdate(newMessage.id, newMessage.content || '', new Date()).catch(
        (err) => this.logger.error(`Message log update error: ${err?.message ?? err}`, err?.stack, 'DiscordBot'),
      );
    });

    this.client.on(Events.MessageDelete, (message) => {
      this.handleMessageDelete(message).catch(
        (err) => this.logger.error(`Message delete log error: ${err?.message ?? err}`, err?.stack, 'DiscordBot'),
      );
      if (!message.guild || !message.id) return;
      this.messageLogs.logDelete(message.id, new Date()).catch(
        (err) => this.logger.error(`Message log delete error: ${err?.message ?? err}`, err?.stack, 'DiscordBot'),
      );
    });

    this.client.on(Events.MessageBulkDelete, (messages) => {
      const messageIds = messages.map((m: any) => m.id);
      this.handleMessageDeleteBulk(messages).catch(
        (err: any) => this.logger.error(`Message delete bulk log error: ${err?.message ?? err}`, err?.stack, 'DiscordBot'),
      );
      this.messageLogs.prisma.discordMessageLog.updateMany({
        where: { id: { in: messageIds } },
        data: { deletedAt: new Date() },
      }).catch(
        (err: any) => this.logger.error(`Message log bulk delete error: ${err?.message ?? err}`, err?.stack, 'DiscordBot'),
      );
    });

    const commands = [
      new SlashCommandBuilder().setName('dashboard').setDescription('Open the nio dashboard').toJSON(),
      new SlashCommandBuilder()
        .setName('booster-role')
        .setDescription('Create or edit your custom booster role')
        .setDMPermission(false)
        .toJSON(),
      new SlashCommandBuilder()
        .setName('donate-role')
        .setDescription('Get private checkout link to donate and receive your reward role')
        .setDMPermission(false)
        .toJSON(),
      new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Issue a warning to a member')
        .addUserOption(option => option.setName('user').setDescription('The member to warn').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('The reason for warning').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers | PermissionFlagsBits.BanMembers | PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .toJSON(),
      new SlashCommandBuilder()
        .setName('warnings')
        .setDescription('List warnings of a member')
        .addUserOption(option => option.setName('user').setDescription('The member to check').setRequired(true))
        .toJSON(),
      new SlashCommandBuilder()
        .setName('unwarn')
        .setDescription('Revoke a warning by ID')
        .addStringOption(option => option.setName('id').setDescription('The warning ID').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers | PermissionFlagsBits.BanMembers | PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .toJSON(),
    ];
    await new REST({ version: '10' }).setToken(token).put(Routes.applicationCommands(clientId), { body: commands });
    this.logger.log('Slash commands registered', 'DiscordBot');
    await this.client.login(token);
  }

  private async handleAgentMessage(message: Message) {
    if (!message.guild) return;

    await this.messageLogs.logCreate({
      id: message.id,
      guildId: message.guild.id,
      channelId: message.channel.id,
      authorId: message.author.id,
      content: message.content || '',
      attachments: message.attachments.map((attachment) => ({
        id: attachment.id,
        name: attachment.name,
        url: attachment.url,
        contentType: attachment.contentType,
      })),
      embeds: message.embeds.map((embed) => embed.toJSON()),
      createdAt: message.createdAt,
    });

    if (!this.client.user || !message.mentions.has(this.client.user)) return;

    if (message.channel && typeof (message.channel as any).sendTyping === 'function') {
      await (message.channel as any).sendTyping().catch(() => null);
    }

    const loadingMessage = await message.reply({
      content: '**nio** sedang membaca konteks...\n-# Meninjau riwayat channel, warning, role, dan tool yang relevan.',
      allowedMentions: { parse: [], users: [], roles: [], repliedUser: false },
    }).catch(() => null);

    const response = await this.agent.handleMention(
      message.guild.id,
      message.channel.id,
      message.author.id,
      message.content,
    );

    if (!response) {
      await loadingMessage?.delete().catch(() => null);
      return;
    }

    const replyPayload = {
      content: response.content,
      embeds: response.embeds,
      components: response.components,
      allowedMentions: { parse: [], users: [], roles: [], repliedUser: false },
    };

    if (loadingMessage) {
      await loadingMessage.edit(replyPayload).catch(() => message.reply(replyPayload));
      return;
    }

    await message.reply(replyPayload);
  }

  private async handleMessageDelete(message: any) {
    if (!message.guild || !message.id) return;

    try {
      const settings = await this.messageLogs.prisma.guildSettings.findUnique({
        where: { guildId: message.guild.id },
      });

      const logChannelId = settings?.messageDeleteLogChannelId;
      if (!logChannelId) return;

      const dbLog = await this.messageLogs.prisma.discordMessageLog.findUnique({
        where: { id: message.id },
      });

      if (!dbLog) return;

      const logChannel = await message.guild.channels.fetch(logChannelId).catch(() => null);
      if (!logChannel || !logChannel.isTextBased()) return;

      const attachments = (dbLog.attachments as any[]) || [];
      const attachmentBuffers: { attachment: Buffer; name: string }[] = [];
      const largeAttachments: any[] = [];

      for (const att of attachments) {
        if (!att.url) continue;
        const res = await fetch(att.url).catch(() => null);
        if (res && res.ok) {
          const contentLength = Number(res.headers.get('content-length') || '0');
          if (contentLength > 0 && contentLength <= 8 * 1024 * 1024) { // max 8MB
            const buffer = Buffer.from(await res.arrayBuffer());
            attachmentBuffers.push({ attachment: buffer, name: att.name || 'file' });
          } else {
            largeAttachments.push(att);
          }
        }
      }

      let contentDescription = dbLog.content ? `>>> ${dbLog.content}` : '*No text content*';
      if (largeAttachments.length > 0) {
        const largeList = largeAttachments.map((att) => `• [${att.name || 'file'}](${att.url}) (File too large to re-upload)`).join('\n');
        contentDescription += `\n\n**Attachments (Over limit):**\n${largeList}`;
      }

      const embed = new EmbedBuilder()
        .setColor(0x7f8c8d)
        .setTitle('Message Deleted')
        .setDescription(contentDescription.length > 4096 ? `${contentDescription.slice(0, 4093)}...` : contentDescription)
        .addFields(
          { name: 'Author', value: `<@${dbLog.authorId}> (\`${dbLog.authorId}\`)`, inline: true },
          { name: 'Channel', value: `<#${dbLog.channelId}>`, inline: true },
          { name: 'Sent At', value: `<t:${Math.floor(dbLog.createdAt.getTime() / 1000)}:f>`, inline: true }
        )
        .setTimestamp();

      await logChannel.send({
        embeds: [embed],
        files: attachmentBuffers,
      }).catch((err: any) => this.logger.error(`Failed to send message delete log: ${err.message}`, err.stack, 'DiscordBot'));
    } catch (err: any) {
      this.logger.error(`Error in handleMessageDelete: ${err.message}`, err.stack, 'DiscordBot');
    }
  }

  private async handleMessageDeleteBulk(messages: any) {
    const firstMsg = messages.first();
    if (!firstMsg || !firstMsg.guild) return;

    const guildId = firstMsg.guild.id;
    const channelId = firstMsg.channel.id;

    try {
      const settings = await this.messageLogs.prisma.guildSettings.findUnique({
        where: { guildId },
      });

      const logChannelId = settings?.messageDeleteLogChannelId;
      if (!logChannelId) return;

      const messageIds = messages.map((m: any) => m.id);
      const dbLogs = await this.messageLogs.prisma.discordMessageLog.findMany({
        where: { id: { in: messageIds } },
        orderBy: { createdAt: 'asc' },
      });

      if (dbLogs.length === 0) return;

      const logChannel = await firstMsg.guild.channels.fetch(logChannelId).catch(() => null);
      if (!logChannel || !logChannel.isTextBased()) return;

      const logLines: string[] = [
        `=== BULK DELETION LOG: #${firstMsg.channel.name || channelId} ===`,
        `Guild: ${firstMsg.guild.name} (${guildId})`,
        `Deleted count: ${dbLogs.length}`,
        `Date: ${new Date().toISOString()}`,
        `----------------------------------------\n`
      ];

      for (const log of dbLogs) {
        const timestamp = log.createdAt.toISOString();
        const attachments = (log.attachments as any[]) || [];
        const attNames = attachments.map((a) => a.name).join(', ');
        const attSuffix = attNames ? ` [Attachments: ${attNames}]` : '';
        logLines.push(`[${timestamp}] User ID ${log.authorId}: ${log.content || ''}${attSuffix}`);
      }

      logLines.push(`\n========================================`);
      const logContent = logLines.join('\n');
      const buffer = Buffer.from(logContent, 'utf8');

      await logChannel.send({
        content: `🗑️ **Bulk Message Deletion**\nChannel: <#${channelId}>\nDeleted: \`${dbLogs.length} messages\``,
        files: [{ attachment: buffer, name: `bulk-delete-log-${Date.now()}.txt` }],
      }).catch((err: any) => this.logger.error(`Failed to send message delete bulk log: ${err.message}`, err.stack, 'DiscordBot'));
    } catch (err: any) {
      this.logger.error(`Error in handleMessageDeleteBulk: ${err.message}`, err.stack, 'DiscordBot');
    }
  }

  private isBoosting(member: GuildMember) {
    const premiumRoleId = member.guild.roles.premiumSubscriberRole?.id;
    return Boolean(member.premiumSince || (premiumRoleId && member.roles.cache.has(premiumRoleId)));
  }
}
