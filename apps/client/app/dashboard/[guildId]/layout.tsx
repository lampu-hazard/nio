import type { ReactNode } from 'react';
import { DashboardShell } from '@/components/layout/DashboardShell';

export default async function GuildDashboardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;

  return <DashboardShell guildId={guildId}>{children}</DashboardShell>;
}
