import { api } from '@/lib/api';
import { DashboardNav } from '@/components/dashboard/DashboardNav';

export default async function AnalyticsPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const data = await api<any>(`/guilds/${guildId}/analytics`).catch(() => ({ analytics: { adds: 0, removes: 0, total: 0, recent: [], topRoles: [] } }));
  const analytics = data.analytics;
  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <h1 className="text-4xl font-black">Analytics</h1>
          <p className="mt-1 text-slate-400">View interactions and role stats.</p>
        </div>

        <DashboardNav guildId={guildId} activeTab="analytics" />

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="card p-6"><div className="text-slate-400">Added</div><div className="text-4xl font-black text-emerald-300">{analytics.adds}</div></div>
          <div className="card p-6"><div className="text-slate-400">Removed</div><div className="text-4xl font-black text-red-300">{analytics.removes}</div></div>
          <div className="card p-6"><div className="text-slate-400">Total</div><div className="text-4xl font-black text-indigo-300">{analytics.total}</div></div>
        </div>
      </div>
    </main>
  );
}
