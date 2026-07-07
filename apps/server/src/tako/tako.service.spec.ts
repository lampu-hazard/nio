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
