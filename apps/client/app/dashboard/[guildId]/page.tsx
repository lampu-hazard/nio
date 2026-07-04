import { api } from '@/lib/api';
import type { Panel } from '@/lib/types';
import { PanelCard } from '@/components/dashboard/PanelCard';
import { DashboardNav } from '@/components/dashboard/DashboardNav';

export default async function GuildDashboardPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const panels = await api<{ ok: true; panels: Panel[] }>(`/guilds/${guildId}/panels`).catch(() => ({ ok: true as const, panels: [] }));
  return (
    <main className="px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">Panels</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">Server Dashboard</h1>
            <p className="mt-1 text-zinc-500 dark:text-zinc-400">Manage rules, announcements, and self-role panels for this server.</p>
          </div>
          <a href={`/dashboard/${guildId}/panels/new`} className="btn btn-primary px-5 py-3">
            New Panel
          </a>
        </div>

        <DashboardNav guildId={guildId} activeTab="panels" />

        <div className="mt-8 grid gap-4">
          {panels.panels.map((panel) => <PanelCard key={panel.id} guildId={guildId} panel={panel} />)}
          {!panels.panels.length && <div className="card p-8 text-zinc-500 dark:text-zinc-400">No panels yet. Create your first panel to get started.</div>}
        </div>
      </div>
    </main>
  );
}
