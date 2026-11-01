'use client';

import { FeatureSettingsForm } from './FeatureSettingsForm';
import { Toggle } from './FeatureControls';

export function VoiceXpSettings({ guildId }: { guildId: string }) {
  return <FeatureSettingsForm guildId={guildId} feature="voice-xp" title="Voice XP & Rewards" description="Award XP for eligible time in voice and assign roles at selected levels.">{({ settings, setSettings, roles }) => <>
    <section className="dashboard-section"><h2>Voice XP</h2>
      <Toggle label="Enable voice XP" checked={settings.voiceXpEnabled} onChange={checked => setSettings(previous => ({ ...previous, voiceXpEnabled: checked }))} />
      <label className="dashboard-field mt-5"><span className="field-label">XP per minute</span><input className="input" type="number" required min={1} max={1000} step={1} value={Number.isNaN(settings.voiceXpPerMinute) ? '' : settings.voiceXpPerMinute} onChange={event => setSettings(previous => ({ ...previous, voiceXpPerMinute: event.target.valueAsNumber }))} /></label>
      <p className="text-[var(--muted)]">At least two eligible people must be in ordinary voice. Bots, AFK, stage, muted and deafened members do not earn XP.</p>
    </section>
    <section className="dashboard-section"><h2>Level rewards</h2><p className="mb-5 text-[var(--muted)]">Level 1 requires 100 XP; level 2 requires 400 XP. Each level requires 100 × level² total XP. Earlier reward roles are kept.</p>
      {settings.voiceXpRewards.map((reward, index) => <div key={index} className="dashboard-reward">
        <label><span className="field-label">Level {index + 1}</span><input className="input" type="number" min={1} max={10000} step={1} required value={Number.isNaN(reward.level) ? '' : reward.level} onChange={event => setSettings(previous => ({ ...previous, voiceXpRewards: previous.voiceXpRewards.map((row, i) => i === index ? { ...row, level: event.target.valueAsNumber } : row) }))} /></label>
        <label><span className="field-label">Reward role {index + 1}</span><select className="input" required value={reward.roleId} onChange={event => setSettings(previous => ({ ...previous, voiceXpRewards: previous.voiceXpRewards.map((row, i) => i === index ? { ...row, roleId: event.target.value } : row) }))}><option value="">Select role</option>
          {reward.roleId && !roles.some(role => role.id === reward.roleId) && <option value={reward.roleId}>Unavailable role ({reward.roleId}) — replace or remove</option>}
          {roles.map(role => <option key={role.id} value={role.id} disabled={role.id !== reward.roleId && (!role.manageable || settings.voiceXpRewards.some((row, i) => i !== index && row.roleId === role.id))}>{role.name}{!role.manageable ? ' (not assignable — replace or remove)' : ''}</option>)}
        </select></label>
        <button type="button" className="btn" aria-label={`Remove reward ${index + 1}`} onClick={() => setSettings(previous => ({ ...previous, voiceXpRewards: previous.voiceXpRewards.filter((_, i) => i !== index) }))}>Remove</button>
      </div>)}
      <button type="button" className="btn" disabled={settings.voiceXpRewards.length >= 50} onClick={() => setSettings(previous => ({ ...previous, voiceXpRewards: [...previous.voiceXpRewards, { level: Math.min(10000, Math.max(0, ...previous.voiceXpRewards.map(row => Number.isFinite(row.level) ? row.level : 0)) + 1), roleId: '' }] }))}>Add level reward</button>
      <p className="mt-4 text-[var(--muted)]">Up to 50 unique levels and roles. Roles must be below the bot’s highest role. Changes apply on future voice participation; existing roles are not removed.</p>
    </section>
  </>}</FeatureSettingsForm>;
}
