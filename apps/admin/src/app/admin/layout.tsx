'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { ToastProvider, Skeleton } from '@/components/ui';
import { Sidebar, SIDEBAR_WIDTH, SIDEBAR_COLLAPSED } from '@/components/shell/Sidebar';
import { Topbar } from '@/components/shell/Topbar';
import { LoginScreen } from '@/components/shell/LoginScreen';
import { ApiError } from '@/lib/api';

function Gate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const { sidebarCollapsed } = useTheme();
  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="w-72 space-y-3">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    );
  }
  if (status === 'anonymous') return <LoginScreen />;
  return (
    <div className="min-h-screen bg-bg">
      <Sidebar />
      <div className="transition-[padding] duration-150" style={{ paddingLeft: sidebarCollapsed ? SIDEBAR_COLLAPSED : SIDEBAR_WIDTH }}>
        <Topbar />
        <main className="fade-in px-[22px] py-5">{children}</main>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
            staleTime: 15_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <Gate>{children}</Gate>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
