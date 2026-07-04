import type { GuildSummary } from '@/lib/types';

export function GuildCard({ guild }: { guild: GuildSummary }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-4">
        {guild.iconUrl ? (
          <img src={guild.iconUrl} className="h-14 w-14 rounded-xl border border-zinc-200 object-cover dark:border-zinc-800" alt="" />
        ) : (
          <div className="grid h-14 w-14 place-items-center rounded-xl border border-zinc-200 bg-zinc-100 font-bold text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50">
            {guild.name[0]}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold tracking-tight text-zinc-950 dark:text-zinc-50">{guild.name}</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{guild.botInGuild ? 'Bot installed' : 'Bot not installed'}</p>
        </div>
      </div>
      <a
        href={guild.botInGuild ? `/dashboard/${guild.id}` : guild.inviteUrl}
        className={`mt-5 block rounded-md border px-4 py-3 text-center text-sm font-semibold transition-colors ${
          guild.botInGuild
            ? 'border-zinc-950 bg-zinc-950 text-white hover:bg-zinc-800 dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200'
            : 'border-zinc-200 bg-white text-zinc-950 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900'
        }`}
      >
        {guild.botInGuild ? 'Open Dashboard' : 'Invite Bot'}
      </a>
    </div>
  );
}
