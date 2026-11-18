// Solmar Bay — dossier builder for the gta6-01 entry.
// Copies game/ and screenshots/ next to this file into the output directory,
// then writes dossier.json with the kit's buildDossier helper.
// Node 22, standard library only; run with: MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

mkdirSync(outDir, { recursive: true });
for (const name of ['game', 'screenshots']) {
  const src = join(here, name);
  if (existsSync(src)) cpSync(src, join(outDir, name), { recursive: true });
}

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});

writeFileSync(join(outDir, 'dossier.json'), dossier);

// Sanity report: the dossier must stay under the 1.5 MiB cap, and the whole
// output under 64 MiB. Fail loudly instead of shipping an oversize bundle.
const dossierBytes = Buffer.byteLength(dossier);
console.log(`dossier written: ${join(outDir, 'dossier.json')} (${dossierBytes} bytes)`);
if (dossierBytes > 1500000) {
  console.error('ERROR: dossier exceeds the 1.5 MiB cap');
  process.exitCode = 1;
}
