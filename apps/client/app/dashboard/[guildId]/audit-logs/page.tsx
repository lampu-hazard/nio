import { api } from '@/lib/api';

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
    <main className="px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px] space-y-4">
        {/* Compact Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-2.5">
          <div>
            <h2 className="text-sm font-bold tracking-tight text-[var(--text)]">Audit Logs</h2>
            <p className="text-xs text-[var(--muted)]">Chronological history of dashboard updates and panel actions.</p>
          </div>
          <span className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-xs font-semibold text-[var(--muted)]">
            {data.auditLogs?.length || 0} events
          </span>
        </div>

        {/* Compact Filters Bar */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5">
          <form method="GET" className="flex flex-wrap items-center gap-2 text-xs">
            <input
              type="text"
              id="userId"
              name="userId"
              defaultValue={userId}
              placeholder="Filter by User ID..."
              className="input py-1 text-xs flex-1 min-w-[180px]"
            />

            <select
              id="action"
              name="action"
              defaultValue={action}
              className="input py-1 text-xs w-40"
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

            <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--panel)] text-[var(--text-secondary)] cursor-pointer text-xs">
              <input
                type="checkbox"
                name="excludeSystem"
                value="true"
                defaultChecked={excludeSystem === 'true'}
                className="h-3.5 w-3.5 rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span>Hide System</span>
            </label>

            <button
              type="submit"
              className="btn btn-primary py-1 px-3 text-xs font-bold"
            >
              Filter
            </button>
            {(userId || excludeSystem === 'true' || action) && (
              <a
                href="?"
                className="btn py-1 px-2.5 text-xs font-semibold text-[var(--muted)] hover:text-[var(--text)]"
              >
                Reset
              </a>
            )}
          </form>
        </div>

        {/* Audit Log Entries List */}
        <div className="card overflow-hidden">
          {!data.auditLogs || data.auditLogs.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--muted)]">
              No activity matches your filters.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[580px]">
              <ul className="divide-y divide-[var(--border)]">
                {data.auditLogs.map((log) => (
                  <li key={log.id} className="py-2.5 px-3.5 hover:bg-[var(--surface)]/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <img className="h-7 w-7 shrink-0 rounded-full bg-[var(--surface-muted)] border border-[var(--border)]" src={getUserAvatar(log.user)} alt="" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-xs font-bold text-[var(--text)]">
                            {log.user.globalName || log.user.username}
                          </span>
                          <span className="truncate text-[10px] text-[var(--muted)]">@{log.user.username}</span>
                          <span className="text-[10px] text-[var(--muted)] ml-auto whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleString('en-US', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] truncate">
                          {formatActionMessage(log.action, log.metadata, log.panel?.name)}
                        </p>
                      </div>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shrink-0 ${getActionBadgeStyle(log.action)}`}>
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
    </main>
  );
}
