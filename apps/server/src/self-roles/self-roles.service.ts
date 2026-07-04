import { Injectable } from '@nestjs/common';
import { ButtonInteraction, GuildMember, StringSelectMenuInteraction } from 'discord.js';
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

    if (!panel) return interaction.editReply('❌ Panel tidak ditemukan.');
    const roleOption = panel.roles.find((role: PanelRole) => role.roleId === roleId);
    if (!roleOption) return interaction.editReply('❌ Role tidak tersedia di panel ini.');
    if (!interaction.guild || !interaction.member || !('roles' in interaction.member)) return interaction.editReply('❌ Interaction tidak valid.');

    const member = interaction.member as GuildMember;
    const role = interaction.guild.roles.cache.get(roleId) || await interaction.guild.roles.fetch(roleId).catch(() => null);
    if (!role) return interaction.editReply('❌ Role tidak ditemukan di server.');

    const hasRole = member.roles.cache.has(roleId);

    if (!hasRole && panel.maxRoles > 0) {
      const currentCount = panel.roles.filter((option: PanelRole) => member.roles.cache.has(option.roleId)).length;
      if (currentCount >= panel.maxRoles) {
        return interaction.editReply(`❌ Kamu sudah mencapai batas maksimal ${panel.maxRoles} role dari panel ini.`);
      }
    }

    if (!hasRole && panel.requireRoleId && !member.roles.cache.has(panel.requireRoleId)) {
      return interaction.editReply(`❌ Kamu membutuhkan role <@&${panel.requireRoleId}> untuk memakai panel ini.`);
    }

    if (hasRole) {
      await member.roles.remove(roleId);
      await this.log(panel.guildId, interaction.user.id, roleId, 'REMOVE', panel.id);
      this.logger.log(`Role removed: ${roleId} from ${interaction.user.id} (panel: ${panel.name})`, 'SelfRoles');
      return interaction.editReply(`✅ Role <@&${roleId}> berhasil dihapus.`);
    }

    await member.roles.add(roleId);
    await this.log(panel.guildId, interaction.user.id, roleId, 'ADD', panel.id);
    this.logger.log(`Role added: ${roleId} to ${interaction.user.id} (panel: ${panel.name})`, 'SelfRoles');
    return interaction.editReply(`✅ Role <@&${roleId}> berhasil ditambahkan.`);
  }

  private log(guildId: string, userId: string, roleId: string, action: 'ADD' | 'REMOVE', panelId: string) {
    return this.prisma.roleLog.create({ data: { guildId, userId, roleId, action, panelId } });
  }
}
