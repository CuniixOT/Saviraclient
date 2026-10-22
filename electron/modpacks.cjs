const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { unzipSync, strFromU8 } = require('fflate');
const { contained } = require('./minecraft.cjs');

/*
 * Modrinth modpacks (.mrpack, also as .zip): modrinth.index.json names Minecraft, the loader and every
 * mod with its download and hashes; overrides/ and client-overrides/ hold configs and other files.
 * https://support.modrinth.com/en/articles/8802351-modrinth-modpack-format-mrpack
 */
// Download hosts the format allows.
const HOSTS = new Set(['cdn.modrinth.com', 'github.com', 'raw.githubusercontent.com', 'gitlab.com']);
const LOADERS = { 'fabric-loader': 'fabric', 'quilt-loader': 'quilt', forge: 'forge', neoforge: 'neoforge' };
const MAX_PACK = 512 * 1024 * 1024, MAX_UNPACKED = 1024 * 1024 * 1024;

// Relative paths inside the profile folder only: no drive letters, no "..", no absolute paths.
function safeRelative(value) {
  if (typeof value !== 'string' || !value || value.length > 260) return null;
  const normal = value.replaceAll('\\', '/');
  if (normal.startsWith('/') || /^[a-zA-Z]:/.test(normal) || normal.split('/').some(part => part === '..' || part === '')) return null;
  return normal;
}

/** Reads a pack and returns what the profile needs; throws with a readable reason otherwise. */
function readPack(bytes) {
  if (bytes.length > MAX_PACK) throw new Error('Das Modpack ist größer als 512 MB.');
  let unpacked = 0;
  let entries;
  try {
    entries = unzipSync(new Uint8Array(bytes), { filter: file => { unpacked += file.originalSize; if (unpacked > MAX_UNPACKED) throw new Error('Das Modpack ist entpackt größer als 1 GB.'); return !file.name.endsWith('/'); } });
  } catch (error) {
    throw new Error(/1 GB/.test(error.message) ? error.message : 'Die Datei ist kein gültiges Zip-Archiv.');
  }
  if (!entries['modrinth.index.json']) {
    if (entries['manifest.json']) throw new Error('Das ist ein CurseForge-Modpack. Savira kann zurzeit nur Modrinth-Modpacks (.mrpack) importieren.');
    throw new Error('In der Datei fehlt modrinth.index.json, sie ist kein Modrinth-Modpack.');
  }
  let index;
  try { index = JSON.parse(strFromU8(entries['modrinth.index.json'])); } catch { throw new Error('modrinth.index.json ist beschädigt.'); }
  if (index.formatVersion !== 1 || index.game !== 'minecraft') throw new Error('Dieses Modpack-Format wird nicht unterstützt.');
  const dependencies = index.dependencies || {};
  const minecraft = dependencies.minecraft;
  if (typeof minecraft !== 'string' || !/^[\w.+-]{1,40}$/.test(minecraft)) throw new Error('Das Modpack nennt keine gültige Minecraft-Version.');
  let loader = 'vanilla', loaderVersion = null;
  for (const [key, value] of Object.entries(dependencies)) {
    if (!LOADERS[key]) continue;
    if (typeof value !== 'string' || !/^[\w.+-]{1,64}$/.test(value)) throw new Error('Das Modpack nennt eine ungültige Loader-Version.');
    loader = LOADERS[key]; loaderVersion = value;
  }
  const files = (Array.isArray(index.files) ? index.files : []).filter(file => file?.env?.client !== 'unsupported').map(file => {
    const target = safeRelative(file.path);
    const sha512 = file.hashes?.sha512, sha1 = file.hashes?.sha1;
    const urls = (Array.isArray(file.downloads) ? file.downloads : []).filter(url => { try { const parsed = new URL(url); return parsed.protocol === 'https:' && HOSTS.has(parsed.hostname); } catch { return false; } });
    if (!target || !/^[a-f0-9]{128}$/i.test(sha512 || '') || !urls.length) throw new Error(`Ungültiger Eintrag im Modpack: ${String(file?.path).slice(0, 80)}`);
    return { path: target, sha512: sha512.toLowerCase(), sha1: typeof sha1 === 'string' ? sha1.toLowerCase() : null, urls, size: Number(file.fileSize) || 0 };
  });
  // overrides/ first, client-overrides/ replace them for the client.
  const overrides = [];
  for (const prefix of ['overrides/', 'client-overrides/']) {
    for (const [name, data] of Object.entries(entries)) {
      if (!name.startsWith(prefix)) continue;
      const target = safeRelative(name.slice(prefix.length));
      if (target) overrides.push({ path: target, data });
    }
  }
  const name = typeof index.name === 'string' ? index.name.replace(/[\x00-\x1f]/g, '').trim().slice(0, 40) : '';
  const icon = entries['icon.png'] && entries['icon.png'].length < 200000 ? `data:image/png;base64,${Buffer.from(entries['icon.png']).toString('base64')}` : null;
  return { name: name || `Modpack ${minecraft}`, minecraft, loader, loaderVersion, files, overrides, icon };
}

async function sha512Of(file) { try { return createHash('sha512').update(await fs.readFile(file)).digest('hex'); } catch { return null; } }

/** Downloads the mods and unpacks the overrides into the profile folder. */
async function installPack(pack, root, progress = () => {}) {
  let done = 0;
  const queue = [...pack.files];
  let failure;
  // A few downloads at once; each file is checked against its SHA-512 before it is kept.
  await Promise.all(Array.from({ length: Math.min(6, queue.length) }, async () => {
    while (queue.length && !failure) {
      const file = queue.shift();
      const target = contained(root, file.path);
      try {
        if (await sha512Of(target) !== file.sha512) {
          let bytes = null, lastError = null;
          for (const url of file.urls) {
            try {
              const response = await fetch(url, { signal: AbortSignal.timeout(180000), headers: { 'User-Agent': 'Savira (Minecraft Launcher)' } });
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              const data = Buffer.from(await response.arrayBuffer());
              if (createHash('sha512').update(data).digest('hex') !== file.sha512) throw new Error('Prüfsumme stimmt nicht');
              bytes = data; break;
            } catch (error) { lastError = error; }
          }
          if (!bytes) throw new Error(`${path.basename(file.path)} konnte nicht geladen werden (${lastError?.message || 'kein Download'}).`);
          await fs.mkdir(path.dirname(target), { recursive: true });
          await fs.writeFile(target + '.tmp', bytes);
          await fs.rename(target + '.tmp', target);
        }
        progress(++done, pack.files.length);
      } catch (error) { failure ??= error; }
    }
  }));
  if (failure) throw failure;
  for (const file of pack.overrides) {
    const target = contained(root, file.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.data);
  }
}

module.exports = { readPack, installPack, safeRelative };
