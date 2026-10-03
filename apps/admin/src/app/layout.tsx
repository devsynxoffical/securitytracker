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
      <body className="antialiased min-h-screen bg-[#F5F6F3] text-[#151A1E]">{children}</body>
    </html>
  );
}
