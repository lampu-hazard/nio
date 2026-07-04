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
        { label: 'Analytics', href: `/dashboard/${guildId}/analytics` },
        { label: 'Audit Logs', href: `/dashboard/${guildId}/audit-logs` },
        { label: 'Settings', href: `/dashboard/${guildId}/settings` },
      ]
    : [{ label: 'Servers', href: '/dashboard', exact: true }];

  return (
    <aside className="hidden min-h-screen w-64 shrink-0 border-r border-zinc-200 bg-white px-5 py-6 dark:border-zinc-800 dark:bg-zinc-950 lg:block">
      <a href="/dashboard" className="block text-xl font-black tracking-tight text-zinc-950 dark:text-zinc-50">
        nio
      </a>
      <nav className="mt-8 space-y-1">
        <a
          href="/dashboard"
          className="mb-4 block rounded-md px-3 py-2 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
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
                  ? 'bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950'
                  : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50'
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
