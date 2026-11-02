'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Banner, Button } from '@/components/ui';
import { AuthLayout, AuthHeading } from '@/components/shell/auth/AuthLayout';
import { ResetPasswordForm } from '@/components/shell/auth/PasswordReset';

/**
 * /admin/reset?token=... (F30). Rendered outside the authenticated shell: the admin layout's
 * gate shows the login screen for anonymous users, so this page lives under /admin but renders
 * its own auth layout. Static export: the token is read client-side.
 */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetInner />
    </Suspense>
  );
}

function ResetInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params?.get('token') ?? '';
  const goLogin = () => router.replace('/admin');

  return (
    <AuthLayout footer={<>Reset links work once and expire after 30 minutes.</>}>
      {token ? (
        <ResetPasswordForm token={token} onDone={goLogin} />
      ) : (
        <div className="space-y-4">
          <AuthHeading title="Reset link missing" subtitle="Open the link from your email, or request a new one from the sign-in page." />
          <Banner tone="amber">This page needs a reset token in the address.</Banner>
          <Button variant="primary" className="w-full justify-center" onClick={goLogin}>
            Back to sign in
          </Button>
        </div>
      )}
    </AuthLayout>
  );
}
