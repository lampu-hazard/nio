import { api } from '@/lib/api';

type LeaderboardRow = { rank: number; userId: string; username: string; displayName: string; avatar: string | null; score: number };

export default async function LeaderboardPage({ params, searchParams }: { params: Promise<{ guildId: string }>; searchParams: Promise<{ type?: string; days?: string }> }) {
  const { guildId } = await params;
  const query = await searchParams;
  const type = query.type === 'voice' ? 'voice' : 'chat';
  const days = ['7', '30', 'all'].includes(query.days || '') ? query.days! : '7';
  const data = await api<LeaderboardRow[]>(`/leaderboard/${type}?guildId=${guildId}&days=${days}&limit=50`).catch(() => null);
  return <main className="dashboard-page dashboard-page--wide"><h1>Leaderboard</h1><p className="dashboard-description">Server member activity in chat and voice.</p>
    <nav aria-label="Leaderboard filters" className="dashboard-actions !mt-0 mb-6">{(['chat', 'voice'] as const).map(item => <a key={item} href={`?type=${item}&days=${days}`} aria-current={type === item ? 'page' : undefined} className={`btn ${type === item ? 'btn-primary' : ''}`}>{item === 'chat' ? 'Chat' : 'Voice'}</a>)}{['7', '30', 'all'].map(item => <a key={item} href={`?type=${type}&days=${item}`} aria-current={days === item ? 'page' : undefined} className="btn">{item === 'all' ? 'All time' : `${item} days`}</a>)}<a className="btn" href={`/leaderboard/${guildId}`}>Public leaderboard</a></nav>
    {data === null ? <div className="dashboard-notice" role="alert">Leaderboard unavailable. <a href={`?type=${type}&days=${days}`} className="underline">Retry</a></div> : !data.length ? <p className="dashboard-notice">No activity recorded for this period.</p> : <div className="card overflow-x-auto"><table className="w-full min-w-[480px] text-left"><caption className="sr-only">{type === 'voice' ? 'Voice duration' : 'Chat messages'} leaderboard</caption><thead className="border-b border-[var(--border)] text-[var(--muted)]"><tr><th className="p-4">Rank</th><th className="p-4">Member</th><th className="p-4 text-right">{type === 'voice' ? 'Voice time' : 'Messages'}</th></tr></thead><tbody>{data.map(row => <tr key={row.userId} className="border-b border-[var(--border)]"><td className="p-4 tabular-nums">{row.rank}</td><td className="p-4"><span className="block font-medium">{row.displayName || row.username || row.userId}</span><span className="text-[var(--muted)]">{row.username ? `@${row.username}` : row.userId}</span></td><td className="p-4 text-right tabular-nums">{type === 'voice' ? `${Math.floor(row.score / 3600)}h ${Math.floor(row.score % 3600 / 60)}m` : row.score.toLocaleString()}</td></tr>)}</tbody></table></div>}
  </main>;
}
