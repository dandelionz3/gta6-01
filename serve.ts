// Solmar Bay — tiny static file server (Node 22, standard library only).
// Serves game/ at / and screenshots/ at /screenshots so the game runs
// from plain static files with no build step: `node serve.ts`.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const port = parseInt(process.env.PORT || "8080", 10);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/favicon.ico") { // no favicon file by design — answer quietly
      res.writeHead(204);
      res.end();
      return;
    }
    if (rel === "/") rel = "/index.html";
    // screenshots live beside game/, game files live under game/
    const candidates = rel.startsWith("/screenshots/")
      ? [join(here, normalize(rel))]
      : [join(here, "game", normalize(rel))];
    const file = candidates[0];
    if (!file.startsWith(here) || !existsSync(file)) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("server error");
  }
});

server.listen(port, () => {
  console.log(`Solmar Bay running at http://localhost:${port}/`);
});
