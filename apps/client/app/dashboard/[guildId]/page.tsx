import { api } from '@/lib/api';
import type { Panel } from '@/lib/types';
import { PanelCard } from '@/components/dashboard/PanelCard';
import { DashboardNav } from '@/components/dashboard/DashboardNav';

export default async function GuildDashboardPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const panels = await api<{ ok: true; panels: Panel[] }>(`/guilds/${guildId}/panels`).catch(() => ({ ok: true as const, panels: [] }));
  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-4xl font-black">Server Dashboard</h1>
            <p className="mt-1 text-slate-400">Manage self-role panels for this guild.</p>
          </div>
          <a href={`/dashboard/${guildId}/panels/new`} className="rounded-xl bg-indigo-500 px-5 py-3 text-center font-bold hover:bg-indigo-400 shadow-lg shadow-indigo-500/20 transition hover:-translate-y-0.5">+ New Panel</a>
        </div>

        <DashboardNav guildId={guildId} activeTab="panels" />

        <div className="mt-8 grid gap-4">
          {panels.panels.map((panel) => <PanelCard key={panel.id} guildId={guildId} panel={panel} />)}
          {!panels.panels.length && <div className="card p-8 text-slate-400">Belum ada panel.</div>}
        </div>
      </div>
    </main>
  );
}
