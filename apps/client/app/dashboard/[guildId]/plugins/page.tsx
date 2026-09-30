import { PluginMarketplace } from '@/components/plugins/PluginMarketplace';

export default async function PluginsPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;

  return (
    <main className="px-4 py-6 sm:px-7 sm:py-8 lg:px-10">
      <div className="mx-auto max-w-[1440px] space-y-6">
        <p className="max-w-2xl text-sm leading-6 text-[var(--muted)]">Install optional features for this server. Each guild controls its own plugins and command visibility.</p>
        <PluginMarketplace guildId={guildId} />
      </div>
    </main>
  );
}
