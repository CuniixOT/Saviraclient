const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { validSkinPng } = require('./skin.cjs');

// The player's skin wardrobe, like the skins page in the NoRisk launcher.
// skins/index.json holds names and models, skins/<id>.png the textures.
const MAX_SKINS = 60;
const ID = /^[0-9a-f-]{36}$/;
const VARIANTS = ['classic', 'slim'];

/** Minecraft skins are 64x64 (or legacy 64x32) PNGs; read the size from the IHDR chunk. */
function skinSize(bytes) {
  if (!validSkinPng(bytes) || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
function assertSkin(bytes) {
  const size = skinSize(bytes);
  if (!size) throw new Error('Das ist keine gültige PNG-Datei.');
  if (size.width !== 64 || (size.height !== 64 && size.height !== 32)) throw new Error(`Ein Skin muss 64×64 Pixel groß sein (diese Datei: ${size.width}×${size.height}).`);
  return bytes;
}
function cleanName(name) {
  const value = typeof name === 'string' ? name.trim() : '';
  if (!value || value.length > 32 || /[\x00-\x1f]/.test(value)) throw new Error('Der Skin-Name muss 1 bis 32 Zeichen lang sein.');
  return value;
}
function cleanVariant(variant) {
  if (!VARIANTS.includes(variant)) throw new Error('Unbekanntes Skin-Modell.');
  return variant;
}
/** "data:image/png;base64,…" from the renderer → PNG bytes. */
function fromDataUrl(value) {
  const match = typeof value === 'string' && /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match || match[1].length > 2_800_000) throw new Error('Das ist keine gültige PNG-Datei.');
  return assertSkin(Buffer.from(match[1], 'base64'));
}

function createSkinLibrary({ dir }) {
  const indexFile = path.join(dir, 'index.json');
  const file = id => path.join(dir, `${id}.png`);
  let data = { skins: [], applied: {} };
  async function persist() {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(indexFile + '.tmp', JSON.stringify(data, null, 2));
    await fs.rename(indexFile + '.tmp', indexFile);
  }
  const find = id => {
    const skin = typeof id === 'string' && ID.test(id) ? data.skins.find(item => item.id === id) : null;
    if (!skin) throw new Error('Dieser Skin existiert nicht mehr.');
    return skin;
  };
  return {
    async load() {
      try {
        const raw = JSON.parse(await fs.readFile(indexFile, 'utf8'));
        const skins = (Array.isArray(raw?.skins) ? raw.skins : []).filter(s => ID.test(s?.id) && typeof s.name === 'string' && VARIANTS.includes(s.variant)).slice(0, MAX_SKINS);
        const applied = Object.fromEntries(Object.entries(raw?.applied || {}).filter(([uuid, id]) => /^[0-9a-f]{32}$/.test(uuid) && skins.some(s => s.id === id)));
        data = { skins, applied };
      } catch { data = { skins: [], applied: {} }; }
      return data;
    },
    /** All skins with their texture as a data URL, newest first. */
    async list() {
      const result = [];
      for (const skin of data.skins) {
        try { result.push({ ...skin, png: `data:image/png;base64,${(await fs.readFile(file(skin.id))).toString('base64')}` }); } catch { /* Texture missing: hide the entry. */ }
      }
      return result.sort((a, b) => b.added - a.added);
    },
    appliedFor: uuid => data.applied[uuid] || null,
    texture: async id => fs.readFile(file(find(id).id)),
    get: id => ({ ...find(id) }),
    async add({ name, variant, png }) {
      if (data.skins.length >= MAX_SKINS) throw new Error(`Es können höchstens ${MAX_SKINS} Skins gespeichert werden.`);
      const skin = { id: randomUUID(), name: cleanName(name), variant: cleanVariant(variant), added: Date.now() };
      const bytes = fromDataUrl(png);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(file(skin.id), bytes);
      data.skins.push(skin);
      await persist();
      return skin;
    },
    /** Rename, switch the model or swap the texture; omitted fields stay as they are. */
    async update(id, { name, variant, png } = {}) {
      const skin = find(id);
      const next = { ...skin, name: name === undefined ? skin.name : cleanName(name), variant: variant === undefined ? skin.variant : cleanVariant(variant) };
      if (png !== undefined) await fs.writeFile(file(skin.id), fromDataUrl(png));
      Object.assign(skin, next);
      await persist();
      return { ...skin };
    },
    async remove(id) {
      const skin = find(id);
      data.skins = data.skins.filter(item => item.id !== skin.id);
      for (const [uuid, applied] of Object.entries(data.applied)) if (applied === skin.id) delete data.applied[uuid];
      await Promise.all([persist(), fs.rm(file(skin.id), { force: true })]);
    },
    async markApplied(uuid, id) { find(id); data.applied[uuid] = id; await persist(); }
  };
}

module.exports = { createSkinLibrary, assertSkin, fromDataUrl, skinSize, MAX_SKINS };
