import { api } from '@/lib/api';
import type { Panel } from '@/lib/types';
import { PanelCard } from '@/components/dashboard/PanelCard';

export default async function GuildDashboardPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const panels = await api<{ ok: true; panels: Panel[] }>(`/guilds/${guildId}/panels`).catch(() => ({ ok: true as const, panels: [] }));
  return (
    <main className="px-4 py-7 sm:px-7 sm:py-9 lg:px-10">
      <div className="mx-auto max-w-[1440px]">
        <section className="relative isolate overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--panel-strong)] p-6 shadow-sm sm:p-9">
          <div className="pointer-events-none absolute -right-12 -top-28 -z-10 h-72 w-72 rounded-full bg-[var(--brand)] opacity-[0.09] blur-3xl" />
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--brand)]">Server control center</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-[var(--text)] sm:text-4xl">Build a better server experience.</h2>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Manage welcome, rules, announcements, and self-role menus from one place.</p>
            </div>
            <a href={`/dashboard/${guildId}/panels/new`} className="btn btn-primary shrink-0 px-5 py-3">＋ Create panel</a>
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Engagement tools</p><h3 className="mt-1 text-xl font-bold text-[var(--text)]">Panels <span className="ml-1 text-sm font-medium text-[var(--muted)]">{panels.panels.length}</span></h3></div>
            <a href={`/dashboard/${guildId}/plugins`} className="text-sm font-semibold text-[var(--brand)] hover:underline">Explore plugins →</a>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            {panels.panels.map((panel) => <PanelCard key={panel.id} guildId={guildId} panel={panel} />)}
            {!panels.panels.length && <div className="card p-7 sm:p-9"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--surface-muted)] text-xl text-[var(--brand)]">＋</div><h4 className="mt-4 text-lg font-bold text-[var(--text)]">No panels yet</h4><p className="mt-1 max-w-lg text-sm leading-6 text-[var(--muted)]">Create your first server panel to share rules, welcome new members, or let members choose roles.</p><a href={`/dashboard/${guildId}/panels/new`} className="btn btn-primary mt-5 px-4 py-2.5">Create your first panel</a></div>}
          </div>
        </section>
      </div>
    </main>
  );
}
