const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createSkinLibrary, fromDataUrl, skinSize } = require('../electron/skins.cjs');

const skinPath = path.join(__dirname, '..', 'public', 'default-skin.png');
const dataUrl = bytes => `data:image/png;base64,${bytes.toString('base64')}`;

test('reads the skin size and rejects wrong images', async () => {
  const bytes = await fs.readFile(skinPath);
  assert.deepEqual(skinSize(bytes), { width: 64, height: 64 });
  const icon = await fs.readFile(path.join(__dirname, '..', 'public', 'icon.png'));
  assert.throws(() => fromDataUrl(dataUrl(icon)), /64×64/);
  assert.throws(() => fromDataUrl('data:image/png;base64,bm90IHBuZw=='), /PNG/);
  assert.throws(() => fromDataUrl('data:text/html;base64,PGgxPg=='), /PNG/);
});

test('adds, renames, swaps, applies and deletes skins', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'savira-skins-'));
  const png = dataUrl(await fs.readFile(skinPath));
  const library = createSkinLibrary({ dir });
  await library.load();
  const skin = await library.add({ name: '  PvP-Skin ', variant: 'slim', png });
  assert.equal(skin.name, 'PvP-Skin');
  const renamed = await library.update(skin.id, { name: 'Turnier', variant: 'classic', png });
  assert.deepEqual([renamed.name, renamed.variant], ['Turnier', 'classic']);
  const uuid = '0'.repeat(32);
  await library.markApplied(uuid, skin.id);

  const reloaded = createSkinLibrary({ dir });
  await reloaded.load();
  const [listed] = await reloaded.list();
  assert.equal(listed.name, 'Turnier');
  assert.match(listed.png, /^data:image\/png;base64,/);
  assert.equal(reloaded.appliedFor(uuid), skin.id);

  await reloaded.remove(skin.id);
  assert.deepEqual(await reloaded.list(), []);
  assert.equal(reloaded.appliedFor(uuid), null);
  await assert.rejects(fs.access(path.join(dir, `${skin.id}.png`)));
});

test('validates names, models and ids', async () => {
  const library = createSkinLibrary({ dir: await fs.mkdtemp(path.join(os.tmpdir(), 'savira-skins-')) });
  await library.load();
  const png = dataUrl(await fs.readFile(skinPath));
  await assert.rejects(library.add({ name: '', variant: 'slim', png }));
  await assert.rejects(library.add({ name: 'x'.repeat(33), variant: 'slim', png }));
  await assert.rejects(library.add({ name: 'Skin', variant: 'wide', png }));
  await assert.rejects(library.update('../index', { name: 'Hack' }));
  await assert.rejects(library.remove('../../settings'));
});
