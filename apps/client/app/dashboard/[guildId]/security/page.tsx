import { SecuritySettings } from '@/components/dashboard/SecuritySettings';

export default async function SecurityPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  return <SecuritySettings guildId={guildId} />;
}
