import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'nio - Discord, in good order',
  description: 'A clear workspace for the everyday work of running a Discord community.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
