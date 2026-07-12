import { describe, expect, it, jest } from '@jest/globals';
import { TakoService } from './tako.service';

describe('TakoService direct donation notifications', () => {
  it('sends a single-line embed description with donor, amount, and message', async () => {
    const send = jest.fn(async () => undefined);
    const channel = {
      isTextBased: () => true,
      send,
    };
    const guild = {
      channels: {
        fetch: jest.fn(async () => channel),
      },
    };
    const client = {
      guilds: {
        fetch: jest.fn(async () => guild),
      },
    };
    const service = new TakoService({} as any);
    service.setClient(client as any);

    await (service as any).sendDirectDonationNotification('guild-1', {
      senderName: 'jerome200510',
      amount: 10000,
      message: 'halo',
    }, 'channel-1');

    expect(send).toHaveBeenCalledTimes(1);
    const payload = (send as any).mock.calls[0][0] as any;
    expect(payload.embeds).toHaveLength(1);
    expect(payload.embeds[0].data).toMatchObject({
      description: 'jerome200510 baru saja memberikan Rp 10.000! halo',
    });
    expect(payload.embeds[0].data.title).toBeUndefined();
    expect(payload.embeds[0].data.fields).toBeUndefined();
    expect(payload.embeds[0].data.footer).toBeUndefined();
  });
});

describe('TakoService role assignment notifications', () => {
  it('assigns every reached cumulative tier role and includes unlocks in the donor DM', async () => {
    const dmSend = jest.fn(async () => undefined);
    const roleAdd = jest.fn(async () => undefined);
    const donation = {
      id: 'donation-1',
      guildId: 'guild-1',
      discordUserId: 'user-1',
      transactionId: 'tx-1',
      amount: 100000,
      paymentMethod: 'qris',
      senderName: 'Ixmo morano',
      email: 'user@example.com',
      message: 'semangat bang!',
      status: 'PAID',
    };
    const prisma = {
      takoDonation: {
        findUnique: jest.fn(async () => donation),
        update: jest.fn(async () => ({})),
        aggregate: jest.fn(async () => ({ _sum: { amount: 600000 } })),
      },
      takoRewardTier: {
        findMany: jest.fn(async () => [
          { id: 'tier-1', label: 'Donatur', thresholdAmount: 100000, roleId: 'role-donatur', position: 0 },
          { id: 'tier-2', label: 'VIP Donatur', thresholdAmount: 500000, roleId: 'role-vip', position: 1 },
        ]),
      },
    };
    const member = {
      roles: {
        cache: { has: jest.fn((roleId: string) => roleId === 'base-role') },
        add: roleAdd,
        highest: { position: 1 },
      },
      user: { send: dmSend },
    };
    const botMember = {
      permissions: { has: jest.fn(() => true) },
      roles: { highest: { position: 10 } },
    };
    const guild = {
      members: {
        fetch: jest.fn(async (id?: string) => (id === 'user-1' ? member : botMember)),
        fetchMe: jest.fn(async () => botMember),
        me: botMember,
      },
      roles: {
        fetch: jest.fn(async (roleId: string) => ({ id: roleId, position: 2 })),
      },
      channels: { fetch: jest.fn(async () => null) },
    };
    const service = new TakoService(prisma as any);
    service.setClient({ guilds: { fetch: jest.fn(async () => guild) } } as any);

    const result = await (service as any).assignDonationRole('guild-1', 'donation-1', 'base-role');

    expect(result).toEqual({
      ok: true,
      status: 'role_assigned',
      totalSupport: 600000,
      unlockedTiers: [
        { label: 'Donatur', roleId: 'role-donatur', thresholdAmount: 100000 },
        { label: 'VIP Donatur', roleId: 'role-vip', thresholdAmount: 500000 },
      ],
    });
    expect(roleAdd).toHaveBeenCalledTimes(2);
    (expect(roleAdd) as any).toHaveBeenCalledWith(expect.objectContaining({ id: 'role-donatur' }), 'Tako cumulative donation tier Donatur at Rp100.000');
    (expect(roleAdd) as any).toHaveBeenCalledWith(expect.objectContaining({ id: 'role-vip' }), 'Tako cumulative donation tier VIP Donatur at Rp500.000');
    const dmPayload = (dmSend as any).mock.calls[0][0] as any;
    expect(dmPayload.embeds[0].data.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Total Support', value: 'Rp600.000' }),
      expect.objectContaining({ name: 'Unlocked Tiers', value: '<@&role-donatur>, <@&role-vip>' }),
    ]));
  });

  it('continues donation success when one cumulative tier role cannot be assigned', async () => {
    const roleAdd = jest.fn(async (role: any) => {
      if (role.id === 'role-vip') throw new Error('Missing permissions');
    });
    const logger = { warn: jest.fn(), error: jest.fn() };
    const donation = {
      id: 'donation-1',
      guildId: 'guild-1',
      discordUserId: 'user-1',
      transactionId: 'tx-1',
      amount: 100000,
      paymentMethod: 'qris',
      senderName: 'Ixmo morano',
      email: 'user@example.com',
      message: null,
      status: 'PAID',
    };
    const prisma = {
      takoDonation: {
        findUnique: jest.fn(async () => donation),
        update: jest.fn(async () => ({})),
        aggregate: jest.fn(async () => ({ _sum: { amount: 600000 } })),
      },
      takoRewardTier: {
        findMany: jest.fn(async () => [
          { id: 'tier-1', label: 'Donatur', thresholdAmount: 100000, roleId: 'role-donatur', position: 0 },
          { id: 'tier-2', label: 'VIP Donatur', thresholdAmount: 500000, roleId: 'role-vip', position: 1 },
        ]),
      },
    };
    const member = {
      roles: {
        cache: { has: jest.fn((roleId: string) => roleId === 'base-role') },
        add: roleAdd,
        highest: { position: 1 },
      },
      user: { send: jest.fn(async () => undefined) },
    };
    const botMember = {
      permissions: { has: jest.fn(() => true) },
      roles: { highest: { position: 10 } },
    };
    const guild = {
      members: {
        fetch: jest.fn(async (id?: string) => (id === 'user-1' ? member : botMember)),
        fetchMe: jest.fn(async () => botMember),
        me: botMember,
      },
      roles: { fetch: jest.fn(async (roleId: string) => ({ id: roleId, position: 2 })) },
      channels: { fetch: jest.fn(async () => null) },
    };
    const service = new TakoService(prisma as any, logger as any);
    service.setClient({ guilds: { fetch: jest.fn(async () => guild) } } as any);

    const result = await (service as any).assignDonationRole('guild-1', 'donation-1', 'base-role');

    expect(result.ok).toBe(true);
    expect(result.unlockedTiers).toEqual([{ label: 'Donatur', roleId: 'role-donatur', thresholdAmount: 100000 }]);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to assign Tako reward tier VIP Donatur'), 'TakoService');
  });

  it('DMs donor and sends only the short public announcement after role assignment', async () => {
    const dmSend = jest.fn(async () => undefined);
    const publicSend = jest.fn(async () => undefined);
    const logSend = jest.fn(async () => undefined);
    const roleAdd = jest.fn(async () => undefined);
    const donation = {
      id: 'donation-1',
      guildId: 'guild-1',
      discordUserId: 'user-1',
      transactionId: 'tx-1',
      amount: 100000,
      paymentMethod: 'qris',
      senderName: 'Ixmo morano',
      email: 'user@example.com',
      message: 'semangat bang!',
      status: 'PAID',
    };
    const prisma = {
      takoDonation: {
        findUnique: jest.fn(async () => donation),
        update: jest.fn(async () => ({})),
        aggregate: jest.fn(async () => ({ _sum: { amount: 100000 } })),
      },
      takoRewardTier: {
        findMany: jest.fn(async () => []),
      },
    };
    const member = {
      roles: {
        cache: { has: jest.fn(() => false) },
        add: roleAdd,
        highest: { position: 1 },
      },
      user: { send: dmSend },
    };
    const botMember = {
      permissions: { has: jest.fn(() => true) },
      roles: { highest: { position: 10 } },
    };
    const role = { id: 'role-1', position: 2 };
    const guild = {
      members: {
        fetch: jest.fn(async (id?: string) => (id === 'user-1' ? member : botMember)),
        fetchMe: jest.fn(async () => botMember),
        me: botMember,
      },
      roles: { fetch: jest.fn(async () => role) },
      channels: {
        fetch: jest.fn(async (id: string) => ({
          isTextBased: () => true,
          send: id === 'public-channel' ? publicSend : logSend,
        })),
      },
    };
    const service = new TakoService(prisma as any);
    service.setClient({ guilds: { fetch: jest.fn(async () => guild) } } as any);

    const result = await (service as any).assignDonationRole(
      'guild-1',
      'donation-1',
      'role-1',
      'log-channel',
      { directNotificationsEnabled: true, directNotificationChannelId: 'public-channel', directNotifyMinimumAmount: 0 },
    );

    expect(result).toMatchObject({ ok: true, status: 'role_assigned' });
    expect(dmSend).toHaveBeenCalledTimes(1);
    expect(publicSend).toHaveBeenCalledTimes(1);
    expect(logSend).not.toHaveBeenCalled();
    const publicPayload = (publicSend as any).mock.calls[0][0] as any;
    expect(publicPayload.embeds[0].data.description).toBe('<@user-1> baru saja memberikan Rp100.000! semangat bang!');
  });
});

describe('TakoService settings reward tiers', () => {
  it('returns reward tiers sorted by threshold amount', async () => {
    const prisma = {
      takoIntegration: {
        findUnique: jest.fn(async () => ({
          enabled: true,
          creatorSlug: 'creator',
          rewardRoleId: 'base-role',
          minimumAmount: 10000,
          paymentMethods: ['qris'],
          logChannelId: null,
          directNotificationsEnabled: true,
          directNotificationChannelId: null,
          directNotifyMinimumAmount: 0,
          apiKey: 'api-key',
          webhookToken: 'webhook-token',
        })),
      },
      takoRewardTier: {
        findMany: jest.fn(async () => [
          { id: 'tier-2', label: 'VIP Donatur', thresholdAmount: 500000, roleId: 'role-vip', position: 1 },
          { id: 'tier-1', label: 'Donatur', thresholdAmount: 100000, roleId: 'role-donatur', position: 0 },
        ]),
      },
    };

    const service = new TakoService(prisma as any);
    const settings = await service.getSettings('guild-1');

    expect(settings.rewardTiers).toEqual([
      { id: 'tier-1', label: 'Donatur', thresholdAmount: 100000, roleId: 'role-donatur', position: 0 },
      { id: 'tier-2', label: 'VIP Donatur', thresholdAmount: 500000, roleId: 'role-vip', position: 1 },
    ]);
  });

  it('replaces reward tiers with sanitized sorted rows when settings are saved', async () => {
    const prisma = {
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
      takoIntegration: {
        upsert: jest.fn(async () => ({
          enabled: true,
          creatorSlug: 'creator',
          rewardRoleId: 'base-role',
          minimumAmount: 10000,
          paymentMethods: ['qris'],
          logChannelId: null,
          directNotificationsEnabled: true,
          directNotificationChannelId: null,
          directNotifyMinimumAmount: 0,
          apiKey: 'api-key',
          webhookToken: 'webhook-token',
        })),
      },
      takoRewardTier: {
        deleteMany: jest.fn(async () => ({})),
        createMany: jest.fn(async () => ({})),
        findMany: jest.fn(async () => [
          { id: 'tier-1', label: 'Donatur', thresholdAmount: 100000, roleId: 'role-donatur', position: 0 },
          { id: 'tier-2', label: 'VIP Donatur', thresholdAmount: 500000, roleId: 'role-vip', position: 1 },
        ]),
      },
    };

    const service = new TakoService(prisma as any);
    const settings = await service.updateSettings('guild-1', {
      rewardTiers: [
        { label: 'VIP Donatur', thresholdAmount: 500000, roleId: 'role-vip' },
        { label: ' ', thresholdAmount: 250000, roleId: '' },
        { label: 'Donatur', thresholdAmount: 100000, roleId: 'role-donatur' },
      ],
    });

    (expect(prisma.takoRewardTier.deleteMany) as any).toHaveBeenCalledWith({ where: { guildId: 'guild-1' } });
    (expect(prisma.takoRewardTier.createMany) as any).toHaveBeenCalledWith({
      data: [
        { guildId: 'guild-1', label: 'Donatur', thresholdAmount: 100000, roleId: 'role-donatur', position: 0 },
        { guildId: 'guild-1', label: 'VIP Donatur', thresholdAmount: 500000, roleId: 'role-vip', position: 1 },
      ],
    });
    expect(settings.rewardTiers).toHaveLength(2);
  });
});

describe('TakoService checkout API', () => {
  it('formats Tako object error responses instead of [object Object]', async () => {
    const prisma = {
      takoIntegration: {
        findUnique: jest.fn(async () => ({
          enabled: true,
          apiKey: 'api-key',
          creatorSlug: 'creator',
          rewardRoleId: 'role-1',
          minimumAmount: 10000,
          paymentMethods: ['qris'],
        })),
      },
      takoDonation: {
        create: jest.fn(async () => ({ id: 'donation-1' })),
        update: jest.fn(async () => ({})),
      },
    };
    globalThis.fetch = jest.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ message: { code: 'VALIDATION_ERROR', details: ['Invalid email'] } }),
    })) as any;

    const service = new TakoService(prisma as any);

    await expect(service.createCheckout('guild-1', {
      amount: 10000,
      email: 'bad-email',
      paymentMethod: 'qris',
      discordUserId: 'user-1',
      discordUsername: 'User',
    })).rejects.toThrow('Tako API returned status 400: {"message":{"code":"VALIDATION_ERROR","details":["Invalid email"]}}');
  });

  it('stores donor message and preserves nio marker for Tako webhook matching', async () => {
    const prisma = {
      takoIntegration: {
        findUnique: jest.fn(async () => ({
          enabled: true,
          apiKey: 'api-key',
          creatorSlug: 'creator',
          rewardRoleId: 'role-1',
          minimumAmount: 10000,
          paymentMethods: ['qris'],
        })),
      },
      takoDonation: {
        create: jest.fn(async () => ({ id: 'donation-1' })),
        update: jest.fn(async () => ({})),
      },
    };
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        result: {
          success: true,
          giftId: 'gift-1',
          transactionId: 'transaction-1',
          paymentUrl: 'https://tako.id/pay/transaction-1',
        },
      }),
    }));
    globalThis.fetch = fetchMock as any;

    const service = new TakoService(prisma as any);
    await service.createCheckout('guild-1', {
      amount: 10000,
      email: 'user@example.com',
      paymentMethod: 'qris',
      discordUserId: 'user-1',
      discordUsername: 'Ixmo morano',
      message: '  semangat bang!  ',
    });

    (expect(prisma.takoDonation.create) as any).toHaveBeenCalledWith({
      data: expect.objectContaining({
        senderName: 'Ixmo morano',
        message: 'semangat bang!',
      }),
    });
    const takoBody = JSON.parse((fetchMock as any).mock.calls[0][1].body);
    expect(takoBody).toMatchObject({
      name: 'Ixmo morano',
      message: 'nio:donation-1\nsemangat bang!',
    });
  });

  it('creates checkout through Tako API v1 and reads result payload', async () => {
    const prisma = {
      takoIntegration: {
        findUnique: jest.fn(async () => ({
          enabled: true,
          apiKey: 'api-key',
          creatorSlug: 'creator',
          rewardRoleId: 'role-1',
          minimumAmount: 10000,
          paymentMethods: ['qris'],
        })),
      },
      takoDonation: {
        create: jest.fn(async () => ({ id: 'donation-1' })),
        update: jest.fn(async () => ({})),
      },
    };
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        statusCode: 206,
        result: {
          success: true,
          giftId: 'gift-1',
          transactionId: 'transaction-1',
          paymentUrl: 'https://tako.id/pay/transaction-1',
        },
      }),
    }));
    globalThis.fetch = fetchMock as any;

    const service = new TakoService(prisma as any);
    const result = await service.createCheckout('guild-1', {
      amount: 10000,
      email: 'user@example.com',
      paymentMethod: 'qris',
      discordUserId: 'user-1',
      discordUsername: 'User',
    });

    (expect(fetchMock) as any).toHaveBeenCalledWith('https://tako.id/api/v1/gift/creator', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer api-key',
        'User-Agent': expect.any(String),
        'Content-Type': 'application/json',
      }),
    }));
    (expect(prisma.takoDonation.update) as any).toHaveBeenCalledWith({
      where: { id: 'donation-1' },
      data: { transactionId: 'transaction-1' },
    });
    expect(result).toEqual({
      paymentUrl: 'https://tako.id/pay/transaction-1',
      transactionId: 'transaction-1',
      giftId: 'gift-1',
    });
  });
});
