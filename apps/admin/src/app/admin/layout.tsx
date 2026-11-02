'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ToastProvider, Skeleton } from '@/components/ui';
import { Sidebar } from '@/components/shell/Sidebar';
import { Topbar } from '@/components/shell/Topbar';
import { LoginScreen } from '@/components/shell/LoginScreen';
import { ApiError } from '@/lib/api';

function Gate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
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
      <div className="pl-[232px]">
        <Topbar />
        <main className="px-[22px] py-5">{children}</main>
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
      <ToastProvider>
        <AuthProvider>
          <Gate>{children}</Gate>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
