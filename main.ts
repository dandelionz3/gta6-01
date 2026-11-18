// Solmar Bay — dossier build entry point (Node 22+, standard library only).
// Copies game/ and screenshots/ next to this file into the output
// directory, then asks the make.fun kit to build dossier.json from them.
import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

mkdirSync(outDir, { recursive: true });

const gameSrc = join(here, 'game');
const shotsSrc = join(here, 'screenshots');
cpSync(gameSrc, join(outDir, 'game'), { recursive: true });
if (existsSync(shotsSrc)) {
  cpSync(shotsSrc, join(outDir, 'screenshots'), { recursive: true });
}

// A dossier with a missing or stale screenshot is a silent failure, so
// check the four staged shots are present before building.
const expectedShots = ['1-cover.jpg', '2-drive.jpg', '3-mission.jpg', '4-chase.jpg'];
for (const shot of expectedShots) {
  const shotPath = join(outDir, 'screenshots', shot);
  if (!existsSync(shotPath)) {
    console.warn(`warning: missing screenshot ${shot} — capture the staged shots before submitting`);
  }
}

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});

writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`dossier written: ${join(outDir, 'dossier.json')} (${dossier.length} bytes)`);

// Size summary for the build log: the dossier and the payload both have
// hard caps, and this is where a blown budget shows up first.
function dirBytes(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    total += entry.isDirectory() ? dirBytes(p) : statSync(p).size;
  }
  return total;
}
console.log(`game bytes: ${dirBytes(join(outDir, 'game'))} (max 50331648)`);
console.log(`total out bytes: ${dirBytes(outDir)} (max 67108864)`);
