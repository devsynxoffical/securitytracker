import { describe, it, expect } from 'vitest';
import { sanitizeMailHtml } from '../src/mail/mail-sanitizer';

describe('sanitizeMailHtml', () => {
  it('removes scripts, event handlers, frames and javascript links', () => {
    const r = sanitizeMailHtml('<p onclick="x()">Hi</p><script>alert(1)</script><iframe src="https://evil"></iframe><a href="javascript:alert(1)">x</a><form action="/steal"><input></form>');
    expect(r.html).toBe('<p>Hi</p><a target="_blank" rel="noopener noreferrer nofollow">x</a>');
  });

  it('blocks remote images by default and counts them', () => {
    const r = sanitizeMailHtml('<img src="https://track.example/p.gif" alt="pixel"><img src="cid:logo1"><img src="//cdn.example/a.png">');
    expect(r.remoteImagesBlocked).toBe(2);
    expect(r.html).toContain('data-blocked-src="https://track.example/p.gif"');
    expect(r.html).not.toContain(' src="https://track.example/p.gif"');
    expect(r.html).toContain('src="cid:logo1"');
  });

  it('keeps remote images when the viewer opts in', () => {
    const r = sanitizeMailHtml('<img src="https://cdn.example/a.png" width="10">', true);
    expect(r.remoteImagesBlocked).toBe(0);
    expect(r.html).toBe('<img src="https://cdn.example/a.png" width="10" />');
  });

  it('keeps layout markup customers send and opens links in a new tab', () => {
    const r = sanitizeMailHtml('<table><tr><td style="color:red" colspan="2">Hi <b>there</b></td></tr></table><a href="https://acme.com">site</a>');
    expect(r.html).toContain('<td style="color:red" colspan="2">');
    expect(r.html).toContain('<a href="https://acme.com" target="_blank" rel="noopener noreferrer nofollow">site</a>');
  });

  it('drops style blocks that import or load remote resources', () => {
    expect(sanitizeMailHtml('<style>@import url(https://evil/x.css);</style><style>p{color:red}</style><p>x</p>').html).toBe('<style>p{color:red}</style><p>x</p>');
    expect(sanitizeMailHtml(null).html).toBe('');
  });
});
