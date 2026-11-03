import { existsSync } from 'fs';
import { join } from 'path';
import type { NextFunction, Request, Response } from 'express';
import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Serves the admin panel and public site (Next.js static export) from the API's own origin, so one
 * address hosts `/`, `/install`, `/admin/...` and the API under `/api/v1`. The export is baked into the
 * production image at /app/public; WEB_ROOT overrides the location (development: apps/admin/out).
 * Same origin means the panel calls the API at the relative `/api/v1` with no CORS setup.
 */
export function serveWebRoot(app: NestExpressApplication): string | null {
  const root = process.env.WEB_ROOT || join(process.cwd(), 'public');
  if (!existsSync(join(root, 'index.html'))) return null;

  // Security headers for the HTML pages (the API's JSON responses are unaffected).
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!isApiPath(req.path)) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    }
    next();
  });

  // Next.js writes clean routes as <route>.html next to a folder of the same name (admin.html + admin/).
  // Resolve /admin and /admin/ to admin.html before the folder lookup would redirect or miss.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if ((req.method === 'GET' || req.method === 'HEAD') && !isApiPath(req.path)) {
      const page = pageFileFor(root, req.path);
      if (page) {
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(page);
        return;
      }
    }
    next();
  });

  app.useStaticAssets(root, {
    redirect: false,
    extensions: ['html'],
    index: 'index.html',
    maxAge: '1h',
    setHeaders: (res, path) => {
      if (path.includes(`${join('_next', 'static')}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      else if (path.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  });

  // Unknown page paths get the site's 404 page instead of the API's JSON 404.
  const notFound = join(root, '404.html');
  app.use((req: Request, res: Response, next: NextFunction) => {
    if ((req.method === 'GET' || req.method === 'HEAD') && !isApiPath(req.path) && existsSync(notFound)) {
      res.status(404).sendFile(notFound);
      return;
    }
    next();
  });
  return root;
}

/** `/admin/crm/` -> `<root>/admin/crm.html` when that page exists; never escapes the root. */
export function pageFileFor(root: string, urlPath: string): string | null {
  let clean: string;
  try {
    clean = decodeURIComponent(urlPath).replace(/\/+$/, '');
  } catch {
    return null;
  }
  if (!clean || clean.includes('..') || clean.includes('\0') || /\.[a-z0-9]+$/i.test(clean)) return null;
  const file = join(root, `${clean}.html`);
  return file.startsWith(root) && existsSync(file) ? file : null;
}

export function isApiPath(path: string): boolean {
  return path.startsWith('/api/') || path === '/api' || path.startsWith('/socket.io') || path.startsWith('/ws');
}
