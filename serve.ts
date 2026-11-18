import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

// Plain static server for Solmar Bay: serves game/ at the root and
// screenshots/ under /screenshots/. No build step, no dependencies.
const here = dirname(fileURLToPath(import.meta.url));
const PORT = 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.md': 'text/plain; charset=utf-8',
};

function safeJoin(base, requestPath) {
  const cleaned = normalize(join(base, requestPath));
  if (!cleaned.startsWith(base)) return null;
  return cleaned;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    let path = decodeURIComponent(url.pathname);
    if (path === '/') path = '/index.html';

    let file = null;
    if (path.startsWith('/screenshots/')) {
      file = safeJoin(join(here, 'screenshots'), path.slice('/screenshots/'.length));
    } else {
      file = safeJoin(join(here, 'game'), path);
    }
    if (!file || !existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('server error');
  }
});

server.listen(PORT, () => {
  console.log(`Solmar Bay running at http://localhost:${PORT}`);
});
