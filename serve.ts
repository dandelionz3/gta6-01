// Minimal static file server for local playtesting of Solmar Bay.
// Serves the game/ directory at http://localhost:8080 (or $PORT).

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "game");
const port = Number(process.env.PORT || 8080);

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".css": "text/css",
  ".jpg": "image/jpeg",
  ".png": "image/png",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/") rel = "/index.html";
    const file = path.join(root, rel);
    if (!file.startsWith(root)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    const data = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});

server.listen(port, () => {
  console.log(`Solmar Bay serving at http://localhost:${port}`);
});
