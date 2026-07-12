import { TemplateStudio } from '@/components/embed-template-studio/TemplateStudio';

type PageProps = {
  params: Promise<{ guildId: string }>;
};

export default async function EmbedTemplatesPage({ params }: PageProps) {
  const { guildId } = await params;

  return (
    <main className="px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">No-code Customization</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--text)]">Embed Template Studio</h1>
          <p className="mt-1 text-[var(--muted)]">Customize Discord messages with safe variables, live preview, and no code.</p>
        </div>
        <TemplateStudio guildId={guildId} />
      </div>
    </main>
  );
}
