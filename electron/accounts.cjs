const fs = require('node:fs/promises');
const path = require('node:path');

// Every signed-in Microsoft account, like the account switcher in the NoRisk launcher.
// The file holds only names, UUIDs and msmc refresh tokens, encrypted as a whole with the
// Windows credential protection (safeStorage). Skins are cached per account next to it.
const MAX_ACCOUNTS = 10;
const UUID = /^[0-9a-f]{32}$/i;
const NAME = /^[A-Za-z0-9_]{1,16}$/;
const normalize = uuid => String(uuid ?? '').replace(/-/g, '').toLowerCase();

function sanitize(data) {
  const list = (Array.isArray(data?.list) ? data.list : [])
    .map(entry => ({ uuid: normalize(entry?.uuid), name: entry?.name, token: entry?.token }))
    .filter(entry => UUID.test(entry.uuid) && NAME.test(entry.name) && typeof entry.token === 'string' && entry.token.length > 0)
    .slice(0, MAX_ACCOUNTS);
  const active = list.some(entry => entry.uuid === data?.active) ? data.active : list[0]?.uuid ?? null;
  return { active, list };
}

function createAccountStore({ dir, encrypt, decrypt }) {
  const file = path.join(dir, 'accounts.bin');
  let data = { active: null, list: [] };
  const find = uuid => data.list.find(entry => entry.uuid === uuid);
  async function persist() {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(file + '.tmp', encrypt(JSON.stringify(data)));
    await fs.rename(file + '.tmp', file);
  }
  return {
    file,
    skinPath: uuid => path.join(dir, 'skins', `${uuid}.png`),
    async load() {
      try { data = sanitize(JSON.parse(decrypt(await fs.readFile(file)))); } catch { data = { active: null, list: [] }; }
      return data;
    },
    list: () => data.list.map(({ uuid, name }) => ({ uuid, name })),
    active: () => find(data.active) || null,
    get: uuid => find(normalize(uuid)) || null,
    /** Adds the account or refreshes its name and token, and makes it the active one. */
    async upsert({ uuid, name, token }) {
      const entry = sanitize({ list: [{ uuid, name, token }] }).list[0];
      if (!entry) throw new Error('Ungültiges Minecraft-Konto.');
      const index = data.list.findIndex(item => item.uuid === entry.uuid);
      if (index >= 0) data.list[index] = entry;
      else if (data.list.length >= MAX_ACCOUNTS) throw new Error(`Es können höchstens ${MAX_ACCOUNTS} Konten gespeichert werden.`);
      else data.list.push(entry);
      data.active = entry.uuid;
      await persist();
      return entry;
    },
    async setActive(uuid) {
      const entry = find(normalize(uuid));
      if (!entry) throw new Error('Dieses Konto ist nicht mehr gespeichert.');
      data.active = entry.uuid;
      await persist();
      return entry;
    },
    /** Removes the account; the first remaining one becomes active. */
    async remove(uuid) {
      const id = normalize(uuid);
      if (!find(id)) throw new Error('Dieses Konto ist nicht mehr gespeichert.');
      data.list = data.list.filter(entry => entry.uuid !== id);
      if (data.active === id) data.active = data.list[0]?.uuid ?? null;
      await Promise.all([persist(), fs.rm(path.join(dir, 'skins', `${id}.png`), { force: true })]);
      return find(data.active) || null;
    }
  };
}

module.exports = { createAccountStore, MAX_ACCOUNTS };
