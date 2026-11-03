import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { isApiPath, pageFileFor } from '../src/common/web-root';

describe('web root routing', () => {
  it('leaves API, websocket and socket.io paths to the API', () => {
    expect(isApiPath('/api/v1/health')).toBe(true);
    expect(isApiPath('/api')).toBe(true);
    expect(isApiPath('/socket.io/?EIO=4')).toBe(true);
    expect(isApiPath('/ws')).toBe(true);
  });
  it('treats site pages as web paths', () => {
    expect(isApiPath('/')).toBe(false);
    expect(isApiPath('/admin')).toBe(false);
    expect(isApiPath('/admin/crm/leads')).toBe(false);
    expect(isApiPath('/install')).toBe(false);
    expect(isApiPath('/apiary')).toBe(false);
  });
});

describe('clean URL pages', () => {
  const root = mkdtempSync(join(tmpdir(), 'web-'));
  writeFileSync(join(root, 'admin.html'), 'admin');
  mkdirSync(join(root, 'admin', 'crm'), { recursive: true });
  writeFileSync(join(root, 'admin', 'crm', 'leads.html'), 'leads');
  it('maps clean routes with or without a trailing slash', () => {
    expect(pageFileFor(root, '/admin')).toBe(join(root, 'admin.html'));
    expect(pageFileFor(root, '/admin/')).toBe(join(root, 'admin.html'));
    expect(pageFileFor(root, '/admin/crm/leads')).toBe(join(root, 'admin', 'crm', 'leads.html'));
  });
  it('refuses traversal, files with extensions and missing pages', () => {
    expect(pageFileFor(root, '/../etc/passwd')).toBeNull();
    expect(pageFileFor(root, '/%2e%2e/secret')).toBeNull();
    expect(pageFileFor(root, '/logo.jpg')).toBeNull();
    expect(pageFileFor(root, '/nope')).toBeNull();
    expect(pageFileFor(root, '/')).toBeNull();
  });
});


import { pickDesktopRelease } from '../src/common/release-manifest';
describe('desktop release selection', () => {
  it('takes the newest published desktop-v release and skips drafts and other tags', () => {
    const list = [
      { tag_name: 'desktop-v1.2.0', draft: true },
      { tag_name: 'v1.0.0', draft: false },
      { tag_name: 'desktop-v1.1.0', draft: false },
      { tag_name: 'desktop-v1.0.0', draft: false },
    ];
    expect(pickDesktopRelease(list)?.tag_name).toBe('desktop-v1.1.0');
    expect(pickDesktopRelease([{ tag_name: 'v1.0.0', draft: false }])).toBeNull();
  });
});
