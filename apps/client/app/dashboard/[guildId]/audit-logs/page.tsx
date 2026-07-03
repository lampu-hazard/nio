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
      return `Reordered role items in panel`;
    case 'SLOWMODE_LEVEL_CHANGED':
      return `Adjusted channel slowmode to ${meta.toLevel} (${meta.recommendedSeconds}s). Reason: ${meta.reason || 'None'}`;
    default:
      return `${action.replace(/_/g, ' ').toLowerCase()} action performed`;
  }
}

function getActionBadgeStyle(action: string) {
  if (action.includes('SLOWMODE')) {
    return 'border-amber-500/30 text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400';
  }
  if (action.includes('CREATE') || action.includes('PUBLISH') || action.includes('ADD')) {
    return 'border-emerald-500/30 text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400';
  }
  if (action.includes('ARCHIVE') || action.includes('REMOVE') || action.includes('UNPUBLISH')) {
    return 'border-rose-500/30 text-rose-600 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-400';
  }
  return 'border-blue-500/30 text-blue-600 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400';
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
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <h1 className="text-4xl font-black">Audit Logs</h1>
          <p className="mt-1 text-slate-400">Chronological history of dashboard updates and panel actions.</p>
        </div>

        <DashboardNav guildId={guildId} activeTab="audit-logs" />

        <div className="card overflow-hidden">
          <div className="p-6">
            {!data.auditLogs || data.auditLogs.length === 0 ? (
              <div className="text-center py-10 text-slate-400">
                Belum ada aktivitas tercatat untuk server ini.
              </div>
            ) : (
              <div className="flow-root">
                <ul className="-my-6 divide-y divide-white/10">
                  {data.auditLogs.map((log) => (
                    <li key={log.id} className="py-5">
                      <div className="flex items-center space-x-4">
                        <div className="flex-shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            className="h-10 w-10 rounded-full bg-slate-800"
                            src={getUserAvatar(log.user)}
                            alt=""
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-white truncate">
                            {log.user.globalName || log.user.username}
                            <span className="text-slate-400 font-normal"> @{log.user.username}</span>
                          </p>
                          <p className="text-sm text-slate-300 mt-0.5">
                            {formatActionMessage(log.action, log.metadata, log.panel?.name)}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            {new Date(log.createdAt).toLocaleString('id-ID', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </p>
                        </div>
                        <div>
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${getActionBadgeStyle(log.action)}`}>
                            {log.action.replace('PANEL_', '')}
                          </span>
                        </div>
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
