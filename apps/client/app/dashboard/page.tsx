import { api } from '@/lib/api';
import type { GuildSummary } from '@/lib/types';
import { GuildCard } from '@/components/dashboard/GuildCard';

export default async function DashboardPage() {
  const data = await api<{ ok: true; guilds: GuildSummary[] }>('/guilds').catch(() => ({ ok: true as const, guilds: [] }));
  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-[var(--text)] sm:text-2xl">Server Control Center</h1>
              <span className="rounded-full border border-[var(--border)] bg-[var(--panel-strong)] px-2.5 py-0.5 text-xs font-semibold text-[var(--muted)]">
                {data.guilds.length} {data.guilds.length === 1 ? 'server' : 'servers'}
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">Select a server to manage panels, plugins, moderation, and insights.</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--ok)]" />
            <span>Permissions verified via Discord</span>
          </div>
        </div>

        <section>
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {data.guilds.map((guild) => <GuildCard key={guild.id} guild={guild} />)}
            {!data.guilds.length && (
              <div className="card col-span-full p-8 text-center sm:p-10">
                <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-[var(--surface-muted)] text-lg text-[var(--brand)]">◎</div>
                <h3 className="mt-3 text-base font-bold text-[var(--text)]">No manageable servers found</h3>
                <p className="mt-1 text-xs text-[var(--muted)]">Ensure your Discord account has administrator or server management permissions.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
