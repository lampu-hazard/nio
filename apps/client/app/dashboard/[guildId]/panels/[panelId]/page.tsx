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
    <main className="px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <a href={`/dashboard/${guildId}`} className="text-sm font-semibold text-zinc-500 transition-colors hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50">Back to server</a>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className={`badge ${panel.status === 'PUBLISHED' ? 'badge-live' : ''}`}>{panel.status === 'PUBLISHED' ? 'Live panel' : 'Draft panel'}</span>
              <span className="badge">{typeLabel}</span>
              <span className="badge">{panel.roles.length} roles</span>
              <span className="badge">{channel ? `#${channel.name}` : 'No channel selected'}</span>
            </div>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50 md:text-5xl">{panel.name}</h1>
            <p className="mt-3 max-w-3xl text-zinc-500 dark:text-zinc-400">Edit panel identity, content, role components, and Discord publishing state.</p>
          </div>
          <a href={`/dashboard/${guildId}`} className="btn">Dashboard</a>
        </div>

        <PanelEditorWorkspace guildId={guildId} panel={panel} channels={channelsData.channels} availableRoles={rolesData.roles} />
      </div>
    </main>
  );
}
