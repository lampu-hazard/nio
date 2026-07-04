import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Client, GuildMember, PermissionsBitField } from 'discord.js';
import { PrismaService } from '../prisma/prisma.service';

const TOKEN_TTL_MS = 15 * 60 * 1000;
const ROLE_NAME_PATTERN = /^(?!.*@(?:everyone|here))[\p{L}\p{N} ._\-]+$/u;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export type BoosterRoleTokenValidation = {
  guildId: string;
  userId: string;
  expiresAt: Date;
  existingRole: {
    roleId: string;
    name: string;
    color: string;
  } | null;
};

@Injectable()
export class BoosterRoleService {
  private client?: Client;

  constructor(private readonly prisma: PrismaService) {}

  setClient(client: Client) {
    this.client = client;
  }

  async generateToken(guildId: string, userId: string) {
    await this.assertActiveBooster(guildId, userId);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    return this.prisma.boosterRoleClaimToken.upsert({
      where: { guildId_userId: { guildId, userId } },
      update: { token: this.createToken(), expiresAt },
      create: { token: this.createToken(), guildId, userId, expiresAt },
    });
  }

  async validateToken(guildId: string, token: string, sessionUserId: string): Promise<BoosterRoleTokenValidation> {
    const claim = await this.prisma.boosterRoleClaimToken.findUnique({ where: { token } });
    if (!claim || claim.guildId !== guildId) throw new NotFoundException('Invalid booster role link.');
    if (claim.userId !== sessionUserId) throw new ForbiddenException('This booster role link belongs to another user.');
    if (claim.expiresAt.getTime() < Date.now()) throw new ForbiddenException('This booster role link has expired.');

    await this.assertActiveBooster(guildId, sessionUserId);
    const existingRole = await this.prisma.boosterCustomRole.findUnique({
      where: { guildId_userId: { guildId, userId: sessionUserId } },
      select: { roleId: true, name: true, color: true },
    });

    return {
      guildId,
      userId: sessionUserId,
      expiresAt: claim.expiresAt,
      existingRole,
    };
  }

  async claimRole(guildId: string, token: string, sessionUserId: string, name: string, color: string) {
    const normalizedName = name.trim();
    const normalizedColor = color.trim().toLowerCase();
    this.validateRoleInput(normalizedName, normalizedColor);
    await this.validateToken(guildId, token, sessionUserId);

    const guild = await this.getClient().guilds.fetch(guildId);
    const member = await guild.members.fetch(sessionUserId);
    const me = guild.members.me ?? await guild.members.fetchMe();
    if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      throw new ForbiddenException('The bot needs Manage Roles permission to manage booster roles.');
    }

    const existing = await this.prisma.boosterCustomRole.findUnique({
      where: { guildId_userId: { guildId, userId: sessionUserId } },
    });

    let role = existing ? await guild.roles.fetch(existing.roleId).catch(() => null) : null;
    if (role && role.position >= me.roles.highest.position) {
      throw new ForbiddenException('The existing custom role is above the bot role and cannot be managed safely.');
    }

    if (!role) {
      role = await guild.roles.create({
        name: normalizedName,
        color: Number.parseInt(normalizedColor.slice(1), 16),
        reason: `Custom booster role for ${sessionUserId}`,
      });
      if (role.position >= me.roles.highest.position) {
        await role.delete('Custom booster role was created above the bot role.').catch(() => null);
        throw new ForbiddenException('The bot role hierarchy is too low to manage custom booster roles.');
      }
    } else {
      await role.edit({
        name: normalizedName,
        color: Number.parseInt(normalizedColor.slice(1), 16),
        reason: `Custom booster role update for ${sessionUserId}`,
      });
    }

    await this.ensureRolePosition(role, me);
    if (!member.roles.cache.has(role.id)) {
      await member.roles.add(role, 'Assigned custom booster role.');
    }

    const saved = await this.prisma.boosterCustomRole.upsert({
      where: { guildId_userId: { guildId, userId: sessionUserId } },
      update: { roleId: role.id, name: normalizedName, color: normalizedColor },
      create: { guildId, userId: sessionUserId, roleId: role.id, name: normalizedName, color: normalizedColor },
    });
    await this.prisma.boosterRoleClaimToken.delete({ where: { token } }).catch(() => null);
    return saved;
  }

  async isActiveBooster(guildId: string, userId: string): Promise<boolean> {
    const guild = await this.getClient().guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    const premiumRoleId = guild.roles.premiumSubscriberRole?.id;
    return Boolean(member.premiumSince || (premiumRoleId && member.roles.cache.has(premiumRoleId)));
  }

  private createToken() {
    return randomBytes(32).toString('base64url');
  }

  private getClient() {
    if (!this.client) {
      throw new ServiceUnavailableException('Discord bot is not ready yet.');
    }
    return this.client;
  }

  private async assertActiveBooster(guildId: string, userId: string): Promise<GuildMember> {
    const guild = await this.getClient().guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);

    // TODO: Remove this dev bypass before production
    if (process.env.BOOSTER_ROLE_DEV_BYPASS === 'true') {
      return member;
    }

    const premiumRoleId = guild.roles.premiumSubscriberRole?.id;
    const active = Boolean(member.premiumSince || (premiumRoleId && member.roles.cache.has(premiumRoleId)));
    if (!active) throw new ForbiddenException('Only active server boosters can manage a custom booster role.');
    return member;
  }

  private validateRoleInput(name: string, color: string) {
    if (name.length < 2 || name.length > 32) {
      throw new BadRequestException('Role name must be between 2 and 32 characters.');
    }
    if (!ROLE_NAME_PATTERN.test(name)) {
      throw new BadRequestException('Role name contains unsupported characters.');
    }
    if (!HEX_COLOR_PATTERN.test(color)) {
      throw new BadRequestException('Role color must be a valid hex color.');
    }
  }

  private async ensureRolePosition(role: any, me: GuildMember) {
    const targetPosition = Math.max(1, me.roles.highest.position - 1);
    if (role.position !== targetPosition && role.position < me.roles.highest.position) {
      await role.setPosition(targetPosition, { reason: 'Position custom booster role below bot role.' }).catch(() => null);
    }
  }
}
