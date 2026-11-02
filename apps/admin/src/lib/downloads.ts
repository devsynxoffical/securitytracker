'use client';

import { useQuery } from '@tanstack/react-query';

/**
 * Release manifest for the WorkPulse desktop app. Published by IT next to the installers under
 * /downloads (Caddy serves the updates folder on the admin host) or at NEXT_PUBLIC_DOWNLOADS_URL.
 * The public pages render only what this file says: no hard-coded file names or versions.
 */
export type ReleasePlatform = 'windows' | 'mac' | 'linux';
export type ReleaseArch = 'x64' | 'arm64' | 'universal';
export type ReleaseKind = 'installer' | 'portable' | 'dmg' | 'zip' | 'agent';

export interface ReleaseAsset {
  platform: ReleasePlatform;
  arch: ReleaseArch;
  kind: ReleaseKind;
  file: string;
  url: string;
  sha256: string;
  size: number;
}

export interface ReleaseManifest {
  product: 'WorkPulse';
  version: string;
  publishedAt: string;
  notes?: string;
  assets: ReleaseAsset[];
}

export const RELEASES_PAGE_URL = 'https://github.com/devsynxoffical/securitytracker/releases';

export function manifestUrl(): string {
  return process.env.NEXT_PUBLIC_DOWNLOADS_URL || '/downloads/latest.json';
}

export class ManifestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ManifestError';
  }
}

function isAsset(a: unknown): a is ReleaseAsset {
  if (!a || typeof a !== 'object') return false;
  const o = a as Record<string, unknown>;
  return (
    typeof o.platform === 'string' &&
    typeof o.arch === 'string' &&
    typeof o.kind === 'string' &&
    typeof o.file === 'string' &&
    typeof o.url === 'string' &&
    typeof o.sha256 === 'string' &&
    typeof o.size === 'number'
  );
}

function parseManifest(json: unknown): ReleaseManifest {
  if (!json || typeof json !== 'object') throw new ManifestError('Manifest is not an object', 0);
  const o = json as Record<string, unknown>;
  if (typeof o.version !== 'string' || typeof o.publishedAt !== 'string' || !Array.isArray(o.assets)) {
    throw new ManifestError('Manifest is missing version, publishedAt or assets', 0);
  }
  return {
    product: 'WorkPulse',
    version: o.version,
    publishedAt: o.publishedAt,
    notes: typeof o.notes === 'string' ? o.notes : undefined,
    assets: o.assets.filter(isAsset),
  };
}

export async function fetchReleaseManifest(): Promise<ReleaseManifest> {
  const res = await fetch(manifestUrl(), { headers: { Accept: 'application/json' }, cache: 'no-store' });
  if (!res.ok) throw new ManifestError(`Manifest request failed (${res.status})`, res.status);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ManifestError('Manifest is not valid JSON', res.status);
  }
  return parseManifest(body);
}

export function useReleaseManifest() {
  return useQuery<ReleaseManifest, Error>({
    queryKey: ['public', 'release-manifest', manifestUrl()],
    queryFn: fetchReleaseManifest,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

export type VisitorPlatform = 'windows' | 'mac' | 'other';

/** Best-effort platform detection from the browser; used only to label the recommended download. */
export function detectPlatform(): VisitorPlatform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent || '';
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform || navigator.platform || '';
  const hay = `${platform} ${ua}`.toLowerCase();
  if (/iphone|ipad|ipod|android/.test(hay)) return 'other';
  if (/win/.test(hay)) return 'windows';
  if (/mac/.test(hay)) return 'mac';
  return 'other';
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

export function assetLabel(a: ReleaseAsset): string {
  if (a.kind === 'agent') return 'Windows tracker agent (IT)';
  if (a.platform === 'windows') {
    if (a.kind === 'portable') return 'Windows portable';
    if (a.kind === 'zip') return 'Windows (zip)';
    return 'Windows installer';
  }
  if (a.platform === 'mac') {
    if (a.kind === 'zip') return 'macOS (zip)';
    return a.arch === 'universal' ? 'macOS (Universal)' : `macOS (${a.arch === 'arm64' ? 'Apple silicon' : 'Intel'})`;
  }
  return `Linux ${a.kind} (${a.arch})`;
}

export function assetFormat(a: ReleaseAsset): string {
  const ext = a.file.includes('.') ? a.file.slice(a.file.lastIndexOf('.') + 1).toLowerCase() : a.kind;
  const arch = a.arch === 'universal' ? 'universal' : a.arch;
  return `.${ext} · ${arch}`;
}

/** Primary download per visitor platform: Windows installer first, macOS dmg first. */
export function primaryAssetFor(platform: VisitorPlatform, assets: ReleaseAsset[]): ReleaseAsset | undefined {
  if (platform === 'windows') return assets.find((a) => a.platform === 'windows' && a.kind === 'installer') ?? assets.find((a) => a.platform === 'windows' && a.kind !== 'agent');
  if (platform === 'mac') return assets.find((a) => a.platform === 'mac' && a.kind === 'dmg') ?? assets.find((a) => a.platform === 'mac');
  return undefined;
}
