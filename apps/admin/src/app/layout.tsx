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
    <html lang="en">
      <body className="antialiased min-h-screen bg-[#F5F6F3] text-[#151A1E]">{children}</body>
    </html>
  );
}
