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
    name: 'Server Rules',
    title: 'Server Rules',
    accentText: 'Please read before participating',
    description: '**1. BASIC**\n• Hormati semua member dan staff.\n• Dilarang spam, toxic, SARA, scam, phishing, atau konten berbahaya.\n\n**2. GENERAL**\n• Gunakan channel sesuai topik.\n• Ikuti arahan moderator.',
    type: 'RULES',
    mode: 'BUTTONS',
    style: 'PREMIUM',
    color: '#ff2f7d',
    maxRoles: 0,
    status: 'DRAFT',
    roles: [],
  },
  SELF_ROLE: {
    id: 'preview',
    guildId: 'preview',
    name: 'Self Roles',
    title: '✦ Self Roles',
    accentText: 'Customize your profile',
    description: 'Pilih role di bawah untuk mengatur profil kamu.',
    type: 'SELF_ROLE',
    mode: 'BUTTONS',
    style: 'PREMIUM',
    color: '#5865F2',
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
    name: 'Announcement',
    title: 'Announcement',
    accentText: 'Official server update',
    description: '**Update baru!**\n\nTulis pengumuman server kamu di sini. Kamu bisa pakai banner, thumbnail, dan markdown Discord.',
    type: 'ANNOUNCEMENT',
    mode: 'BUTTONS',
    style: 'COLORFUL',
    color: '#34d399',
    maxRoles: 0,
    status: 'DRAFT',
    roles: [],
  },
};

export function NewPanelWizard({ guildId, channels }: { guildId: string; channels: Channel[] }) {
  const [selectedType, setSelectedType] = useState<PanelType>('RULES');
  const [previewPanel, setPreviewPanel] = useState<Panel>(PREVIEW_BY_TYPE.RULES);

  function selectType(type: PanelType) {
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
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.12fr)_minmax(380px,.88fr)]">
        <PanelForm key={selectedType} guildId={guildId} panel={null} channels={channels} initialValues={initialValues} onPreviewChange={(draft) => setPreviewPanel((current) => ({ ...current, ...templatePanel, ...draft }))} />
        <EmbedPreview panel={previewPanel} />
      </div>
    </div>
  );
}
