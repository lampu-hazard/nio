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

  it('renders polished execution results', () => {
    const service = new AgentActionRendererService();

    const payload = service.renderExecutionResult('Proposal Executed', 'Done.');

    expect(payload.components).toEqual([]);
    expect(payload.embeds[0].data.title).toBe('Action Executed');
    expect(payload.embeds[0].data.color).toBe(0x2ecc71);
  });
});
