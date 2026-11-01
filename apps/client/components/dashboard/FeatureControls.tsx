'use client';

import type { ChannelOption } from '@/lib/feature-settings';

export function Toggle({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="dashboard-toggle"><span><span className="block font-medium">{label}</span>{description && <small className="block text-[var(--muted)]">{description}</small>}</span><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} /></label>;
}

export function ChannelSelect({ label, value, channels, onChange }: { label: string; value: string | null; channels: ChannelOption[]; onChange: (value: string | null) => void }) {
  return <label className="dashboard-field"><span className="field-label">{label}</span><select className="input" value={value || ''} onChange={event => onChange(event.target.value || null)}><option value="">Disabled</option>{value && !channels.some(channel => channel.id === value) && <option value={value}>Unavailable channel ({value}) — replace or disable</option>}{channels.map(channel => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}</select></label>;
}
