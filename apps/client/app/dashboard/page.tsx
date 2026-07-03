import { api } from '@/lib/api';
import type { GuildSummary } from '@/lib/types';
import { GuildCard } from '@/components/dashboard/GuildCard';

export default async function DashboardPage() {
  const data = await api<{ ok: true; guilds: GuildSummary[] }>('/guilds').catch(() => ({ ok: true as const, guilds: [] }));
  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-4xl font-black">Select a server</h1>
        <p className="mt-2 text-slate-400">Only manageable guilds are shown.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.guilds.map((guild) => <GuildCard key={guild.id} guild={guild} />)}
          {!data.guilds.length && <div className="card p-8 text-slate-400">Login dulu atau belum ada guild yang bisa kamu manage.</div>}
        </div>
      </div>
    </main>
  );
}
