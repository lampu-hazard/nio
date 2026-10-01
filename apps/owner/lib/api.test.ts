import { describe, expect, it } from 'bun:test';
import { isSafeApiPath } from './api-path';

describe('isSafeApiPath', () => {
  it('allows a same-origin API path', () => expect(isSafeApiPath('/owner/overview')).toBe(true));
  it('rejects protocol-relative URLs', () => expect(isSafeApiPath('//attacker.example')).toBe(false));
  it('rejects traversal segments', () => expect(isSafeApiPath('/owner/../auth/me')).toBe(false));
  it('rejects unrelated backend endpoints', () => expect(isSafeApiPath('/auth/logout')).toBe(false));
});
