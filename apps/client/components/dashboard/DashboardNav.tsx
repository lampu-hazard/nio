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
    { id: 'settings' as const, label: 'Settings', href: `/dashboard/${guildId}/settings` }
  ];

  return (
    <div className="flex border-b border-white/10 mb-8 gap-6 overflow-x-auto whitespace-nowrap">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <a
            key={tab.id}
            href={tab.href}
            className={`pb-3 font-bold text-sm transition-all border-b-2 ${
              isActive
                ? 'border-indigo-500 text-white font-black'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            {tab.label}
          </a>
        );
      })}
    </div>
  );
}
