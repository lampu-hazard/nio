import { api } from '@/lib/api';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { TradingViewChart } from '@/components/dashboard/TradingViewChart';
import { CustomPieChart } from '@/components/dashboard/CustomPieChart';

type RoleLog = {
  id: string;
  guildId: string;
  userId: string;
  roleId: string;
  action: 'ADD' | 'REMOVE';
  createdAt: string;
  username?: string;
  roleName?: string;
};

type AnalyticsData = {
  analytics: {
    adds: number;
    removes: number;
    total: number;
    recent: RoleLog[];
    topRoles: { roleId: string; _count: { roleId: number } }[];
  };
};

type ChartDataResponse = {
  history: { time: string; messages: number; voice: number }[];
  pieData: { name: string; value: number; roleId: string }[];
};

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { guildId } = await params;
  const { days = '7' } = await searchParams;

  // Load basic stats (passing selected days window) + chart data in parallel
  const [statsData, chartData] = await Promise.all([
    api<AnalyticsData>(`/guilds/${guildId}/analytics?days=${days}`).catch(() => ({
      analytics: { adds: 0, removes: 0, total: 0, recent: [], topRoles: [] },
    })),
    api<ChartDataResponse>(`/guilds/${guildId}/analytics/chart-data`).catch(() => ({
      history: [],
      pieData: [],
    })),
  ]);

  const { analytics } = statsData;

  // Format data for TradingView Lightweight charts
  const messageData = chartData.history.map((h) => ({
    time: h.time,
    value: h.messages,
  }));

  const voiceData = chartData.history.map((h) => ({
    time: h.time,
    value: h.voice, // in minutes
  }));

  return (
    <main className="px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Analytics</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--text)]">Server Insights</h1>
            <p className="mt-1 text-[var(--muted)]">Tinjau grafik keaktifan server, durasi voice session, dan aktivitas role.</p>
          </div>

          {/* Timeframe Filter (applies to both stats & chart) */}
          <div className="flex gap-1.5 justify-end">
            {[
              { id: '7', label: '7 Hari' },
              { id: '30', label: '30 Hari' },
              { id: 'all', label: 'Semua Waktu' },
            ].map((d) => (
              <a
                key={d.id}
                href={`?days=${d.id}`}
                className={`btn px-3.5 py-2 text-xs rounded-lg font-bold border transition-all ${
                  days === d.id
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-500/5'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--panel-strong)] border-transparent'
                }`}
              >
                {d.label}
              </a>
            ))}
          </div>
        </div>

        <DashboardNav guildId={guildId} activeTab="analytics" />

        {/* Info Cards */}
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="card p-6 border border-[var(--border)] bg-[var(--panel)]">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Role Added Log</div>
            <div className="mt-2 text-4xl font-extrabold text-[var(--text)]">+{analytics.adds}</div>
          </div>
          <div className="card p-6 border border-[var(--border)] bg-[var(--panel)]">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Role Removed Log</div>
            <div className="mt-2 text-4xl font-extrabold text-[var(--text)]">-{analytics.removes}</div>
          </div>
          <div className="card p-6 border border-[var(--border)] bg-[var(--panel)]">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Total Role Operations</div>
            <div className="mt-2 text-4xl font-extrabold text-[var(--text)]">{analytics.total}</div>
          </div>
        </div>

        {/* Interactive Charts Section */}
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <TradingViewChart
            data={messageData}
            title="Keaktifan Chat (Jumlah Pesan / Hari)"
            color="#6366f1"
          />
          <TradingViewChart
            data={voiceData}
            title="Keaktifan Voice (Durasi Voice / Menit / Hari)"
            color="#a855f7"
          />
        </div>

        {/* Pie Chart & Recent Logs */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_420px]">
          <div className="card p-6 border border-[var(--border)] bg-[var(--panel)]">
            <h3 className="text-sm font-bold tracking-tight text-[var(--text)] mb-4">Riwayat Aktivitas Role Terkini</h3>
            {analytics.recent.length === 0 ? (
              <div className="py-12 text-center text-xs text-[var(--muted)]">Belum ada log operasi role tercatat.</div>
            ) : (
              <div className="flow-root">
                <ul className="-my-5 divide-y divide-[var(--border)]">
                  {analytics.recent.map((log) => (
                    <li key={log.id} className="py-4">
                      <div className="flex items-center space-x-4">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-[var(--text)]">
                            @{log.username || `User#${log.userId.slice(0, 4)}`}
                          </p>
                          <p className="truncate text-xs text-[var(--muted)]">
                            Role: <span className="font-semibold text-[var(--text-secondary)]">{log.roleName || `Role#${log.roleId.slice(0, 4)}`}</span>
                          </p>
                        </div>
                        <div>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${
                              log.action === 'ADD'
                                ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                                : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                            }`}
                          >
                            {log.action === 'ADD' ? 'Added' : 'Removed'}
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <CustomPieChart
            data={chartData.pieData}
            title="Distribusi Penambahan Role Terbanyak (Top 5)"
          />
        </div>
      </div>
    </main>
  );
}
