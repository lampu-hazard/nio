import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, Optional } from '@nestjs/common';
import { Client, EmbedBuilder, PermissionsBitField } from 'discord.js';
import { PrismaService } from '../prisma/prisma.service';
import { AppLogger } from '../logger/logger.service';
import * as crypto from 'node:crypto';

export type TakoCheckoutInput = {
  amount: number;
  email: string;
  paymentMethod: string;
  discordUserId: string;
  discordUsername: string;
  message?: string;
};

type TakoRewardTierInput = {
  label?: string;
  thresholdAmount?: number;
  roleId?: string;
  position?: number;
};

@Injectable()
export class TakoService {
  private client?: Client;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly logger?: AppLogger,
  ) {}

  setClient(client: Client) {
    this.client = client;
  }

  private getClient() {
    if (!this.client) {
      throw new ServiceUnavailableException('Discord bot is not ready yet.');
    }
    return this.client;
  }

  async getSettings(guildId: string) {
    const settings = await this.prisma.takoIntegration.findUnique({
      where: { guildId },
    });
    const rewardTiers = await this.getRewardTiers(guildId);

    return {
      enabled: settings?.enabled ?? false,
      creatorSlug: settings?.creatorSlug ?? null,
      rewardRoleId: settings?.rewardRoleId ?? null,
      minimumAmount: settings?.minimumAmount ?? 10000,
      paymentMethods: settings?.paymentMethods ?? ['qris'],
      logChannelId: settings?.logChannelId ?? null,
      directNotificationsEnabled: settings?.directNotificationsEnabled ?? true,
      directNotificationChannelId: settings?.directNotificationChannelId ?? null,
      directNotifyMinimumAmount: settings?.directNotifyMinimumAmount ?? 0,
      rewardTiers,
      hasApiKey: Boolean(settings?.apiKey),
      hasWebhookToken: Boolean(settings?.webhookToken),
    };
  }

  async updateSettings(
    guildId: string,
    data: {
      enabled?: boolean;
      creatorSlug?: string;
      apiKey?: string;
      webhookToken?: string;
      rewardRoleId?: string;
      minimumAmount?: number;
      paymentMethods?: string[];
      logChannelId?: string | null;
      directNotificationsEnabled?: boolean;
      directNotificationChannelId?: string | null;
      directNotifyMinimumAmount?: number;
      rewardTiers?: TakoRewardTierInput[];
    },
  ) {
    const updateData: any = {};
    if (data.enabled !== undefined) updateData.enabled = data.enabled;
    if (data.creatorSlug !== undefined) updateData.creatorSlug = data.creatorSlug;
    if (data.apiKey !== undefined && data.apiKey !== '__masked__') updateData.apiKey = data.apiKey;
    if (data.webhookToken !== undefined && data.webhookToken !== '__masked__') updateData.webhookToken = data.webhookToken;
    if (data.rewardRoleId !== undefined) updateData.rewardRoleId = data.rewardRoleId;
    if (data.minimumAmount !== undefined) updateData.minimumAmount = data.minimumAmount;
    if (data.paymentMethods !== undefined) updateData.paymentMethods = data.paymentMethods;
    if (data.logChannelId !== undefined) updateData.logChannelId = data.logChannelId;
    if (data.directNotificationsEnabled !== undefined) updateData.directNotificationsEnabled = data.directNotificationsEnabled;
    if (data.directNotificationChannelId !== undefined) updateData.directNotificationChannelId = data.directNotificationChannelId;
    if (data.directNotifyMinimumAmount !== undefined) updateData.directNotifyMinimumAmount = data.directNotifyMinimumAmount;

    const run = async (tx: any) => {
      const result = await tx.takoIntegration.upsert({
        where: { guildId },
        update: updateData,
        create: {
          guildId,
          enabled: data.enabled ?? false,
          creatorSlug: data.creatorSlug ?? '',
          apiKey: data.apiKey ?? '',
          webhookToken: data.webhookToken ?? '',
          rewardRoleId: data.rewardRoleId ?? '',
          minimumAmount: data.minimumAmount ?? 10000,
          paymentMethods: data.paymentMethods ?? ['qris'],
          logChannelId: data.logChannelId ?? null,
          directNotificationsEnabled: data.directNotificationsEnabled ?? true,
          directNotificationChannelId: data.directNotificationChannelId ?? null,
          directNotifyMinimumAmount: data.directNotifyMinimumAmount ?? 0,
        },
      });

      if (data.rewardTiers !== undefined) {
        const rewardTiers = this.sanitizeRewardTiers(guildId, data.rewardTiers);
        await tx.takoRewardTier.deleteMany({ where: { guildId } });
        if (rewardTiers.length) {
          await tx.takoRewardTier.createMany({ data: rewardTiers });
        }
      }

      return result;
    };

    const result = data.rewardTiers !== undefined
      ? await this.prisma.$transaction(run)
      : await run(this.prisma);
    const rewardTiers = await this.getRewardTiers(guildId);

    return {
      enabled: result.enabled,
      creatorSlug: result.creatorSlug,
      rewardRoleId: result.rewardRoleId,
      minimumAmount: result.minimumAmount,
      paymentMethods: result.paymentMethods,
      logChannelId: result.logChannelId,
      directNotificationsEnabled: result.directNotificationsEnabled,
      directNotificationChannelId: result.directNotificationChannelId,
      directNotifyMinimumAmount: result.directNotifyMinimumAmount,
      rewardTiers,
      hasApiKey: Boolean(result.apiKey),
      hasWebhookToken: Boolean(result.webhookToken),
    };
  }

  private async getRewardTiers(guildId: string) {
    const tiers = await (this.prisma as any).takoRewardTier.findMany({
      where: { guildId },
      orderBy: [{ thresholdAmount: 'asc' }, { position: 'asc' }],
    });
    return tiers
      .slice()
      .sort((a: any, b: any) => a.thresholdAmount - b.thresholdAmount || a.position - b.position)
      .map((tier: any) => ({
        id: tier.id,
        label: tier.label,
        thresholdAmount: tier.thresholdAmount,
        roleId: tier.roleId,
        position: tier.position,
      }));
  }

  private sanitizeRewardTiers(guildId: string, tiers: TakoRewardTierInput[]) {
    return tiers
      .filter((tier) => tier.label?.trim() && tier.roleId?.trim() && Number(tier.thresholdAmount) >= 1000)
      .slice(0, 10)
      .sort((a, b) => Number(a.thresholdAmount) - Number(b.thresholdAmount))
      .map((tier, index) => ({
        guildId,
        label: tier.label!.trim().slice(0, 80),
        thresholdAmount: Number(tier.thresholdAmount),
        roleId: tier.roleId!.trim(),
        position: index,
      }));
  }

  async createCheckout(guildId: string, input: TakoCheckoutInput) {
    const integration = await this.prisma.takoIntegration.findUnique({
      where: { guildId },
    });

    if (!integration || !integration.enabled) {
      throw new BadRequestException('Tako integration is disabled on this server.');
    }

    if (!integration.apiKey || !integration.creatorSlug || !integration.rewardRoleId) {
      throw new BadRequestException('Tako integration is not fully configured.');
    }

    if (input.amount < integration.minimumAmount) {
      throw new BadRequestException(`Minimum donation amount is Rp${integration.minimumAmount.toLocaleString('id-ID')}.`);
    }

    if (!integration.paymentMethods.includes(input.paymentMethod)) {
      throw new BadRequestException('Selected payment method is not allowed.');
    }

    const donorMessage = input.message?.trim().slice(0, 200) || null;

    // Buat donation record PENDING di DB
    const donation = await this.prisma.takoDonation.create({
      data: {
        guildId,
        discordUserId: input.discordUserId,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        senderName: input.discordUsername,
        email: input.email,
        message: donorMessage,
        status: 'PENDING',
      },
    });

    try {
      // Panggil Tako API v1
      const res = await fetch(`https://tako.id/api/v1/gift/${integration.creatorSlug}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${integration.apiKey}`,
          'User-Agent': process.env.TAKO_USER_AGENT || 'nio/1.0',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: input.discordUsername,
          email: input.email,
          amount: input.amount,
          paymentMethod: input.paymentMethod,
          message: donorMessage ? `nio:${donation.id}\n${donorMessage}` : `nio:${donation.id}`,
        }),
      });

      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(`Tako API returned status ${res.status}: ${this.formatTakoError(body)}`);
      }

      const data = body as {
        statusCode?: number;
        message?: unknown;
        error?: unknown;
        result?: {
          success?: boolean;
          giftId?: string;
          transactionId?: string;
          paymentUrl?: string;
        };
      } | null;
      const result = data?.result;

      if (!result?.success || !result.paymentUrl) {
        throw new Error(`Failed to retrieve payment URL from Tako: ${this.formatTakoError(body)}`);
      }

      // Update donation dengan transaction ID
      await this.prisma.takoDonation.update({
        where: { id: donation.id },
        data: { transactionId: result.transactionId },
      });

      return {
        paymentUrl: result.paymentUrl,
        transactionId: result.transactionId,
        giftId: result.giftId,
      };
    } catch (err: any) {
      this.logger?.error(`Tako checkout creation failed: ${err.message}`, err.stack, 'TakoService');
      await this.prisma.takoDonation.update({
        where: { id: donation.id },
        data: { status: 'FAILED', failureReason: `Tako API Error: ${err.message}` },
      });
      throw new BadRequestException(`Failed to create Tako payment checkout: ${err.message}`);
    }
  }

  private formatTakoError(body: unknown) {
    if (!body) return 'empty response body';
    if (typeof body === 'string') return body;
    if (typeof body === 'object') {
      const payload = body as any;
      if (typeof payload.message === 'string') return payload.message;
      if (typeof payload.error === 'string') return payload.error;
      try {
        return JSON.stringify(payload);
      } catch {
        return String(payload);
      }
    }
    return String(body);
  }

  async handleWebhook(guildId: string, rawBody: string, signatureHeader?: string) {
    const integration = await this.prisma.takoIntegration.findUnique({
      where: { guildId },
    });

    if (!integration || !integration.enabled || !integration.webhookToken) {
      this.logger?.warn(`Ignored Tako webhook for guild ${guildId}: Integration disabled or token missing.`, 'TakoService');
      return { ok: false, message: 'Integration disabled' };
    }

    if (!signatureHeader) {
      throw new ForbiddenException('Missing X-Tako-Signature header.');
    }

    // Hitung signature HMAC SHA-256
    const computedSignature = crypto
      .createHmac('sha256', integration.webhookToken)
      .update(rawBody)
      .digest('hex');

    try {
      const match = crypto.timingSafeEqual(
        Buffer.from(computedSignature, 'hex'),
        Buffer.from(signatureHeader, 'hex'),
      );
      if (!match) {
        throw new ForbiddenException('Invalid Tako webhook signature.');
      }
    } catch {
      throw new ForbiddenException('Invalid Tako webhook signature.');
    }

    const payload = JSON.parse(rawBody) as {
      transactionId?: string;
      transaction_id?: string;
      id?: string;
      amount?: number | string;
      sender?: string;
      name?: string;
      email?: string;
      message?: string;
      status?: string;
      paymentMethod?: string;
      payment_method?: string;
    };

    const transactionId = payload.transactionId || payload.transaction_id || payload.id;
    const amount = Number(payload.amount || 0);
    const message = payload.message || '';
    const senderName = payload.sender || payload.name || 'Anonymous';
    const email = payload.email || 'unknown';
    const paymentMethod = payload.paymentMethod || payload.payment_method || 'unknown';

    // Cek pattern nio:<donationId> di message
    const matchNio = message.match(/nio:([a-z0-9]+)/i);
    const donationId = matchNio ? matchNio[1] : null;

    let donation = null;
    if (donationId) {
      donation = await this.prisma.takoDonation.findUnique({ where: { id: donationId } });
    }

    if (!donation && transactionId) {
      donation = await this.prisma.takoDonation.findUnique({ where: { transactionId } });
    }

    if (!donation) {
      const directDonation = await this.prisma.takoDonation.create({
        data: {
          guildId,
          discordUserId: 'unknown',
          transactionId: transactionId || null,
          amount: amount || 0,
          paymentMethod,
          senderName,
          email,
          message,
          status: 'DIRECT',
          failureReason: 'Direct Tako donation. No matching nio checkout found; no Discord role assigned.',
        },
      });

      if (
        integration.directNotificationsEnabled &&
        integration.directNotificationChannelId &&
        amount >= integration.directNotifyMinimumAmount
      ) {
        await this.sendDirectDonationNotification(guildId, directDonation, integration.directNotificationChannelId);
      }

      return { ok: true, status: 'direct_notified' };
    }

    // Jika sudah terproses/sukses sebelumnya, abaikan (idempotent)
    if (donation.status === 'ROLE_ASSIGNED') {
      return { ok: true, status: 'already_processed' };
    }

    const cleanMessage = this.cleanTakoMessage(message) || donation.message;

    // Update data donasi dari payload webhook
    await this.prisma.takoDonation.update({
      where: { id: donation.id },
      data: {
        transactionId: transactionId || donation.transactionId,
        amount: amount || donation.amount,
        senderName: senderName || donation.senderName,
        email: email || donation.email,
        message: cleanMessage,
        status: 'PAID',
      },
    });

    if (amount < integration.minimumAmount) {
      await this.prisma.takoDonation.update({
        where: { id: donation.id },
        data: { status: 'IGNORED', failureReason: `Amount Rp${amount} is below minimum Rp${integration.minimumAmount}` },
      });
      return { ok: true, status: 'ignored', reason: 'Below minimum amount' };
    }

    if (!integration.rewardRoleId) {
      await this.prisma.takoDonation.update({
        where: { id: donation.id },
        data: { status: 'FAILED', failureReason: 'Reward role is not configured.' },
      });
      return { ok: false, status: 'failed', reason: 'Reward role is not configured.' };
    }

    // Berikan Role Discord
    return this.assignDonationRole(guildId, donation.id, integration.rewardRoleId, integration.logChannelId, {
      directNotificationsEnabled: integration.directNotificationsEnabled,
      directNotificationChannelId: integration.directNotificationChannelId,
      directNotifyMinimumAmount: integration.directNotifyMinimumAmount,
    });
  }

  async listDonations(guildId: string) {
    const donations = await this.prisma.takoDonation.findMany({
      where: { guildId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const client = this.getClient();
    return Promise.all(
      donations.map(async (d) => {
        const user = await client.users.fetch(d.discordUserId).catch(() => null);
        return {
          ...d,
          user: user
            ? {
                id: user.id,
                username: user.username,
                displayName: user.globalName ?? user.username,
                avatarUrl: user.displayAvatarURL({ size: 64 }),
              }
            : {
                id: d.discordUserId,
                username: null,
                displayName: null,
                avatarUrl: null,
              },
        };
      }),
    );
  }

  private async sendDirectDonationNotification(guildId: string, donation: any, channelId: string) {
    const guild = await this.getClient().guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const senderName = donation.senderName || 'Anonymous';
    const amount = Number(donation.amount || 0).toLocaleString('id-ID');
    const message = donation.message?.trim();
    const description = `${senderName} baru saja memberikan Rp ${amount}!${message ? ` ${message}` : ''}`;
    const embed = new EmbedBuilder()
      .setColor(0xf59e0b)
      .setDescription(description.length > 4096 ? `${description.slice(0, 4093)}...` : description);

    await channel.send({ embeds: [embed] }).catch((err) => {
      this.logger?.warn(`Failed to send direct Tako donation notification: ${err?.message ?? err}`, 'TakoService');
    });
  }

  private cleanTakoMessage(message: string) {
    return message.replace(/nio:[a-z0-9]+/i, '').trim() || null;
  }

  private async assignCumulativeTierRoles(guildId: string, member: any, donation: any) {
    const totalSupportResult = await (this.prisma as any).takoDonation.aggregate({
      where: {
        guildId,
        discordUserId: donation.discordUserId,
        status: { in: ['PAID', 'ROLE_ASSIGNED'] },
      },
      _sum: { amount: true },
    });
    const totalSupport = Number(totalSupportResult?._sum?.amount || 0);
    const tiers = await (this.prisma as any).takoRewardTier.findMany({
      where: { guildId, thresholdAmount: { lte: totalSupport } },
      orderBy: [{ thresholdAmount: 'asc' }, { position: 'asc' }],
    });
    const unlockedTiers: Array<{ label: string; roleId: string; thresholdAmount: number }> = [];

    for (const tier of tiers) {
      if (member.roles.cache.has(tier.roleId)) continue;
      try {
        const role = await member.guild?.roles?.fetch?.(tier.roleId)
          ?? await (await this.getClient().guilds.fetch(guildId)).roles.fetch(tier.roleId);
        if (!role) throw new Error('Configured tier role no longer exists.');
        await member.roles.add(role, `Tako cumulative donation tier ${tier.label} at Rp${tier.thresholdAmount.toLocaleString('id-ID')}`);
        unlockedTiers.push({ label: tier.label, roleId: tier.roleId, thresholdAmount: tier.thresholdAmount });
      } catch (err: any) {
        this.logger?.warn(`Failed to assign Tako reward tier ${tier.label} to ${donation.discordUserId}: ${err?.message ?? err}`, 'TakoService');
      }
    }

    return { totalSupport, unlockedTiers };
  }

  private async sendDonationSuccessDm(
    member: any,
    donation: any,
    roleId: string,
    tierResult?: { totalSupport: number; unlockedTiers: Array<{ label: string; roleId: string; thresholdAmount: number }> },
  ) {
    const fields = [
      { name: 'Donor', value: `<@${donation.discordUserId}> (${donation.senderName})`, inline: true },
      { name: 'Amount', value: `Rp${donation.amount.toLocaleString('id-ID')}`, inline: true },
      { name: 'Transaction ID', value: donation.transactionId || 'None', inline: true },
    ];

    if (tierResult?.unlockedTiers.length) {
      fields.push(
        { name: 'Total Support', value: `Rp${tierResult.totalSupport.toLocaleString('id-ID')}`, inline: true },
        { name: 'Unlocked Tiers', value: tierResult.unlockedTiers.map((tier) => `<@&${tier.roleId}>`).join(', '), inline: false },
      );
    }

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('Tako Donation Success')
      .setDescription(`Role <@&${roleId}> has been assigned to <@${donation.discordUserId}>.`)
      .addFields(fields)
      .setTimestamp();

    await member.user.send({ embeds: [embed] }).catch((err: any) => {
      this.logger?.warn(`Failed to DM Tako donation success to ${donation.discordUserId}: ${err?.message ?? err}`, 'TakoService');
    });
  }

  private async sendPaidDonationAnnouncement(guildId: string, donation: any, channelId: string) {
    const guild = await this.getClient().guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const amount = Number(donation.amount || 0).toLocaleString('id-ID');
    const donorMessage = donation.message?.trim();
    const description = `<@${donation.discordUserId}> baru saja memberikan Rp${amount}!${donorMessage ? ` ${donorMessage}` : ''}`;
    const embed = new EmbedBuilder()
      .setColor(0xf59e0b)
      .setDescription(description.length > 4096 ? `${description.slice(0, 4093)}...` : description);

    await channel.send({ embeds: [embed] }).catch((err) => {
      this.logger?.warn(`Failed to send Tako paid donation announcement: ${err?.message ?? err}`, 'TakoService');
    });
  }

  async retryRoleAssignment(guildId: string, donationId: string) {
    const integration = await this.prisma.takoIntegration.findUnique({
      where: { guildId },
    });

    if (!integration || !integration.enabled || !integration.rewardRoleId) {
      throw new BadRequestException('Tako integration is not enabled or reward role is missing.');
    }

    const donation = await this.prisma.takoDonation.findUnique({
      where: { id: donationId },
    });

    if (!donation || donation.guildId !== guildId) {
      throw new NotFoundException('Donation record not found.');
    }

    return this.assignDonationRole(guildId, donationId, integration.rewardRoleId, integration.logChannelId, {
      directNotificationsEnabled: integration.directNotificationsEnabled,
      directNotificationChannelId: integration.directNotificationChannelId,
      directNotifyMinimumAmount: integration.directNotifyMinimumAmount,
    });
  }

  private async assignDonationRole(
    guildId: string,
    donationId: string,
    roleId: string,
    logChannelId?: string | null,
    directNotification?: {
      directNotificationsEnabled?: boolean;
      directNotificationChannelId?: string | null;
      directNotifyMinimumAmount?: number;
    },
  ) {
    const donation = await this.prisma.takoDonation.findUnique({ where: { id: donationId } });
    if (!donation) throw new Error('Donation not found');

    try {
      const client = this.getClient();
      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(donation.discordUserId);
      const me = guild.members.me ?? (await guild.members.fetchMe());

      if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
        throw new Error('Bot lacks Manage Roles permission.');
      }

      const role = await guild.roles.fetch(roleId);
      if (!role) {
        throw new Error('Configured reward role no longer exists in Discord.');
      }

      if (role.position >= me.roles.highest.position) {
        throw new Error('Configured reward role is positioned above the bot highest role.');
      }

      // Assign secara idempotent
      if (!member.roles.cache.has(roleId)) {
        await member.roles.add(role, `Tako donation reward for transaction ${donation.transactionId}`);
      }

      await this.prisma.takoDonation.update({
        where: { id: donationId },
        data: { status: 'ROLE_ASSIGNED', roleAssignedAt: new Date(), failureReason: null },
      });

      const tierResult = await this.assignCumulativeTierRoles(guildId, member, donation);
      await this.sendDonationSuccessDm(member, donation, roleId, tierResult);

      if (
        directNotification?.directNotificationsEnabled &&
        directNotification.directNotificationChannelId &&
        donation.amount >= (directNotification.directNotifyMinimumAmount ?? 0)
      ) {
        await this.sendPaidDonationAnnouncement(guildId, donation, directNotification.directNotificationChannelId);
      }

      // Detailed Tako Donation Success is DM-only; public channels only receive the short announcement.
      void logChannelId;

      return { ok: true, status: 'role_assigned', ...tierResult };
    } catch (err: any) {
      this.logger?.error(`Failed to assign role to ${donation.discordUserId} for donation ${donationId}: ${err.message}`, err.stack, 'TakoService');
      await this.prisma.takoDonation.update({
        where: { id: donationId },
        data: { status: 'FAILED', failureReason: err.message },
      });
      return { ok: false, status: 'failed', reason: err.message };
    }
  }
}
