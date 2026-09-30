import { api } from '@/lib/api';
import { NewPanelWizard } from '@/components/panel-editor/NewPanelWizard';

export default async function NewPanelPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const channelsData = await api<{ ok: true; channels: { id: string; name: string }[] }>(`/guilds/${guildId}/channels`)
    .catch(() => ({ ok: true as const, channels: [] }));

  return (
    <main className="px-4 py-6 sm:px-7 sm:py-8 lg:px-10">
      <div className="mx-auto max-w-[1440px] space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <a href={`/dashboard/${guildId}`} className="text-sm font-semibold text-[var(--muted)] transition-colors hover:text-[var(--text)]">Back to server</a>
          <span className="badge">Wizard</span>
        </div>
        <p className="max-w-3xl text-sm leading-6 text-[var(--muted)]">Choose a panel type and nio will prepare the right form, template, and preview.</p>

        <NewPanelWizard guildId={guildId} channels={channelsData.channels} />
      </div>
    </main>
  );
}
