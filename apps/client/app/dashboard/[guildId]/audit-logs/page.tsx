import { api } from '@/lib/api';
import { DashboardNav } from '@/components/dashboard/DashboardNav';

type AuditLogEntry = {
  id: string;
  guildId: string;
  userId: string;
  action: string;
  metadata: any;
  createdAt: string;
  user: {
    id: string;
    username: string;
    globalName: string | null;
    avatar: string | null;
  };
  panel?: {
    id: string;
    name: string;
  } | null;
};

function formatActionMessage(action: string, metadata: any, panelName?: string) {
  const meta = metadata || {};
  switch (action) {
    case 'PANEL_CREATE':
      return `Created panel "${meta.name || panelName || 'Unknown'}"`;
    case 'PANEL_UPDATE':
      return `Updated settings for panel "${meta.name || panelName || 'Unknown'}"`;
    case 'PANEL_ARCHIVE':
      return `Archived panel "${meta.name || panelName || 'Unknown'}"`;
    case 'PANEL_PUBLISH':
      return `Published panel "${meta.name || panelName || 'Unknown'}" to Discord`;
    case 'PANEL_UNPUBLISH':
      return `Unpublished panel "${meta.name || panelName || 'Unknown'}" from Discord`;
    case 'PANEL_ROLE_ADD':
      return `Added role "${meta.label || 'Unknown'}" (ID: ${meta.roleId || 'Unknown'}) to panel`;
    case 'PANEL_ROLE_UPDATE':
      return `Updated role "${meta.label || 'Unknown'}" (ID: ${meta.roleId || 'Unknown'}) in panel`;
    case 'PANEL_ROLE_REMOVE':
      return `Removed role "${meta.label || 'Unknown'}" (ID: ${meta.roleId || 'Unknown'}) from panel`;
    case 'PANEL_ROLE_REORDER':
      return 'Reordered role items in panel';
    case 'SLOWMODE_LEVEL_CHANGED':
      return `Adjusted channel slowmode to ${meta.toLevel} (${meta.recommendedSeconds}s). Reason: ${meta.reason || 'None'}`;
    default:
      return `${action.replace(/_/g, ' ').toLowerCase()} action performed`;
  }
}

function getActionBadgeStyle(action: string) {
  if (action.includes('REMOVE') || action.includes('UNPUBLISH') || action.includes('ARCHIVE')) {
    return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300';
  }
  return 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300';
}

function getUserAvatar(user: AuditLogEntry['user']) {
  if (!user.avatar) return 'https://cdn.discordapp.com/embed/avatars/0.png';
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
}

export default async function AuditLogsPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ userId?: string; excludeSystem?: string; action?: string }>;
}) {
  const { guildId } = await params;
  const filters = await searchParams;

  const userId = filters.userId || '';
  const excludeSystem = filters.excludeSystem || 'false';
  const action = filters.action || '';

  // Build query path
  const queryParams = new URLSearchParams();
  if (userId) queryParams.set('userId', userId);
  if (excludeSystem) queryParams.set('excludeSystem', excludeSystem);
  if (action) queryParams.set('action', action);

  const data = await api<{ ok: boolean; auditLogs: AuditLogEntry[] }>(
    `/guilds/${guildId}/audit-logs?${queryParams.toString()}`
  ).catch(() => ({ ok: false, auditLogs: [] }));

  return (
    <main className="px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Audit</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--text)]">Audit Logs</h1>
          <p className="mt-1 text-[var(--muted)]">Chronological history of dashboard updates and panel actions.</p>
        </div>

        <DashboardNav guildId={guildId} activeTab="audit-logs" />

        {/* Advanced Filters Bar */}
        <div className="card p-5 mb-6 border border-[var(--border)] bg-[var(--panel)] backdrop-blur-md">
          <form method="GET" className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label htmlFor="userId" className="field-label">Filter by User ID</label>
              <input
                type="text"
                id="userId"
                name="userId"
                defaultValue={userId}
                placeholder="Discord User ID (e.g. 1514...)"
                className="input"
              />
            </div>

            <div className="min-w-[180px]">
              <label htmlFor="action" className="field-label">Action Type</label>
              <select
                id="action"
                name="action"
                defaultValue={action}
                className="input select-native"
                style={{ appearance: 'none', WebkitAppearance: 'none' }}
              >
                <option value="">All Actions</option>
                <option value="PANEL_CREATE">Panel Create</option>
                <option value="PANEL_UPDATE">Panel Update</option>
                <option value="PANEL_PUBLISH">Panel Publish</option>
                <option value="PANEL_UNPUBLISH">Panel Unpublish</option>
                <option value="PANEL_ARCHIVE">Panel Archive</option>
                <option value="PANEL_ROLE_ADD">Panel Role Add</option>
                <option value="PANEL_ROLE_REMOVE">Panel Role Remove</option>
                <option value="SLOWMODE_LEVEL_CHANGED">Slowmode Changed</option>
              </select>
            </div>

            <div className="flex items-center h-[46px] px-3 border border-[var(--border)] bg-[var(--panel-strong)] rounded-lg">
              <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  name="excludeSystem"
                  value="true"
                  defaultChecked={excludeSystem === 'true'}
                  className="rounded border-[var(--border)] text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-[var(--text-secondary)]">Hide System Actions</span>
              </label>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="btn bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2.5 rounded-lg border-transparent shadow-md transition-all cursor-pointer"
              >
                Apply Filters
              </button>
              {(userId || excludeSystem === 'true' || action) && (
                <a
                  href="?"
                  className="btn bg-[var(--panel-strong)] border-[var(--border)] text-[var(--text)] font-semibold px-4 py-2.5 rounded-lg hover:border-[var(--border-strong)] transition-all flex items-center justify-center"
                >
                  Reset
                </a>
              )}
            </div>
          </form>
        </div>

        {/* Audit Log Entries List */}
        <div className="card overflow-hidden">
          <div className="p-6">
            {!data.auditLogs || data.auditLogs.length === 0 ? (
              <div className="py-12 text-center text-[var(--muted)]">
                No activity matches your filters.
              </div>
            ) : (
              <div className="flow-root">
                <ul className="-my-6 divide-y divide-[var(--border)]">
                  {data.auditLogs.map((log) => (
                    <li key={log.id} className="py-5 transition-colors hover:bg-[var(--panel-strong)]/10 px-2 rounded-lg">
                      <div className="flex items-center gap-4">
                        <img className="h-10 w-10 shrink-0 rounded-full bg-[var(--surface-muted)] border border-[var(--border)]" src={getUserAvatar(log.user)} alt="" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-[var(--text)]">
                            {log.user.globalName || log.user.username}
                            <span className="font-normal text-[var(--muted)] text-xs"> @{log.user.username} ({log.userId})</span>
                          </p>
                          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                            {formatActionMessage(log.action, log.metadata, log.panel?.name)}
                          </p>
                          <p className="mt-1 text-xs text-[var(--muted)]">
                            {new Date(log.createdAt).toLocaleString('en-US', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </p>
                        </div>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${getActionBadgeStyle(log.action)}`}>
                          {log.action.replace('PANEL_', '').replace('LEVEL_CHANGED', 'SLOWMODE')}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
