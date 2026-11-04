import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function quotaTestDatabaseUrl(env: Record<string, string | undefined>): string {
  if (!env.AGENT_QUOTA_TEST_DATABASE_URL) throw new Error('AGENT_QUOTA_TEST_DATABASE_URL must explicitly identify a disposable PostgreSQL database. Application DATABASE_URL is never used.');
  const url = new URL(env.AGENT_QUOTA_TEST_DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Quota integration tests require PostgreSQL.');
  url.searchParams.set('schema', `agent_quota_test_${randomUUID().replace(/-/g, '')}`);
  return url.toString();
}

export async function createQuotaTestDatabase(options: { beforeMigration?: string } = {}) {
  const databaseUrl = quotaTestDatabaseUrl(process.env);
  const url = new URL(databaseUrl);
  const schema = url.searchParams.get('schema')!;
  url.searchParams.delete('schema');
  const admin = new Client({ connectionString: url.toString() });
  await admin.connect();
  let created = false;
  const clients: PrismaClient[] = [];
  const close = async () => {
    await Promise.all(clients.map((client) => client.$disconnect()));
    if (created && /^agent_quota_test_[a-f0-9]{32}$/.test(schema)) {
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      created = false;
    }
    await admin.end();
  };
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    const deploy = (schemaPath?: string) => {
      const result = spawnSync('bun', ['run', 'prisma:deploy', ...(schemaPath ? ['--schema', schemaPath] : [])], {
        cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: 'utf8', timeout: 120000,
      });
      if (result.status !== 0) throw new Error('Disposable quota schema migration failed; no application database was used.');
    };
    if (options.beforeMigration) {
      // Stage an owned temporary copy; never modify checked-in migration history.
      const staged = mkdtempSync(join(tmpdir(), 'nio-quota-migrations-'));
      try {
        const prismaPath = join(process.cwd(), 'prisma');
        cpSync(join(prismaPath, 'schema.prisma'), join(staged, 'schema.prisma'));
        cpSync(join(prismaPath, 'migrations'), join(staged, 'migrations'), { recursive: true });
        for (const entry of readdirSync(join(staged, 'migrations'), { withFileTypes: true })) {
          if (entry.isDirectory() && entry.name >= options.beforeMigration) {
            rmSync(join(staged, 'migrations', entry.name), { recursive: true });
          }
        }
        deploy(join(staged, 'schema.prisma'));
      } finally { rmSync(staged, { recursive: true }); }
    } else deploy();
    for (let i = 0; i < 2; i++) clients.push(new PrismaClient({ datasources: { db: { url: databaseUrl } } }));
    return { clients, close, migrateRemaining: async () => deploy() };
  } catch (error) { await close(); throw error; }
}
