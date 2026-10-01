import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Nio Owner Operations', description: 'Private operational console for the Nio Discord bot.' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
