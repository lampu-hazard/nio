import { api } from '@/lib/api';
import type { GuildSummary } from '@/lib/types';
import { GuildCard } from '@/components/dashboard/GuildCard';

export default async function DashboardPage() {
  const data = await api<{ ok: true; guilds: GuildSummary[] }>('/guilds').catch(() => ({ ok: true as const, guilds: [] }));
  return (
    <main className="min-h-screen px-4 py-10 sm:px-7 lg:px-10 lg:py-14">
      <div className="mx-auto max-w-[1440px]">
        <section className="relative isolate overflow-hidden rounded-[30px] border border-[var(--border)] bg-[var(--panel-strong)] p-7 shadow-sm sm:p-11">
          <div className="pointer-events-none absolute -right-16 -top-32 -z-10 h-96 w-96 rounded-full bg-[var(--brand)] opacity-[0.08] blur-3xl" />
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--brand)]">Nio · Server management</p>
          <h1 className="mt-4 max-w-2xl text-3xl font-bold tracking-tight text-[var(--text)] sm:text-5xl">Your servers, all in one place.</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--muted)]">Choose a server to manage its automations, community tools, and insights.</p>
          <div className="mt-7 flex flex-wrap gap-3 text-xs font-semibold text-[var(--text-secondary)]">
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2">{data.guilds.length} manageable {data.guilds.length === 1 ? 'server' : 'servers'}</span>
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2">Permissions verified by Discord</span>
          </div>
        </section>
        <section className="mt-9">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Workspace</p><h2 className="mt-1 text-xl font-bold text-[var(--text)]">Select a server</h2></div></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.guilds.map((guild) => <GuildCard key={guild.id} guild={guild} />)}
            {!data.guilds.length && <div className="card p-8 sm:p-10"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--surface-muted)] text-xl text-[var(--brand)]">◎</div><h3 className="mt-4 text-lg font-bold text-[var(--text)]">No manageable servers found</h3><p className="mt-1 max-w-lg text-sm leading-6 text-[var(--muted)]">Log in and connect a Discord server where you have permission to manage it.</p></div>}
          </div>
        </section>
      </div>
    </main>
  );
}
