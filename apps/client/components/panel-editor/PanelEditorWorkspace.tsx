'use client';

import { useState } from 'react';
import type { Panel } from '@/lib/types';
import { PanelForm } from './PanelForm';
import { RoleOptionList } from './RoleOptionList';
import { EmbedPreview } from './EmbedPreview';

type Channel = { id: string; name: string };
type DiscordRole = { id: string; name: string; color?: string; position: number; manageable: boolean };

export function PanelEditorWorkspace({
  guildId,
  panel,
  channels,
  availableRoles,
}: {
  guildId: string;
  panel: Panel;
  channels: Channel[];
  availableRoles: DiscordRole[];
}) {
  const [previewPanel, setPreviewPanel] = useState<Panel>(panel);

  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.05fr)_440px]">
      <div className="space-y-5">
        <PanelForm guildId={guildId} panel={panel} channels={channels} onPreviewChange={(draft) => setPreviewPanel((current) => ({ ...current, ...draft }))} />
        <RoleOptionList guildId={guildId} panel={previewPanel} availableRoles={availableRoles} />
      </div>
      <EmbedPreview panel={previewPanel} />
    </div>
  );
}
