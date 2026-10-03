'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

type DashboardShellProps = { guildId: string; children: ReactNode };
type NavItem = { label: string; href: string; exact?: boolean };

const groups: Array<{ label: string; items: NavItem[] }> = [
  { label: 'Workspace', items: [{ label: 'Panels', href: '', exact: false }] },
  { label: 'Configure', items: [
    { label: 'Plugins', href: '/plugins' },
    { label: 'AI Agent', href: '/ai-agent' },
    { label: 'Moderation', href: '/moderation' },
    { label: 'Settings', href: '/settings' },
  ] },
  { label: 'Community', items: [
    { label: 'Stickers', href: '/stickers' },
    { label: 'Booster Roles', href: '/booster-roles' },
    { label: 'Tako Rewards', href: '/tako' },
    { label: 'Embed Studio', href: '/embed-templates' },
  ] },
  { label: 'Insights', items: [
    { label: 'Analytics', href: '/analytics' },
    { label: 'Leaderboard', href: '/leaderboard' },
    { label: 'Audit Logs', href: '/audit-logs' },
  ] },
];

const titles: Record<string, string> = {
  '': 'Panels', '/plugins': 'Plugins', '/ai-agent': 'AI Agent', '/moderation': 'Moderation',
  '/settings': 'Settings', '/stickers': 'Stickers', '/booster-roles': 'Booster Roles',
  '/tako': 'Tako Rewards', '/embed-templates': 'Embed Studio', '/analytics': 'Analytics',
  '/leaderboard': 'Leaderboard', '/audit-logs': 'Audit Logs', '/panels/new': 'Create panel',
};

export function DashboardShell({ guildId, children }: DashboardShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const base = `/dashboard/${guildId}`;
  const path = pathname.startsWith(base) ? pathname.slice(base.length).replace(/\/$/, '') : '';
  const title = path.startsWith('/panels/') && path !== '/panels/new' ? 'Edit panel' : titles[path] || 'Server workspace';
  const activePanelList = path === '' || path.startsWith('/panels/');

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileOpen(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  const navigation = (
    <>
      <div className="flex items-center justify-between px-2.5 pb-4">
        <a href="/dashboard" className="text-lg font-black tracking-tight text-[var(--text)]">nio<span className="ml-0.5 text-[var(--brand)]">.</span></a>
        <span className="rounded-md border border-[var(--border)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--muted)]">Control</span>
      </div>
      <a href="/dashboard" className="mb-3 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--muted)] transition hover:bg-[var(--panel-strong)] hover:text-[var(--text)]">
        <span aria-hidden="true">←</span> Servers
      </a>
      <nav aria-label="Server navigation" className="space-y-3.5">
        {groups.map((group) => (
          <section key={group.label}>
            <h2 className="mb-1 px-2.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--soft)]">{group.label}</h2>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const href = item.label === 'Leaderboard' ? `/leaderboard/${guildId}` : `${base}${item.href}`;
                const active = item.label === 'Leaderboard' ? pathname === href : item.label === 'Panels' ? activePanelList : path === item.href || path.startsWith(`${item.href}/`);
                return <a key={item.label} href={href} aria-current={active ? 'page' : undefined} onClick={() => setMobileOpen(false)} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] ${active ? 'bg-[var(--brand)] text-[var(--text-inverse)] shadow-sm' : 'text-[var(--text-secondary)] hover:bg-[var(--panel-strong)] hover:text-[var(--text)]'}`}>
                  <span aria-hidden="true" className="w-3.5 text-center text-xs opacity-70">{item.label === 'Panels' ? '⌂' : item.label === 'AI Agent' ? '✳' : item.label === 'Analytics' ? '▥' : item.label === 'Settings' ? '⚙' : '·'}</span>{item.label}
                </a>;
              })}
            </div>
          </section>
        ))}
      </nav>
      <div className="mt-auto pt-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-strong)] p-3">
          <p className="text-[11px] font-semibold text-[var(--text)]">Server workspace</p>
          <p className="mt-0.5 truncate font-mono text-[10px] text-[var(--muted)]">{guildId}</p>
          <a href="/dashboard" className="mt-1.5 inline-block text-[11px] font-bold text-[var(--brand)] hover:underline">Switch server →</a>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] lg:flex">
      <aside className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--panel)] px-3 py-4 lg:flex">{navigation}</aside>
      {mobileOpen && <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
        <button className="absolute inset-0 bg-black/45" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
        <aside className="relative flex h-full w-[min(280px,85vw)] flex-col overflow-y-auto border-r border-[var(--border)] bg-[var(--bg)] px-3 py-4 shadow-2xl" aria-label="Mobile navigation">{navigation}</aside>
      </div>}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-[52px] items-center gap-3 border-b border-[var(--border)] bg-[var(--bg)]/90 px-4 backdrop-blur-xl sm:px-6">
          <button type="button" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-[var(--panel-strong)] text-sm lg:hidden" aria-label="Open navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}>☰</button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="text-xs font-medium text-[var(--muted)]">Server /</span>
            <h1 className="truncate text-sm font-bold tracking-tight text-[var(--text)]">{title}</h1>
          </div>
          <a href="/dashboard" className="hidden rounded-lg border border-[var(--border)] bg-[var(--panel-strong)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] sm:inline-flex">Switch server</a>
        </header>
        {children}
      </div>
    </div>
  );
}
