import { TemplateStudio } from '@/components/embed-template-studio/TemplateStudio';

type PageProps = {
  params: Promise<{ guildId: string }>;
};

export default async function EmbedTemplatesPage({ params }: PageProps) {
  const { guildId } = await params;

  return (
    <main className="px-4 py-6 sm:px-7 sm:py-8 lg:px-10">
      <div className="mx-auto max-w-[1440px] space-y-6">
        <p className="max-w-2xl text-sm leading-6 text-[var(--muted)]">Customize Discord messages with safe variables, live preview, and no code.</p>
        <TemplateStudio guildId={guildId} />
      </div>
    </main>
  );
}
