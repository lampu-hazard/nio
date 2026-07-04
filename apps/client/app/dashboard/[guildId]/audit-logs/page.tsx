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

export default async function AuditLogsPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;

  const data = await api<{ ok: boolean; auditLogs: AuditLogEntry[] }>(`/guilds/${guildId}/audit-logs`)
    .catch(() => ({ ok: false, auditLogs: [] }));

  return (
    <main className="px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">Audit</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">Audit Logs</h1>
          <p className="mt-1 text-zinc-500 dark:text-zinc-400">Chronological history of dashboard updates and panel actions.</p>
        </div>

        <DashboardNav guildId={guildId} activeTab="audit-logs" />

        <div className="card overflow-hidden">
          <div className="p-6">
            {!data.auditLogs || data.auditLogs.length === 0 ? (
              <div className="py-10 text-center text-zinc-500 dark:text-zinc-400">
                No activity recorded for this server yet.
              </div>
            ) : (
              <div className="flow-root">
                <ul className="-my-6 divide-y divide-zinc-200 dark:divide-zinc-800">
                  {data.auditLogs.map((log) => (
                    <li key={log.id} className="py-5">
                      <div className="flex items-center gap-4">
                        <img className="h-10 w-10 shrink-0 rounded-full bg-zinc-100 dark:bg-zinc-900" src={getUserAvatar(log.user)} alt="" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                            {log.user.globalName || log.user.username}
                            <span className="font-normal text-zinc-500 dark:text-zinc-400"> @{log.user.username}</span>
                          </p>
                          <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300">
                            {formatActionMessage(log.action, log.metadata, log.panel?.name)}
                          </p>
                          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            {new Date(log.createdAt).toLocaleString('en-US', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </p>
                        </div>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${getActionBadgeStyle(log.action)}`}>
                          {log.action.replace('PANEL_', '')}
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
