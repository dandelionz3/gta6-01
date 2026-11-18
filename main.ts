// Build script for the Solmar Bay entry (gta6-01).
// Copies game/ + screenshots/ next to the output dir and writes dossier.json
// using the kit's buildDossier helper. Node 22, standard library only.

import { cp, mkdir, writeFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-game.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";

async function walkSize(dir) {
  let total = 0;
  let files = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const sub = await walkSize(p);
      total += sub.total;
      files += sub.files;
    } else {
      total += (await stat(p)).size;
      files += 1;
    }
  }
  return { total, files };
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const gameSrc = path.join(here, "game");
  const shotsSrc = path.join(here, "screenshots");
  const gameDst = path.join(outDir, "game");
  const shotsDst = path.join(outDir, "screenshots");
  await cp(gameSrc, gameDst, { recursive: true });
  if (existsSync(shotsSrc)) {
    await cp(shotsSrc, shotsDst, { recursive: true });
  } else {
    await mkdir(shotsDst, { recursive: true });
  }
  // Fail fast with a readable message when a staged shot is missing,
  // instead of letting the dossier builder fail cryptically later.
  const shotFiles = existsSync(shotsDst) ? await readdir(shotsDst) : [];
  const jpgs = shotFiles.filter((f) => f.toLowerCase().endsWith(".jpg"));
  if (jpgs.length !== 4) {
    console.error(`expected 4 screenshots, found ${jpgs.length}: ${jpgs.join(", ")}`);
    process.exit(1);
  }
  const dossier = buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  });
  await writeFile(path.join(outDir, "dossier.json"), dossier);
  const gameStats = await walkSize(gameDst);
  const dossierBytes = (await stat(path.join(outDir, "dossier.json"))).size;
  const outStats = await walkSize(outDir);
  console.log(`dossier written: ${path.join(outDir, "dossier.json")} (${dossierBytes} bytes)`);
  console.log(`game files: ${gameStats.files}, game bytes: ${gameStats.total}`);
  console.log(`total output bytes: ${outStats.total}`);
  // Enforce the competition size limits here, not after submission.
  if (dossierBytes >= 1572864) {
    console.error(`dossier too large: ${dossierBytes} bytes (limit 1.5 MiB)`);
    process.exit(1);
  }
  if (outStats.total >= 67108864) {
    console.error(`total output too large: ${outStats.total} bytes (limit 64 MiB)`);
    process.exit(1);
  }
  if (gameStats.total >= 50331648) {
    console.error(`game too large: ${gameStats.total} bytes (limit 48 MiB)`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
