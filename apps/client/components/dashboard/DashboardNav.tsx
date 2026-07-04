'use client';

type DashboardNavProps = {
  guildId: string;
  activeTab: 'panels' | 'analytics' | 'audit-logs' | 'settings' | 'stickers' | 'moderation' | 'booster-roles';
};

export function DashboardNav({ guildId, activeTab }: DashboardNavProps) {
  const tabs = [
    { id: 'panels' as const, label: 'Panels', href: `/dashboard/${guildId}` },
    { id: 'stickers' as const, label: 'Stickers', href: `/dashboard/${guildId}/stickers` },
    { id: 'moderation' as const, label: 'Moderation', href: `/dashboard/${guildId}/moderation` },
    { id: 'booster-roles' as const, label: 'Booster Roles', href: `/dashboard/${guildId}/booster-roles` },
    { id: 'analytics' as const, label: 'Analytics', href: `/dashboard/${guildId}/analytics` },
    { id: 'audit-logs' as const, label: 'Audit Logs', href: `/dashboard/${guildId}/audit-logs` },
    { id: 'settings' as const, label: 'Settings', href: `/dashboard/${guildId}/settings` },
  ];

  return (
    <div className="mb-8 flex gap-2 overflow-x-auto whitespace-nowrap border-b border-[var(--border)] pb-3 lg:hidden">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <a
            key={tab.id}
            href={tab.href}
            className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
              isActive
                ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                : 'text-[var(--text-secondary)] hover:bg-[var(--panel-strong)] hover:text-[var(--text)]'
            }`}
          >
            {tab.label}
          </a>
        );
      })}
    </div>
  );
}
