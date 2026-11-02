'use client';

import { useEffect, useRef, useState } from 'react';
import { Paperclip, Download, Image as ImageIcon, FileText, FileArchive, FileSpreadsheet, File as FileIcon, Loader2, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import { getApiBaseUrl, getToken } from '@/lib/api';
import { useMessageBody, type MailAttachment, type MailMessage } from '@/lib/queries/mail';
import { Button, Skeleton, ErrorBanner, useToast } from '@/components/ui';

/* ---------------------------------------------------------------------------
   Message body: fetched on demand (10 §4.3), rendered in a sandboxed iframe.
   The server sanitises the HTML; remote images stay blocked until the reader
   opts in (allowRemote=true), which protects against tracking pixels.
--------------------------------------------------------------------------- */

const FRAME_CSS = `
  :root { color-scheme: light dark; }
  html, body { margin: 0; padding: 0; background: transparent; }
  body { font: 14px/1.55 Inter, -apple-system, Segoe UI, Roboto, sans-serif; color: var(--ink, #1f2328); word-break: break-word; overflow-wrap: anywhere; }
  img { max-width: 100%; height: auto; }
  table { max-width: 100%; }
  blockquote { margin: 8px 0; padding-left: 10px; border-left: 2px solid #c8ced6; color: #5b6470; }
  pre { white-space: pre-wrap; }
  a { color: #2459c4; }
`;

function frameDoc(html: string, ink: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><base target="_blank"><style>${FRAME_CSS.replace('var(--ink, #1f2328)', ink)}</style></head><body>${html}</body></html>`;
}

function HtmlFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);
  const ink = typeof window !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#1f2328' : '#1f2328';
  const measure = () => {
    const doc = ref.current?.contentDocument;
    if (!doc?.body) return;
    const h = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
    if (h > 0) setHeight(Math.min(h + 8, 6000));
  };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const t = window.setInterval(measure, 500); // images loading change the height; stop after a few seconds
    const stop = window.setTimeout(() => window.clearInterval(t), 6000);
    return () => { window.clearInterval(t); window.clearTimeout(stop); };
  }, [html]);
  return (
    <iframe
      ref={ref}
      title="Message"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      srcDoc={frameDoc(html, ink)}
      onLoad={measure}
      className="block w-full border-0 bg-transparent"
      style={{ height }}
    />
  );
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function attachmentIcon(mime: string, name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (mime.startsWith('image/')) return <ImageIcon size={16} />;
  if (mime === 'application/pdf' || ext === 'pdf') return <FileText size={16} />;
  if (/zip|rar|7z|tar|gzip/.test(mime) || ['zip', 'rar', '7z', 'gz'].includes(ext)) return <FileArchive size={16} />;
  if (/sheet|excel|csv/.test(mime) || ['xls', 'xlsx', 'csv'].includes(ext)) return <FileSpreadsheet size={16} />;
  if (/word|text|document/.test(mime) || ['doc', 'docx', 'txt', 'rtf'].includes(ext)) return <FileText size={16} />;
  return <FileIcon size={16} />;
}

async function downloadAttachment(mailboxId: string, messageId: string, a: MailAttachment) {
  const res = await fetch(`${getApiBaseUrl()}/mail/mailboxes/${mailboxId}/messages/${messageId}/attachments/${encodeURIComponent(a.partId)}`, {
    headers: { Authorization: `Bearer ${getToken() ?? ''}`, 'X-Client-Type': 'admin' },
  });
  if (!res.ok) {
    let msg = `Download failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: { message?: string }; message?: string };
      msg = body.error?.message || body.message || msg;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = a.fileName || 'attachment';
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function AttachmentList({ mailboxId, messageId, items, canDownload }: { mailboxId: string; messageId: string; items: MailAttachment[]; canDownload: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  if (!items.length) return null;
  const get = async (a: MailAttachment) => {
    setBusy(a.partId);
    try {
      await downloadAttachment(mailboxId, messageId, a);
    } catch (e) {
      toast.push('error', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="mt-3 border-t border-line-2 pt-3">
      <div className="mb-1.5 inline-flex items-center gap-1 text-2xs font-semibold uppercase text-ink-3"><Paperclip size={11} /> {items.length} attachment{items.length === 1 ? '' : 's'}</div>
      <ul className="flex flex-wrap gap-2">
        {items.map((a) => (
          <li key={a.partId} className="flex max-w-full items-center gap-2.5 rounded-card border border-line bg-surface-2/60 py-1.5 pl-2.5 pr-1.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface text-ink-2">{attachmentIcon(a.mime, a.fileName)}</span>
            <span className="min-w-0">
              <span className="block max-w-[220px] truncate text-sm font-semibold text-ink" title={a.fileName}>{a.fileName || '(unnamed)'}</span>
              <span className="block font-mono text-2xs text-ink-3">{formatBytes(a.size)}{a.mime ? ` · ${a.mime.split('/').pop()}` : ''}</span>
            </span>
            {canDownload ? (
              <Button size="sm" variant="ghost" icon={busy === a.partId ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} disabled={busy !== null} onClick={() => get(a)} aria-label={`Download ${a.fileName}`}>
                Download
              </Button>
            ) : (
              <span className="px-2 text-2xs text-ink-3" title="Your mailbox permissions do not include download">no access</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MessageBody({ mailboxId, message, expanded, onExpand, canDownload }: { mailboxId: string; message: MailMessage; expanded: boolean; onExpand: () => void; canDownload: boolean }) {
  const [allowRemote, setAllowRemote] = useState(false);
  const body = useMessageBody(mailboxId, message.id, { enabled: expanded, allowRemote });

  if (!expanded) {
    return (
      <button type="button" onClick={onExpand} className="group mt-2 flex w-full items-start gap-2 text-left">
        <span className="line-clamp-2 flex-1 text-base text-ink-2">{message.snippet ?? <span className="text-ink-3">(no preview)</span>}</span>
        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-pri opacity-70 group-hover:opacity-100">Show full message <ChevronDown size={12} /></span>
      </button>
    );
  }

  if (body.isLoading) {
    return (
      <div className="mt-3 space-y-2">
        <Skeleton className="h-3 w-11/12" /><Skeleton className="h-3 w-4/5" /><Skeleton className="h-3 w-2/3" />
      </div>
    );
  }
  if (body.isError) return <div className="mt-3"><ErrorBanner message={(body.error as Error).message} onRetry={() => body.refetch()} /></div>;
  const d = body.data;
  if (!d) return null;
  // The server strips remote image sources until allowRemote=true, so the client cannot tell whether any were removed.
  return (
    <div className="mt-3">
      {d.html && !allowRemote && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-surface-2 px-2.5 py-1.5 text-xs text-ink-2">
          <span className="inline-flex items-center gap-1.5"><ImageIcon size={12} /> Remote images are blocked to protect privacy.</span>
          <button type="button" onClick={() => setAllowRemote(true)} className="font-semibold text-pri hover:underline">Load remote images</button>
        </div>
      )}
      {d.html ? (
        <HtmlFrame html={d.html} />
      ) : d.text ? (
        <pre className={clsx('whitespace-pre-wrap break-words font-sans text-base leading-relaxed text-ink')}>{d.text}</pre>
      ) : (
        <div className="text-base text-ink-3">{message.snippet ?? '(empty message)'}</div>
      )}
      <AttachmentList mailboxId={mailboxId} messageId={message.id} items={d.attachments ?? []} canDownload={canDownload} />
    </div>
  );
}
