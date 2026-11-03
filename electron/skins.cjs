const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { validSkinPng } = require('./skin.cjs');

// The player's skin wardrobe, like the skins page in the NoRisk launcher.
// skins/index.json holds names, models, favourites and where a skin came from, skins/<id>.png the textures.
const MAX_SKINS = 60;
const ID = /^[0-9a-f-]{36}$/;
const VARIANTS = ['classic', 'slim'];
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
// A skin taken from the SkinMC gallery remembers its id there; favourites are own skins or gallery skins.
const SOURCE = new RegExp(`^skinmc:${UUID}$`);
const FAVORITE = new RegExp(`^(own|skinmc):${UUID}$`);
const MAX_FAVORITES = 500;
const cleanAuthor = author => typeof author === 'string' && author.trim() && author.length <= 40 && !/[\x00-\x1f]/.test(author) ? author.trim() : null;

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
  let data = { skins: [], applied: {}, favorites: [], authors: {} };
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
        const skins = (Array.isArray(raw?.skins) ? raw.skins : []).filter(s => ID.test(s?.id) && typeof s.name === 'string' && VARIANTS.includes(s.variant)).slice(0, MAX_SKINS)
          .map(s => SOURCE.test(s.source) ? s : { id: s.id, name: s.name, variant: s.variant, added: s.added });
        const applied = Object.fromEntries(Object.entries(raw?.applied || {}).filter(([uuid, id]) => /^[0-9a-f]{32}$/.test(uuid) && skins.some(s => s.id === id)));
        const favorites = [...new Set((Array.isArray(raw?.favorites) ? raw.favorites : []).filter(key => typeof key === 'string' && FAVORITE.test(key)))].slice(0, MAX_FAVORITES);
        const authors = Object.fromEntries(favorites.filter(key => key.startsWith('skinmc:')).map(key => [key, cleanAuthor(raw?.authors?.[key])]));
        data = { skins, applied, favorites, authors };
      } catch { data = { skins: [], applied: {}, favorites: [], authors: {} }; }
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
    /** Favourite keys, newest last, and the uploader of each favourite gallery skin. */
    favorites: () => ({ favorites: [...data.favorites], authors: { ...data.authors } }),
    async toggleFavorite(key, author) {
      if (typeof key !== 'string' || !FAVORITE.test(key)) throw new Error('Unbekannter Skin.');
      if (key.startsWith('own:')) find(key.slice(4));
      if (data.favorites.includes(key)) { data.favorites = data.favorites.filter(item => item !== key); delete data.authors[key]; }
      else {
        if (data.favorites.length >= MAX_FAVORITES) throw new Error(`Es können höchstens ${MAX_FAVORITES} Favoriten gespeichert werden.`);
        data.favorites.push(key);
        if (key.startsWith('skinmc:')) data.authors[key] = cleanAuthor(author);
      }
      await persist();
      return data.favorites.includes(key);
    },
    texture: async id => fs.readFile(file(find(id).id)),
    get: id => ({ ...find(id) }),
    async add({ name, variant, png, source }) {
      if (source !== undefined && (typeof source !== 'string' || !SOURCE.test(source))) throw new Error('Unbekannte Herkunft.');
      // A gallery skin is only stored once.
      const known = source && data.skins.find(item => item.source === source);
      if (known) return { ...known };
      if (data.skins.length >= MAX_SKINS) throw new Error(`Es können höchstens ${MAX_SKINS} Skins gespeichert werden.`);
      const skin = { id: randomUUID(), name: cleanName(name), variant: cleanVariant(variant), added: Date.now(), ...(source ? { source } : {}) };
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
      data.favorites = data.favorites.filter(key => key !== `own:${skin.id}`);
      for (const [uuid, applied] of Object.entries(data.applied)) if (applied === skin.id) delete data.applied[uuid];
      await Promise.all([persist(), fs.rm(file(skin.id), { force: true })]);
    },
    async markApplied(uuid, id) { find(id); data.applied[uuid] = id; await persist(); }
  };
}

module.exports = { createSkinLibrary, assertSkin, fromDataUrl, skinSize, MAX_SKINS };
