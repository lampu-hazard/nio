import { describe, expect, it } from '@jest/globals';
import { AgentActionRendererService } from './agent-action-renderer.service';

describe('AgentActionRendererService', () => {
  it('renders approve and cancel buttons for a pending proposal', () => {
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
    expect((payload.components[0].components[1].data as any).custom_id).toBe('agent:cancel:proposal-1');
  });
});
