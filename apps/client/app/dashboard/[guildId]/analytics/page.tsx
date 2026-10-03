import { api } from '@/lib/api';
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
    <main className="px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px] space-y-4">
        {/* Compact Header & Timeframe Filter */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-2.5">
          <div>
            <h2 className="text-sm font-bold tracking-tight text-[var(--text)]">Server Analytics</h2>
            <p className="text-xs text-[var(--muted)]">Activity charts, voice session duration, and role logs.</p>
          </div>

          <div className="flex gap-1">
            {[
              { id: '7', label: '7D' },
              { id: '30', label: '30D' },
              { id: 'all', label: 'All' },
            ].map((d) => (
              <a
                key={d.id}
                href={`?days=${d.id}`}
                className={`btn px-2.5 py-1 text-xs rounded-md font-semibold transition-all ${
                  days === d.id
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10'
                    : 'text-[var(--muted)] hover:bg-[var(--panel-strong)] border-transparent'
                }`}
              >
                {d.label}
              </a>
            ))}
          </div>
        </div>

        {/* Compact Metrics Row */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="card p-3.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Role Added Log</div>
            <div className="mt-1 text-2xl font-black text-[var(--ok)]">+{analytics.adds}</div>
          </div>
          <div className="card p-3.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Role Removed Log</div>
            <div className="mt-1 text-2xl font-black text-[var(--danger)]">-{analytics.removes}</div>
          </div>
          <div className="card p-3.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Total Role Operations</div>
            <div className="mt-1 text-2xl font-black text-[var(--text)]">{analytics.total}</div>
          </div>
        </div>

        {/* Interactive Charts Section */}
        <div className="grid gap-3 lg:grid-cols-2">
          <TradingViewChart
            data={messageData}
            title="Chat Messages / Day"
            color="#6366f1"
          />
          <TradingViewChart
            data={voiceData}
            title="Voice Minutes / Day"
            color="#a855f7"
          />
        </div>

        {/* Pie Chart & Recent Logs */}
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
          <div className="card p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text)] mb-3">Recent Role Activity</h3>
            {analytics.recent.length === 0 ? (
              <div className="py-8 text-center text-xs text-[var(--muted)]">No role operations recorded.</div>
            ) : (
              <div className="flow-root max-h-[300px] overflow-y-auto">
                <ul className="divide-y divide-[var(--border)]">
                  {analytics.recent.map((log) => (
                    <li key={log.id} className="py-2.5">
                      <div className="flex items-center space-x-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-[var(--text)]">
                            @{log.username || `User#${log.userId.slice(0, 4)}`}
                          </p>
                          <p className="truncate text-[11px] text-[var(--muted)]">
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
