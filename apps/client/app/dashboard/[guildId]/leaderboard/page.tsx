import { api } from '@/lib/api';
import { DashboardNav } from '@/components/dashboard/DashboardNav';

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
    <main className="px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Activity</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--text)]">Leaderboard</h1>
          <p className="mt-1 text-[var(--muted)]">View the most active members in chat and voice.</p>
        </div>

        <DashboardNav guildId={guildId} activeTab="leaderboard" />

        {/* Filters */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-2">
            <a
              href={`?type=chat&days=${days}`}
              className={`btn px-4 py-2 rounded-md font-semibold ${
                type === 'chat'
                  ? 'bg-indigo-600 text-white border-transparent dark:bg-indigo-500'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--panel-strong)]'
              }`}
            >
              💬 Chat Activity
            </a>
            <a
              href={`?type=voice&days=${days}`}
              className={`btn px-4 py-2 rounded-md font-semibold ${
                type === 'voice'
                  ? 'bg-indigo-600 text-white border-transparent dark:bg-indigo-500'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--panel-strong)]'
              }`}
            >
              🔊 Voice Activity
            </a>
          </div>

          <div className="flex gap-2">
            {[
              { id: '7', label: '7 Days' },
              { id: '30', label: '30 Days' },
              { id: 'all', label: 'All Time' },
            ].map((d) => (
              <a
                key={d.id}
                href={`?type=${type}&days=${d.id}`}
                className={`btn px-3 py-1.5 text-xs rounded-md font-medium ${
                  days === d.id
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--panel-strong)]'
                }`}
              >
                {d.label}
              </a>
            ))}
          </div>
        </div>

        {/* Podium Layout */}
        {leaderboardData.length > 0 && (
          <div className="mb-10 flex flex-col items-end justify-center gap-6 sm:flex-row sm:gap-4 md:gap-8">
            {podium.map(({ rankSlot, user }) => {
              if (!user) return null;
              const isRank1 = rankSlot === 1;
              const isRank2 = rankSlot === 2;
              const podiumHeight = isRank1 ? 'h-52' : isRank2 ? 'h-40' : 'h-32';
              const podiumColor = isRank1
                ? 'border-yellow-400 bg-yellow-500/10'
                : isRank2
                ? 'border-slate-300 bg-slate-500/10'
                : 'border-amber-600 bg-amber-700/10';

              return (
                <div
                  key={user.userId}
                  className={`flex w-full flex-col items-center justify-end sm:w-44 md:w-52`}
                >
                  <div className="relative mb-3 flex flex-col items-center">
                    {/* Podium Badge */}
                    <div
                      className={`absolute -top-3 flex h-6 w-6 items-center justify-center rounded-full text-xs font-black text-white ${
                        isRank1
                          ? 'bg-yellow-500'
                          : isRank2
                          ? 'bg-slate-400'
                          : 'bg-amber-700'
                      }`}
                    >
                      {user.rank}
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getAvatarUrl(user.userId, user.avatar)}
                      alt={user.displayName}
                      className="h-16 w-16 rounded-full border-2 border-[var(--border)] object-cover shadow-sm md:h-20 md:w-20"
                    />
                  </div>

                  <div className="w-full text-center">
                    <div className="truncate text-sm font-bold text-[var(--text)]">{user.displayName}</div>
                    <div className="text-xs text-[var(--muted)]">@{user.username}</div>
                  </div>

                  {/* Visual Podium Block */}
                  <div
                    className={`mt-4 flex w-full flex-col items-center justify-center rounded-t-xl border-t border-x px-4 py-6 shadow-sm ${podiumHeight} ${podiumColor}`}
                  >
                    <span className="text-2xl font-black text-[var(--text)]">{formatScore(user.score)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Ranking List Table */}
        <div className="card overflow-hidden">
          {leaderboardData.length === 0 ? (
            <div className="p-8 text-center text-[var(--muted)]">No activity found for this period.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--panel-strong)] text-xs font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
                    <th className="px-6 py-4 w-20">Rank</th>
                    <th className="px-6 py-4">User</th>
                    <th className="px-6 py-4 text-right">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {remaining.map((user) => (
                    <tr
                      key={user.userId}
                      className="text-sm text-[var(--text)] transition-colors hover:bg-[var(--panel-strong)]"
                    >
                      <td className="px-6 py-4 font-bold text-[var(--text-secondary)]">#{user.rank}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={getAvatarUrl(user.userId, user.avatar)}
                            alt={user.displayName}
                            className="h-8 w-8 rounded-full border border-[var(--border)] object-cover"
                          />
                          <div>
                            <div className="font-bold">{user.displayName}</div>
                            <div className="text-xs text-[var(--muted)]">@{user.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-black text-lg">
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
