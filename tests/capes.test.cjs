const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { createCapeLibrary, capeFromDataUrl } = require('../electron/capes.cjs');

// Minimal valid PNG of the given size (transparent pixels).
function png(width, height) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, body) => { const len = Buffer.alloc(4), sum = Buffer.alloc(4); len.writeUInt32BE(body.length); sum.writeUInt32BE(crc(Buffer.concat([Buffer.from(type), body]))); return Buffer.concat([len, Buffer.from(type), body, sum]); };
  const head = Buffer.alloc(13); head.writeUInt32BE(width, 0); head.writeUInt32BE(height, 4); head[8] = 8; head[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const dataUrl = bytes => `data:image/png;base64,${bytes.toString('base64')}`;

test('accepts 2:1 capes including HD and rejects other sizes', () => {
  assert.ok(capeFromDataUrl(dataUrl(png(64, 32))));
  assert.ok(capeFromDataUrl(dataUrl(png(512, 256))));
  assert.throws(() => capeFromDataUrl(dataUrl(png(64, 64))), /64×32/);
  assert.throws(() => capeFromDataUrl(dataUrl(png(100, 50))), /64×32/);
  assert.throws(() => capeFromDataUrl('data:image/png;base64,AAAA'), /PNG/);
});

test('adds, renames, wears, favours and deletes capes', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'savira-capes-'));
  const library = createCapeLibrary({ dir });
  await library.load();
  const cape = await library.add({ name: ' Mein Cape ', png: dataUrl(png(64, 32)) });
  assert.equal(cape.name, 'Mein Cape');
  assert.equal(cape.visibility, 'private');
  await library.update(cape.id, { name: 'Turnier-Cape', visibility: 'public' });
  await assert.rejects(library.update(cape.id, { visibility: 'everyone' }));
  await library.setActive(cape.id);
  assert.equal(await library.toggleFavorite(`custom:${cape.id}`), true);
  const vanilla = 'vanilla:2340c0e0-3a8d-4a43-a1b4-6b2c1d5e9f00';
  assert.equal(await library.toggleFavorite(vanilla), true);
  assert.equal(library.activeFile(), path.join(dir, `${cape.id}.png`));

  const reloaded = createCapeLibrary({ dir });
  await reloaded.load();
  const state = await reloaded.list();
  assert.deepEqual([state.capes[0].name, state.capes[0].visibility], ['Turnier-Cape', 'public']);
  assert.equal(state.active, cape.id);
  assert.deepEqual(state.favorites, [`custom:${cape.id}`, vanilla]);

  await reloaded.remove(cape.id);
  const after = await reloaded.list();
  assert.deepEqual([after.capes, after.active, after.favorites], [[], null, [vanilla]]);
  assert.equal(await reloaded.toggleFavorite(vanilla), false);
});

test('rejects unknown ids and favourite keys', async () => {
  const library = createCapeLibrary({ dir: await fs.mkdtemp(path.join(os.tmpdir(), 'savira-capes-')) });
  await library.load();
  await assert.rejects(library.setActive('../index'));
  await assert.rejects(library.remove('../../settings'));
  await assert.rejects(library.toggleFavorite('custom:../../x'));
  await assert.rejects(library.toggleFavorite(`custom:${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}`));
  await assert.rejects(library.add({ name: '', png: dataUrl(png(64, 32)) }));
});
