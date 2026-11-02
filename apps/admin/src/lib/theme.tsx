'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type Density = 'comfortable' | 'compact';

interface ThemeState {
  theme: Theme;
  resolved: 'light' | 'dark';
  density: Density;
  sidebarCollapsed: boolean;
  setTheme: (t: Theme) => void;
  setDensity: (d: Density) => void;
  setSidebarCollapsed: (v: boolean) => void;
}

const Ctx = createContext<ThemeState | null>(null);

/* Per-viewer conveniences only (DESIGN-SYSTEM section 9). Every read and write is guarded. */
function read<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [density, setDensityState] = useState<Density>('comfortable');
  const [sidebarCollapsed, setCollapsedState] = useState(false);
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    setThemeState(read('cos.theme', 'system'));
    setDensityState(read('cos.density', 'comfortable'));
    setCollapsedState(read<'open' | 'collapsed'>('cos.sidebar', 'open') === 'collapsed');
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(mq.matches);
    const h = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  const resolved: 'light' | 'dark' = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', resolved);
    root.setAttribute('data-density', density);
  }, [resolved, density]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    write('cos.theme', t);
  }, []);
  const setDensity = useCallback((d: Density) => {
    setDensityState(d);
    write('cos.density', d);
  }, []);
  const setSidebarCollapsed = useCallback((v: boolean) => {
    setCollapsedState(v);
    write('cos.sidebar', v ? 'collapsed' : 'open');
  }, []);

  const value = useMemo(
    () => ({ theme, resolved, density, sidebarCollapsed, setTheme, setDensity, setSidebarCollapsed }),
    [theme, resolved, density, sidebarCollapsed, setTheme, setDensity, setSidebarCollapsed],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
