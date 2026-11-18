// Solmar Bay — tiny static server. Serves game/ at /, screenshots/ at
// /screenshots and shots.json at /shots.json. Node 22, standard library only.
// Run: node serve.ts — then open http://localhost:8080
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = 8080;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    let path = decodeURIComponent(url.pathname);
    if (path === '/') path = '/index.html';
    let file: string;
    if (path.startsWith('/screenshots/')) file = join(here, path);
    else if (path === '/shots.json') file = join(here, 'shots.json');
    else file = join(here, 'game', path);
    const safe = normalize(file);
    if (!safe.startsWith(here + sep)) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    const data = await readFile(safe);
    res.writeHead(200, { 'content-type': MIME[extname(safe)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

server.listen(PORT, () => {
  console.log(`Solmar Bay running at http://localhost:${PORT}`);
});
