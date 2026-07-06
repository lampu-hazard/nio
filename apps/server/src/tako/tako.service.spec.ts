import { TakoService } from './tako.service';

describe('TakoService direct donation notifications', () => {
  it('sends a single-line embed description with donor, amount, and message', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const channel = {
      isTextBased: () => true,
      send,
    };
    const guild = {
      channels: {
        fetch: jest.fn().mockResolvedValue(channel),
      },
    };
    const client = {
      guilds: {
        fetch: jest.fn().mockResolvedValue(guild),
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
    const payload = send.mock.calls[0][0];
    expect(payload.embeds).toHaveLength(1);
    expect(payload.embeds[0].data).toMatchObject({
      description: 'jerome200510 baru saja memberikan Rp 10.000! halo',
    });
    expect(payload.embeds[0].data.title).toBeUndefined();
    expect(payload.embeds[0].data.fields).toBeUndefined();
    expect(payload.embeds[0].data.footer).toBeUndefined();
  });
});
