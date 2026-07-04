'use client';

type DashboardNavProps = {
  guildId: string;
  activeTab: 'panels' | 'analytics' | 'audit-logs' | 'settings' | 'stickers';
};

export function DashboardNav({ guildId, activeTab }: DashboardNavProps) {
  const tabs = [
    { id: 'panels' as const, label: 'Panels', href: `/dashboard/${guildId}` },
    { id: 'stickers' as const, label: 'Stickers', href: `/dashboard/${guildId}/stickers` },
    { id: 'analytics' as const, label: 'Analytics', href: `/dashboard/${guildId}/analytics` },
    { id: 'audit-logs' as const, label: 'Audit Logs', href: `/dashboard/${guildId}/audit-logs` },
    { id: 'settings' as const, label: 'Settings', href: `/dashboard/${guildId}/settings` },
  ];

  return (
    <div className="mb-8 flex gap-2 overflow-x-auto whitespace-nowrap border-b border-zinc-200 pb-3 dark:border-zinc-800 lg:hidden">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <a
            key={tab.id}
            href={tab.href}
            className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
              isActive
                ? 'bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950'
                : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50'
            }`}
          >
            {tab.label}
          </a>
        );
      })}
    </div>
  );
}
