import { Injectable } from '@nestjs/common';
import { Interaction, PermissionFlagsBits } from 'discord.js';
import { SelfRolesService } from '../self-roles/self-roles.service';
import { ModerationService } from '../moderation/moderation.service';

@Injectable()
export class DiscordInteractionService {
  constructor(
    private readonly selfRoles: SelfRolesService,
    private readonly moderation: ModerationService,
  ) {}

  async handle(interaction: Interaction) {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'dashboard') {
        const url = process.env.FRONTEND_URL || 'http://localhost:3000';
        await interaction.reply({ content: `✦ Open nio dashboard: ${url}`, ephemeral: true });
        return;
      }

      const guildId = interaction.guildId;
      if (!guildId) return;

      if (interaction.commandName === 'warn') {
        const user = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason', true);

        if (!interaction.memberPermissions?.has([PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.Administrator])) {
          await interaction.reply({ content: '❌ You do not have permission to run this command.', ephemeral: true });
          return;
        }

        const settings = await this.moderation.getSettings(guildId);
        await this.moderation.createWarning(guildId, user.id, interaction.user.id, reason);
        const activeCount = await this.moderation.countActiveWarnings(guildId, user.id);

        let timeoutMsg = '';
        if (settings.warnLimitEnabled && activeCount >= settings.warnLimitThreshold) {
          try {
            const member = await interaction.guild?.members.fetch(user.id);
            if (member) {
              await member.timeout(
                settings.warnTimeoutDurationMin * 60 * 1000,
                `Warnings threshold reached (${activeCount}/${settings.warnLimitThreshold})`,
              );
              timeoutMsg = `\n⚠️ User has been timed out for ${settings.warnTimeoutDurationMin} minutes.`;
            }
          } catch (err: any) {
            timeoutMsg = `\n❌ Failed to issue auto-timeout: ${err.message}`;
          }
        }

        await interaction.reply({
          content: `✅ Warned **${user.username}** (Active: ${activeCount}). Reason: ${reason}${timeoutMsg}`,
        });
        return;
      }

      if (interaction.commandName === 'warnings') {
        const user = interaction.options.getUser('user', true);
        const activeCount = await this.moderation.countActiveWarnings(guildId, user.id);
        const warnings = await this.moderation.listWarnings(guildId, { search: user.id });

        await interaction.reply({
          content: `👤 **${user.username}** has **${activeCount}** active warning(s) (${warnings.length} total warnings).`,
        });
        return;
      }

      if (interaction.commandName === 'unwarn') {
        const warnId = interaction.options.getString('id', true);

        if (!interaction.memberPermissions?.has([PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.Administrator])) {
          await interaction.reply({ content: '❌ You do not have permission to run this command.', ephemeral: true });
          return;
        }

        try {
          await this.moderation.revokeWarning(guildId, warnId);
          await interaction.reply({ content: `✅ Successfully revoked warning **${warnId}**.` });
        } catch (err) {
          await interaction.reply({ content: `❌ Warning not found or could not be revoked.`, ephemeral: true });
        }
        return;
      }
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
