'use client';

import { useMemo, useState } from 'react';
import type { Panel } from '@/lib/types';
import { PanelForm } from './PanelForm';
import { PanelTypePicker } from './PanelTypePicker';
import { EmbedPreview } from './EmbedPreview';

type Channel = { id: string; name: string };

type PanelType = Panel['type'];

const PREVIEW_BY_TYPE: Record<PanelType, Panel> = {
  RULES: {
    id: 'preview',
    guildId: 'preview',
    revision: 0,
    name: 'Server Rules',
    title: 'Server Rules',
    accentText: 'Please read before participating',
    description: '**1. BASIC**\n• Respect all members and staff.\n• No spam, toxicity, hate speech, scams, phishing, or harmful links.\n\n**2. GENERAL**\n• Use channels according to their topics.\n• Follow moderator instructions.',
    type: 'RULES',
    mode: 'BUTTONS',
    style: 'PREMIUM',
    color: '#18181B',
    maxRoles: 0,
    status: 'DRAFT',
    roles: [],
  },
  SELF_ROLE: {
    id: 'preview',
    guildId: 'preview',
    revision: 0,
    name: 'Self Roles',
    title: 'Self Roles',
    accentText: 'Customize your profile',
    description: 'Select roles below to customize your profile.',
    type: 'SELF_ROLE',
    mode: 'BUTTONS',
    style: 'PREMIUM',
    color: '#18181B',
    maxRoles: 0,
    status: 'DRAFT',
    roles: [
      { id: 'gamer', roleId: 'gamer', label: 'Gamer', emoji: '🎮', buttonStyle: 'PRIMARY', position: 0 },
      { id: 'artist', roleId: 'artist', label: 'Artist', emoji: '🎨', buttonStyle: 'SECONDARY', position: 1 },
    ],
  },
  ANNOUNCEMENT: {
    id: 'preview',
    guildId: 'preview',
    revision: 0,
    name: 'Announcement',
    title: 'Announcement',
    accentText: 'Official server update',
    description: '**New Update!**\n\nWrite your announcement here. You can customize the banner, thumbnail, and Discord markdown formatting.',
    type: 'ANNOUNCEMENT',
    mode: 'BUTTONS',
    style: 'MINIMAL',
    color: '#18181B',
    maxRoles: 0,
    status: 'DRAFT',
    roles: [],
  },
  LEADERBOARD: {
    id: 'preview',
    guildId: 'preview',
    revision: 0,
    name: 'Leaderboard Panel',
    title: '✦ Server Leaderboard',
    accentText: 'Most active members',
    description: 'Pesan ini akan otomatis ter-update setiap 5 menit dengan data keaktifan member server terbaru.',
    type: 'LEADERBOARD',
    mode: 'BUTTONS',
    style: 'PREMIUM',
    color: '#18181B',
    maxRoles: 0,
    status: 'DRAFT',
    roles: [],
  },
};

export function NewPanelWizard({ guildId, channels }: { guildId: string; channels: Channel[] }) {
  const [selectedType, setSelectedType] = useState<PanelType>('RULES');
  const [previewPanel, setPreviewPanel] = useState<Panel>(PREVIEW_BY_TYPE.RULES);
  const [dirty, setDirty] = useState(false);

  function selectType(type: PanelType) {
    if (type === selectedType || (dirty && !window.confirm('Discard unsaved panel changes?'))) return;
    setDirty(false);
    setSelectedType(type);
    setPreviewPanel(PREVIEW_BY_TYPE[type]);
  }

  const templatePanel = useMemo(() => ({ ...PREVIEW_BY_TYPE[selectedType], id: '', guildId }), [selectedType, guildId]);
  const initialValues = useMemo(() => ({
    name: templatePanel.name,
    title: templatePanel.title,
    accentText: templatePanel.accentText || '',
    description: templatePanel.description || '',
    type: templatePanel.type,
    mode: templatePanel.mode,
    style: templatePanel.style,
    color: templatePanel.color,
    imageUrl: templatePanel.imageUrl || '',
    thumbnailUrl: templatePanel.thumbnailUrl || '',
  }), [templatePanel]);

  return (
    <div className="space-y-6">
      <PanelTypePicker selected={selectedType} onSelect={selectType} />
      <div className="space-y-6">
        <PanelForm key={selectedType} guildId={guildId} onDirtyChange={setDirty} panel={null} channels={channels} initialValues={initialValues} onPreviewChange={(draft) => setPreviewPanel((current) => ({ ...current, ...templatePanel, ...draft }))} />
        <EmbedPreview panel={previewPanel} />
      </div>
    </div>
  );
}
