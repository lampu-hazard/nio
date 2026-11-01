'use client';

import { FeatureSettingsForm } from './FeatureSettingsForm';
import { ChannelSelect } from './FeatureControls';

export function VoiceNotificationSettings({ guildId }: { guildId: string }) {
  return <FeatureSettingsForm guildId={guildId} feature="voice-notifications" title="Voice Notifications" description="Choose independent destinations for voice activity and level-up announcements.">{({ settings, setSettings, channels }) => <>
    <section className="dashboard-section"><h2>Voice activity</h2>
      <ChannelSelect label="Join, leave and move channel" value={settings.voiceNotificationChannelId} channels={channels} onChange={value => setSettings(previous => ({ ...previous, voiceNotificationChannelId: value }))} />
      <p className="text-[var(--muted)]">Plain embeds, without mentions. Example: Othinus joined voice General. Works independently of voice XP.</p>
    </section>
    <section className="dashboard-section"><h2>Level-up announcements</h2>
      <ChannelSelect label="Level-up channel" value={settings.voiceLevelUpChannelId} channels={channels} onChange={value => setSettings(previous => ({ ...previous, voiceLevelUpChannelId: value }))} />
      <p className="text-[var(--muted)]">Announce voice level increases, even without role rewards. Example: Othinus reached level 5. Destinations may be the same, different, or independently disabled.</p>
    </section>
  </>}</FeatureSettingsForm>;
}
