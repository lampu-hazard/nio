import { describe, expect, it } from '@jest/globals';
import { createSessionOptions } from './session-options';

describe('createSessionOptions', () => {
  it('trusts forwarded HTTPS when running behind the production proxy', () => {
    const options = createSessionOptions('production', 'secret');

    expect(options.proxy).toBe(true);
    const cookie = options.cookie as NonNullable<typeof options.cookie> & { secure: boolean; sameSite: string };
    expect(cookie.secure).toBe(true);
    expect(cookie.sameSite).toBe('lax');
  });

  it('keeps local development cookies usable over HTTP', () => {
    const options = createSessionOptions('development', 'secret');

    expect(options.proxy).toBe(false);
    const cookie = options.cookie as NonNullable<typeof options.cookie> & { secure: boolean };
    expect(cookie.secure).toBe(false);
  });
});
