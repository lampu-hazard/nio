'use client';

import type { Panel } from '@/lib/types';

type PanelType = Panel['type'];

const OPTIONS: Array<{
  type: PanelType;
  icon: string;
  title: string;
  description: string;
  bullets: string[];
}> = [
  {
    type: 'RULES',
    icon: '📌',
    title: 'Rules / Info',
    description: 'For server rules, verification steps, FAQs, and pinned information.',
    bullets: ['Banner-first embed', 'Markdown sections', 'No role buttons required'],
  },
  {
    type: 'SELF_ROLE',
    icon: '🎭',
    title: 'Self Role',
    description: 'Let members choose roles using Discord buttons or dropdown menus.',
    bullets: ['Role picker', 'Drag ordering', 'Buttons or menu'],
  },
  {
    type: 'ANNOUNCEMENT',
    icon: '📣',
    title: 'Announcement',
    description: 'Publish server updates, events, maintenance notes, and changelogs.',
    bullets: ['Rich embed', 'Banner support', 'Official update style'],
  },
];

export function PanelTypePicker({ selected, onSelect }: { selected: PanelType; onSelect: (type: PanelType) => void }) {
  return (
    <section className="card p-6 md:p-7">
      <div className="mb-5">
        <div className="badge mb-3">Step 1</div>
        <h2 className="text-2xl font-black tracking-tight">What do you want to create?</h2>
        <p className="mt-1 text-sm text-slate-400">Pilih tipe panel dulu, nanti form dan template akan menyesuaikan otomatis.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {OPTIONS.map((option) => {
          const active = selected === option.type;
          return (
            <button
              key={option.type}
              type="button"
              onClick={() => onSelect(option.type)}
              className={`group rounded-3xl border p-5 text-left transition hover:-translate-y-1 ${
                active
                  ? 'border-indigo-300/70 bg-indigo-500/15 shadow-2xl shadow-indigo-500/15'
                  : 'border-white/10 bg-white/[0.035] hover:border-white/25 hover:bg-white/[0.06]'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="text-4xl">{option.icon}</div>
                <span className={`badge ${active ? 'badge-live' : ''}`}>{active ? 'Selected' : option.type.replace('_', ' ')}</span>
              </div>
              <h3 className="mt-5 text-xl font-black">{option.title}</h3>
              <p className="mt-2 min-h-12 text-sm leading-6 text-slate-400">{option.description}</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-300">
                {option.bullets.map((bullet) => <li key={bullet}>✓ {bullet}</li>)}
              </ul>
            </button>
          );
        })}
      </div>
    </section>
  );
}
