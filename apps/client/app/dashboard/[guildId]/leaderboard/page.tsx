import { api } from '@/lib/api';

type LeaderboardRow = {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  avatar: string | null;
  score: number;
};

export default async function LeaderboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ type?: string; days?: string }>;
}) {
  const { guildId } = await params;
  const { type = 'chat', days = '7' } = await searchParams;

  const endpoint = type === 'voice' ? 'voice' : 'chat';
  const leaderboardData = await api<LeaderboardRow[]>(
    `/leaderboard/${endpoint}?guildId=${guildId}&days=${days}&limit=50`
  ).catch(() => []);

  const formatScore = (score: number) => {
    if (type === 'voice') {
      const hours = Math.floor(score / 3600);
      const minutes = Math.floor((score % 3600) / 60);
      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      }
      return `${minutes}m`;
    }
    return `${score} msg`;
  };

  const getAvatarUrl = (userId: string, avatar: string | null) => {
    if (!avatar) return 'https://cdn.discordapp.com/embed/avatars/0.png';
    if (avatar.startsWith('http')) return avatar;
    return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png`;
  };

  // Top 3 Podium mapping
  // Rank 1 (index 0), Rank 2 (index 1), Rank 3 (index 2)
  const rank1 = leaderboardData.find((u) => u.rank === 1);
  const rank2 = leaderboardData.find((u) => u.rank === 2);
  const rank3 = leaderboardData.find((u) => u.rank === 3);

  // We want to render them in order: Rank 2 (Left), Rank 1 (Middle), Rank 3 (Right)
  const podium = [
    { rankSlot: 2, user: rank2 },
    { rankSlot: 1, user: rank1 },
    { rankSlot: 3, user: rank3 },
  ].filter(p => p.user !== undefined);

  const remaining = leaderboardData.filter((u) => u.rank > 3);

  return (
    <main className="px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px] space-y-4">
        {/* Compact Header & Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-2.5">
          <div>
            <h2 className="text-sm font-bold tracking-tight text-[var(--text)]">Activity Leaderboard</h2>
            <p className="text-xs text-[var(--muted)]">Most active server members in chat and voice channels.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Type Switcher */}
            <div className="flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5 text-xs">
              <a
                href={`?type=chat&days=${days}`}
                className={`rounded-md px-2.5 py-1 font-semibold transition-all ${
                  type === 'chat'
                    ? 'bg-[var(--panel-strong)] text-[var(--text)] shadow-sm'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                💬 Chat
              </a>
              <a
                href={`?type=voice&days=${days}`}
                className={`rounded-md px-2.5 py-1 font-semibold transition-all ${
                  type === 'voice'
                    ? 'bg-[var(--panel-strong)] text-[var(--text)] shadow-sm'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                🔊 Voice
              </a>
            </div>

            {/* Timeframe Filter */}
            <div className="flex gap-1">
              {[
                { id: '7', label: '7D' },
                { id: '30', label: '30D' },
                { id: 'all', label: 'All' },
              ].map((d) => (
                <a
                  key={d.id}
                  href={`?type=${type}&days=${d.id}`}
                  className={`btn px-2.5 py-1 text-xs rounded-md font-semibold transition-all ${
                    days === d.id
                      ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10'
                      : 'text-[var(--muted)] hover:bg-[var(--panel-strong)] border-transparent'
                  }`}
                >
                  {d.label}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Compact Top 3 Cards */}
        {leaderboardData.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-3">
            {[rank1, rank2, rank3].filter(Boolean).map((user) => {
              if (!user) return null;
              const isRank1 = user.rank === 1;
              const isRank2 = user.rank === 2;
              const badgeBg = isRank1
                ? 'bg-amber-500/20 text-amber-500 border-amber-500/30'
                : isRank2
                ? 'bg-slate-400/20 text-slate-300 border-slate-400/30'
                : 'bg-amber-700/20 text-amber-600 border-amber-700/30';

              return (
                <div
                  key={user.userId}
                  className="card flex items-center justify-between p-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-black border shrink-0 ${badgeBg}`}
                    >
                      #{user.rank}
                    </span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getAvatarUrl(user.userId, user.avatar)}
                      alt={user.displayName}
                      className="h-8 w-8 rounded-full border border-[var(--border)] object-cover shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold text-[var(--text)]">{user.displayName}</div>
                      <div className="truncate text-[10px] text-[var(--muted)]">@{user.username}</div>
                    </div>
                  </div>
                  <div className="text-right shrink-0 pl-2">
                    <span className="text-sm font-black text-[var(--text)]">{formatScore(user.score)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Ranking List Table */}
        <div className="card overflow-hidden">
          {leaderboardData.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--muted)]">No activity found for this period.</div>
          ) : (
            <div className="overflow-x-auto max-h-[520px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-[var(--panel)] border-b border-[var(--border)] text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                  <tr>
                    <th className="py-2.5 px-3 w-16">Rank</th>
                    <th className="py-2.5 px-3">User</th>
                    <th className="py-2.5 px-3 text-right">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {remaining.map((user) => (
                    <tr
                      key={user.userId}
                      className="text-[var(--text)] transition-colors hover:bg-[var(--surface)]/50"
                    >
                      <td className="py-2 px-3 font-bold text-[var(--muted)]">#{user.rank}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2.5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={getAvatarUrl(user.userId, user.avatar)}
                            alt={user.displayName}
                            className="h-6 w-6 rounded-full border border-[var(--border)] object-cover shrink-0"
                          />
                          <div className="min-w-0">
                            <span className="font-semibold block truncate text-xs">{user.displayName}</span>
                            <span className="text-[10px] text-[var(--muted)] block truncate">@{user.username}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right font-black tabular-nums">
                        {formatScore(user.score)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
