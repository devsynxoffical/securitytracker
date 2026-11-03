import type { NextFunction, Request, Response } from 'express';

/**
 * GET /downloads/latest.json for the install page (apps/admin/src/lib/downloads.ts) when no file server
 * exists: reads the newest `desktop-v*` GitHub Release of RELEASES_REPO and returns its latest.json
 * (written by .github/workflows/release-desktop.yml). Asset URLs point at the release's public
 * downloads. GITHUB_TOKEN is optional (higher rate limit, or a private repository's metadata).
 * Cached in memory for five minutes; on errors the page shows its "no release yet" state.
 */
const CACHE_MS = 5 * 60_000;
let cache: { at: number; body: string | null } | null = null;

export function releaseManifestHandler() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.path !== '/downloads/latest.json' || (req.method !== 'GET' && req.method !== 'HEAD')) return next();
    try {
      const body = await manifest();
      if (!body) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No desktop release has been published yet' } });
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.type('application/json').send(body);
    } catch {
      res.status(502).json({ error: { code: 'RELEASES_UNAVAILABLE', message: 'Release information is temporarily unavailable' } });
    }
  };
}

async function manifest(): Promise<string | null> {
  const now = performance.now();
  if (cache && now - cache.at < CACHE_MS) return cache.body;
  const repo = process.env.RELEASES_REPO || 'devsynxoffical/securitytracker';
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'workpulse-api' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const list = await fetchJson<Array<{ tag_name: string; draft: boolean; assets: Array<{ name: string; browser_download_url: string }> }>>(
    `https://api.github.com/repos/${repo}/releases?per_page=20`,
    headers,
  );
  const release = pickDesktopRelease(list);
  const asset = release?.assets.find((a) => a.name === 'latest.json');
  const body = asset ? await fetchText(asset.browser_download_url, { 'User-Agent': 'workpulse-api' }) : null;
  cache = { at: now, body };
  return body;
}

/** Newest published (non-draft) release whose tag is `desktop-v<semver>`; GitHub lists newest first. */
export function pickDesktopRelease<T extends { tag_name: string; draft: boolean }>(releases: T[]): T | null {
  return releases.find((r) => !r.draft && /^desktop-v\d+\.\d+\.\d+/.test(r.tag_name)) ?? null;
}

async function fetchJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  return JSON.parse(await fetchText(url, headers)) as T;
}

async function fetchText(url: string, headers: Record<string, string>): Promise<string> {
  const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}
