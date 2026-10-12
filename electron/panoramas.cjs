const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

// Title-screen panoramas of earlier Minecraft updates for the in-game main menu.
// They are Mojang's own assets, so nothing is bundled: like every other game file they are
// downloaded from Mojang's asset servers (checked by SHA-1) and cached in userData/panoramas.
const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const RESOURCES = 'https://resources.download.minecraft.net';
const FACES = [0, 1, 2, 3, 4, 5].map(i => `minecraft/textures/gui/title/background/panorama_${i}.png`);
// Newest first; versions whose panorama equals the previous one are skipped automatically.
// Before 1.14 the panorama lived inside the game jar instead of the asset index, so the list starts there.
const PANORAMAS = [
  { id: 'trails', version: '1.20.1', label: 'Trails & Tales' },
  { id: 'wild', version: '1.19.2', label: 'The Wild Update' },
  { id: 'cliffs', version: '1.18.2', label: 'Caves & Cliffs II' },
  { id: 'caves', version: '1.17.1', label: 'Caves & Cliffs I' },
  { id: 'nether', version: '1.16.5', label: 'Nether Update' },
  { id: 'bees', version: '1.15.2', label: 'Buzzy Bees' },
  { id: 'village', version: '1.14.4', label: 'Village & Pillage' }
];
const HASH = /^[0-9a-f]{40}$/;

function createPanoramaStore({ dir, fetchJson, fetchBytes, log = () => {} }) {
  const indexFile = path.join(dir, 'index.json');
  let running = null;
  async function readIndex() {
    try {
      const list = JSON.parse(await fs.readFile(indexFile, 'utf8'));
      return Array.isArray(list) ? list.filter(p => PANORAMAS.some(known => known.id === p.id)) : [];
    } catch { return []; }
  }
  async function complete(id) {
    for (let i = 0; i < 6; i++) { try { await fs.access(path.join(dir, id, `panorama_${i}.png`)); } catch { return false; } }
    return true;
  }
  async function download() {
    const manifest = await fetchJson(MANIFEST);
    const done = [], seen = new Set();
    for (const panorama of PANORAMAS) {
      try {
        const entry = manifest.versions?.find(v => v.id === panorama.version);
        if (!entry?.url) continue;
        const version = await fetchJson(entry.url);
        const assets = await fetchJson(version.assetIndex.url);
        const hashes = FACES.map(key => assets.objects?.[key]?.hash);
        if (!hashes.every(hash => HASH.test(hash || '')) || seen.has(hashes[0])) continue;
        seen.add(hashes[0]);
        const target = path.join(dir, panorama.id);
        await fs.mkdir(target, { recursive: true });
        for (let i = 0; i < 6; i++) {
          const file = path.join(target, `panorama_${i}.png`);
          try { if (createHash('sha1').update(await fs.readFile(file)).digest('hex') === hashes[i]) continue; } catch { /* Not there yet. */ }
          const bytes = await fetchBytes(`${RESOURCES}/${hashes[i].slice(0, 2)}/${hashes[i]}`);
          if (createHash('sha1').update(bytes).digest('hex') !== hashes[i]) throw new Error('Prüfsumme stimmt nicht.');
          await fs.writeFile(file, bytes);
        }
        done.push({ id: panorama.id, label: panorama.label, version: panorama.version });
      } catch (error) {
        log(`Panorama ${panorama.label} übersprungen: ${error instanceof Error ? error.message : error}`);
      }
    }
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(indexFile, JSON.stringify(done, null, 2));
    return done;
  }
  return {
    dir,
    /** Cached panoramas; downloads the missing ones once (later calls reuse the same run). */
    async ensure() {
      const cached = await readIndex();
      const ready = [];
      for (const p of cached) if (await complete(p.id)) ready.push(p);
      if (ready.length && ready.length === cached.length && cached.length > 0) return ready;
      running ??= download().finally(() => { running = null; });
      return running;
    },
    readIndex
  };
}

module.exports = { createPanoramaStore, PANORAMAS, FACES };
