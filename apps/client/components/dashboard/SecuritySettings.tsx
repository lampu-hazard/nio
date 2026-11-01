'use client';

import { FeatureSettingsForm } from './FeatureSettingsForm';
import { Toggle } from './FeatureControls';

export function SecuritySettings({ guildId }: { guildId: string }) {
  return <FeatureSettingsForm guildId={guildId} feature="security" title="Security" description="Configure anomaly detection, phishing checks and enforcement.">{({ settings, setSettings }) => <>
    <section className="dashboard-section"><h2>Anomaly detection</h2><Toggle label="Enable anomaly detection" checked={settings.anomalyEnabled} onChange={checked => setSettings(previous => ({ ...previous, anomalyEnabled: checked }))} /></section>
    <section className="dashboard-section"><h2>Detection checks</h2>
      {([
        ['phishingDetectionEnabled', 'Phishing links', 'Known malicious gifts and scam URLs.'],
        ['contentAnomalyEnabled', 'Content anomalies', 'Mention floods and repeated text.'],
        ['userAnomalyEnabled', 'User anomalies', 'Unusual member message spikes.'],
        ['guildBaselineEnabled', 'Guild baseline', 'Sudden server-wide link activity.'],
      ] as const).map(([field, label, description]) => <Toggle key={field} label={label} description={description} checked={settings[field]} onChange={checked => setSettings(previous => ({ ...previous, [field]: checked }))} />)}
    </section>
    <section className="dashboard-section"><h2>Enforcement</h2><label className="dashboard-field"><span className="field-label">Enforcement mode</span><select className="input" value={settings.anomalyEnforcementMode} onChange={event => setSettings(previous => ({ ...previous, anomalyEnforcementMode: event.target.value }))}>
      {!['AUDIT_ONLY', 'DELETE_HIGH_CONFIDENCE'].includes(settings.anomalyEnforcementMode) && <option value={settings.anomalyEnforcementMode}>Unknown mode ({settings.anomalyEnforcementMode})</option>}
      <option value="AUDIT_ONLY">Audit only (log detections)</option><option value="DELETE_HIGH_CONFIDENCE">Auto-delete verified violations</option>
    </select></label></section>
  </>}</FeatureSettingsForm>;
}
