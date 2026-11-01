import { HallOfFameSettings } from '@/components/dashboard/HallOfFameSettings';

export default async function HallOfFamePage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  return <HallOfFameSettings guildId={guildId} />;
}
