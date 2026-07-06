import { Injectable, OnModuleInit } from '@nestjs/common';
import { Client, Events, GatewayIntentBits, GuildMember, Message, Partials, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
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
  ) {}

  async onModuleInit() {
    this.slowmode.setClient(this.client);
    this.boosterRoles.setClient(this.client);
    this.tako.setClient(this.client);
    this.agentContext.setClient(this.client);
    this.actionProposals.setClient(this.client);

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
      if (!message.guild || !message.id) return;
      this.messageLogs.logDelete(message.id, new Date()).catch(
        (err) => this.logger.error(`Message log delete error: ${err?.message ?? err}`, err?.stack, 'DiscordBot'),
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
    const response = await this.agent.handleMention(
      message.guild.id,
      message.channel.id,
      message.author.id,
      message.content,
    );

    if (!response) return;

    await message.reply({
      content: response.content,
      embeds: response.embeds,
      components: response.components,
      allowedMentions: { parse: [], users: [], roles: [], repliedUser: false },
    });
  }

  private isBoosting(member: GuildMember) {
    const premiumRoleId = member.guild.roles.premiumSubscriberRole?.id;
    return Boolean(member.premiumSince || (premiumRoleId && member.roles.cache.has(premiumRoleId)));
  }
}
