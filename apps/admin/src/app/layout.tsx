import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'WorkPulse — Enterprise Workforce Intelligence & Operations',
  description: 'Real-time telemetry, employee tracking, and unified CRM operations platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark">
      <body className="antialiased min-h-screen bg-bg text-ink">{children}</body>
    </html>
  );
}
