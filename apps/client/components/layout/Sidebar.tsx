'use client';

import { usePathname } from 'next/navigation';

type SidebarProps = {
  guildId?: string;
};

export function Sidebar({ guildId }: SidebarProps) {
  const pathname = usePathname();
  const links = guildId
    ? [
        { label: 'Panels', href: `/dashboard/${guildId}`, exact: true },
        { label: 'Stickers', href: `/dashboard/${guildId}/stickers` },
        { label: 'Moderation', href: `/dashboard/${guildId}/moderation` },
        { label: 'Booster Roles', href: `/dashboard/${guildId}/booster-roles` },
        { label: 'Tako Rewards', href: `/dashboard/${guildId}/tako` },
        { label: 'Analytics', href: `/dashboard/${guildId}/analytics` },
        { label: 'Leaderboard', href: `/leaderboard/${guildId}` },
        { label: 'Audit Logs', href: `/dashboard/${guildId}/audit-logs` },
        { label: 'Settings', href: `/dashboard/${guildId}/settings` },
      ]
    : [{ label: 'Servers', href: '/dashboard', exact: true }];

  return (
    <aside className="hidden min-h-screen w-64 shrink-0 border-r border-[var(--border)] bg-[var(--surface)] backdrop-blur-md px-5 py-6 lg:block">
      <a href="/dashboard" className="block text-xl font-black tracking-tight text-[var(--text)]">
        nio
      </a>
      <nav className="mt-8 space-y-1">
        <a
          href="/dashboard"
          className="mb-4 block rounded-md px-3 py-2 text-sm font-medium text-[var(--muted)] transition-colors hover:bg-[var(--panel-strong)] hover:text-[var(--text)]"
        >
          All servers
        </a>
        {links.map((link) => {
          const isActive = link.exact ? pathname === link.href : pathname.startsWith(link.href);
          return (
            <a
              key={link.href}
              href={link.href}
              className={`block rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--panel-strong)] hover:text-[var(--text)]'
              }`}
            >
              {link.label}
            </a>
          );
        })}
      </nav>
    </aside>
  );
}
