import { api } from '@/lib/api';
import { DashboardNav } from '@/components/dashboard/DashboardNav';

export default async function AnalyticsPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const data = await api<any>(`/guilds/${guildId}/analytics`).catch(() => ({ analytics: { adds: 0, removes: 0, total: 0, recent: [], topRoles: [] } }));
  const analytics = data.analytics;
  return (
    <main className="px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">Analytics</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">Role Activity</h1>
          <p className="mt-1 text-zinc-500 dark:text-zinc-400">View interactions and role assignment statistics.</p>
        </div>

        <DashboardNav guildId={guildId} activeTab="analytics" />

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="card p-6"><div className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Added</div><div className="mt-2 text-4xl font-bold text-zinc-950 dark:text-zinc-50">{analytics.adds}</div></div>
          <div className="card p-6"><div className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Removed</div><div className="mt-2 text-4xl font-bold text-zinc-950 dark:text-zinc-50">{analytics.removes}</div></div>
          <div className="card p-6"><div className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Total</div><div className="mt-2 text-4xl font-bold text-zinc-950 dark:text-zinc-50">{analytics.total}</div></div>
        </div>
      </div>
    </main>
  );
}
