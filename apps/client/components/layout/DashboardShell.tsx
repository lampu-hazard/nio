'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

type DashboardShellProps = { guildId: string; children: ReactNode };
type NavItem = { label: string; href: string; exact?: boolean };

const groups: Array<{ label: string; items: NavItem[] }> = [
  { label: 'Workspace', items: [{ label: 'Overview', href: '', exact: true }, { label: 'Panels', href: '', exact: false }] },
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
  '': 'Server overview', '/plugins': 'Plugins', '/ai-agent': 'AI Agent', '/moderation': 'Moderation',
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
      <div className="flex items-center justify-between px-3 pb-7">
        <a href="/dashboard" className="text-xl font-black tracking-tight text-[var(--text)]">nio<span className="ml-1 text-[var(--brand)]">.</span></a>
        <span className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">Workspace</span>
      </div>
      <a href="/dashboard" className="mb-5 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[var(--muted)] transition hover:bg-[var(--panel-strong)] hover:text-[var(--text)]">
        <span aria-hidden="true">←</span> All servers
      </a>
      <nav aria-label="Server navigation" className="space-y-6">
        {groups.map((group) => (
          <section key={group.label}>
            <h2 className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--soft)]">{group.label}</h2>
            <div className="space-y-1">
              {group.items.map((item) => {
                const href = item.label === 'Leaderboard' ? `/leaderboard/${guildId}` : `${base}${item.href}`;
                const active = item.label === 'Leaderboard' ? pathname === href : item.label === 'Overview' ? path === '' : item.label === 'Panels' ? activePanelList : path === item.href || path.startsWith(`${item.href}/`);
                return <a key={item.label} href={href} aria-current={active ? 'page' : undefined} onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] ${active ? 'bg-[var(--brand)] text-[var(--text-inverse)] shadow-sm' : 'text-[var(--text-secondary)] hover:bg-[var(--panel-strong)] hover:text-[var(--text)]'}`}>
                  <span aria-hidden="true" className="w-4 text-center text-xs opacity-70">{item.label === 'Overview' ? '⌂' : item.label === 'AI Agent' ? '✳' : item.label === 'Analytics' ? '▥' : item.label === 'Settings' ? '⚙' : '·'}</span>{item.label}
                </a>;
              })}
            </div>
          </section>
        ))}
      </nav>
      <div className="mt-auto pt-8">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-strong)] p-4">
          <p className="text-xs font-semibold text-[var(--text)]">Server workspace</p>
          <p className="mt-1 truncate text-[11px] text-[var(--muted)]">ID · {guildId}</p>
          <a href="/dashboard" className="mt-3 inline-block text-xs font-bold text-[var(--brand)] hover:underline">Switch server →</a>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] lg:flex">
      <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--panel)] px-4 py-6 lg:flex">{navigation}</aside>
      {mobileOpen && <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
        <button className="absolute inset-0 bg-black/45" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
        <aside className="relative flex h-full w-[min(300px,85vw)] flex-col overflow-y-auto border-r border-[var(--border)] bg-[var(--bg)] px-4 py-6 shadow-2xl" aria-label="Mobile navigation">{navigation}</aside>
      </div>}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex min-h-[76px] items-center gap-4 border-b border-[var(--border)] bg-[var(--bg)]/90 px-4 backdrop-blur-xl sm:px-7 lg:px-10">
          <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--border)] bg-[var(--panel-strong)] text-lg lg:hidden" aria-label="Open navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}>☰</button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Server workspace <span className="px-1 opacity-50">/</span> {title}</p>
            <h1 className="mt-0.5 truncate text-lg font-bold tracking-tight text-[var(--text)] sm:text-xl">{title}</h1>
          </div>
          <a href="/dashboard" className="hidden rounded-xl border border-[var(--border)] bg-[var(--panel-strong)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] sm:inline-flex">Switch server</a>
        </header>
        {children}
      </div>
    </div>
  );
}
