import type { Panel } from '@/lib/types';

const TYPE_LABELS = {
  SELF_ROLE: 'Self Role',
  RULES: 'Rules',
  ANNOUNCEMENT: 'Announcement',
};

export function PanelCard({ guildId, panel }: { guildId: string; panel: Panel }) {
  const type = TYPE_LABELS[panel.type || 'SELF_ROLE'];
  return (
    <div className="card p-5 transition hover:-translate-y-0.5 hover:border-white/25">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-xl font-black">{panel.name}</h3>
            <span className={`badge ${panel.status === 'PUBLISHED' ? 'badge-live' : ''}`}>{panel.status}</span>
            <span className="badge">{type}</span>
          </div>
          <p className="mt-2 text-slate-400">{panel.title} · {panel.roles.length} roles · {panel.mode}</p>
        </div>
        <a href={`/dashboard/${guildId}/panels/${panel.id}`} className="btn">Open Builder</a>
      </div>
    </div>
  );
}
