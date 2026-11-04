import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
const model = (name: string) => schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? '';

describe('agent profile persistence contract', () => {
  it('requires a profile on every settings, accounting and execution boundary', () => {
    for (const name of ['DiscordAgentSettings', 'AgentRoleRule', 'AgentQuotaBucket', 'AgentQuotaAttempt', 'AgentRun', 'AgentInteractionLog', 'AgentActionProposal']) {
      expect(model(name)).toMatch(/profile\s+String\s*\n/);
    }
    expect(model('DiscordAgentSettings')).toContain('@@id([guildId, profile])');
    expect(model('AgentRoleRule')).toContain('@@id([guildId, profile, roleId])');
    expect(model('AgentQuotaBucket')).toContain('@@id([guildId, profile, periodStart, subject])');
    expect(model('AgentMemberLease')).not.toMatch(/profile\s/);
    expect(model('AgentMemberLease')).toContain('@@id([guildId, userId])');
  });

  it('can represent genuinely unlimited tokens and unavailable historical estimates', () => {
    expect(model('DiscordAgentSettings')).toMatch(/dailyGuildTokenLimit\s+Int\?/);
    expect(model('DiscordAgentSettings')).toMatch(/maxRunTokens\s+Int\?/);
    expect(model('DiscordAgentSettings')).toMatch(/tokenQuotaMode\s+String/);
    expect(model('AgentRoleRule')).toMatch(/dailyTokenLimit\s+Int\?/);
    expect(model('AgentQuotaAttempt')).toMatch(/tokenCountSource\s+String\?/);
    expect(model('AgentQuotaAttempt')).toMatch(/tokenCounterVersion\s+String\?/);
    expect(model('AgentQuotaAttempt')).toMatch(/inputTokenEstimate\s+BigInt\?/);
    expect(model('AgentActionProposal')).toMatch(/originToolId\s+String\?/);
  });
});
