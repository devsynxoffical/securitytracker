const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || process.env.NODE_PORT || 3000;

// Resolve static assets from Next.js exported directory or public folder
const STATIC_DIRS = [
  path.join(__dirname, 'apps', 'admin', 'out'),
  path.join(__dirname, 'public'),
  path.join(__dirname)
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

function getFilePath(requestUrl) {
  const urlPath = decodeURIComponent(requestUrl.split('?')[0]);
  const cleanPath = urlPath === '/' ? '/index.html' : urlPath;

  for (const dir of STATIC_DIRS) {
    // 1. Direct match
    const directFile = path.join(dir, cleanPath);
    if (fs.existsSync(directFile) && fs.statSync(directFile).isFile()) {
      return directFile;
    }

    // 2. Direct match + .html
    const htmlFile = path.join(dir, `${cleanPath}.html`);
    if (fs.existsSync(htmlFile) && fs.statSync(htmlFile).isFile()) {
      return htmlFile;
    }

    // 3. Subdirectory index.html
    const indexFile = path.join(dir, cleanPath, 'index.html');
    if (fs.existsSync(indexFile) && fs.statSync(indexFile).isFile()) {
      return indexFile;
    }
  }

  // SPA fallback to main index.html
  for (const dir of STATIC_DIRS) {
    const fallback = path.join(dir, 'index.html');
    if (fs.existsSync(fallback) && fs.statSync(fallback).isFile()) {
      return fallback;
    }
  }

  return null;
}

const server = http.createServer((req, res) => {
  // CORS & Security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check endpoint
  if (req.url === '/health' || req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }

  // Handle API requests: Proxy to NestJS Backend on port 4000 if available, or return clean JSON
  if (req.url.startsWith('/api/')) {
    const apiTargetPort = process.env.API_PORT || 4000;
    const apiTargetHost = process.env.API_HOST || '127.0.0.1';

    const proxyReq = http.request(
      {
        host: apiTargetHost,
        port: apiTargetPort,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
      }
    );

    proxyReq.on('error', () => {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          error: {
            code: 'API_BACKEND_OFFLINE',
            message: 'Central backend API service on port 4000 is not running.',
          },
        })
      );
    });

    req.pipe(proxyReq, { end: true });
    return;
  }

  const filePath = getFilePath(req.url);

  if (!filePath) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>404 - Page Not Found</h1><p>WorkPulse Company OS</p>');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('500 Internal Server Error');
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    res.end(content);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`WorkPulse Platform Server listening on port ${PORT}`);
  console.log(`Static directories checked: ${STATIC_DIRS.join(', ')}`);
});
