'use client';

import { FeatureSettingsForm } from './FeatureSettingsForm';
import { ChannelSelect } from './FeatureControls';

export function LoggingSettings({ guildId }: { guildId: string }) {
  return <FeatureSettingsForm guildId={guildId} feature="logging" title="Logging" description="Choose where the bot sends audit and deleted-message logs.">{({ settings, setSettings, channels }) => <section className="dashboard-section"><h2>Log destinations</h2>
    <ChannelSelect label="Audit log channel" value={settings.logChannelId} channels={channels} onChange={value => setSettings(previous => ({ ...previous, logChannelId: value }))} />
    <ChannelSelect label="Message deletion channel" value={settings.messageDeleteLogChannelId} channels={channels} onChange={value => setSettings(previous => ({ ...previous, messageDeleteLogChannelId: value }))} />
  </section>}</FeatureSettingsForm>;
}
