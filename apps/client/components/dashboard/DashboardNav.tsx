'use client';

type DashboardNavProps = {
  guildId: string;
  activeTab: 'panels' | 'plugins' | 'analytics' | 'audit-logs' | 'settings' | 'stickers' | 'moderation' | 'booster-roles' | 'tako' | 'embed-templates' | 'leaderboard' | 'ai-agent';
};

// Navigation lives in the responsive DashboardShell now.
export function DashboardNav(_props: DashboardNavProps) {
  return null;
}
