const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const { unzipSync, strFromU8 } = require('fflate');
const { contained } = require('./minecraft.cjs');

/*
 * What a profile folder holds (mods, resource packs, shaders, data packs, worlds, servers,
 * screenshots) and adding to it from Modrinth. Every path from the renderer is checked to stay
 * inside its folder; downloads come only from Modrinth's CDN and are checked against their SHA-512.
 */
const KINDS = {
  mods: { dir: 'mods', ext: '.jar', type: 'mod' },
  resourcepacks: { dir: 'resourcepacks', ext: '.zip', type: 'resourcepack' },
  shaderpacks: { dir: 'shaderpacks', ext: '.zip', type: 'shader' },
  datapacks: { dir: 'datapacks', ext: '.zip', type: 'datapack' },
};
// Searchable on the Mods page, but installed as a new profile instead of into one.
const SEARCH_TYPES = { ...Object.fromEntries(Object.entries(KINDS).map(([kind, entry]) => [kind, entry.type])), modpacks: 'modpack' };
const typeOf = kind => { if (!SEARCH_TYPES[kind]) throw new Error('Unbekannte Inhaltsart.'); return SEARCH_TYPES[kind]; };
const API = 'https://api.modrinth.com/v2';
const USER_AGENT = 'Savira (github.com/CuniixOT/Saviraclient)';
const DISABLED = '.disabled';
// Files the launcher puts into every Savira profile itself.
const MANAGED = /^(savira-client-[\w.]+\.jar|fabric-api-[\w.+-]+\.jar)$/;
const FILE_NAME = /^[^\\/:*?"<>|\x00-\x1f]{1,160}$/;
const PROJECT_ID = /^[A-Za-z0-9]{8}$/;

function kindOf(kind) {
  const entry = KINDS[kind];
  if (!entry) throw new Error('Unbekannte Inhaltsart.');
  return entry;
}
// A file name from the renderer: one entry directly inside the kind's folder.
function entryPath(root, kind, file) {
  if (typeof file !== 'string' || !FILE_NAME.test(file) || file === '.' || file === '..') throw new Error('Ungültiger Dateiname.');
  return contained(path.join(root, kindOf(kind).dir), file);
}

async function modrinth(route, init = {}) {
  const response = await fetch(`${API}${route}`, { ...init, signal: AbortSignal.timeout(30000), headers: { 'User-Agent': USER_AGENT, ...(init.body ? { 'Content-Type': 'application/json' } : {}) } });
  if (!response.ok) throw new Error(`Modrinth antwortet nicht (HTTP ${response.status}).`);
  return response.json();
}
const sha = (algorithm, bytes) => createHash(algorithm).update(bytes).digest('hex');

// Name, version and icon from the file itself, cached by path, size and time.
const metaCache = new Map();
function pngData(bytes) {
  if (!bytes || bytes.length > 300000 || bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return null;
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
}
function tomlValue(text, key) { return new RegExp(`^\\s*${key}\\s*=\\s*["']([^"'\\n]*)["']`, 'm').exec(text)?.[1] || null; }
function readMeta(kind, bytes) {
  const wanted = kind === 'mods'
    ? ['fabric.mod.json', 'quilt.mod.json', 'META-INF/mods.toml', 'META-INF/neoforge.mods.toml', 'META-INF/MANIFEST.MF']
    : ['pack.mcmeta', 'pack.png'];
  let entries;
  try { entries = unzipSync(new Uint8Array(bytes), { filter: file => wanted.includes(file.name) }); } catch { return {}; }
  const text = name => entries[name] ? strFromU8(entries[name]) : null;
  const icon = name => { if (!name || typeof name !== 'string') return null; try { return pngData(unzipSync(new Uint8Array(bytes), { filter: file => file.name === name.replace(/^\//, '') })[name.replace(/^\//, '')]); } catch { return null; } };
  if (kind !== 'mods') {
    let description = null;
    try { const value = JSON.parse(text('pack.mcmeta') || '{}').pack?.description; description = typeof value === 'string' ? value : Array.isArray(value) ? value.map(part => typeof part === 'string' ? part : part?.text || '').join('') : value?.text || null; } catch { /* No description. */ }
    return { description: description?.replace(/§./g, '').slice(0, 120) || null, icon: pngData(entries['pack.png']) };
  }
  try {
    if (text('fabric.mod.json')) {
      const info = JSON.parse(text('fabric.mod.json'));
      const iconPath = typeof info.icon === 'string' ? info.icon : info.icon && Object.entries(info.icon).sort((a, b) => Number(b[0]) - Number(a[0]))[0]?.[1];
      return { name: info.name || info.id, version: info.version, icon: icon(iconPath) };
    }
    if (text('quilt.mod.json')) {
      const info = JSON.parse(text('quilt.mod.json')).quilt_loader || {};
      return { name: info.metadata?.name || info.id, version: info.version, icon: icon(typeof info.metadata?.icon === 'string' ? info.metadata.icon : null) };
    }
  } catch { /* Broken metadata: fall back to the file name. */ }
  const toml = text('META-INF/neoforge.mods.toml') || text('META-INF/mods.toml');
  if (toml) {
    let version = tomlValue(toml, 'version');
    if (!version || version.includes('${')) version = /^Implementation-Version:\s*(\S+)/m.exec(text('META-INF/MANIFEST.MF') || '')?.[1] || null;
    return { name: tomlValue(toml, 'displayName'), version, icon: icon(tomlValue(toml, 'logoFile')) };
  }
  return {};
}

// Modrinth knows most files by their SHA-1: project, version and icon, cached per hash.
const projectCache = new Map();
async function identify(hashes) {
  const unknown = hashes.filter(hash => !projectCache.has(hash));
  if (unknown.length) {
    for (let i = 0; i < unknown.length; i += 400) {
      const chunk = unknown.slice(i, i + 400);
      const versions = await modrinth('/version_files', { method: 'POST', body: JSON.stringify({ hashes: chunk, algorithm: 'sha1' }) });
      const ids = [...new Set(Object.values(versions).map(version => version.project_id))];
      const projects = ids.length ? await modrinth(`/projects?ids=${encodeURIComponent(JSON.stringify(ids))}`) : [];
      const byId = new Map(projects.map(project => [project.id, project]));
      for (const hash of chunk) {
        const version = versions[hash], project = version && byId.get(version.project_id);
        projectCache.set(hash, project ? { projectId: project.id, versionId: version.id, slug: project.slug, type: project.project_type, title: project.title, icon: project.icon_url || null, versionNumber: version.version_number } : null);
      }
    }
  }
  return new Map(hashes.map(hash => [hash, projectCache.get(hash) || null]));
}

function loaderFilter(kind, profile) {
  if (kind === 'mods') return profile.loader === 'quilt' ? ['quilt', 'fabric'] : profile.loader === 'vanilla' ? [] : [profile.loader];
  if (kind === 'datapacks') return ['datapack'];
  return [];
}

/** Everything of one kind in a profile, with Modrinth info and available updates where it knows the file. */
async function list(root, kind, profile) {
  const { dir, ext } = kindOf(kind);
  const folder = path.join(root, dir);
  let entries = [];
  try { entries = await fs.readdir(folder, { withFileTypes: true }); } catch { return []; }
  const items = [];
  for (const entry of entries) {
    const enabled = !entry.name.endsWith(DISABLED);
    const base = enabled ? entry.name : entry.name.slice(0, -DISABLED.length);
    const isFile = entry.isFile() && base.toLowerCase().endsWith(ext);
    // Packs may also be plain folders; those are listed but cannot be switched off by renaming.
    if (!isFile && !(entry.isDirectory() && kind !== 'mods' && enabled)) continue;
    const file = path.join(folder, entry.name);
    const info = await fs.stat(file);
    const key = `${file}:${info.size}:${info.mtimeMs}`;
    let meta = metaCache.get(key);
    if (!meta) {
      if (isFile) {
        const bytes = await fs.readFile(file);
        meta = { ...readMeta(kind, bytes), sha1: sha('sha1', bytes) };
      } else meta = { sha1: null };
      metaCache.set(key, meta);
    }
    items.push({ file: entry.name, name: meta.name || base.replace(/\.(jar|zip)$/i, ''), version: meta.version || null, description: meta.description || null, icon: meta.icon || null, size: info.size, enabled, folder: !isFile, managed: kind === 'mods' && profile.savira && MANAGED.test(base), sha1: meta.sha1, modrinth: null, update: null });
  }
  const hashes = items.map(item => item.sha1).filter(Boolean);
  if (hashes.length) {
    try {
      const known = await identify(hashes);
      for (const item of items) item.modrinth = item.sha1 ? known.get(item.sha1) : null;
      const loaders = loaderFilter(kind, profile);
      const updates = await modrinth('/version_files/update', { method: 'POST', body: JSON.stringify({ hashes: items.filter(item => item.modrinth).map(item => item.sha1), algorithm: 'sha1', ...(loaders.length ? { loaders } : {}), game_versions: [profile.version] }) });
      for (const item of items) {
        const next = item.sha1 && updates[item.sha1];
        if (next && item.modrinth && next.id !== item.modrinth.versionId) item.update = { versionId: next.id, versionNumber: next.version_number };
      }
    } catch { /* Offline: the list still shows what is on disk. */ }
  }
  for (const item of items) {
    if (item.modrinth && !item.icon) item.icon = item.modrinth.icon;
    if (item.modrinth && !item.version) item.version = item.modrinth.versionNumber;
    // Some files carry no readable name; Modrinth's title beats the file name.
    if (item.modrinth && item.name === item.file.replace(/.disabled$/, '').replace(/.(jar|zip)$/i, '')) item.name = item.modrinth.title;
  }
  return items.sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }));
}

async function toggle(root, kind, file, enabled) {
  const current = entryPath(root, kind, file);
  const isDisabled = file.endsWith(DISABLED);
  if (enabled === !isDisabled) return;
  const target = enabled ? current.slice(0, -DISABLED.length) : current + DISABLED;
  await fs.rename(current, target);
}

async function download(file, target) {
  const url = new URL(file.url);
  if (url.protocol !== 'https:' || url.hostname !== 'cdn.modrinth.com') throw new Error('Unbekannte Downloadquelle.');
  const response = await fetch(url, { signal: AbortSignal.timeout(180000), headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`${file.filename} konnte nicht geladen werden (HTTP ${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (sha('sha512', bytes) !== file.hashes?.sha512) throw new Error(`Prüfsumme von ${file.filename} stimmt nicht.`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target + '.tmp', bytes);
  await fs.rename(target + '.tmp', target);
}
function primaryFile(version, ext) {
  const files = version.files.filter(file => file.filename.toLowerCase().endsWith(ext) && FILE_NAME.test(file.filename));
  return files.find(file => file.primary) || files[0] || null;
}

/** Installs the newest fitting version of a Modrinth project; for mods also its required dependencies. */
/** versionId: a specific version from the version list; otherwise the newest fitting one. */
async function install(root, kind, profile, projectId, installed = null, versionId = null) {
  if (!PROJECT_ID.test(projectId) || (versionId !== null && !PROJECT_ID.test(versionId))) throw new Error('Ungültiges Projekt.');
  // What is there already, so dependencies the profile has are not downloaded twice.
  if (!installed) installed = new Set((await list(root, kind, profile)).map(item => item.modrinth?.projectId).filter(Boolean));
  const { dir, ext } = kindOf(kind);
  if (kind === 'mods' && profile.loader === 'vanilla') throw new Error('Vanilla-Profile laden keine Mods. Nimm ein Profil mit Fabric, Forge, NeoForge oder Quilt.');
  const loaders = loaderFilter(kind, profile);
  const query = `${loaders.length ? `loaders=${encodeURIComponent(JSON.stringify(loaders))}&` : ''}game_versions=${encodeURIComponent(JSON.stringify([profile.version]))}`;
  let version;
  if (versionId) {
    version = await modrinth(`/version/${versionId}`);
    if (version.project_id !== projectId) throw new Error('Diese Version gehört zu einem anderen Projekt.');
  } else {
    const versions = await modrinth(`/project/${projectId}/version?${query}`);
    version = versions.find(item => item.version_type === 'release') || versions[0];
  }
  if (!version) throw new Error(`Für Minecraft ${profile.version}${loaders.length ? ` mit ${loaders[0]}` : ''} gibt es davon keine Version.`);
  const file = primaryFile(version, ext);
  if (!file) throw new Error('Die Modrinth-Version enthält keine passende Datei.');
  await download(file, contained(path.join(root, dir), file.filename));
  installed.add(projectId);
  const added = [file.filename];
  if (kind === 'mods' && installed.size < 40) {
    for (const dependency of version.dependencies || []) {
      if (dependency.dependency_type !== 'required' || !dependency.project_id || installed.has(dependency.project_id)) continue;
      try { added.push(...await install(root, kind, profile, dependency.project_id, installed)); } catch { /* Optional for the player to fix; the main file is in. */ }
    }
  }
  return added;
}

/** Replaces a file with the newest fitting version Modrinth has. */
async function update(root, kind, profile, file, trash) {
  const current = entryPath(root, kind, file);
  const hash = sha('sha1', await fs.readFile(current));
  const loaders = loaderFilter(kind, profile);
  const result = await modrinth('/version_files/update', { method: 'POST', body: JSON.stringify({ hashes: [hash], algorithm: 'sha1', ...(loaders.length ? { loaders } : {}), game_versions: [profile.version] }) });
  const version = result[hash];
  if (!version) throw new Error('Für diese Datei gibt es kein Update.');
  const next = primaryFile(version, kindOf(kind).ext);
  if (!next) throw new Error('Das Update enthält keine passende Datei.');
  const target = contained(path.join(root, kindOf(kind).dir), next.filename + (file.endsWith(DISABLED) ? DISABLED : ''));
  await download(next, target);
  if (path.resolve(target) !== path.resolve(current)) await trash(current);
  return next.filename;
}

// Modrinth search with the filters of the browser.
const SORTS = ['relevance', 'downloads', 'follows', 'newest', 'updated'];
const TAG = /^[a-z0-9_-]{1,32}$/, MC_VERSION = /^[\w.+-]{1,40}$/;
async function search({ kind, query = '', versions = [], categories = [], loaders = [], environment = null, sort = 'relevance', offset = 0 }) {
  const type = typeOf(kind);
  if (typeof query !== 'string' || query.length > 100) throw new Error('Ungültige Suche.');
  const pick = (value, pattern) => { if (!Array.isArray(value) || value.length > 12 || !value.every(item => typeof item === 'string' && pattern.test(item))) throw new Error('Ungültiger Filter.'); return value; };
  const facets = [[`project_type:${type}`]];
  if (pick(versions, MC_VERSION).length) facets.push(versions.map(version => `versions:${version}`));
  if (pick(loaders, TAG).length) facets.push(loaders.map(loader => `categories:${loader}`));
  for (const category of pick(categories, TAG)) facets.push([`categories:${category}`]);
  if (environment === 'client') facets.push(['client_side:required', 'client_side:optional']);
  else if (environment === 'server') facets.push(['server_side:required', 'server_side:optional']);
  else if (environment !== null) throw new Error('Ungültiger Filter.');
  if (!SORTS.includes(sort) || !Number.isInteger(offset) || offset < 0 || offset > 10000) throw new Error('Ungültige Sortierung.');
  const result = await modrinth(`/search?query=${encodeURIComponent(query)}&facets=${encodeURIComponent(JSON.stringify(facets))}&index=${sort}&offset=${offset}&limit=20`);
  return { total: result.total_hits, hits: result.hits.map(hit => ({ id: hit.project_id, slug: hit.slug, title: hit.title, author: hit.author, description: hit.description, icon: hit.icon_url || null, downloads: hit.downloads, categories: hit.display_categories || hit.categories || [], type: hit.project_type })) };
}
const tagCache = new Map();
async function tags(kind) {
  const type = typeOf(kind);
  if (!tagCache.has('all')) tagCache.set('all', Promise.all([modrinth('/tag/category'), modrinth('/tag/game_version'), modrinth('/tag/loader')]).catch(error => { tagCache.delete('all'); throw error; }));
  const [categories, versions, loaders] = await tagCache.get('all');
  return {
    categories: categories.filter(item => item.project_type === type && item.header === 'categories').map(item => item.name).sort(),
    versions: versions.map(item => ({ id: item.version, type: item.version_type === 'release' ? 'release' : 'snapshot' })),
    loaders: type === 'mod' ? ['fabric', 'forge', 'neoforge', 'quilt'] : type === 'shader' ? ['iris', 'optifine', 'canvas', 'vanilla'] : loaders.filter(item => item.supported_project_types.includes(type)).map(item => item.name).slice(0, 8),
  };
}

// Minimal NBT reader for level.dat and servers.dat: compounds, lists and plain values.
function readNbt(buffer) {
  let offset = 0;
  const need = count => { if (count < 0 || offset + count > buffer.length) throw new Error('NBT zu kurz.'); };
  const string = () => { need(2); const length = buffer.readUInt16BE(offset); offset += 2; need(length); const value = buffer.toString('utf8', offset, offset + length); offset += length; return value; };
  const value = (type, depth) => {
    if (depth > 64) throw new Error('NBT zu tief.');
    switch (type) {
      case 1: need(1); return buffer.readInt8(offset++);
      case 2: need(2); offset += 2; return buffer.readInt16BE(offset - 2);
      case 3: need(4); offset += 4; return buffer.readInt32BE(offset - 4);
      case 4: need(8); offset += 8; return Number(buffer.readBigInt64BE(offset - 8));
      case 5: need(4); offset += 4; return buffer.readFloatBE(offset - 4);
      case 6: need(8); offset += 8; return buffer.readDoubleBE(offset - 8);
      case 7: { need(4); const length = buffer.readInt32BE(offset); offset += 4; need(length); offset += length; return null; }
      case 8: return string();
      case 9: { need(5); const inner = buffer.readUInt8(offset++); const length = buffer.readInt32BE(offset); offset += 4; if (length < 0 || length > 100000) throw new Error('NBT-Liste zu lang.'); return Array.from({ length }, () => value(inner, depth + 1)); }
      case 10: { const object = {}; for (;;) { need(1); const inner = buffer.readUInt8(offset++); if (inner === 0) return object; object[string()] = value(inner, depth + 1); } }
      case 11: { need(4); const length = buffer.readInt32BE(offset); offset += 4; need(length * 4); offset += length * 4; return null; }
      case 12: { need(4); const length = buffer.readInt32BE(offset); offset += 4; need(length * 8); offset += length * 8; return null; }
      default: throw new Error('Unbekannter NBT-Typ.');
    }
  };
  need(1);
  const type = buffer.readUInt8(offset++);
  string();
  return value(type, 0);
}

const GAME_MODES = ['Überleben', 'Kreativ', 'Abenteuer', 'Zuschauer'];
async function worlds(root) {
  const saves = path.join(root, 'saves');
  let entries = [];
  try { entries = await fs.readdir(saves, { withFileTypes: true }); } catch { /* No worlds yet. */ }
  const found = [];
  for (const entry of entries.filter(item => item.isDirectory())) {
    const dir = path.join(saves, entry.name);
    let data = {};
    try { data = readNbt(gunzipSync(await fs.readFile(path.join(dir, 'level.dat')), { maxOutputLength: 32 * 1048576 }))?.Data || {}; } catch { try { await fs.access(path.join(dir, 'level.dat')); } catch { continue; } }
    let icon = null;
    try { icon = pngData(await fs.readFile(path.join(dir, 'icon.png'))); } catch { /* No icon. */ }
    const stat = await fs.stat(dir);
    found.push({ folder: entry.name, name: typeof data.LevelName === 'string' && data.LevelName ? data.LevelName : entry.name, mode: data.hardcore ? 'Hardcore' : GAME_MODES[data.GameType] || null, version: typeof data.Version?.Name === 'string' ? data.Version.Name : null, lastPlayed: Number.isFinite(data.LastPlayed) && data.LastPlayed > 0 ? data.LastPlayed : stat.mtimeMs, icon });
  }
  let servers = [];
  try {
    const nbt = readNbt(await fs.readFile(path.join(root, 'servers.dat')));
    servers = (Array.isArray(nbt?.servers) ? nbt.servers : []).filter(server => typeof server?.ip === 'string').slice(0, 100).map(server => ({
      name: typeof server.name === 'string' ? server.name.replace(/§./g, '') : server.ip, address: server.ip,
      icon: typeof server.icon === 'string' && /^[A-Za-z0-9+/=]{20,200000}$/.test(server.icon) ? `data:image/png;base64,${server.icon}` : null,
    }));
  } catch { /* No server list. */ }
  return { worlds: found.sort((a, b) => b.lastPlayed - a.lastPlayed), servers };
}

async function screenshots(root, thumbnail) {
  const dir = path.join(root, 'screenshots');
  let names = [];
  try { names = (await fs.readdir(dir)).filter(name => /\.png$/i.test(name) && FILE_NAME.test(name)); } catch { return []; }
  const items = await Promise.all(names.map(async name => ({ file: name, time: (await fs.stat(path.join(dir, name))).mtimeMs })));
  items.sort((a, b) => b.time - a.time);
  return Promise.all(items.slice(0, 80).map(async item => ({ ...item, thumbnail: await thumbnail(path.join(dir, item.file)) })));
}
function screenshotPath(root, file) {
  if (typeof file !== 'string' || !FILE_NAME.test(file) || !/\.png$/i.test(file)) throw new Error('Ungültiger Dateiname.');
  return contained(path.join(root, 'screenshots'), file);
}

async function folderSize(dir) {
  let entries = [];
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return 0; }
  const sizes = await Promise.all(entries.map(async entry => {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) return folderSize(target);
    if (!entry.isFile()) return 0;
    try { return (await fs.stat(target)).size; } catch { return 0; }
  }));
  return sizes.reduce((sum, size) => sum + size, 0);
}

// Project page: everything Modrinth shows about a project, plus its team.
const KIND_OF_TYPE = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks', datapack: 'datapacks', modpack: 'modpacks' };
async function project(projectId) {
  if (typeof projectId !== 'string' || !/^[\w-]{1,64}$/.test(projectId)) throw new Error('Ungültiges Projekt.');
  const [info, members] = await Promise.all([modrinth(`/project/${projectId}`), modrinth(`/project/${projectId}/members`).catch(() => [])]);
  const link = value => typeof value === 'string' && /^https:\/\//.test(value) ? value : null;
  return {
    id: info.id, slug: info.slug, type: info.project_type, kind: KIND_OF_TYPE[info.project_type] || null, title: info.title, description: info.description, body: typeof info.body === 'string' ? info.body.slice(0, 200000) : '',
    icon: info.icon_url || null, downloads: info.downloads, followers: info.followers, categories: [...(info.categories || []), ...(info.additional_categories || [])],
    gameVersions: [...(info.game_versions || [])].reverse(), loaders: info.loaders || [], client: info.client_side, server: info.server_side,
    license: info.license?.name || info.license?.id || null, published: info.published, updated: info.updated,
    links: [['Quellcode', info.source_url], ['Fehlerverfolgung', info.issues_url], ['Wiki', info.wiki_url], ['Discord', info.discord_url], ...(info.donation_urls || []).map(item => [`Spenden (${item.platform})`, item.url])].map(([label, url]) => ({ label, url: link(url) })).filter(item => item.url),
    gallery: (info.gallery || []).slice(0, 12).map(item => ({ url: item.url, title: item.title || '' })),
    team: (Array.isArray(members) ? members : []).slice(0, 20).map(member => ({ name: member.user?.username, role: member.role, avatar: member.user?.avatar_url || null })),
  };
}
const versionCache = new Map();
/** All versions of a project, newest first (Fabric API has more than a thousand). */
async function projectVersions(projectId) {
  if (!PROJECT_ID.test(projectId)) throw new Error('Ungültiges Projekt.');
  const hit = versionCache.get(projectId);
  if (hit && Date.now() - hit.at < 300000) return hit.list;
  const list = (await modrinth(`/project/${projectId}/version`)).map(version => ({ id: version.id, name: version.name, number: version.version_number, type: version.version_type, gameVersions: version.game_versions, loaders: version.loaders, date: version.date_published, downloads: version.downloads }));
  versionCache.set(projectId, { at: Date.now(), list });
  return list;
}
/** Whether a project has a version for this profile's Minecraft version and loader. */
async function compatible(projectId, kind, profile) {
  if (kind === 'mods' && profile.loader === 'vanilla') return false;
  const loaders = loaderFilter(kind, profile);
  return (await projectVersions(projectId)).some(version => version.gameVersions.includes(profile.version) && (!loaders.length || version.loaders.some(loader => loaders.includes(loader))));
}

module.exports = { KINDS, KIND_OF_TYPE, project, projectVersions, compatible, MANAGED, list, toggle, install, update, search, tags, worlds, screenshots, screenshotPath, entryPath, folderSize, readNbt, identify, primaryFile, download, modrinth, sha };
