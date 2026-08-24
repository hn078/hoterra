const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'dist');
const port = Number(process.env.PORT) || 4173;
const host = process.env.HOST || '0.0.0.0';
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

if (!fs.existsSync(path.join(root, 'index.html'))) {
  console.error('[frontend] dist/index.html not found; run the frontend build first');
  process.exit(1);
}

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self' https://*.hoterra.net https://*.up.railway.app; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
}

const server = http.createServer((req, res) => {
  setSecurityHeaders(res);
  if (!['GET', 'HEAD'].includes(req.method || '')) {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
  } catch {
    res.writeHead(400);
    return res.end('Bad request');
  }

  const requested = path.resolve(root, `.${pathname}`);
  const safePath = requested === root || requested.startsWith(`${root}${path.sep}`) ? requested : null;
  let filePath = safePath && fs.existsSync(safePath) && fs.statSync(safePath).isFile()
    ? safePath
    : path.join(root, 'index.html');
  const ext = path.extname(filePath).toLowerCase();
  const immutableAsset = filePath.includes(`${path.sep}assets${path.sep}`);

  res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', immutableAsset ? 'public, max-age=31536000, immutable' : 'no-cache, no-store, must-revalidate');
  res.statusCode = 200;
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(filePath).on('error', () => {
    if (!res.headersSent) res.writeHead(500);
    res.end('Internal server error');
  }).pipe(res);
});

server.listen(port, host, () => console.log(`[frontend] listening on ${host}:${port}`));

function shutdown(signal) {
  console.log(`[frontend] ${signal} received; shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
