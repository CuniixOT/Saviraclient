// Writes the font definitions of the in-game menus: one Minecraft font per family and pixel size,
// so every text is drawn one glyph pixel per screen pixel (see MenuType.java).
// Families, as in the launcher (design 2026-11): Inter SemiBold (titles), JetBrains Mono (labels in
// capitals) and Inter Medium (text); then the Phosphor icons (regular, fill).
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('client-mod/src/main/resources/assets/savira/font');
const range = (from, to, step = 1) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);
const families = {
  px: { file: 'savira:inter_semibold.ttf', sizes: [...range(6, 24), ...range(26, 80, 2)] },
  sk: { file: 'savira:jetbrains_mono.ttf', sizes: range(6, 30) },
  ui: { file: 'savira:inter.ttf', sizes: [...range(6, 24), ...range(26, 40, 2)] },
  ic: { file: 'savira:phosphor.ttf', sizes: [...range(8, 30), ...range(32, 44, 2)] },
  icf: { file: 'savira:phosphor_fill.ttf', sizes: range(12, 44, 2) }
};
for (const name of fs.readdirSync(dir)) if (/^(px|sk|ui|ic|icf)_\d+\.json$/.test(name)) fs.rmSync(path.join(dir, name));
let count = 0;
for (const [prefix, { file, sizes }] of Object.entries(families)) {
  for (const size of sizes) {
    const providers = [{ type: 'ttf', file, size, oversample: 1, shift: [0, 0] }];
    // Text families fall back to Minecraft's font for glyphs they lack.
    if (!prefix.startsWith('ic')) providers.push({ type: 'reference', id: 'minecraft:default' });
    fs.writeFileSync(path.join(dir, `${prefix}_${size}.json`), JSON.stringify({ providers }, null, 2) + '\n');
    count++;
  }
}
console.log(`${count} Schriftgrößen geschrieben`);
