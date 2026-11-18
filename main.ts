// Solmar Bay — build entrypoint (Node 22, standard library only).
// Copies game/ and screenshots/ next to this file into the output
// directory and writes dossier.json via the kit's buildDossier.
import { cp, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-game.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
const gameDir = join(here, "game");
const shotsDir = join(here, "screenshots");

await mkdir(outDir, { recursive: true });
await cp(gameDir, join(outDir, "game"), { recursive: true });
if (existsSync(shotsDir)) {
  await cp(shotsDir, join(outDir, "screenshots"), { recursive: true });
} else {
  await mkdir(join(outDir, "screenshots"), { recursive: true });
}

const dossier = await buildDossier(
  outDir,
  {
    text_max_bytes: 163840,
    screenshots: { dir: join(outDir, "screenshots"), max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }
);

// buildDossier returns the dossier document as raw bytes (a Uint8Array
// of JSON text) — write those bytes verbatim, do not re-stringify them.
await writeFile(join(outDir, "dossier.json"), dossier);
const dossierBytes = dossier.length;
console.log("dossier written:", join(outDir, "dossier.json"), `(${dossierBytes} bytes)`);
