import { SlowmodeSettings } from '@/components/dashboard/SlowmodeSettings';

export default async function SlowmodePage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  return <SlowmodeSettings guildId={guildId} />;
}
