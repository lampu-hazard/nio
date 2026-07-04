import { api } from '@/lib/api';
import { NewPanelWizard } from '@/components/panel-editor/NewPanelWizard';

export default async function NewPanelPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const channelsData = await api<{ ok: true; channels: { id: string; name: string }[] }>(`/guilds/${guildId}/channels`)
    .catch(() => ({ ok: true as const, channels: [] }));

  return (
    <main className="px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <a href={`/dashboard/${guildId}`} className="text-sm font-semibold text-zinc-500 transition-colors hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50">Back to server</a>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="badge">New Panel</span>
            <span className="badge">Wizard</span>
          </div>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50 md:text-5xl">Create a Discord panel</h1>
          <p className="mt-3 max-w-3xl text-zinc-500 dark:text-zinc-400">Choose a panel type and nio will prepare the right form, template, and preview.</p>
        </div>

        <NewPanelWizard guildId={guildId} channels={channelsData.channels} />
      </div>
    </main>
  );
}
