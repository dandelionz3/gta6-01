import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Solmar Bay build entry: copies the game and its screenshots into the
// output directory, then asks the kit's dossier builder to describe
// the whole submission in one dossier.json.
const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';
mkdirSync(outDir, { recursive: true });

for (const folder of ['game', 'screenshots']) {
  const src = join(here, folder);
  if (existsSync(src)) {
    cpSync(src, join(outDir, folder), { recursive: true });
  }
}

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});

const dossierPath = join(outDir, 'dossier.json');
writeFileSync(dossierPath, dossier);

// Fail closed on size: a dossier over the limit would be rejected
// downstream, so refuse to report success instead of shipping it.
function treeBytes(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    total += entry.isDirectory() ? treeBytes(p) : statSync(p).size;
  }
  return total;
}

const dossierBytes = statSync(dossierPath).size;
const gameBytes = treeBytes(join(outDir, 'game'));
console.log(`dossier: ${dossierBytes} bytes, game dir: ${gameBytes} bytes`);
if (dossierBytes >= 1572864) {
  throw new Error(`dossier too large: ${dossierBytes} bytes (limit 1.5 MiB)`);
}
console.log(`dossier written: ${dossierPath} (${dossier.length} bytes)`);
