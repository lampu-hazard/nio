import { describe, expect, it, jest } from '@jest/globals';
import { BoosterRoleController } from './booster-role.controller';

describe('BoosterRoleController', () => {
  it('validates a token for the logged-in session user', async () => {
    const service = {
      validateToken: jest.fn(async () => ({ guildId: 'guild-1', userId: 'user-1', expiresAt: new Date(), existingRole: null })),
      claimRole: jest.fn(),
    };
    const controller = new BoosterRoleController(service as any);

    const result = await controller.validateToken('guild-1', 'claim-token', { id: 'user-1', username: 'tester' });

    expect(service.validateToken).toHaveBeenCalledWith('guild-1', 'claim-token', 'user-1');
    expect(result.ok).toBe(true);
  });

  it('claims a role for the logged-in session user', async () => {
    const service = {
      validateToken: jest.fn(),
      claimRole: jest.fn(async () => ({ roleId: 'role-1', name: 'Booster', color: '#abcdef' })),
    };
    const controller = new BoosterRoleController(service as any);

    const result = await controller.claimRole('guild-1', { token: 'claim-token', name: 'Booster', color: '#abcdef' }, { id: 'user-1', username: 'tester' });

    expect(service.claimRole).toHaveBeenCalledWith('guild-1', 'claim-token', 'user-1', 'Booster', '#abcdef');
    expect(result.role.roleId).toBe('role-1');
  });
});
