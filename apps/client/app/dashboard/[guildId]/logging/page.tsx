import { LoggingSettings } from '@/components/dashboard/LoggingSettings';

export default async function LoggingPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  return <LoggingSettings guildId={guildId} />;
}
