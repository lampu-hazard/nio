import { describe, expect, it } from '@jest/globals';
import { AgentActionRendererService } from './agent-action-renderer.service';

describe('AgentActionRendererService', () => {
  it('renders premium approve and dismiss buttons for a pending proposal', () => {
    const service = new AgentActionRendererService();

    const payload = service.renderProposalMessage({
      id: 'proposal-1',
      actionType: 'WARN',
      targetUserId: '123456789012345678',
      payload: { reason: 'Spam berulang' },
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });

    expect(payload.embeds).toHaveLength(1);
    expect(payload.components).toHaveLength(1);
    expect(payload.components[0].components).toHaveLength(2);
    expect((payload.components[0].components[0].data as any).custom_id).toBe('agent:approve:proposal-1');
    expect((payload.components[0].components[0].data as any).label).toBe('Execute');
    expect((payload.components[0].components[0].data as any).emoji).toBeUndefined();
    expect((payload.components[0].components[1].data as any).custom_id).toBe('agent:cancel:proposal-1');
    expect((payload.components[0].components[1].data as any).label).toBe('Dismiss');
  });

  it('renders action-specific details in the proposal embed', () => {
    const service = new AgentActionRendererService();

    const payload = service.renderProposalMessage({
      id: 'proposal-2',
      actionType: 'ADD_ROLE',
      targetUserId: '123456789012345678',
      payload: { reason: 'Verified member', roleId: '987654321098765432' },
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });

    const description = payload.embeds[0].data.description;
    expect(description).toContain('Role management action');
    expect(description).toContain('`ADD_ROLE`');
    expect(description).toContain('<@&987654321098765432>');
  });

  it('renders mass moderation proposal details', () => {
    const service = new AgentActionRendererService();

    const payload = service.renderProposalMessage({
      id: 'proposal-3',
      actionType: 'MASS_BAN',
      targetUserId: null,
      payload: { reason: 'raiders list', targetUserIds: ['111', '222'] },
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });

    const description = payload.embeds[0].data.description;
    expect(description).toContain('Critical moderation action');
    expect(description).toContain('mass `BAN`');
    expect(description).toContain('<@111>');
    expect(description).toContain('<@222>');
  });

  it('renders manage sticker proposal details', () => {
    const service = new AgentActionRendererService();

    const payload = service.renderProposalMessage({
      id: 'proposal-4',
      actionType: 'MANAGE_STICKER',
      targetUserId: null,
      payload: { reason: 'new sticker', stickerAction: 'ADD', stickerName: 'cool', stickerUrl: 'https://img.com' },
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });

    const description = payload.embeds[0].data.description;
    expect(description).toContain('Role management action'); // theme category matches ADD_ROLE/MANAGE_STICKER
    expect(description).toContain('`ADD` sticker trigger');
    expect(description).toContain('`cool`');
  });

  it('renders rich announcement proposal details', () => {
    const service = new AgentActionRendererService();

    const payload = service.renderProposalMessage({
      id: 'proposal-5',
      actionType: 'SEND_ANNOUNCEMENT',
      targetUserId: null,
      payload: {
        reason: 'weekly update',
        channelId: 'channel-1',
        content: 'hello server',
        title: 'Weekly Update',
        announcementPing: 'here',
        announcementColor: '#ffaa00',
        announcementImageUrl: 'https://example.com/image.png',
        announcementThumbnailUrl: 'https://example.com/thumb.png',
        announcementFooter: 'footer text',
      },
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });

    const description = payload.embeds[0].data.description;
    expect(description).toContain('Guild announcement action');
    expect(description).toContain('Ping: `here`');
    expect(description).toContain('Color: `#ffaa00`');
    expect(description).toContain('Image: [link](https://example.com/image.png)');
    expect(description).toContain('Thumbnail: [link](https://example.com/thumb.png)');
    expect(description).toContain('Footer: footer text');
  });

  it('renders purge user messages proposal details', () => {
    const service = new AgentActionRendererService();

    const payload = service.renderProposalMessage({
      id: 'proposal-6',
      actionType: 'PURGE_USER_MESSAGES',
      targetUserId: 'user-1',
      payload: { reason: 'spam cleanup', targetUserId: 'user-1', limit: 25, channels: ['channel-1', 'channel-2'] },
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });

    const description = payload.embeds[0].data.description;
    expect(description).toContain('Message cleanup action');
    expect(description).toContain('<@user-1>');
    expect(description).toContain('25 recent messages per channel');
    expect(description).toContain('<#channel-1>');
    expect(description).toContain('<#channel-2>');
  });

  it('renders polished execution results', () => {
    const service = new AgentActionRendererService();

    const payload = service.renderExecutionResult('Proposal Executed', 'Done.');

    expect(payload.components).toEqual([]);
    expect(payload.embeds[0].data.title).toBe('Action Executed');
    expect(payload.embeds[0].data.color).toBe(0x2ecc71);
  });
});
