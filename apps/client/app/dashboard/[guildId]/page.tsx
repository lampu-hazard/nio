import { api } from '@/lib/api';
import type { Panel } from '@/lib/types';
import { PanelCard } from '@/components/dashboard/PanelCard';

export default async function GuildDashboardPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const panels = await api<{ ok: true; panels: Panel[] }>(`/guilds/${guildId}/panels`).catch(() => ({ ok: true as const, panels: [] }));
  return (
    <main className="px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px]">
        {/* Compact Control Panel Action Bar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight text-[var(--text)]">Server Panels</h2>
                <span className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-xs font-semibold text-[var(--muted)]">
                  {panels.panels.length} active
                </span>
              </div>
              <p className="text-xs text-[var(--muted)]">Self-roles, rules, announcements, and custom embeds.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href={`/dashboard/${guildId}/plugins`} className="btn text-xs font-semibold py-1.5 px-3">
              Plugins →
            </a>
            <a href={`/dashboard/${guildId}/panels/new`} className="btn btn-primary text-xs font-bold py-1.5 px-3.5">
              ＋ Create panel
            </a>
          </div>
        </div>

        {/* Panels Grid */}
        <section>
          <div className="grid gap-3 sm:grid-cols-2">
            {panels.panels.map((panel) => <PanelCard key={panel.id} guildId={guildId} panel={panel} />)}
            {!panels.panels.length && (
              <div className="card col-span-full p-8 text-center sm:p-10">
                <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-[var(--surface-muted)] text-lg text-[var(--brand)]">＋</div>
                <h4 className="mt-3 text-base font-bold text-[var(--text)]">No panels configured</h4>
                <p className="mt-1 text-xs text-[var(--muted)]">Create your first panel to deploy interactive menus directly to your Discord channels.</p>
                <a href={`/dashboard/${guildId}/panels/new`} className="btn btn-primary mt-4 py-2 px-4 text-xs font-bold">
                  Create your first panel
                </a>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
