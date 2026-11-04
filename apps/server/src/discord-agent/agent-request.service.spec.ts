import { describe, expect, it, jest } from '@jest/globals';
import { AgentRequestService } from './agent-request.service';

describe('AgentRequestService', () => {
  it('routes image commands through AgentImageService with profile and returns profile-tagged reply', async () => {
    const agent = {
      handleMention: jest.fn<any>(),
    };
    const images = {
      handle: jest.fn<any>(async () => ({
        content: 'generated',
        files: [{ attachment: Buffer.from('png'), name: 'nio-generated.png' }],
      })),
    };
    const service = new AgentRequestService(agent as any, images as any);

    const reply = await service.handle({
      guildId: 'guild-1',
      profile: 'PUBLIC',
      channelId: 'channel-public',
      userId: 'user-1',
      requestId: 'req-1',
      prompt: 'gambar kucing oranye',
      source: 'SLASH',
      canAttach: true,
      attachmentLimit: 8388608,
    });

    expect(images.handle).toHaveBeenCalledWith({
      guildId: 'guild-1',
      profile: 'PUBLIC',
      channelId: 'channel-public',
      userId: 'user-1',
      messageId: 'req-1',
      prompt: 'kucing oranye',
      canAttach: true,
      attachmentLimit: 8388608,
    });
    expect(agent.handleMention).not.toHaveBeenCalled();
    expect(reply).toMatchObject({
      profile: 'PUBLIC',
      content: 'generated',
    });
  });

  it('routes chat requests through DiscordAgentService.handleMention with profile and preserves profile on response', async () => {
    const agent = {
      handleMention: jest.fn<any>(async () => ({
        profile: 'ADMIN',
        content: 'Laporan siap.',
      })),
    };
    const service = new AgentRequestService(agent as any, undefined);

    const reply = await service.handle({
      guildId: 'guild-1',
      profile: 'ADMIN',
      channelId: 'channel-admin',
      userId: 'mod-1',
      requestId: 'req-2',
      prompt: 'cek audit log',
      source: 'SLASH',
    });

    expect(agent.handleMention).toHaveBeenCalledWith(
      'guild-1',
      'channel-admin',
      'mod-1',
      'cek audit log',
      undefined,
      undefined,
      undefined,
      'ADMIN',
    );
    expect(reply).toEqual({
      profile: 'ADMIN',
      content: 'Laporan siap.',
    });
  });
});
