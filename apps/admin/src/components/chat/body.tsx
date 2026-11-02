'use client';

import type { ReactNode } from 'react';
import { clsx } from 'clsx';

/**
 * Renders the chat Markdown subset (22 section 1: bold, italic, code, links) and @mentions as React
 * nodes. No HTML is ever injected; URLs are only linked when they start with http(s).
 */
export interface MentionName {
  id: string;
  name: string;
}

const TOKEN = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*|_[^_\n]+_)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'")\]])|(@[\p{L}][\p{L}\p{N}'’.-]*(?: [\p{L}][\p{L}\p{N}'’.-]*)?)/giu;

export function renderBody(body: string, mentions: MentionName[], selfId?: string): ReactNode[] {
  const out: ReactNode[] = [];
  const names = [...mentions].sort((a, b) => b.name.length - a.name.length);
  let last = 0;
  let key = 0;
  for (const m of body.matchAll(TOKEN)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(body.slice(last, idx));
    const [raw, code, bold, italic, url, mention] = m;
    if (code) out.push(<code key={key++} className="rounded bg-surface-3 px-1 py-px font-mono text-[12px] text-ink">{code.slice(1, -1)}</code>);
    else if (bold) out.push(<strong key={key++} className="font-semibold">{bold.slice(2, -2)}</strong>);
    else if (italic) out.push(<em key={key++}>{italic.slice(1, -1)}</em>);
    else if (url) out.push(<a key={key++} href={url} target="_blank" rel="noopener noreferrer" className="text-pri underline-offset-2 hover:underline">{url}</a>);
    else if (mention) {
      const text = mention.slice(1).toLowerCase();
      const hit = names.find((n) => text === n.name.toLowerCase() || text.startsWith(n.name.toLowerCase() + ' '));
      if (hit) {
        const trailing = mention.slice(1 + hit.name.length);
        out.push(
          <span key={key++} className={clsx('rounded px-1 font-medium', hit.id === selfId ? 'bg-amber-soft text-amber-text' : 'bg-pri-soft text-pri-2')}>
            @{hit.name}
          </span>,
        );
        if (trailing) out.push(trailing);
      } else out.push(raw);
    } else out.push(raw);
    last = idx + raw.length;
  }
  if (last < body.length) out.push(body.slice(last));
  return out;
}

/** Plain-text preview for the channel list. */
export function previewText(body: string, max = 60): string {
  const flat = body.replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
