'use client';

import { FeatureSettingsForm } from './FeatureSettingsForm';
import { Toggle } from './FeatureControls';

export function SlowmodeSettings({ guildId }: { guildId: string }) {
  return <FeatureSettingsForm guildId={guildId} feature="slowmode" title="Slowmode" description="Adjust channel slowmode automatically as message activity changes.">{({ settings, setSettings, channels }) => <>
    <section className="dashboard-section"><h2>Automatic slowmode</h2><Toggle label="Enable automatic slowmode" checked={settings.slowmodeEnabled} onChange={checked => setSettings(previous => ({ ...previous, slowmodeEnabled: checked }))} /></section>
    <section className="dashboard-section"><h2>Protected channels</h2>
      <p className="mb-4 text-[var(--muted)]">{settings.slowmodeChannels.length} selected</p>
      {[...channels, ...settings.slowmodeChannels.filter(id => !channels.some(channel => channel.id === id)).map(id => ({ id, name: `Unavailable channel (${id}) — clear to remove` }))].map(channel => <label key={channel.id} className="dashboard-toggle"><span>{channel.name}</span><input type="checkbox" checked={settings.slowmodeChannels.includes(channel.id)} onChange={event => setSettings(previous => ({ ...previous, slowmodeChannels: event.target.checked ? [...previous.slowmodeChannels, channel.id] : previous.slowmodeChannels.filter(id => id !== channel.id) }))} /></label>)}
      {!channels.length && !settings.slowmodeChannels.length && <p>No channels available.</p>}
    </section>
    <section className="dashboard-section"><h2>Intervals</h2><div className="dashboard-grid">
      {(['Quiet', 'Normal', 'Busy'] as const).map(label => {
        const field = `slowmodeInterval${label}` as const;
        return <label key={field} className="dashboard-field"><span className="field-label">{label} (seconds)</span><input className="input" type="number" required min={0} max={21600} step={1} value={Number.isNaN(settings[field]) ? '' : settings[field]} onChange={event => setSettings(previous => ({ ...previous, [field]: event.target.valueAsNumber }))} /></label>;
      })}
    </div><p className="text-[var(--muted)]">Use 0 seconds to remove slowmode at an activity level.</p></section>
  </>}</FeatureSettingsForm>;
}
