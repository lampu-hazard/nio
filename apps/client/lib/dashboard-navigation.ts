export type DashboardNavItem = { key: string; label: string; path: string };
export type DashboardNavGroup = { label: string; items: DashboardNavItem[] };

export const dashboardNavGroups: DashboardNavGroup[] = [
  { label: 'Workspace', items: [
    { key: 'overview', label: 'Overview', path: '/overview' },
    { key: 'panels', label: 'Panels', path: '' },
    { key: 'ai-agent', label: 'AI Agent', path: '/ai-agent' },
  ] },
  { label: 'Community', items: [
    { key: 'voice-xp', label: 'Voice XP & Rewards', path: '/voice-xp' },
    { key: 'voice-notifications', label: 'Voice Notifications', path: '/voice-notifications' },
    { key: 'hall-of-fame', label: 'Hall of Fame', path: '/hall-of-fame' },
    { key: 'stickers', label: 'Stickers', path: '/stickers' },
    { key: 'booster-roles', label: 'Booster Roles', path: '/booster-roles' },
    { key: 'tako', label: 'Tako Rewards', path: '/tako' },
  ] },
  { label: 'Management', items: [
    { key: 'moderation', label: 'Moderation', path: '/moderation' },
    { key: 'slowmode', label: 'Slowmode', path: '/slowmode' },
    { key: 'security', label: 'Security', path: '/security' },
    { key: 'logging', label: 'Logging', path: '/logging' },
  ] },
  { label: 'Tools', items: [
    { key: 'embed-templates', label: 'Embed Studio', path: '/embed-templates' },
    { key: 'plugins', label: 'Plugins', path: '/plugins' },
  ] },
  { label: 'Activity', items: [
    { key: 'analytics', label: 'Analytics', path: '/analytics' },
    { key: 'leaderboard', label: 'Leaderboard', path: '/leaderboard' },
    { key: 'audit-logs', label: 'Audit Logs', path: '/audit-logs' },
  ] },
];

export function activeDashboardItem(path: string): DashboardNavItem | undefined {
  return dashboardNavGroups.flatMap(group => group.items).find(item =>
    item.key === 'panels' ? path === '' || path.startsWith('/panels/') : path === item.path || path.startsWith(`${item.path}/`),
  );
}
