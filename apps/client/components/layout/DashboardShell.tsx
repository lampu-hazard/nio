'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { activeDashboardItem, dashboardNavGroups } from '@/lib/dashboard-navigation';

type DashboardShellProps = { guildId: string; children: ReactNode };

export function DashboardShell({ guildId, children }: DashboardShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const base = `/dashboard/${guildId}`;
  const path = pathname.startsWith(`${base}/`) ? pathname.slice(base.length).replace(/\/$/, '') : pathname === base ? '' : '/unknown';
  const active = activeDashboardItem(path);
  const title = path === '/panels/new' ? 'Create panel' : path.startsWith('/panels/') ? 'Edit panel' : path === '/settings' ? 'Settings' : active?.label || 'Server workspace';

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  useEffect(() => {
    if (!mobileOpen || !dialog.current) return;
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = 'hidden';
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (desktop.matches) setMobileOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    closeOnDesktop();
    return () => {
      desktop.removeEventListener('change', closeOnDesktop);
      element.close();
      document.body.style.overflow = overflow;
      if (trigger.current?.isConnected && !desktop.matches) trigger.current.focus();
    };
  }, [mobileOpen]);

  const navigation = (
    <>
      <Link href="/dashboard" className="dashboard-wordmark">nio</Link>
      <nav aria-label="Server navigation" className="dashboard-navigation">
        {dashboardNavGroups.map(group => (
          <section key={group.label}>
            <h2>{group.label}</h2>
            {group.items.map(item => (
              <Link key={item.key} href={`${base}${item.path}`} aria-current={active?.key === item.key ? 'page' : undefined}
                onClick={event => { if (!event.defaultPrevented) setMobileOpen(false); }}>
                {item.label}
              </Link>
            ))}
          </section>
        ))}
      </nav>
      <div className="dashboard-server-context">
        <p>Server workspace</p>
        <p className="dashboard-server-id">{guildId}</p>
        <Link href="/dashboard">Switch server</Link>
        <Link href={`${base}/settings`}>All settings</Link>
      </div>
    </>
  );

  return (
    <div className="dashboard-workspace">
      <Link className="dashboard-skip" href="#dashboard-content">Skip to content</Link>
      <aside className="dashboard-sidebar">{navigation}</aside>
      <dialog ref={dialog} id="dashboard-navigation" className="dashboard-drawer" aria-label="Server navigation"
        onCancel={() => setMobileOpen(false)} onClose={() => setMobileOpen(false)}
        onClick={event => { if (event.target === event.currentTarget) {
          const box = event.currentTarget.getBoundingClientRect();
          if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) setMobileOpen(false);
        } }}>
        <button type="button" className="btn dashboard-drawer-close" onClick={() => setMobileOpen(false)} autoFocus>Close navigation</button>
        {navigation}
      </dialog>
      <div className="dashboard-body">
        <header className="dashboard-header">
          <button ref={trigger} type="button" className="btn dashboard-menu" aria-expanded={mobileOpen} aria-controls="dashboard-navigation" onClick={() => setMobileOpen(true)}>Menu</button>
          <p className="dashboard-breadcrumb"><span>Server / </span>{title}</p>
          <Link href="/dashboard" className="btn dashboard-server-switch">Switch server</Link>
        </header>
        <div id="dashboard-content" tabIndex={-1}>{children}</div>
      </div>
    </div>
  );
}
