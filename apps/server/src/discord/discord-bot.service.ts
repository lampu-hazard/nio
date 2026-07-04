import { Injectable, OnModuleInit } from '@nestjs/common';
import { Client, EmbedBuilder, Events, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { AppLogger } from '../logger/logger.service';
import { DiscordInteractionService } from './discord-interaction.service';
import { StickersService } from '../stickers/stickers.service';
import { DiscordSlowmodeService } from './discord-slowmode.service';

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
  ) {}

  async onModuleInit() {
    this.slowmode.setClient(this.client);

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

    this.client.on('messageCreate', (message) => {
      this.slowmode.handleMessage(message).catch(
        (err) => this.logger.error(`Slowmode service error: ${err?.message ?? err}`, err?.stack, 'DiscordBot'),
      );

      if (message.author.bot || !message.guild) return;
      const name = message.content.trim().toLowerCase();
      if (!name || name.length > 32) return;
      const url = this.stickers.getCachedUrl(message.guild.id, name);
      if (!url) return;
      const embed = new EmbedBuilder().setImage(url);
      message.channel.send({ embeds: [embed] }).catch(
        (err) => this.logger.error(`Sticker send error: ${err?.message ?? err}`, err?.stack, 'DiscordBot'),
      );
    });

    const commands = [
      new SlashCommandBuilder().setName('dashboard').setDescription('Open the nio dashboard').toJSON(),
    ];
    await new REST({ version: '10' }).setToken(token).put(Routes.applicationCommands(clientId), { body: commands });
    this.logger.log('Slash commands registered', 'DiscordBot');
    await this.client.login(token);
  }
}
