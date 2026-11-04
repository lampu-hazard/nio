import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as Sections from '../components/ai-agent/AgentSections';
import { AgentRoleQuotas, AgentImages, AgentQuotaUsage, AgentToolCatalog } from '../components/ai-agent/AgentSections';
import { AgentProfileForm } from '../components/ai-agent/AgentProfileForm';

const settings: any = {
  profile: 'PUBLIC',
  tokenQuotaMode: 'LIMITED',
  enabled: true,
  provider: 'openai-compatible',
  model: 'custom-llama-70b',
  baseUrl: 'https://provider.example/v1',
  allowedUserIds: [],
  allowedChannelIds: ['1001'],
  excludedChannelIds: [],
  hasCredential: true,
  accessMode: 'ROLE_QUOTAS',
  roleRules: [{ roleId: 'missing', chatEnabled: false, imageEnabled: true, dailyTokenLimit: 0, dailyImageLimit: 2 }],
  dailyGuildTokenLimit: 100,
  dailyGuildImageLimit: 10,
  maxOutputTokens: 2048,
  maxRunTokens: 16384,
  imageEnabled: false,
  imageBaseUrl: null,
  imageModel: null,
  imageCredentialSource: 'SEPARATE',
  hasImageCredential: false,
  allowedToolIds: ['web_search', 'plugin:unsafe:write'],
};

const PersonalField = (Sections as any).AgentMemberTokens;
assert.equal(typeof PersonalField, 'function', 'Personal token editor must be available');
let edited: any;
let field = PersonalField({ settings, userId: '40000', name: 'Member A', onChange: (next: any) => { edited = next; } });
field.props.children[0].props.children[1].props.onChange({ target: { value: 'custom' } });
assert.deepEqual(edited.userTokenRules, [{ userId: '40000', dailyTokenLimit: 10000 }]);
field = PersonalField({ settings: edited, userId: '40000', name: 'Member A', onChange: (next: any) => { edited = next; } });
field.props.children[1].props.onChange(50000);
assert.equal(edited.userTokenRules[0].dailyTokenLimit, 50000);
field = PersonalField({ settings: edited, userId: '40000', name: 'Member A', onChange: (next: any) => { edited = next; } });
field.props.children[0].props.children[1].props.onChange({ target: { value: 'unlimited' } });
assert.equal(edited.userTokenRules[0].dailyTokenLimit, null);
field = PersonalField({ settings: edited, userId: '40000', name: 'Member A', onChange: (next: any) => { edited = next; } });
field.props.children[0].props.children[1].props.onChange({ target: { value: 'role' } });
assert.deepEqual(edited.userTokenRules, []);

const roles = renderToStaticMarkup(<AgentRoleQuotas settings={settings} roles={[]} onChange={() => {}} />);
assert.ok(roles.includes('Unavailable role (missing)'));
assert.ok(roles.includes('highest') && roles.includes('00:00 UTC'));
assert.ok(roles.includes('Allow chat') && roles.includes('Allow images'));
assert.ok(!roles.includes('<option value="LEGACY_USERS">'), 'Legacy mode toggle must not be rendered');

const images = renderToStaticMarkup(<AgentImages settings={settings} onChange={() => {}} imageApiKey="" clearImageApiKey={false} onKey={() => {}} onClear={() => {}} />);
assert.ok(images.includes('@nio gambar') && images.includes('@nio buat gambar') && images.includes('@nio generate image'));
assert.ok(images.includes('type="password"'));

const counter = { committed: '30', reserved: '20', limit: 100, remaining: 50 };
const usage = renderToStaticMarkup(
  <AgentQuotaUsage
    page={{
      profile: 'PUBLIC',
      accessMode: 'ROLE_QUOTAS',
      periodStart: '2026-11-04T00:00:00Z',
      resetAt: '2026-11-05T00:00:00Z',
      guild: {
        tokens: counter,
        images: counter,
        allowanceStatus: 'KNOWN',
        usageSources: { ESTIMATED: 2, UNCERTAIN: 1 },
        usageSourceAmounts: { ESTIMATED: '120', UNCERTAIN: '40' },
        overruns: 1,
      },
      members: [
        {
          userId: 'Member B',
          tokens: { committed: '10', reserved: '0', limit: null, remaining: null },
          images: counter,
          allowanceStatus: 'UNAVAILABLE',
          usageSources: {},
          overruns: 0,
        },
      ],
      nextCursor: 'next',
    }}
    onNext={() => {}}
    onRefresh={() => {}}
  />,
);
assert.ok(usage.includes('50 remaining') && usage.includes('UNCERTAIN') && usage.includes('Overruns: 1') && usage.includes('Next page'));
assert.ok(usage.includes('Current allowance unavailable') && usage.includes('remaining unavailable'));
assert.ok(usage.includes('not provider-reported actual usage'));

// ADMIN quota ledger shows Unlimited — usage tracked, no NIO token quota
const adminUsage = renderToStaticMarkup(
  <AgentQuotaUsage
    page={{
      profile: 'ADMIN',
      tokenQuotaMode: 'UNLIMITED',
      accessMode: 'ROLE_QUOTAS',
      periodStart: '2026-11-04T00:00:00Z',
      resetAt: '2026-11-05T00:00:00Z',
      guild: {
        tokens: { committed: '1500000', reserved: '0', limit: null, remaining: null, unlimited: true },
        images: counter,
        allowanceStatus: 'KNOWN',
        usageSources: { REPORTED: 5 },
        overruns: 0,
      },
      members: [],
      nextCursor: null,
    }}
    onNext={() => {}}
    onRefresh={() => {}}
  />,
);
assert.ok(adminUsage.includes('Unlimited — usage tracked, no NIO token quota'));

// Tool catalog renders unavailable tools disabled with reason and warns on selected unavailable tools
const catalogMarkup = renderToStaticMarkup(
  <AgentToolCatalog
    settings={settings}
    tools={[
      { id: 'web_search', name: 'web_search', description: 'Search public web via SearXNG', source: 'BUILTIN', mode: 'read', available: true },
      { id: 'plugin:unsafe:write', name: 'unsafe_write', description: 'Mutates state without confirmation', source: 'PLUGIN', mode: 'write', available: false, unavailableReason: 'Plugin write tools require a confirmation adapter.' },
    ]}
    onChange={() => {}}
  />,
);
assert.ok(catalogMarkup.includes('Search public web via SearXNG'));
assert.ok(catalogMarkup.includes('Plugin write tools require a confirmation adapter.'));
assert.ok(catalogMarkup.includes('disabled=""'));
assert.ok(catalogMarkup.includes('remain inactive'));

// PUBLIC config form warns on baseline token estimate fallback for custom model
const publicConfigMarkup = renderToStaticMarkup(
  <AgentProfileForm
    profile="PUBLIC"
    tab="config"
    settings={settings}
    keys={{ apiKey: '', clearApiKey: false, imageApiKey: '', clearImageApiKey: false }}
    channels={[{ id: '1001', name: 'umum', everyoneVisible: true }]}
    members={[]}
    roles={[{ id: '2001', name: 'Member' }]}
    tools={[]}
    onChange={() => {}}
    onKeysChange={() => {}}
  />,
);
assert.ok(publicConfigMarkup.includes('Baseline token estimate fallback'));
assert.ok(publicConfigMarkup.includes('Max tokens / run'));

// ADMIN form shows Unlimited — usage tracked, no NIO token quota, no daily/run/personal token editors, and warns on @everyone-visible channel
const adminSettings: any = {
  ...settings,
  profile: 'ADMIN',
  tokenQuotaMode: 'UNLIMITED',
  dailyGuildTokenLimit: null,
  maxRunTokens: null,
  allowedChannelIds: ['9001'],
  roleRules: [{ roleId: '8001', chatEnabled: true, imageEnabled: true, dailyTokenLimit: null, dailyImageLimit: 5 }],
};
const adminConfigMarkup = renderToStaticMarkup(
  <AgentProfileForm
    profile="ADMIN"
    tab="config"
    settings={adminSettings}
    keys={{ apiKey: '', clearApiKey: false, imageApiKey: '', clearImageApiKey: false }}
    channels={[{ id: '9001', name: 'public-lobby', everyoneVisible: true }]}
    members={[{ id: '40000', displayName: 'Admin A', username: 'admina' }]}
    roles={[{ id: '8001', name: 'Moderator' }]}
    tools={[]}
    readOnly={true}
    permissionNotice="Current guild management permission required to configure the ADMIN profile."
    onChange={() => {}}
    onKeysChange={() => {}}
  />,
);
assert.ok(adminConfigMarkup.includes('Unlimited — usage tracked, no NIO token quota'));
assert.ok(adminConfigMarkup.includes('Max output tokens / call'));
assert.ok(!adminConfigMarkup.includes('Max tokens / run'));
assert.ok(adminConfigMarkup.includes('Current guild management permission required'));

const adminAccessMarkup = renderToStaticMarkup(
  <AgentProfileForm
    profile="ADMIN"
    tab="access"
    settings={adminSettings}
    keys={{ apiKey: '', clearApiKey: false, imageApiKey: '', clearImageApiKey: false }}
    channels={[{ id: '9001', name: 'public-lobby', everyoneVisible: true }]}
    members={[{ id: '40000', displayName: 'Admin A', username: 'admina' }]}
    roles={[{ id: '8001', name: 'Moderator' }]}
    tools={[]}
    onChange={() => {}}
    onKeysChange={() => {}}
  />,
);
assert.ok(adminAccessMarkup.includes('Unlimited — usage tracked, no NIO token quota'));
assert.ok(adminAccessMarkup.includes('Allow all channels'));
assert.ok(adminAccessMarkup.includes('Server images / day'));
assert.ok(adminAccessMarkup.includes('Member images / day'));
assert.ok(!adminAccessMarkup.includes('Server tokens / day'));
assert.ok(!adminAccessMarkup.includes('Member tokens / day'));
assert.ok(!adminAccessMarkup.includes('Personal token quotas'));
assert.ok(adminAccessMarkup.includes('@everyone'));

console.log('AI settings sections static markup checks passed; not browser interaction acceptance.');
