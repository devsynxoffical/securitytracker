import sanitizeHtml from 'sanitize-html';

/**
 * Message bodies are untrusted HTML from the internet (10 section 8b). Scripts, forms, frames and
 * event handlers are removed; remote images are blocked unless the viewer opts in, because loading
 * them leaks the reader's IP and confirms the open to the sender.
 */
export interface SanitizedBody {
  html: string;
  remoteImagesBlocked: number;
}

const REMOTE = /^\s*(https?:)?\/\//i;

export function sanitizeMailHtml(html: string | null | undefined, allowRemote = false): SanitizedBody {
  if (!html) return { html: '', remoteImagesBlocked: 0 };
  let remoteImagesBlocked = 0;
  const clean = sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'span', 'u', 'center', 'font', 'h1', 'h2', 'style']),
    allowedAttributes: {
      '*': ['style', 'align', 'valign', 'width', 'height', 'bgcolor', 'color', 'border', 'cellpadding', 'cellspacing', 'dir', 'lang'],
      a: ['href', 'name', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height', 'title', 'data-blocked-src'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel', 'cid', 'data'],
    allowedSchemesByTag: { img: ['http', 'https', 'cid', 'data'], a: ['http', 'https', 'mailto', 'tel'] },
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    transformTags: {
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer nofollow' } }),
      img: (tagName, attribs) => {
        const src = attribs.src ?? '';
        if (!allowRemote && REMOTE.test(src)) {
          remoteImagesBlocked += 1;
          const { src: _dropped, ...rest } = attribs;
          return { tagName, attribs: { ...rest, 'data-blocked-src': src, alt: attribs.alt ?? 'Remote image blocked' } };
        }
        return { tagName, attribs };
      },
    },
    exclusiveFilter: (frame) => frame.tag === 'style' && /@import|expression\(|url\(\s*['"]?\s*https?:/i.test(frame.text),
  });
  return { html: clean, remoteImagesBlocked };
}
