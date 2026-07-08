import { api } from '@/lib/api';

type LeaderboardRow = {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  avatar: string | null;
  score: number;
};

export default async function PublicLeaderboardPage({
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

  const getAvatarUrl = (userId: string, avatarHash: string | null) => {
    if (!avatarHash) return 'https://cdn.discordapp.com/embed/avatars/0.png';
    return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png`;
  };

  // Top 3 podium mapping
  const rank1 = leaderboardData.find((u) => u.rank === 1);
  const rank2 = leaderboardData.find((u) => u.rank === 2);
  const rank3 = leaderboardData.find((u) => u.rank === 3);

  // Order for podium display: 2nd place on left, 1st place in middle, 3rd place on right
  const podium = [
    { rankSlot: 2, user: rank2 },
    { rankSlot: 1, user: rank1 },
    { rankSlot: 3, user: rank3 },
  ].filter((p) => p.user !== undefined);

  const remaining = leaderboardData.filter((u) => u.rank > 3);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] relative overflow-x-hidden">
      {/* Background ambient glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-purple-500/10 blur-[120px] pointer-events-none" />

      <main className="max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <a href="/dashboard" className="text-sm font-bold tracking-widest uppercase text-indigo-500 hover:text-indigo-400 transition-colors">
            ← nio dashboard
          </a>
          <h1 className="mt-4 text-4xl sm:text-5xl font-black tracking-tight bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
            Server Leaderboard
          </h1>
          <p className="mt-3 text-base text-[var(--muted)] max-w-lg mx-auto">
            Tempat berkumpulnya para member teraktif. Lihat siapa yang memuncaki keaktifan chat dan voice di server.
          </p>
        </div>

        {/* Category & Time Filters */}
        <div className="card p-4 mb-8 flex flex-col sm:flex-row items-center justify-between gap-4 border border-[var(--border)] bg-[var(--panel)] backdrop-blur-md">
          <div className="flex gap-2 w-full sm:w-auto">
            <a
              href={`?type=chat&days=${days}`}
              className={`flex-1 sm:flex-initial btn px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                type === 'chat'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 border-transparent dark:bg-indigo-500'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--panel-strong)]'
              }`}
            >
              💬 Chat Activity
            </a>
            <a
              href={`?type=voice&days=${days}`}
              className={`flex-1 sm:flex-initial btn px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                type === 'voice'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 border-transparent dark:bg-indigo-500'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--panel-strong)]'
              }`}
            >
              🔊 Voice Activity
            </a>
          </div>

          <div className="flex gap-1.5 w-full sm:w-auto justify-end">
            {[
              { id: '7', label: '7 Hari' },
              { id: '30', label: '30 Hari' },
              { id: 'all', label: 'Semua Waktu' },
            ].map((d) => (
              <a
                key={d.id}
                href={`?type=${type}&days=${d.id}`}
                className={`btn px-3.5 py-2 text-xs rounded-lg font-bold border transition-all ${
                  days === d.id
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-500/5'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--panel-strong)] border-transparent'
                }`}
              >
                {d.label}
              </a>
            ))}
          </div>
        </div>

        {/* Podium Layout */}
        {leaderboardData.length > 0 && (
          <div className="mb-12 flex flex-col sm:flex-row items-end justify-center gap-6 sm:gap-4 md:gap-8">
            {podium.map(({ rankSlot, user }) => {
              if (!user) return null;
              const isRank1 = rankSlot === 1;
              const isRank2 = rankSlot === 2;
              const podiumHeight = isRank1 ? 'h-60 sm:h-56' : isRank2 ? 'h-44 sm:h-40' : 'h-36 sm:h-32';

              // Custom glow themes
              const borderTheme = isRank1
                ? 'border-yellow-400/50 shadow-[0_0_25px_rgba(234,179,8,0.15)]'
                : isRank2
                ? 'border-slate-300/40 shadow-[0_0_20px_rgba(148,163,184,0.1)]'
                : 'border-amber-600/40 shadow-[0_0_15px_rgba(180,83,9,0.08)]';

              const bgTheme = isRank1
                ? 'bg-gradient-to-b from-yellow-500/10 to-yellow-600/5'
                : isRank2
                ? 'bg-gradient-to-b from-slate-400/10 to-slate-500/5'
                : 'bg-gradient-to-b from-amber-700/10 to-amber-800/5';

              return (
                <div
                  key={user.userId}
                  className="flex w-full flex-col items-center justify-end sm:w-44 md:w-52"
                >
                  <div className="relative mb-3 flex flex-col items-center">
                    {/* Crown / Podium Rank badge */}
                    <div
                      className={`absolute -top-3.5 flex h-7 w-7 items-center justify-center rounded-full text-xs font-black text-white shadow-md z-10 ${
                        isRank1
                          ? 'bg-gradient-to-r from-yellow-500 to-amber-500 scale-110'
                          : isRank2
                          ? 'bg-gradient-to-r from-slate-400 to-slate-500'
                          : 'bg-gradient-to-r from-amber-700 to-amber-800'
                      }`}
                    >
                      {user.rank}
                    </div>
                    {/* Glowing outer ring for Rank 1 */}
                    <div className={`absolute -inset-0.5 rounded-full blur-sm opacity-50 ${isRank1 ? 'bg-gradient-to-r from-yellow-400 to-amber-500' : ''}`} />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getAvatarUrl(user.userId, user.avatar)}
                      alt={user.displayName}
                      className="relative h-18 w-18 rounded-full border-2 border-[var(--border)] object-cover shadow-md md:h-22 md:w-22"
                    />
                  </div>

                  <div className="w-full text-center px-2">
                    <div className="truncate text-sm font-black text-[var(--text)]">{user.displayName}</div>
                    <div className="truncate text-xs text-[var(--muted)]">@{user.username}</div>
                  </div>

                  {/* Podium Base */}
                  <div
                    className={`mt-4 flex w-full flex-col items-center justify-center rounded-t-2xl border-t border-x px-4 py-6 shadow-sm transition-all hover:scale-[1.02] duration-300 ${podiumHeight} ${borderTheme} ${bgTheme}`}
                  >
                    <span className="text-xs uppercase tracking-wider font-bold text-[var(--muted)] mb-1">Total</span>
                    <span className="text-2xl md:text-3xl font-black tracking-tight text-[var(--text)]">
                      {formatScore(user.score)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Ranking List Table */}
        <div className="card overflow-hidden border border-[var(--border)] bg-[var(--panel)] backdrop-blur-md">
          {leaderboardData.length === 0 ? (
            <div className="p-12 text-center text-[var(--muted)]">Tidak ada aktivitas terdata di server.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--panel-strong)]/40 text-xs font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
                    <th className="px-6 py-5 w-24 text-center">Rank</th>
                    <th className="px-6 py-5">User</th>
                    <th className="px-6 py-5 text-right">Skor Keaktifan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] bg-[var(--panel)]/20">
                  {remaining.map((user) => (
                    <tr
                      key={user.userId}
                      className="text-sm text-[var(--text)] transition-all hover:bg-[var(--panel-strong)]/30"
                    >
                      <td className="px-6 py-4.5 text-center font-bold text-[var(--text-secondary)]">#{user.rank}</td>
                      <td className="px-6 py-4.5">
                        <div className="flex items-center gap-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={getAvatarUrl(user.userId, user.avatar)}
                            alt={user.displayName}
                            className="h-9 w-9 rounded-full border border-[var(--border)] object-cover shadow-sm"
                          />
                          <div>
                            <div className="font-extrabold text-[var(--text)]">{user.displayName}</div>
                            <div className="text-xs text-[var(--muted)]">@{user.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4.5 text-right font-black text-lg tracking-tight text-indigo-500 dark:text-indigo-400">
                        {formatScore(user.score)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
