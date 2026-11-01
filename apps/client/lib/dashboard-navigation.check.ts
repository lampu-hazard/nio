import assert from 'node:assert/strict';
import { activeDashboardItem, dashboardNavGroups } from './dashboard-navigation';

assert.equal(activeDashboardItem('')?.key, 'panels');
for (const path of ['/panels/new', '/panels/123']) assert.equal(activeDashboardItem(path)?.key, 'panels');
assert.equal(activeDashboardItem('/voice-xp')?.key, 'voice-xp');
assert.equal(activeDashboardItem('/unknown'), undefined);
assert.equal(activeDashboardItem('/voice-xp-extra'), undefined);
const items = dashboardNavGroups.flatMap(group => group.items);
assert.equal(new Set(items.map(item => item.key)).size, items.length);
assert.equal(new Set(items.map(item => item.path)).size, items.length);
assert.equal(items.find(item => item.key === 'leaderboard')?.path, '/leaderboard');
for (const path of ['/overview', '', '/ai-agent', '/voice-xp', '/voice-notifications', '/hall-of-fame', '/stickers', '/booster-roles', '/tako', '/moderation', '/slowmode', '/security', '/logging', '/embed-templates', '/plugins', '/analytics', '/leaderboard', '/audit-logs']) {
  assert.equal(items.filter(item => item.path === path).length, 1, path);
}
console.log('dashboard navigation checks passed');
