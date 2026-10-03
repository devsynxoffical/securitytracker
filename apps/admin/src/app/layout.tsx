import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Company OS - Admin Control Center',
  description: 'Enterprise Employee Management, Security & CRM Platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-[#090d16] text-slate-100">{children}</body>
    </html>
  );
}
