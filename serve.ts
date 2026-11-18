// Solmar Bay — plain static file server for local play. Serves game/ at
// the root (so / loads game/index.html) and screenshots/ under /screenshots/.
// No dependencies, no build step: `node serve.ts`, then open
// http://localhost:8080
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const gameRoot = join(here, 'game');
const shotsRoot = join(here, 'screenshots');
const port = Number(process.env.PORT || 8080);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file;
  if (url === '/') {
    file = join(gameRoot, 'index.html');
  } else if (url.startsWith('/screenshots/')) {
    file = join(shotsRoot, url.slice('/screenshots/'.length));
  } else {
    file = join(gameRoot, url);
  }
  if (!file.startsWith(gameRoot) && !file.startsWith(shotsRoot)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': types[extname(file).toLowerCase()] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

server.listen(port, () => {
  console.log(`Solmar Bay serving at http://localhost:${port}`);
});
