import React from 'react';
import { AiSettings, behaviorOptions } from '../../lib/ai-agent';

const fields = [
  { key: 'conversationStyle', label: 'Gaya bahasa', fallback: 'BALANCED', labels: ['Seimbang', 'Santai', 'Formal'] },
  { key: 'responseLength', label: 'Panjang jawaban', fallback: 'ADAPTIVE', labels: ['Ringkas', 'Adaptif', 'Detail'] },
  { key: 'activityVisibility', label: 'Aktivitas', fallback: 'BRIEF', labels: ['Status singkat', 'Tanpa status tambahan'] },
  { key: 'webResearchPolicy', label: 'Pencarian web', fallback: 'AUTO', labels: ['Otomatis', 'Hanya saat diminta'] },
] as const;

export function AgentBehaviorSettings({ settings, onChange }: { settings: AiSettings; onChange: (next: AiSettings) => void }) {
  return <section className="dashboard-section max-w-3xl">
    <h2>Perilaku percakapan</h2>
    <div className="dashboard-grid mt-4">
      {fields.map((field) => <label key={field.key} className="dashboard-field">
        <span>{field.label}</span>
        <select className="input" value={settings[field.key] ?? field.fallback}
          onChange={(event) => onChange({ ...settings, [field.key]: event.target.value })}>
          {behaviorOptions[field.key].map((value, index) => <option key={value} value={value}>{field.labels[index]}</option>)}
        </select>
      </label>)}
    </div>
    <p className="mt-3 text-[var(--muted)]">Panjang jawaban tidak mengubah batas token. Tanpa status tambahan tetap menampilkan jawaban, kesalahan, dan keterbatasan hasil.</p>
    <p className="mt-2 text-[var(--muted)]">Pencarian berlaku untuk tool bawaan pencarian dan pembacaan web yang diaktifkan, bukan semua integrasi Admin. Kredit provider dapat berlaku. Gunakan “cari di web” atau “baca https://…” untuk meminta pencarian secara eksplisit.</p>
  </section>;
}
