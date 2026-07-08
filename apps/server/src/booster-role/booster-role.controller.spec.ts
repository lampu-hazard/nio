import { describe, expect, it, jest } from '@jest/globals';
import { BoosterRoleController } from './booster-role.controller';

describe('BoosterRoleController', () => {
  it('validates a token publicly without session user', async () => {
    const service = {
      validateToken: jest.fn(async () => ({ guildId: 'guild-1', userId: 'user-1', expiresAt: new Date(), existingRole: null })),
      claimRole: jest.fn(),
    };
    const controller = new BoosterRoleController(service as any);

    const result = await controller.validateToken('guild-1', 'claim-token');

    (expect(service.validateToken) as any).toHaveBeenCalledWith('guild-1', 'claim-token');
    expect(result.ok).toBe(true);
  });

  it('claims a role publicly without session user', async () => {
    const service = {
      validateToken: jest.fn(),
      claimRole: jest.fn(async () => ({ roleId: 'role-1', name: 'Booster', color: '#abcdef' })),
    };
    const controller = new BoosterRoleController(service as any);

    const result = await controller.claimRole('guild-1', { token: 'claim-token', name: 'Booster', primaryColor: '#abcdef' });

    (expect(service.claimRole) as any).toHaveBeenCalledWith('guild-1', 'claim-token', 'Booster', {
      primaryColor: '#abcdef',
      secondaryColor: undefined,
      tertiaryColor: undefined,
      iconDataUrl: undefined,
      removeIcon: undefined,
    });
    expect(result.role.roleId).toBe('role-1');
  });
});
