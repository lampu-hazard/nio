import { api } from '@/lib/api';
import type { GuildSummary } from '@/lib/types';
import { GuildCard } from '@/components/dashboard/GuildCard';

export default async function DashboardPage() {
  let guilds: GuildSummary[] | null = null;
  try {
    const response = await api<{ ok: boolean; guilds: GuildSummary[] }>('/guilds');
    if (response.ok && Array.isArray(response.guilds)) guilds = response.guilds;
  } catch { /* A failed request is not an empty server list. */ }
  return <main className="dashboard-page dashboard-page--wide"><header className="mb-8 border-b border-[var(--border)] pb-6"><a className="dashboard-wordmark !px-0" href="/">nio</a><h1>Servers</h1><p className="dashboard-description">Select a server to manage.</p>{guilds && <p className="text-[var(--muted)]">{guilds.length} manageable {guilds.length === 1 ? 'server' : 'servers'}</p>}</header>
    {guilds === null ? <div role="alert" className="dashboard-notice">Could not load your servers. <a href="/dashboard" className="underline">Retry</a></div> : guilds.length ? <section aria-label="Manageable servers" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{guilds.map(guild => <GuildCard key={guild.id} guild={guild} />)}</section> : <section className="dashboard-section"><h2>No manageable servers</h2><p className="text-[var(--muted)]">Your Discord account needs administrator or server management permissions.</p></section>}
  </main>;
}
