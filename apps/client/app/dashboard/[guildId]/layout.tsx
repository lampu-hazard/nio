import type { ReactNode } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';

export default async function GuildDashboardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] lg:flex">
      <Sidebar guildId={guildId} />
      <div className="min-w-0 flex-1">
        <Topbar title="Server workspace" subtitle="Manage panels, automation, audit history, and server settings." />
        {children}
      </div>
    </div>
  );
}
