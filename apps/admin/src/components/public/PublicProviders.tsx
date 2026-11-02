'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/lib/theme';

/**
 * Providers for the public (unauthenticated) pages. The root layout provides none, and the
 * admin layout's provider stack is tied to AuthProvider, so the public pages get their own
 * QueryClient and the shared ThemeProvider (same `cos.theme` key as the admin panel).
 */
export function PublicProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}
