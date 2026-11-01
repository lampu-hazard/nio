import { TemplateStudio } from '@/components/embed-template-studio/TemplateStudio';

type PageProps = {
  params: Promise<{ guildId: string }>;
};

export default async function EmbedTemplatesPage({ params }: PageProps) {
  const { guildId } = await params;

  return (
    <main className="dashboard-page dashboard-page--wide dashboard-legacy">
      <div className="mx-auto max-w-[1520px] space-y-4">
        {/* Compact Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-2.5">
          <div>
            <h1>Embed Studio</h1>
            <p className="text-xs text-[var(--muted)]">Design Discord embeds with dynamic variables, formatting, and real-time preview.</p>
          </div>
        </div>

        <TemplateStudio guildId={guildId} />
      </div>
    </main>
  );
}
