import { Injectable } from '@nestjs/common';
import { Interaction, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { SelfRolesService } from '../self-roles/self-roles.service';
import { ModerationService } from '../moderation/moderation.service';
import { BoosterRoleService } from '../booster-role/booster-role.service';
import { TakoService } from '../tako/tako.service';
import { AgentActionProposalService } from '../discord-agent/agent-action-proposal.service';
import { AgentActionRendererService } from '../discord-agent/agent-action-renderer.service';

@Injectable()
export class DiscordInteractionService {
  constructor(
    private readonly selfRoles: SelfRolesService,
    private readonly moderation: ModerationService,
    private readonly boosterRoles: BoosterRoleService,
    private readonly tako: TakoService,
    private readonly agentProposals: AgentActionProposalService,
    private readonly agentActionRenderer: AgentActionRendererService,
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

      if (interaction.commandName === 'booster-role') {
        try {
          const claim = await this.boosterRoles.generateToken(guildId, interaction.user.id);
          const url = process.env.FRONTEND_URL || 'http://localhost:3000';
          await interaction.reply({
            embeds: [this.buildStatusEmbed('Custom Booster Role', `Open this private link to create or edit your custom booster role:\n${url}/booster-role?guildId=${guildId}&token=${claim.token}`)],
            ephemeral: true,
          });
        } catch (err: any) {
          await interaction.reply({
            embeds: [this.buildStatusEmbed('Booster Role Unavailable', err?.message || 'Only active server boosters can use this feature.')],
            ephemeral: true,
          });
        }
        return;
      }

      if (interaction.commandName === 'donate-role') {
        try {
          const settings = await this.tako.getSettings(guildId);
          if (!settings.enabled || !settings.rewardRoleId) {
            await interaction.reply({
              embeds: [this.buildStatusEmbed('Donation Unavailable', 'Tako donation rewards are not enabled on this server.')],
              ephemeral: true,
            });
            return;
          }

          const url = process.env.FRONTEND_URL || 'http://localhost:3000';
          const minFormatted = settings.minimumAmount.toLocaleString('id-ID');
          await interaction.reply({
            embeds: [this.buildStatusEmbed(
              'Tako Donation Reward',
              `Donate minimal **Rp${minFormatted}** via Tako to automatically receive the <@&${settings.rewardRoleId}> role!\n\n✦ [Click here to open donation page](${url}/donate?guildId=${guildId})`
            )],
            ephemeral: true,
          });
        } catch (err: any) {
          await interaction.reply({
            embeds: [this.buildStatusEmbed('Error', err?.message || 'Failed to process donation request.')],
            ephemeral: true,
          });
        }
        return;
      }

      if (interaction.commandName === 'warn') {
        const user = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason', true);

        if (!interaction.memberPermissions?.has([PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.Administrator])) {
          await interaction.reply({
            embeds: [this.buildStatusEmbed('Permission Required', 'You need moderation permissions to run this command.')],
            ephemeral: true,
          });
          return;
        }

        const settings = await this.moderation.getSettings(guildId);
        const warning = await this.moderation.createWarning(guildId, user.id, interaction.user.id, reason);
        const activeCount = await this.moderation.countActiveWarnings(guildId, user.id);

        let timeoutApplied = false;
        let timeoutError = '';

        if (settings.warnLimitEnabled && activeCount >= settings.warnLimitThreshold) {
          try {
            const member = await interaction.guild?.members.fetch(user.id);
            if (member) {
              await member.timeout(
                settings.warnTimeoutDurationMin * 60 * 1000,
                `Warnings threshold reached (${activeCount}/${settings.warnLimitThreshold})`,
              );
              timeoutApplied = true;
            }
          } catch (err: any) {
            timeoutError = err.message;
          }
        }

        const embed = new EmbedBuilder()
          .setColor(0x2b2d31)
          .setTitle('Warning Issued')
          .setDescription(`A warning has been recorded for <@${user.id}>.`)
          .addFields(
            { name: 'Member', value: `<@${user.id}> (${user.username})`, inline: true },
            { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Active Warnings', value: `${activeCount}`, inline: true },
            { name: 'Reason', value: reason },
          )
          .setFooter({ text: `Warning ID: ${warning.id}` })
          .setTimestamp();

        if (timeoutApplied) {
          embed.addFields({ name: 'Auto Penalty', value: `Muted (Timeout) for ${settings.warnTimeoutDurationMin} minutes.` });
        } else if (timeoutError) {
          embed.addFields({ name: 'Auto Penalty Status', value: `Failed to timeout: ${timeoutError}` });
        }

        await interaction.reply({ embeds: [embed] });
        return;
      }

      if (interaction.commandName === 'warnings') {
        const user = interaction.options.getUser('user', true);
        const activeCount = await this.moderation.countActiveWarnings(guildId, user.id);
        const warnings = await this.moderation.listWarnings(guildId, { search: user.id });

        const embed = new EmbedBuilder()
          .setColor(0x2b2d31)
          .setTitle(`Warnings Status: ${user.username}`)
          .setThumbnail(user.displayAvatarURL())
          .addFields(
            { name: 'Active Warnings', value: `${activeCount}`, inline: true },
            { name: 'Total Violations', value: `${warnings.length}`, inline: true },
          );

        if (warnings.length > 0) {
          const warnList = warnings
            .slice(0, 5)
            .map((w) => {
              const date = new Date(w.createdAt).toLocaleDateString(undefined, { dateStyle: 'short' });
              return `\`${w.id}\` - ${w.reason} (Issued on ${date})`;
            })
            .join('\n');
          embed.addFields({ name: 'Recent Warning Logs', value: warnList });
          if (warnings.length > 5) {
            embed.setFooter({ text: `Showing 5 of ${warnings.length} total warnings. Manage details via nio dashboard.` });
          }
        } else {
          embed.setDescription('This member has a clean record on this server.');
        }

        await interaction.reply({ embeds: [embed] });
        return;
      }

      if (interaction.commandName === 'unwarn') {
        const warnId = interaction.options.getString('id', true);

        if (!interaction.memberPermissions?.has([PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.Administrator])) {
          await interaction.reply({
            embeds: [this.buildStatusEmbed('Permission Required', 'You need moderation permissions to run this command.')],
            ephemeral: true,
          });
          return;
        }

        try {
          await this.moderation.revokeWarning(guildId, warnId);
          const embed = new EmbedBuilder()
            .setColor(0x2b2d31)
            .setTitle('Warning Revoked')
            .setDescription(`Successfully removed warning record \`${warnId}\`.`)
            .setTimestamp();
          await interaction.reply({ embeds: [embed] });
        } catch (err) {
          await interaction.reply({
            embeds: [this.buildStatusEmbed('Warning Not Found', 'That warning could not be found or has already been revoked.')],
            ephemeral: true,
          });
        }
        return;
      }
    }

    if (interaction.isButton() && interaction.customId.startsWith('agent:')) {
      const [, action, proposalId] = interaction.customId.split(':');
      try {
        const result = action === 'approve'
          ? await this.agentProposals.approveAndExecute(proposalId, interaction.user.id)
          : await this.agentProposals.cancelProposal(proposalId, interaction.user.id);

        await interaction.update(this.agentActionRenderer.renderExecutionResult(
          action === 'approve' ? 'Proposal Executed' : 'Proposal Cancelled',
          result.message,
        ));
      } catch (err: any) {
        await interaction.reply({
          content: err?.message || 'Failed to process proposal.',
          ephemeral: true,
          allowedMentions: { parse: [], users: [], roles: [], repliedUser: false },
        });
      }
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

  private buildStatusEmbed(title: string, description: string) {
    return new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle(title)
      .setDescription(description)
      .setTimestamp();
  }
}
