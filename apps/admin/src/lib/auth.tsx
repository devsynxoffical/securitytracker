'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { http, setToken, getToken, setUnauthorizedHandler } from './api';

export interface Me {
  id: string;
  companyId: string;
  code: string;
  firstName: string;
  lastName: string;
  email: string | null;
  role: { id: string; name: string; rank: number; permissions: Array<{ key: string; scope: string }> };
  overrides?: Array<{ permissionKey: string; effect: string; scope: string }>;
  department?: { id: string; name: string } | null;
  team?: { id: string; name: string } | null;
  /** FR-SEC-20/21: company data containment policy, used to hide export controls. */
  dataExportPolicy?: 'disabled' | 'super_admin' | 'permission';
}

/** Result of the first login step (F3 / FR-AUTH-07). */
export type LoginStep = { kind: 'done' } | { kind: 'requires2fa'; tempToken: string } | { kind: 'enroll'; tempToken: string };

interface TokensResponse {
  tokens?: { accessToken: string };
  requires2fa?: boolean;
  enrollmentRequired?: boolean;
  tempToken?: string;
}

interface AuthState {
  me: Me | null;
  status: 'loading' | 'anonymous' | 'authenticated';
  login: (email: string, password: string) => Promise<LoginStep>;
  startEnrollment: (tempToken: string) => Promise<{ secret: string; otpauthUrl: string; tempToken: string }>;
  confirmEnrollment: (tempToken: string, totpCode: string) => Promise<void>;
  verifyTwoFactor: (tempToken: string, totpCode: string) => Promise<void>;
  logout: () => void;
  can: (key: string) => boolean;
  /** F29: true while the deployment has no employee yet. null = unknown (not checked). */
  needsSetup: boolean | null;
  refreshSetupStatus: () => Promise<boolean>;
  bootstrap: (input: { companyName: string; timezone: string; firstName: string; lastName: string; email: string; password: string }) => Promise<{ companyId: string }>;
  /** F30 */
  forgotPassword: (email: string) => Promise<{ ok: true; devResetUrl?: string }>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);

  const refreshSetupStatus = useCallback(async () => {
    try {
      const res = await http.get<{ needsSetup: boolean }>('/setup/status');
      setNeedsSetup(res.needsSetup);
      return res.needsSetup;
    } catch {
      setNeedsSetup(false);
      return false;
    }
  }, []);

  const loadMe = useCallback(async () => {
    try {
      const data = await http.get<Me>('/me');
      setMe(data);
      setStatus('authenticated');
    } catch {
      setToken(null);
      setMe(null);
      setStatus('anonymous');
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setMe(null);
      setStatus('anonymous');
    });
    if (getToken()) void loadMe();
    else {
      setStatus('anonymous');
      void refreshSetupStatus();
    }
    return () => setUnauthorizedHandler(null);
  }, [loadMe, refreshSetupStatus]);

  const finish = useCallback(
    async (res: TokensResponse) => {
      if (!res.tokens?.accessToken) throw new Error('Server did not return a session token.');
      setToken(res.tokens.accessToken);
      await loadMe();
    },
    [loadMe],
  );

  const login = useCallback(
    async (email: string, password: string): Promise<LoginStep> => {
      const res = await http.post<TokensResponse>('/admin/auth/login', { email, password });
      if (res.tokens?.accessToken) {
        await finish(res);
        return { kind: 'done' };
      }
      if (res.enrollmentRequired && res.tempToken) return { kind: 'enroll', tempToken: res.tempToken };
      if (res.requires2fa && res.tempToken) return { kind: 'requires2fa', tempToken: res.tempToken };
      throw new Error('Unexpected response from the server.');
    },
    [finish],
  );

  const startEnrollment = useCallback(
    (tempToken: string) => http.post<{ secret: string; otpauthUrl: string; tempToken: string }>('/admin/auth/2fa/enroll', { tempToken }),
    [],
  );
  const confirmEnrollment = useCallback(
    async (tempToken: string, totpCode: string) => finish(await http.post<TokensResponse>('/admin/auth/2fa/confirm', { tempToken, totpCode })),
    [finish],
  );
  const verifyTwoFactor = useCallback(
    async (tempToken: string, totpCode: string) => finish(await http.post<TokensResponse>('/admin/auth/2fa/verify', { tempToken, totpCode })),
    [finish],
  );

  const logout = useCallback(() => {
    void http.post('/auth/logout').catch(() => undefined);
    setToken(null);
    setMe(null);
    setStatus('anonymous');
  }, []);

  const bootstrap = useCallback(
    async (input: { companyName: string; timezone: string; firstName: string; lastName: string; email: string; password: string }) => {
      const res = await http.post<{ companyId: string }>('/setup/bootstrap', input);
      setNeedsSetup(false);
      return res;
    },
    [],
  );
  const forgotPassword = useCallback((email: string) => http.post<{ ok: true; devResetUrl?: string }>('/auth/forgot-password', { email }), []);
  const resetPassword = useCallback(async (token: string, newPassword: string) => {
    await http.post('/auth/reset-password', { token, newPassword });
  }, []);

  const can = useCallback(
    (key: string) => {
      if (!me) return false;
      const override = me.overrides?.find((o) => o.permissionKey === key);
      if (override) return override.effect !== 'deny';
      return me.role.permissions.some((p) => p.key === key);
    },
    [me],
  );

  const value = useMemo(
    () => ({ me, status, login, startEnrollment, confirmEnrollment, verifyTwoFactor, logout, can, needsSetup, refreshSetupStatus, bootstrap, forgotPassword, resetPassword }),
    [me, status, login, startEnrollment, confirmEnrollment, verifyTwoFactor, logout, can, needsSetup, refreshSetupStatus, bootstrap, forgotPassword, resetPassword],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
