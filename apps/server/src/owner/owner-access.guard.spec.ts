import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { afterEach, describe, expect, it } from '@jest/globals';
import { OwnerAccessGuard } from './owner-access.guard';

describe('OwnerAccessGuard', () => {
  const guard = new OwnerAccessGuard();
  const context = (id?: string) => ({
    switchToHttp: () => ({ getRequest: () => ({ session: { user: id ? { id } : undefined } }) }),
  }) as unknown as ExecutionContext;
  const original = process.env.OWNER_DISCORD_ID;
  afterEach(() => {
    if (original === undefined) delete process.env.OWNER_DISCORD_ID;
    else process.env.OWNER_DISCORD_ID = original;
  });

  it('allows only the configured owner', () => {
    process.env.OWNER_DISCORD_ID = 'owner-1';
    expect(guard.canActivate(context('owner-1'))).toBe(true);
    expect(() => guard.canActivate(context('someone-else'))).toThrow(ForbiddenException);
  });

  it('denies when no owner is configured', () => {
    delete process.env.OWNER_DISCORD_ID;
    expect(() => guard.canActivate(context('owner-1'))).toThrow(ForbiddenException);
  });
});
