import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Client, GuildMember, PermissionsBitField } from 'discord.js';
import { PrismaService } from '../prisma/prisma.service';

const TOKEN_TTL_MS = 15 * 60 * 1000;
const MAX_ICON_BYTES = 256 * 1024;
const ROLE_NAME_PATTERN = /^(?!.*@(?:everyone|here))[\p{L}\p{N} ._\-]+$/u;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const ICON_DATA_URL_PATTERN = /^data:image\/(png|jpe?g|webp);base64,/i;

type RoleStyleInput = {
  primaryColor: string;
  secondaryColor?: string | null;
  tertiaryColor?: string | null;
  iconDataUrl?: string | null;
  removeIcon?: boolean;
};

export type BoosterRoleTokenValidation = {
  guildId: string;
  userId: string;
  expiresAt: Date;
  existingRole: {
    roleId: string;
    name: string;
    color: string;
    primaryColor: string;
    secondaryColor: string | null;
    tertiaryColor: string | null;
    iconUrl: string | null;
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
      select: {
        roleId: true,
        name: true,
        color: true,
        primaryColor: true,
        secondaryColor: true,
        tertiaryColor: true,
        iconUrl: true,
      },
    });

    return {
      guildId,
      userId: sessionUserId,
      expiresAt: claim.expiresAt,
      existingRole,
    };
  }

  async claimRole(
    guildId: string,
    token: string,
    sessionUserId: string,
    name: string,
    style: RoleStyleInput,
  ) {
    const normalizedName = name.trim();
    const normalizedStyle = this.normalizeStyle(style);
    this.validateRoleInput(normalizedName, normalizedStyle);
    await this.validateToken(guildId, token, sessionUserId);

    const guild = await this.getClient().guilds.fetch(guildId);
    const member = await guild.members.fetch(sessionUserId);
    const me = guild.members.me ?? await guild.members.fetchMe();
    this.assertCanManageRoles(me);

    const existing = await this.prisma.boosterCustomRole.findUnique({
      where: { guildId_userId: { guildId, userId: sessionUserId } },
    });

    let role = existing ? await guild.roles.fetch(existing.roleId).catch(() => null) : null;
    if (role && role.position >= me.roles.highest.position) {
      throw new ForbiddenException('The existing custom role is above the bot role and cannot be managed safely.');
    }

    const rolePayload = {
      name: normalizedName,
      colors: this.toDiscordColors(normalizedStyle),
      ...this.toIconPayload(normalizedStyle),
    };

    if (!role) {
      role = await guild.roles.create({
        ...rolePayload,
        reason: `Custom booster role for ${sessionUserId}`,
      }).catch((err) => this.rethrowDiscordRoleError(err));
      if (role.position >= me.roles.highest.position) {
        await role.delete('Custom booster role was created above the bot role.').catch(() => null);
        throw new ForbiddenException('The bot role hierarchy is too low to manage custom booster roles.');
      }
    } else {
      await role.edit({
        ...rolePayload,
        reason: `Custom booster role update for ${sessionUserId}`,
      }).catch((err) => this.rethrowDiscordRoleError(err));
    }

    await this.ensureRolePosition(role, me);
    if (!member.roles.cache.has(role.id)) {
      await member.roles.add(role, 'Assigned custom booster role.');
    }

    const iconUrl = role.iconURL?.({ size: 64 }) ?? null;
    const saved = await this.prisma.boosterCustomRole.upsert({
      where: { guildId_userId: { guildId, userId: sessionUserId } },
      update: {
        roleId: role.id,
        name: normalizedName,
        color: normalizedStyle.primaryColor,
        primaryColor: normalizedStyle.primaryColor,
        secondaryColor: normalizedStyle.secondaryColor,
        tertiaryColor: normalizedStyle.tertiaryColor,
        iconUrl,
      },
      create: {
        guildId,
        userId: sessionUserId,
        roleId: role.id,
        name: normalizedName,
        color: normalizedStyle.primaryColor,
        primaryColor: normalizedStyle.primaryColor,
        secondaryColor: normalizedStyle.secondaryColor,
        tertiaryColor: normalizedStyle.tertiaryColor,
        iconUrl,
      },
    });
    await this.prisma.boosterRoleClaimToken.delete({ where: { token } }).catch(() => null);
    return saved;
  }

  async listCustomRoles(guildId: string) {
    const records = await this.prisma.boosterCustomRole.findMany({
      where: { guildId },
      orderBy: { updatedAt: 'desc' },
    });

    const client = this.getClient();
    const guild = await client.guilds.fetch(guildId);
    return Promise.all(records.map(async (record) => {
      const [user, role] = await Promise.all([
        client.users.fetch(record.userId).catch(() => null),
        guild.roles.fetch(record.roleId).catch(() => null),
      ]);
      return {
        ...record,
        roleExists: Boolean(role),
        roleName: role?.name ?? record.name,
        iconUrl: role?.iconURL?.({ size: 64 }) ?? record.iconUrl,
        user: user ? {
          id: user.id,
          username: user.username,
          displayName: user.globalName ?? user.username,
          avatarUrl: user.displayAvatarURL({ size: 64 }),
        } : {
          id: record.userId,
          username: null,
          displayName: null,
          avatarUrl: null,
        },
      };
    }));
  }

  async deleteCustomRole(guildId: string, id: string) {
    const record = await this.prisma.boosterCustomRole.findFirst({ where: { id, guildId } });
    if (!record) throw new NotFoundException('Custom booster role not found.');

    const guild = await this.getClient().guilds.fetch(guildId);
    const me = guild.members.me ?? await guild.members.fetchMe();
    this.assertCanManageRoles(me);

    const role = await guild.roles.fetch(record.roleId).catch(() => null);
    if (role) {
      if (role.position >= me.roles.highest.position) {
        throw new ForbiddenException('This custom role is above the bot role and cannot be deleted safely.');
      }
      await role.delete('Custom booster role removed by dashboard admin.');
    }

    await this.prisma.boosterCustomRole.delete({ where: { id: record.id } });
    return record;
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

    // Development-only local testing bypass. Do not enable in production.
    if (process.env.BOOSTER_ROLE_DEV_BYPASS === 'true') {
      return member;
    }

    const premiumRoleId = guild.roles.premiumSubscriberRole?.id;
    const active = Boolean(member.premiumSince || (premiumRoleId && member.roles.cache.has(premiumRoleId)));
    if (!active) throw new ForbiddenException('Only active server boosters can manage a custom booster role.');
    return member;
  }

  private assertCanManageRoles(me: GuildMember) {
    if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      throw new ForbiddenException('The bot needs Manage Roles permission to manage booster roles.');
    }
  }

  private normalizeStyle(style: RoleStyleInput) {
    return {
      primaryColor: style.primaryColor.trim().toLowerCase(),
      secondaryColor: style.secondaryColor?.trim().toLowerCase() || null,
      tertiaryColor: style.tertiaryColor?.trim().toLowerCase() || null,
      iconDataUrl: style.iconDataUrl || null,
      removeIcon: Boolean(style.removeIcon),
    };
  }

  private validateRoleInput(name: string, style: ReturnType<BoosterRoleService['normalizeStyle']>) {
    if (name.length < 2 || name.length > 32) {
      throw new BadRequestException('Role name must be between 2 and 32 characters.');
    }
    if (!ROLE_NAME_PATTERN.test(name)) {
      throw new BadRequestException('Role name contains unsupported characters.');
    }
    for (const color of [style.primaryColor, style.secondaryColor, style.tertiaryColor].filter(Boolean)) {
      if (!HEX_COLOR_PATTERN.test(color as string)) {
        throw new BadRequestException('Role colors must be valid hex colors.');
      }
    }
    if (style.iconDataUrl) {
      if (!ICON_DATA_URL_PATTERN.test(style.iconDataUrl)) {
        throw new BadRequestException('Role icon must be a PNG, JPG, or WebP image.');
      }
      const base64 = style.iconDataUrl.split(',')[1] || '';
      const size = Buffer.byteLength(base64, 'base64');
      if (size > MAX_ICON_BYTES) {
        throw new BadRequestException('Role icon must be 256 KB or smaller.');
      }
    }
  }

  private rethrowDiscordRoleError(err: any): never {
    const message = String(err?.message || err || 'Discord rejected the custom role update.');
    if (message.toLowerCase().includes('icon')) {
      throw new BadRequestException('Discord rejected the role icon. Make sure this server has role icons unlocked and the image is valid.');
    }
    if (message.toLowerCase().includes('color') || message.toLowerCase().includes('gradient')) {
      throw new BadRequestException('Discord rejected the role colors. This server may not support gradient role colors yet.');
    }
    throw new BadRequestException(`Discord rejected the custom role update: ${message}`);
  }

  private toDiscordColors(style: ReturnType<BoosterRoleService['normalizeStyle']>) {
    const secondaryColor = style.secondaryColor || (style.tertiaryColor ? style.primaryColor : null);
    return {
      primaryColor: Number.parseInt(style.primaryColor.slice(1), 16),
      ...(secondaryColor ? { secondaryColor: Number.parseInt(secondaryColor.slice(1), 16) } : {}),
      ...(style.tertiaryColor ? { tertiaryColor: Number.parseInt(style.tertiaryColor.slice(1), 16) } : {}),
    };
  }

  private toIconPayload(style: ReturnType<BoosterRoleService['normalizeStyle']>) {
    if (style.removeIcon) return { icon: null };
    if (!style.iconDataUrl) return {};
    const base64 = style.iconDataUrl.split(',')[1];
    return { icon: Buffer.from(base64, 'base64') };
  }

  private async ensureRolePosition(role: any, me: GuildMember) {
    const targetPosition = Math.max(1, me.roles.highest.position - 1);
    if (role.position !== targetPosition && role.position < me.roles.highest.position) {
      await role.setPosition(targetPosition, { reason: 'Position custom booster role below bot role.' }).catch(() => null);
    }
  }
}
