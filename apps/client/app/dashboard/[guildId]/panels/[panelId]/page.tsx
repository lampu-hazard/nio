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
    <main className="px-4 py-6 sm:px-7 sm:py-8 lg:px-10">
      <div className="mx-auto max-w-[1440px] space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <a href={`/dashboard/${guildId}`} className="w-fit text-sm font-semibold text-[var(--muted)] transition-colors hover:text-[var(--text)]">Back to server</a>
          <a href={`/dashboard/${guildId}`} className="btn w-fit">Dashboard</a>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`badge ${panel.status === 'PUBLISHED' ? 'badge-live' : ''}`}>{panel.status === 'PUBLISHED' ? 'Live panel' : 'Draft panel'}</span>
          <span className="badge">{typeLabel}</span>
          <span className="badge">{panel.roles.length} roles</span>
          <span className="badge">{channel ? `#${channel.name}` : 'No channel selected'}</span>
        </div>
        <p className="max-w-3xl text-sm leading-6 text-[var(--muted)]">Edit panel identity, content, role components, and Discord publishing state.</p>

        <PanelEditorWorkspace guildId={guildId} panel={panel} channels={channelsData.channels} availableRoles={rolesData.roles} />
      </div>
    </main>
  );
}
