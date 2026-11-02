#!/usr/bin/env node
/**
 * Builds latest.json for the install page (apps/admin/src/lib/downloads.ts) from a folder of release files.
 *
 *   node scripts/release-manifest.mjs <dir> <version> <owner/repo> [downloadBase]
 *
 * downloadBase (e.g. https://admin.example.com/downloads or https://updates.example.com) makes asset URLs
 * point at the company's own server under <base>/releases/<version>/<file>. Without it the URLs point at the
 * GitHub Release assets, which only work when the repository is public.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [dir, version, repo, downloadBase = ''] = process.argv.slice(2);
if (!dir || !version || !repo) {
  console.error('usage: release-manifest.mjs <dir> <version> <owner/repo> [downloadBase]');
  process.exit(1);
}

function classify(file) {
  const f = file.toLowerCase();
  if (!f.startsWith('workpulse-') || f.endsWith('.sha256') || f.endsWith('.json')) return null;
  if (f.includes('agent')) return { platform: 'windows', arch: 'x64', kind: 'agent' };
  if (f.startsWith('workpulse-setup-') && f.endsWith('.exe')) return { platform: 'windows', arch: 'x64', kind: 'installer' };
  if (f.startsWith('workpulse-portable-') && f.endsWith('.exe')) return { platform: 'windows', arch: 'x64', kind: 'portable' };
  if (f.endsWith('.dmg')) return { platform: 'mac', arch: f.includes('arm64') ? 'arm64' : f.includes('x64') ? 'x64' : 'universal', kind: 'dmg' };
  if (f.includes('-mac-') && f.endsWith('.zip')) return { platform: 'mac', arch: f.includes('arm64') ? 'arm64' : f.includes('x64') ? 'x64' : 'universal', kind: 'zip' };
  if (f.endsWith('.appimage')) return { platform: 'linux', arch: f.includes('arm64') ? 'arm64' : 'x64', kind: 'zip' };
  return null;
}

const base = downloadBase ? `${downloadBase.replace(/\/+$/, '')}/releases/${version}` : `https://github.com/${repo}/releases/download/desktop-v${version}`;
const order = { installer: 0, dmg: 1, portable: 2, zip: 3, agent: 4 };
const assets = readdirSync(dir)
  .map((file) => ({ file, meta: classify(file) }))
  .filter((a) => a.meta)
  .map(({ file, meta }) => {
    const path = join(dir, file);
    const sha256 = createHash('sha256').update(readFileSync(path)).digest('hex');
    return { ...meta, file, url: `${base}/${encodeURIComponent(file)}`, sha256, size: statSync(path).size };
  })
  .sort((a, b) => a.platform.localeCompare(b.platform) || order[a.kind] - order[b.kind]);

if (assets.length === 0) {
  console.error(`no WorkPulse-* release files found in ${dir}`);
  process.exit(1);
}

process.stdout.write(
  JSON.stringify(
    {
      product: 'WorkPulse',
      version,
      publishedAt: new Date().toISOString(),
      notes: `WorkPulse ${version}. Release notes: https://github.com/${repo}/releases/tag/desktop-v${version}`,
      assets,
    },
    null,
    2,
  ) + '\n',
);
