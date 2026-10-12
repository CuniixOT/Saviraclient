const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { skinSize } = require('./skins.cjs');

// The player's own capes plus favourites, like the cape section of the NoRisk launcher.
// capes/index.json: names, favourites (keys "custom:<id>" or "vanilla:<capeId>") and the
// cape currently worn in the game; capes/<id>.png: the textures.
const MAX_CAPES = 60;
const ID = /^[0-9a-f-]{36}$/;
const FAVORITE = /^(custom:[0-9a-f-]{36}|vanilla:[0-9a-f-]{36})$/;
const WIDTHS = [64, 128, 256, 512, 1024];
// private: only this player; public: shared with everyone once the Savira server exists.
const VISIBILITY = ['private', 'public'];

/** Capes use a 2:1 layout: 64x32, or a larger multiple for HD capes. */
function assertCape(bytes) {
  const size = skinSize(bytes);
  if (!size) throw new Error('Das ist keine gültige PNG-Datei.');
  if (!WIDTHS.includes(size.width) || size.height * 2 !== size.width) throw new Error(`Ein Cape muss 64×32 Pixel groß sein (oder 128×64, 256×128 …). Diese Datei: ${size.width}×${size.height}.`);
  return bytes;
}
function capeFromDataUrl(value) {
  const match = typeof value === 'string' && /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match || match[1].length > 2_800_000) throw new Error('Das ist keine gültige PNG-Datei.');
  return assertCape(Buffer.from(match[1], 'base64'));
}
function cleanName(name) {
  const value = typeof name === 'string' ? name.trim() : '';
  if (!value || value.length > 32 || /[\x00-\x1f]/.test(value)) throw new Error('Der Cape-Name muss 1 bis 32 Zeichen lang sein.');
  return value;
}

function cleanVisibility(value) {
  if (!VISIBILITY.includes(value)) throw new Error('Unbekannte Sichtbarkeit.');
  return value;
}

function createCapeLibrary({ dir }) {
  const indexFile = path.join(dir, 'index.json');
  const file = id => path.join(dir, `${id}.png`);
  let data = { capes: [], favorites: [], active: null };
  async function persist() {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(indexFile + '.tmp', JSON.stringify(data, null, 2));
    await fs.rename(indexFile + '.tmp', indexFile);
  }
  const find = id => {
    const cape = typeof id === 'string' && ID.test(id) ? data.capes.find(item => item.id === id) : null;
    if (!cape) throw new Error('Dieses Cape existiert nicht mehr.');
    return cape;
  };
  return {
    file,
    async load() {
      try {
        const raw = JSON.parse(await fs.readFile(indexFile, 'utf8'));
        const capes = (Array.isArray(raw?.capes) ? raw.capes : []).filter(c => ID.test(c?.id) && typeof c.name === 'string').slice(0, MAX_CAPES)
          .map(c => ({ id: c.id, name: c.name, added: c.added, visibility: VISIBILITY.includes(c.visibility) ? c.visibility : 'private' }));
        const favorites = [...new Set((Array.isArray(raw?.favorites) ? raw.favorites : []).filter(key => FAVORITE.test(key)))];
        data = { capes, favorites, active: capes.some(c => c.id === raw?.active) ? raw.active : null };
      } catch { data = { capes: [], favorites: [], active: null }; }
      return data;
    },
    async list() {
      const capes = [];
      for (const cape of data.capes) {
        try { capes.push({ ...cape, png: `data:image/png;base64,${(await fs.readFile(file(cape.id))).toString('base64')}` }); } catch { /* Texture missing: hide it. */ }
      }
      return { capes: capes.sort((a, b) => b.added - a.added), favorites: [...data.favorites], active: data.active };
    },
    /** File of the cape worn in the game, or null. */
    activeFile: () => data.active ? file(data.active) : null,
    async add({ name, png, visibility = 'private' }) {
      if (data.capes.length >= MAX_CAPES) throw new Error(`Es können höchstens ${MAX_CAPES} Capes gespeichert werden.`);
      const cape = { id: randomUUID(), name: cleanName(name), added: Date.now(), visibility: cleanVisibility(visibility) };
      const bytes = capeFromDataUrl(png);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(file(cape.id), bytes);
      data.capes.push(cape);
      await persist();
      return cape;
    },
    /** Rename and/or change who can see the cape; omitted fields stay. */
    async update(id, { name, visibility } = {}) {
      const cape = find(id);
      const next = { name: name === undefined ? cape.name : cleanName(name), visibility: visibility === undefined ? cape.visibility : cleanVisibility(visibility) };
      Object.assign(cape, next);
      await persist();
      return { ...cape };
    },
    async remove(id) {
      const cape = find(id);
      data.capes = data.capes.filter(item => item.id !== cape.id);
      data.favorites = data.favorites.filter(key => key !== `custom:${cape.id}`);
      if (data.active === cape.id) data.active = null;
      await Promise.all([persist(), fs.rm(file(cape.id), { force: true })]);
    },
    /** Wear one of the own capes in the game; null takes it off. */
    async setActive(id) { data.active = id === null ? null : find(id).id; await persist(); },
    async toggleFavorite(key) {
      if (typeof key !== 'string' || !FAVORITE.test(key)) throw new Error('Unbekanntes Cape.');
      if (key.startsWith('custom:')) find(key.slice(7));
      data.favorites = data.favorites.includes(key) ? data.favorites.filter(item => item !== key) : [...data.favorites, key];
      await persist();
      return data.favorites.includes(key);
    }
  };
}

module.exports = { createCapeLibrary, assertCape, capeFromDataUrl, MAX_CAPES };
