'use client';

import { useEffect, useState } from 'react';
import type { Panel } from '@/lib/types';
import { PanelForm } from './PanelForm';
import { RoleOptionList } from './RoleOptionList';
import { EmbedPreview } from './EmbedPreview';
import { PanelEditorNavigation, PanelEditorSection } from './PanelEditorNavigation';

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
  const [section, setSection] = useState('edit');
  useEffect(() => {
    setSavedPanel(panel);
    setPreviewPanel(current => dirty ? { ...current, roles: panel.roles, revision: panel.revision } : panel);
  }, [panel]);

  return (
    <div className="min-w-0 space-y-4">
      <PanelEditorNavigation label="Panel workspace" active={section} onChange={setSection} items={[
        { id: 'edit', label: 'Edit' },
        ...(previewPanel.type === 'SELF_ROLE' ? [{ id: 'roles', label: `Roles (${savedPanel.roles.length})` }] : []),
        { id: 'preview', label: 'Discord preview' },
      ]} />
      <PanelEditorSection id="edit" active={section}>
        <PanelForm guildId={guildId} panel={savedPanel} channels={channels} onDirtyChange={setDirty} onSaved={next => { setSavedPanel(next); setPreviewPanel(next); }} onPreviewChange={(draft) => setPreviewPanel((current) => ({ ...current, ...draft }))} />
      </PanelEditorSection>
      {previewPanel.type === 'SELF_ROLE' && <PanelEditorSection id="roles" active={section}>
        {dirty && <p className="notice mb-3">The design has unsaved changes. Save in Edit before publishing.</p>}
        <RoleOptionList guildId={guildId} panel={savedPanel} availableRoles={availableRoles} publishDisabled={dirty} />
      </PanelEditorSection>}
      <PanelEditorSection id="preview" active={section}>
        <p className="mb-3 text-sm text-[var(--muted)]">Estimated Discord layout{dirty ? ' using unsaved changes' : ''}. Use the server-rendered image preview in Edit to check Canvas output.</p>
        <EmbedPreview panel={previewPanel} />
      </PanelEditorSection>
    </div>
  );
}
