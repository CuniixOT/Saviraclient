const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createPanoramaStore, PANORAMAS, FACES } = require('../electron/panoramas.cjs');

const sha1 = bytes => createHash('sha1').update(bytes).digest('hex');

// Fake Mojang servers: two versions share a panorama, one has a corrupt download.
function fakeMojang() {
  const files = new Map(), calls = { bytes: 0 };
  const index = tag => ({ objects: Object.fromEntries(FACES.map((key, i) => { const bytes = Buffer.from(`${tag}-${i}`); files.set(sha1(bytes), bytes); return [key, { hash: sha1(bytes) }]; })) });
  const indexes = { 'trails': index('trails'), 'wild': index('trails'), 'cliffs': index('cliffs') };
  // The 1.17.1 index points at a file whose content does not match its hash.
  indexes.caves = { objects: Object.fromEntries(FACES.map(key => [key, { hash: 'a'.repeat(40) }])) };
  files.set('a'.repeat(40), Buffer.from('kaputt'));
  const byVersion = Object.fromEntries(PANORAMAS.map(p => [p.version, p.id]));
  return {
    calls,
    fetchJson: async url => {
      if (url.includes('version_manifest')) return { versions: PANORAMAS.map(p => ({ id: p.version, url: `https://meta/${p.version}.json` })) };
      const version = url.match(/meta\/(.+)\.json$/)?.[1];
      if (version) return { assetIndex: { url: `https://index/${byVersion[version]}` } };
      const id = url.split('/').pop();
      if (!indexes[id]) throw new Error('offline');
      return indexes[id];
    },
    fetchBytes: async url => { calls.bytes++; return files.get(url.split('/').pop()); }
  };
}

test('downloads distinct panoramas once, skips duplicates and broken ones', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'savira-panoramas-'));
  const mojang = fakeMojang();
  const store = createPanoramaStore({ dir, ...mojang });
  const list = await store.ensure();
  assert.deepEqual(list.map(p => p.id), ['trails', 'cliffs']);
  assert.equal((await fs.readFile(path.join(dir, 'trails', 'panorama_3.png'))).toString(), 'trails-3');
  await assert.rejects(fs.access(path.join(dir, 'caves', 'panorama_0.png')));
  const downloads = mojang.calls.bytes;
  // Cached: no second download.
  assert.deepEqual((await store.ensure()).map(p => p.id), ['trails', 'cliffs']);
  assert.equal(mojang.calls.bytes, downloads);
});
