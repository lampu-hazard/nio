import { PluginMarketplace } from '@/components/plugins/PluginMarketplace';

export default async function PluginsPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;

  return (
    <main className="dashboard-page dashboard-page--wide dashboard-legacy">
      <div className="mx-auto max-w-[1440px] space-y-4">
        {/* Compact Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-2.5">
          <div>
            <h1>Plugins</h1>
            <p className="text-xs text-[var(--muted)]">Install optional bot capabilities, external integrations, and server features.</p>
          </div>
        </div>

        <PluginMarketplace guildId={guildId} />
      </div>
    </main>
  );
}
