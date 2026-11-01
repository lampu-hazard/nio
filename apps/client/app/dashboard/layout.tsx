import type { ReactNode } from 'react';
import { FeatureDraftProvider } from '@/components/dashboard/FeatureSettingsForm';
import './dashboard.css';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <FeatureDraftProvider><div className="nio-dashboard">{children}</div></FeatureDraftProvider>;
}
