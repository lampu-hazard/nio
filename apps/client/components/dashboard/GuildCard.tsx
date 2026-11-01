import Link from 'next/link';
import type { GuildSummary } from '@/lib/types';

export function GuildCard({ guild }: { guild: GuildSummary }) {
  return <article className="card p-5"><div className="flex items-center gap-4">
    {guild.iconUrl ? <img src={guild.iconUrl} className="h-12 w-12 rounded border border-[var(--border)] object-cover" alt="" /> : <div aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded border border-[var(--border)] bg-[var(--surface)] font-semibold">{guild.name[0]}</div>}
    <div className="min-w-0"><h2 className="truncate text-lg font-semibold">{guild.name}</h2><p className="text-[var(--muted)]">{guild.botInGuild ? 'Bot installed' : 'Bot not installed'}</p></div>
  </div><Link href={guild.botInGuild ? `/dashboard/${guild.id}` : guild.inviteUrl} className={`btn mt-6 w-full ${guild.botInGuild ? 'btn-primary' : ''}`}>{guild.botInGuild ? 'Open dashboard' : 'Invite bot'}</Link></article>;
}
