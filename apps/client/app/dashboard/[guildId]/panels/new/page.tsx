import { api } from '@/lib/api';
import { NewPanelWizard } from '@/components/panel-editor/NewPanelWizard';

export default async function NewPanelPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const channelsData = await api<{ ok: true; channels: { id: string; name: string }[] }>(`/guilds/${guildId}/channels`)
    .catch(() => ({ ok: true as const, channels: [] }));

  return (
    <main className="shell">
      <div className="container-wide">
        <div className="mb-8">
          <a href={`/dashboard/${guildId}`} className="text-sm font-bold text-slate-400 transition hover:text-white">← Back to server</a>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="badge">New Panel</span>
            <span className="badge">Wizard</span>
          </div>
          <h1 className="mt-4 text-4xl font-black tracking-tight md:text-6xl">Create a Discord panel</h1>
          <p className="mt-3 max-w-3xl text-slate-400">Pilih tipe panel dulu supaya dashboard otomatis menyiapkan template, layout, dan preview yang sesuai.</p>
        </div>

        <NewPanelWizard guildId={guildId} channels={channelsData.channels} />
      </div>
    </main>
  );
}
