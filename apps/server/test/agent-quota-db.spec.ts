import { describe, expect, it } from '@jest/globals';
import { quotaTestDatabaseUrl } from './agent-quota-db';

describe('disposable quota database selection', () => {
  it('never falls back to the application database', () => {
    expect(() => quotaTestDatabaseUrl({ DATABASE_URL: 'postgresql://app/db' })).toThrow('AGENT_QUOTA_TEST_DATABASE_URL');
  });
  it('requires PostgreSQL and generates a new private schema name', () => {
    expect(() => quotaTestDatabaseUrl({ AGENT_QUOTA_TEST_DATABASE_URL: 'file:app.db' })).toThrow();
    const first = new URL(quotaTestDatabaseUrl({ AGENT_QUOTA_TEST_DATABASE_URL: 'postgresql://test/db?schema=public' }));
    const second = new URL(quotaTestDatabaseUrl({ AGENT_QUOTA_TEST_DATABASE_URL: 'postgresql://test/db?schema=public' }));
    expect(first.searchParams.get('schema')).toMatch(/^agent_quota_test_[a-f0-9]{32}$/);
    expect(first.searchParams.get('schema')).not.toBe(second.searchParams.get('schema'));
  });
});
