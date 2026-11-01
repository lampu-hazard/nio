import Link from 'next/link';
import type { Panel } from '@/lib/types';

const TYPE_LABELS = { SELF_ROLE: 'Self Role', RULES: 'Rules', ANNOUNCEMENT: 'Announcement', LEADERBOARD: 'Leaderboard' };

export function PanelCard({ guildId, panel }: { guildId: string; panel: Panel }) {
  return <article className="card p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><h2 className="break-words text-lg font-semibold">{panel.name}</h2><p className="mt-2 text-[var(--muted)]">{TYPE_LABELS[panel.type || 'SELF_ROLE']} · {panel.status}</p><p className="mt-2 break-words text-[var(--text-secondary)]">{panel.title || 'Untitled'} · {panel.roles.length} roles · {panel.mode}</p></div><Link href={`/dashboard/${guildId}/panels/${panel.id}`} className="btn">Edit panel</Link></div></article>;
}
