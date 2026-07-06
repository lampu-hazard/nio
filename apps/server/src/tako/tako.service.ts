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

    const result = await this.prisma.takoIntegration.upsert({
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
      hasApiKey: Boolean(result.apiKey),
      hasWebhookToken: Boolean(result.webhookToken),
    };
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

    // Buat donation record PENDING di DB
    const donation = await this.prisma.takoDonation.create({
      data: {
        guildId,
        discordUserId: input.discordUserId,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        senderName: input.discordUsername,
        email: input.email,
        status: 'PENDING',
      },
    });

    try {
      // Panggil Tako API
      const res = await fetch(`https://tako.id/api/gift/${integration.creatorSlug}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${integration.apiKey}`,
        },
        body: JSON.stringify({
          name: input.discordUsername,
          email: input.email,
          amount: input.amount,
          paymentMethod: input.paymentMethod,
          message: `nio:${donation.id}`,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || `Tako API returned status ${res.status}`);
      }

      const data = await res.json() as { success: boolean; transactionId?: string; paymentUrl?: string };

      if (!data.success || !data.paymentUrl) {
        throw new Error('Failed to retrieve payment URL from Tako.');
      }

      // Update donation dengan transaction ID
      await this.prisma.takoDonation.update({
        where: { id: donation.id },
        data: { transactionId: data.transactionId },
      });

      return {
        paymentUrl: data.paymentUrl,
        transactionId: data.transactionId,
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

    // Update data donasi dari payload webhook
    await this.prisma.takoDonation.update({
      where: { id: donation.id },
      data: {
        transactionId: transactionId || donation.transactionId,
        amount: amount || donation.amount,
        senderName: senderName || donation.senderName,
        email: email || donation.email,
        message: message || donation.message,
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
    return this.assignDonationRole(guildId, donation.id, integration.rewardRoleId, integration.logChannelId);
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

    return this.assignDonationRole(guildId, donationId, integration.rewardRoleId, integration.logChannelId);
  }

  private async assignDonationRole(
    guildId: string,
    donationId: string,
    roleId: string,
    logChannelId?: string | null,
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

      // Kirim log channel jika ada
      if (logChannelId) {
        const channel = await guild.channels.fetch(logChannelId).catch(() => null);
        if (channel && channel.isTextBased()) {
          const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('Tako Donation Success')
            .setDescription(`Role <@&${roleId}> has been assigned to <@${donation.discordUserId}>.`)
            .addFields(
              { name: 'Donor', value: `<@${donation.discordUserId}> (${donation.senderName})`, inline: true },
              { name: 'Amount', value: `Rp${donation.amount.toLocaleString('id-ID')}`, inline: true },
              { name: 'Transaction ID', value: donation.transactionId || 'None', inline: true },
            )
            .setTimestamp();
          await channel.send({ embeds: [embed] }).catch(() => null);
        }
      }

      return { ok: true, status: 'role_assigned' };
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
