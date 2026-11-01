import Link from 'next/link';
import { api } from '@/lib/api';
import type { Panel } from '@/lib/types';
import { PanelCard } from '@/components/dashboard/PanelCard';

export default async function GuildDashboardPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  let panels: Panel[] | null = null;
  try {
    const response = await api<{ ok: boolean; panels: Panel[] }>(`/guilds/${guildId}/panels`);
    if (response.ok && Array.isArray(response.panels)) panels = response.panels;
  } catch { /* Preserve the distinction between unavailable and empty. */ }
  return <main className="dashboard-page dashboard-page--wide"><div className="flex flex-wrap items-start justify-between gap-5"><div><h1>Panels</h1><p className="dashboard-description">Self-roles, rules, announcements and custom embeds.</p></div><Link href={`/dashboard/${guildId}/panels/new`} className="btn btn-primary">Create panel</Link></div>
    {panels === null ? <div className="dashboard-notice" role="alert">Could not load panels. <a className="underline" href={`/dashboard/${guildId}`}>Retry</a></div> : panels.length ? <><p className="mb-5 text-[var(--muted)]">{panels.length} {panels.length === 1 ? 'panel' : 'panels'}</p><section aria-label="Panels" className="grid gap-4 xl:grid-cols-2">{panels.map(panel => <PanelCard key={panel.id} guildId={guildId} panel={panel} />)}</section></> : <section className="dashboard-section"><h2>No panels configured</h2><p className="text-[var(--muted)]">Create a panel to publish an interactive menu in a Discord channel.</p></section>}
  </main>;
}
