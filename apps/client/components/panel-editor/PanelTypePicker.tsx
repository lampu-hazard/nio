'use client';

import type { Panel } from '@/lib/types';

type PanelType = Panel['type'];

const OPTIONS: Array<{
  type: PanelType;
  title: string;
  description: string;
  bullets: string[];
}> = [
  {
    type: 'RULES',
    title: 'Rules / Info',
    description: 'For server rules, verification steps, FAQs, and pinned information.',
    bullets: ['Banner-first embed', 'Markdown sections', 'No role buttons required'],
  },
  {
    type: 'SELF_ROLE',
    title: 'Self Role',
    description: 'Let members choose roles using Discord buttons or dropdown menus.',
    bullets: ['Role picker', 'Drag ordering', 'Buttons or menu'],
  },
  {
    type: 'ANNOUNCEMENT',
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
        <h2 className="text-2xl font-bold tracking-tight text-[var(--text)]">What do you want to create?</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Choose a panel type. The form, template, and preview will adapt automatically.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {OPTIONS.map((option) => {
          const active = selected === option.type;
          return (
            <button
              key={option.type}
              type="button"
              onClick={() => onSelect(option.type)}
              className={`rounded-xl border p-5 text-left transition-colors ${
                active
                  ? 'border-transparent bg-indigo-600 text-white dark:bg-indigo-500'
                  : 'border-[var(--border)] bg-transparent text-[var(--text)] hover:bg-[var(--surface)]'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <span className={`badge ${active ? 'border-current bg-transparent text-current' : ''}`}>{active ? 'Selected' : option.type.replace('_', ' ')}</span>
              </div>
              <h3 className="mt-5 text-xl font-bold">{option.title}</h3>
              <p className={`mt-2 min-h-12 text-sm leading-6 ${active ? 'opacity-70' : 'text-[var(--muted)]'}`}>{option.description}</p>
              <ul className={`mt-4 space-y-2 text-sm ${active ? 'opacity-80' : 'text-[var(--text-secondary)]'}`}>
                {option.bullets.map((bullet) => <li key={bullet}>• {bullet}</li>)}
              </ul>
            </button>
          );
        })}
      </div>
    </section>
  );
}
