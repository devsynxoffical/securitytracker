'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Apple, Check, Copy, Download, ExternalLink, Monitor, PackageOpen, ServerCog } from 'lucide-react';
import { clsx } from 'clsx';
import { Badge, Skeleton } from '@/components/ui';
import { dateOnly } from '@/lib/format';
import {
  RELEASES_PAGE_URL,
  assetFormat,
  assetLabel,
  detectPlatform,
  formatBytes,
  primaryAssetFor,
  useReleaseManifest,
  type ReleaseAsset,
  type ReleaseManifest,
  type VisitorPlatform,
} from '@/lib/downloads';

export function useVisitorPlatform(): VisitorPlatform {
  const [p, setP] = useState<VisitorPlatform>('other');
  useEffect(() => setP(detectPlatform()), []);
  return p;
}

function isRecommended(a: ReleaseAsset, platform: VisitorPlatform, assets: ReleaseAsset[]): boolean {
  const primary = primaryAssetFor(platform, assets);
  return !!primary && primary.url === a.url && primary.file === a.file;
}

function PlatformIcon({ asset, size = 18 }: { asset: ReleaseAsset; size?: number }) {
  if (asset.kind === 'agent') return <ServerCog size={size} />;
  if (asset.platform === 'mac') return <Apple size={size} />;
  if (asset.platform === 'windows') return <Monitor size={size} />;
  return <PackageOpen size={size} />;
}

/** No release published, manifest unreachable or malformed. Calm, nothing invented. */
export function NoReleaseCard({ compact = false }: { compact?: boolean }) {
  return (
    <div className={clsx('rounded-card border border-dashed border-line bg-surface', compact ? 'p-4' : 'p-6')}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-3">
          <PackageOpen size={18} />
        </span>
        <div className="min-w-0">
          <div className="text-base font-semibold text-ink">No release has been published yet.</div>
          <p className="mt-1 text-sm text-ink-2">Ask your administrator. Downloads appear here as soon as IT publishes a release manifest to this server.</p>
          <a href={RELEASES_PAGE_URL} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-pri hover:text-pri-2">
            Source releases on GitHub <ExternalLink size={13} />
          </a>
        </div>
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-card">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <Skeleton className="mt-5 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-5/6" />
      <Skeleton className="mt-5 h-9 w-full rounded-lg" />
    </div>
  );
}

export function CopyHash({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable; the hash is selectable as text */
    }
  };
  return (
    <div className="flex min-w-0 items-center gap-2 overflow-hidden rounded-lg border border-line bg-surface-2 px-2.5 py-1.5">
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-ink-2" title={value}>
        {value}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy SHA-256"
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-3 hover:bg-surface-3 hover:text-ink"
      >
        {copied ? <Check size={13} className="text-green" /> : <Copy size={13} />}
      </button>
    </div>
  );
}

export function AssetCard({ asset, manifest, recommended }: { asset: ReleaseAsset; manifest: ReleaseManifest; recommended: boolean }) {
  const agent = asset.kind === 'agent';
  return (
    <div className={clsx('flex min-w-0 flex-col rounded-card border bg-surface p-5 shadow-card', recommended ? 'border-pri' : 'border-line')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', agent ? 'bg-blue-soft text-blue' : 'bg-pri-soft text-pri-2')}>
            <PlatformIcon asset={asset} />
          </span>
          <div className="min-w-0">
            <div className="text-base font-semibold text-ink">{assetLabel(asset)}</div>
            <div className="text-xs text-ink-3">{assetFormat(asset)}</div>
          </div>
        </div>
        {recommended && (
          <Badge tone="primary" dot>
            For your computer
          </Badge>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-ink-3">Version</dt>
          <dd className="num font-semibold text-ink">{manifest.version}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Size</dt>
          <dd className="num font-semibold text-ink">{formatBytes(asset.size)}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Published</dt>
          <dd className="num font-semibold text-ink">{dateOnly(manifest.publishedAt)}</dd>
        </div>
      </dl>

      <div className="mt-3">
        <div className="mb-1 text-2xs font-semibold uppercase tracking-wide text-ink-3">SHA-256</div>
        <CopyHash value={asset.sha256} />
      </div>

      <div className="mt-4 flex-1" />
      <a
        href={asset.url}
        download={asset.file}
        className={clsx(
          'inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-semibold transition',
          recommended ? 'btn-primary border-pri bg-pri text-white hover:bg-pri-2' : 'btn-default border-line bg-surface text-ink hover:bg-surface-2',
        )}
      >
        <Download size={14} className="shrink-0" /> <span className="min-w-0 break-all">Download {asset.file}</span>
      </a>
      {agent && <p className="mt-2 text-xs text-ink-3">For IT only. Installs the Windows tracker service and native messaging host. Employees install the app above.</p>}
    </div>
  );
}

/** Full download grid for /install: one card per asset in the manifest. */
export function DownloadGrid() {
  const q = useReleaseManifest();
  const platform = useVisitorPlatform();

  if (q.isPending) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }
  if (q.isError || !q.data || q.data.assets.length === 0) return <NoReleaseCard />;

  const m = q.data;
  const order = (a: ReleaseAsset) => (a.kind === 'agent' ? 3 : a.platform === 'windows' ? 0 : a.platform === 'mac' ? 1 : 2) * 10 + (a.kind === 'installer' || a.kind === 'dmg' ? 0 : 1);
  const assets = [...m.assets].sort((a, b) => order(a) - order(b));
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-ink-2">
        <Badge tone="green" dot>
          Current release {m.version}
        </Badge>
        <span>Published {dateOnly(m.publishedAt)}</span>
        {m.notes && <span className="text-ink-3">· {m.notes}</span>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {assets.map((a) => (
          <AssetCard key={`${a.platform}-${a.kind}-${a.arch}-${a.file}`} asset={a} manifest={m} recommended={isRecommended(a, platform, m.assets)} />
        ))}
      </div>
    </div>
  );
}

/** Hero buttons for the landing page: Windows and Mac primary downloads, driven by the manifest. */
export function HeroDownloadButtons() {
  const q = useReleaseManifest();
  const platform = useVisitorPlatform();

  if (q.isPending) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row">
        <Skeleton className="h-11 w-full rounded-lg sm:w-48" />
        <Skeleton className="h-11 w-full rounded-lg sm:w-48" />
      </div>
    );
  }
  if (q.isError || !q.data || q.data.assets.length === 0) return <NoReleaseCard compact />;

  const m = q.data;
  const win = primaryAssetFor('windows', m.assets);
  const mac = primaryAssetFor('mac', m.assets);
  const btn = (asset: ReleaseAsset | undefined, label: string, icon: ReactNode, primary: boolean) =>
    asset ? (
      <a
        href={asset.url}
        download={asset.file}
        className={clsx(
          'inline-flex items-center justify-center gap-2 rounded-lg border px-[18px] py-[11px] text-sm font-semibold transition',
          primary ? 'btn-primary border-pri bg-pri text-white hover:bg-pri-2' : 'btn-default border-line bg-surface text-ink hover:bg-surface-2',
        )}
      >
        {icon}
        <span>{label}</span>
        <span className={clsx('num text-xs font-medium', primary ? 'text-white/80' : 'text-ink-3')}>{formatBytes(asset.size)}</span>
      </a>
    ) : null;

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        {btn(win, 'Download for Windows', <Monitor size={16} />, platform !== 'mac')}
        {btn(mac, 'Download for Mac', <Apple size={16} />, platform === 'mac')}
      </div>
      <p className="mt-2.5 text-xs text-ink-3">
        Version <span className="num font-semibold text-ink-2">{m.version}</span> · published {dateOnly(m.publishedAt)}
        {platform !== 'other' && (
          <>
            {' '}
            · <span className="text-pri">Recommended for your computer: {platform === 'windows' ? 'Windows' : 'Mac'}</span>
          </>
        )}
        {' · '}
        <a href="/install#download" className="font-semibold text-ink-2 hover:text-ink">
          All files and checksums
        </a>
      </p>
    </div>
  );
}

