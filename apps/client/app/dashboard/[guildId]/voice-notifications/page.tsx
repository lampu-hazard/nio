import { VoiceNotificationSettings } from '@/components/dashboard/VoiceNotificationSettings';

export default async function VoiceNotificationsPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  return <VoiceNotificationSettings guildId={guildId} />;
}
