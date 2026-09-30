import type { GuildSummary } from '@/lib/types';

export function GuildCard({ guild }: { guild: GuildSummary }) {
  return (
    <article className="card group p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand)] hover:shadow-lg hover:shadow-indigo-950/5">
      <div className="flex items-center gap-4">
        {guild.iconUrl ? (
          <img src={guild.iconUrl} className="h-14 w-14 rounded-xl border border-[var(--border)] object-cover" alt="" />
        ) : (
          <div className="grid h-14 w-14 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] font-bold text-[var(--text)]">
            {guild.name[0]}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold tracking-tight text-[var(--text)]">{guild.name}</h3>
          <p className="text-sm text-[var(--muted)]">{guild.botInGuild ? 'Bot installed' : 'Bot not installed'}</p>
        </div>
      </div>
      <a
        href={guild.botInGuild ? `/dashboard/${guild.id}` : guild.inviteUrl}
        className={`mt-5 block rounded-md border px-4 py-3 text-center text-sm font-semibold transition-colors ${
          guild.botInGuild
            ? 'border-transparent bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600'
            : 'border-[var(--border)] bg-transparent text-[var(--text)] hover:bg-[var(--surface)]'
        }`}
      >
        {guild.botInGuild ? 'Open Dashboard' : 'Invite Bot'}
      </a>
    </article>
  );
}
