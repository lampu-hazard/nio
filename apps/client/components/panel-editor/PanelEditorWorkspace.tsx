'use client';

import { useEffect, useState } from 'react';
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
  const [savedPanel, setSavedPanel] = useState(panel);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setSavedPanel(panel);
    setPreviewPanel(current => dirty ? { ...current, roles: panel.roles, revision: panel.revision } : panel);
  }, [panel]);

  return (
    <div className="space-y-6">
      <div className="space-y-5">
        <PanelForm guildId={guildId} panel={savedPanel} channels={channels} onDirtyChange={setDirty} onSaved={next => { setSavedPanel(next); setPreviewPanel(next); }} onPreviewChange={(draft) => setPreviewPanel((current) => ({ ...current, ...draft }))} />
        {previewPanel.type !== 'LEADERBOARD' && (
          <RoleOptionList guildId={guildId} panel={savedPanel} availableRoles={availableRoles} publishDisabled={dirty} />
        )}
      </div>
      <EmbedPreview panel={previewPanel} />
    </div>
  );
}
