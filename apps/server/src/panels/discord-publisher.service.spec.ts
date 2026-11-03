import { describe, expect, it, jest } from '@jest/globals';
import { ChannelType } from 'discord.js';
import { DiscordPublisherService } from './discord-publisher.service';

function fixture(payload: any = { embeds: [{ title: 'Test' }], components: [] }) {
  const edit = jest.fn(async (_payload: any) => ({ id: 'message' }));
  const send = jest.fn(async (_payload: any) => ({ id: 'new-message' }));
  const fetchMessage = jest.fn(async (_id: string) => ({ edit }));
  const channel = { id: 'channel', name: 'test', type: ChannelType.GuildText, isTextBased: () => true, permissionsFor: () => ({ has: () => true }), messages: { fetch: fetchMessage }, send };
  const guild = { channels: { fetch: async () => channel }, members: { me: {} } };
  const render = jest.fn(async () => payload);
  const logger = { log: jest.fn(), warn: jest.fn() };
  const service = new DiscordPublisherService({ client: { guilds: { fetch: async () => guild } } } as any, { render } as any, logger as any);
  return { service, edit, send, fetchMessage, render, channel, logger, panel: { id: 'p', guildId: '123', channelId: 'channel', messageId: 'message', roles: [] } };
}

describe('panel publication safety', () => {
  it.each([
    { embeds: [{ title: 'ok' }, { title: 'x'.repeat(257) }] },
    { embeds: [{ fields: [{ name: 'field', value: 'x'.repeat(1025) }] }] },
    { embeds: [{ description: 'x'.repeat(3500) }, { description: 'x'.repeat(3500) }] },
    { embeds: Array.from({ length: 11 }, () => ({ title: 'ok' })) },
    { components: Array.from({ length: 6 }, () => ({ type: 1, components: [{ type: 2, style: 5, label: 'Link', url: 'https://example.com' }] })) },
    { components: [{ type: 1, components: [{ type: 2, style: 5, label: 'x'.repeat(81), url: 'https://example.com' }] }] },
  ])('rejects invalid complete payload before sending %#', async payload => {
    const f = fixture(payload);
    await expect(f.service.publish(f.panel)).rejects.toMatchObject({ status: 400 });
    expect(f.edit).not.toHaveBeenCalled(); expect(f.send).not.toHaveBeenCalled();
  });
  it('replaces generated attachments on edit', async () => {
    const files = [{ attachment: Buffer.from('png'), name: 'panel-visual.png', description: 'Welcome' }];
    const f = fixture({ embeds: [{ image: { url: 'attachment://panel-visual.png' } }], files });
    await f.service.publish(f.panel);
    expect(f.edit).toHaveBeenCalledWith(expect.objectContaining({ files, attachments: [] }));
  });
  it('does not send a duplicate message on fetch permission failure', async () => {
    const f = fixture(); f.fetchMessage.mockRejectedValueOnce({ code: 50013 });
    await expect(f.service.publish(f.panel)).rejects.toMatchObject({ code: 50013 });
    expect(f.send).not.toHaveBeenCalled();
  });
  it('recovers an unknown message', async () => {
    const f = fixture(); f.fetchMessage.mockRejectedValueOnce({ code: 10008 });
    await expect(f.service.publish(f.panel)).resolves.toMatchObject({ id: 'new-message' });
  });
  it('does not send when rendering fails', async () => {
    const f = fixture(); f.render.mockRejectedValueOnce(new Error('Render failed'));
    await expect(f.service.publish(f.panel)).rejects.toThrow('Render failed');
    expect(f.edit).not.toHaveBeenCalled(); expect(f.send).not.toHaveBeenCalled();
  });
});
