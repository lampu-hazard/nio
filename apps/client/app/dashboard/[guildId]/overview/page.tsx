import Link from 'next/link';
import { api } from '@/lib/api';
import { dashboardNavGroups } from '@/lib/dashboard-navigation';
import { featureStatuses, type GuildSettings } from '@/lib/feature-settings';

export default async function OverviewPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  let settings: GuildSettings | null = null;
  try {
    const response = await api<{ ok: boolean; settings: GuildSettings }>(`/guilds/${guildId}/settings`);
    if (response.ok) settings = response.settings;
  } catch { /* Render unavailable rather than disabled when the API cannot be reached. */ }
  const items = dashboardNavGroups.flatMap(group => group.items);
  return <main className="dashboard-page"><h1>Overview</h1><p className="dashboard-description">Feature configuration for this server. Status reflects saved settings, not service health.</p>
    {!settings && <div className="dashboard-notice" role="alert">Configuration is unavailable. <a className="underline" href={`/dashboard/${guildId}/overview`}>Retry</a></div>}
    <section className="dashboard-section"><h2>Feature configuration</h2><ul className="divide-y divide-[var(--border)]">{featureStatuses(settings).map(feature => {
      const item = items.find(item => item.key === feature.key)!;
      return <li key={feature.key} className="flex flex-wrap items-center justify-between gap-4 py-3"><Link className="flex min-h-11 items-center underline underline-offset-4" href={`/dashboard/${guildId}${item.path}`}>{item.label}</Link><span className="text-[var(--muted)] capitalize">{feature.status}</span></li>;
    })}</ul></section>
    <div className="dashboard-actions"><Link href={`/dashboard/${guildId}`} className="btn">Manage panels</Link><Link href={`/dashboard/${guildId}/settings`} className="btn">All settings</Link></div>
  </main>;
}
