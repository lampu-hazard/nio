import type { Panel } from '@/lib/types';

const TYPE_LABELS = {
  SELF_ROLE: 'Self Role',
  RULES: 'Rules',
  ANNOUNCEMENT: 'Announcement',
  LEADERBOARD: 'Leaderboard',
};

export function PanelCard({ guildId, panel }: { guildId: string; panel: Panel }) {
  const type = TYPE_LABELS[panel.type || 'SELF_ROLE'];
  const isPublished = panel.status === 'PUBLISHED';
  return (
    <div className="card p-4 transition-all hover:border-[var(--border-strong)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-bold tracking-tight text-[var(--text)]">{panel.name}</h3>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              isPublished
                ? 'border border-[var(--ok)]/30 bg-[var(--ok)]/10 text-[var(--ok)]'
                : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]'
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${isPublished ? 'bg-[var(--ok)]' : 'bg-[var(--muted)]'}`} />
              {panel.status}
            </span>
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
              {type}
            </span>
          </div>
          <p className="mt-1.5 truncate text-xs text-[var(--muted)]">
            {panel.title || 'Untitled'} · {panel.roles.length} roles · {panel.mode}
          </p>
        </div>
        <a href={`/dashboard/${guildId}/panels/${panel.id}`} className="btn shrink-0 py-1.5 px-3 text-xs font-semibold">
          Builder →
        </a>
      </div>
    </div>
  );
}
