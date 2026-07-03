import type { GuildSummary } from '@/lib/types';

export function GuildCard({ guild }: { guild: GuildSummary }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-4">
        {guild.iconUrl ? <img src={guild.iconUrl} className="h-14 w-14 rounded-2xl" alt="" /> : <div className="grid h-14 w-14 place-items-center rounded-2xl bg-indigo-500 font-black">{guild.name[0]}</div>}
        <div className="min-w-0">
          <h3 className="truncate text-lg font-black">{guild.name}</h3>
          <p className={guild.botInGuild ? 'text-sm text-emerald-300' : 'text-sm text-amber-300'}>{guild.botInGuild ? 'Bot installed' : 'Bot not installed'}</p>
        </div>
      </div>
      <a href={guild.botInGuild ? `/dashboard/${guild.id}` : guild.inviteUrl} className="mt-5 block rounded-xl bg-indigo-500 px-4 py-3 text-center font-bold hover:bg-indigo-400">
        {guild.botInGuild ? 'Open Dashboard' : 'Invite Bot'}
      </a>
    </div>
  );
}
