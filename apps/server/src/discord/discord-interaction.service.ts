import { Injectable } from '@nestjs/common';
import { Interaction } from 'discord.js';
import { SelfRolesService } from '../self-roles/self-roles.service';

@Injectable()
export class DiscordInteractionService {
  constructor(private readonly selfRoles: SelfRolesService) {}

  async handle(interaction: Interaction) {
    if (interaction.isChatInputCommand() && interaction.commandName === 'dashboard') {
      const url = process.env.FRONTEND_URL || 'http://localhost:3000';
      await interaction.reply({ content: `✦ Open nio dashboard: ${url}`, ephemeral: true });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('sr:')) {
      const [, panelId, roleId] = interaction.customId.split(':');
      await this.selfRoles.toggleFromInteraction(interaction, panelId, roleId);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('sr-menu:')) {
      const [, panelId] = interaction.customId.split(':');
      await this.selfRoles.toggleFromInteraction(interaction, panelId, interaction.values[0]);
    }
  }
}
