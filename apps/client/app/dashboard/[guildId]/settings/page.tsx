import Link from 'next/link';
import { dashboardNavGroups } from '@/lib/dashboard-navigation';

export default async function SettingsPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  return <main className="dashboard-page"><h1>Settings</h1><p className="dashboard-description">Each feature has its own configuration and save action.</p><div className="dashboard-grid">
    {dashboardNavGroups.filter(group => ['Community', 'Management', 'Tools'].includes(group.label)).map(group => <section key={group.label} className="dashboard-section"><h2>{group.label}</h2><ul>{group.items.map(item => <li key={item.key}><Link className="flex min-h-11 items-center text-[var(--text-secondary)] underline underline-offset-4" href={`/dashboard/${guildId}${item.path}`}>{item.label}</Link></li>)}</ul></section>)}
  </div></main>;
}
