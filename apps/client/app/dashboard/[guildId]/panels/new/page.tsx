import { api } from '@/lib/api';
import { NewPanelWizard } from '@/components/panel-editor/NewPanelWizard';

export default async function NewPanelPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const channelsData = await api<{ ok: true; channels: { id: string; name: string }[] }>(`/guilds/${guildId}/channels`)
    .catch(() => null);
  if (!channelsData) return <main className="dashboard-page"><h1>Create panel</h1><div className="dashboard-notice" role="alert">Channels unavailable. <a className="underline" href={`/dashboard/${guildId}/panels/new`}>Retry</a></div></main>;

  return (
    <main className="dashboard-page dashboard-page--wide dashboard-legacy">
      <div className="mx-auto max-w-[1440px] space-y-4">
        {/* Compact Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-2.5">
          <div className="flex items-center gap-3">
            <a href={`/dashboard/${guildId}`} className="text-xs font-semibold text-[var(--muted)] transition-colors hover:text-[var(--text)]">
              Panels
            </a>
            <span className="text-[var(--border)]">/</span>
            <h1>Create panel</h1>
          </div>
          <span className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-xs font-semibold text-[var(--muted)]">
            Setup Wizard
          </span>
        </div>

        <NewPanelWizard guildId={guildId} channels={channelsData.channels} />
      </div>
    </main>
  );
}
