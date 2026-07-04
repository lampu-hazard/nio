import { Injectable } from '@nestjs/common';
import { ButtonInteraction, EmbedBuilder, GuildMember, StringSelectMenuInteraction } from 'discord.js';
import { PanelRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppLogger } from '../logger/logger.service';

@Injectable()
export class SelfRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  async toggleFromInteraction(interaction: ButtonInteraction | StringSelectMenuInteraction, panelId: string, roleId: string) {
    await interaction.deferReply({ flags: ['Ephemeral'] });

    const panel = await this.prisma.panel.findUnique({
      where: { id: panelId },
      include: { roles: { orderBy: { position: 'asc' } } },
    });

    if (!panel) return interaction.editReply({ embeds: [this.buildStatusEmbed('Panel Not Found', 'This self-role panel is no longer available.')] });
    const roleOption = panel.roles.find((role: PanelRole) => role.roleId === roleId);
    if (!roleOption) return interaction.editReply({ embeds: [this.buildStatusEmbed('Role Unavailable', 'This role is no longer available in this panel.')] });
    if (!interaction.guild || !interaction.member || !('roles' in interaction.member)) {
      return interaction.editReply({ embeds: [this.buildStatusEmbed('Invalid Interaction', 'This role can only be managed from inside the server.')] });
    }

    const member = interaction.member as GuildMember;
    const role = interaction.guild.roles.cache.get(roleId) || await interaction.guild.roles.fetch(roleId).catch(() => null);
    if (!role) return interaction.editReply({ embeds: [this.buildStatusEmbed('Role Not Found', 'This role could not be found on the server.')] });

    const hasRole = member.roles.cache.has(roleId);

    if (!hasRole && panel.maxRoles > 0) {
      const currentCount = panel.roles.filter((option: PanelRole) => member.roles.cache.has(option.roleId)).length;
      if (currentCount >= panel.maxRoles) {
        return interaction.editReply({
          embeds: [this.buildStatusEmbed('Role Limit Reached', `You can only hold ${panel.maxRoles} role${panel.maxRoles === 1 ? '' : 's'} from this panel.`)],
        });
      }
    }

    if (!hasRole && panel.requireRoleId && !member.roles.cache.has(panel.requireRoleId)) {
      return interaction.editReply({
        embeds: [this.buildStatusEmbed('Required Role Missing', `You need <@&${panel.requireRoleId}> before using this panel.`)],
      });
    }

    if (hasRole) {
      await member.roles.remove(roleId);
      await this.log(panel.guildId, interaction.user.id, roleId, 'REMOVE', panel.id);
      this.logger.log(`Role removed: ${roleId} from ${interaction.user.id} (panel: ${panel.name})`, 'SelfRoles');
      return interaction.editReply({ embeds: [this.buildRoleEmbed('Role Removed', `Removed <@&${roleId}> from your account.`, panel.name)] });
    }

    await member.roles.add(roleId);
    await this.log(panel.guildId, interaction.user.id, roleId, 'ADD', panel.id);
    this.logger.log(`Role added: ${roleId} to ${interaction.user.id} (panel: ${panel.name})`, 'SelfRoles');
    return interaction.editReply({ embeds: [this.buildRoleEmbed('Role Added', `Added <@&${roleId}> to your account.`, panel.name)] });
  }

  private buildStatusEmbed(title: string, description: string) {
    return new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle(title)
      .setDescription(description)
      .setTimestamp();
  }

  private buildRoleEmbed(title: string, description: string, panelName: string) {
    return this.buildStatusEmbed(title, description)
      .addFields({ name: 'Panel', value: panelName, inline: true });
  }

  private log(guildId: string, userId: string, roleId: string, action: 'ADD' | 'REMOVE', panelId: string) {
    return this.prisma.roleLog.create({ data: { guildId, userId, roleId, action, panelId } });
  }
}
