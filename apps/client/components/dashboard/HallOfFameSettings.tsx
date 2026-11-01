'use client';

import { FeatureSettingsForm } from './FeatureSettingsForm';
import { ChannelSelect, Toggle } from './FeatureControls';

export function HallOfFameSettings({ guildId }: { guildId: string }) {
  return <FeatureSettingsForm guildId={guildId} feature="hall-of-fame" title="Hall of Fame" description="Mirror messages that reach the star reaction threshold to a showcase channel.">{({ settings, setSettings, channels }) => <section className="dashboard-section"><h2>Starboard</h2>
    <Toggle label="Enable Hall of Fame" checked={settings.hallOfFameEnabled} onChange={checked => setSettings(previous => ({ ...previous, hallOfFameEnabled: checked }))} />
    <div className="mt-5"><ChannelSelect label="Showcase channel" value={settings.hallOfFameChannelId} channels={channels} onChange={value => setSettings(previous => ({ ...previous, hallOfFameChannelId: value }))} /></div>
    <label className="dashboard-field"><span className="field-label">Reaction threshold</span><input type="number" className="input" required min={1} max={100} step={1} value={Number.isNaN(settings.hallOfFameThreshold) ? '' : settings.hallOfFameThreshold} onChange={event => setSettings(previous => ({ ...previous, hallOfFameThreshold: event.target.valueAsNumber }))} /><small>Select a channel before enabling Hall of Fame.</small></label>
  </section>}</FeatureSettingsForm>;
}
