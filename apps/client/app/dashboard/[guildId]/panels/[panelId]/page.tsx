import { api } from '@/lib/api';
import type { Panel } from '@/lib/types';
import { PanelEditorWorkspace } from '@/components/panel-editor/PanelEditorWorkspace';

export default async function EditPanelPage({ params }: { params: Promise<{ guildId: string; panelId: string }> }) {
  const { guildId, panelId } = await params;
  const [data, channelsData, rolesData] = await Promise.all([
    api<{ ok: true; panel: Panel }>(`/guilds/${guildId}/panels/${panelId}`),
    api<{ ok: true; channels: { id: string; name: string }[] }>(`/guilds/${guildId}/channels`).catch(() => ({ ok: true as const, channels: [] })),
    api<{ ok: true; roles: { id: string; name: string; color?: string; position: number; manageable: boolean }[] }>(`/guilds/${guildId}/roles`).catch(() => ({ ok: true as const, roles: [] }))
  ]);
  const panel = data.panel;
  const channel = channelsData.channels.find((item) => item.id === panel.channelId);
  const typeLabel = panel.type === 'RULES' ? 'Rules' : panel.type === 'ANNOUNCEMENT' ? 'Announcement' : 'Self Role';

  return (
    <main className="px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1520px] space-y-4">
        {/* Compact Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-2.5">
          <div className="flex items-center gap-3">
            <a href={`/dashboard/${guildId}`} className="text-xs font-semibold text-[var(--muted)] transition-colors hover:text-[var(--text)]">
              ← Panels
            </a>
            <span className="text-[var(--border)]">/</span>
            <h2 className="text-sm font-bold tracking-tight text-[var(--text)]">{panel.name}</h2>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              panel.status === 'PUBLISHED'
                ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                : 'bg-[var(--surface)] text-[var(--muted)] border border-[var(--border)]'
            }`}>
              {panel.status === 'PUBLISHED' ? 'Live' : 'Draft'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-xs font-semibold text-[var(--muted)]">
              {typeLabel}
            </span>
            <span className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-xs font-semibold text-[var(--muted)]">
              {channel ? `#${channel.name}` : 'No channel'}
            </span>
          </div>
        </div>

        <PanelEditorWorkspace guildId={guildId} panel={panel} channels={channelsData.channels} availableRoles={rolesData.roles} />
      </div>
    </main>
  );
}
