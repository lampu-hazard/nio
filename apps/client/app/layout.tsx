import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'nio Dashboard',
  description: 'Dashboard-first Discord self-role bot',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
