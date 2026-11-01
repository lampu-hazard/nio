import { VoiceXpSettings } from '@/components/dashboard/VoiceXpSettings';

export default async function VoiceXpPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  return <VoiceXpSettings guildId={guildId} />;
}
