const fs = require('node:fs/promises');
const path = require('node:path');
const { zipSync, strToU8 } = require('fflate');
const { contained } = require('./minecraft.cjs');
const { readPack, installPack } = require('./modpacks.cjs');
const { KINDS, MANAGED, identify, modrinth, sha, download } = require('./content.cjs');

/*
 * Profiles as Modrinth packs: export (files Modrinth knows become downloads, the rest overrides),
 * and switching an imported pack to another of its versions.
 */
// Launcher-owned folders and files that never belong into a pack.
const INTERNAL = new Set(['assets', 'libraries', 'versions', 'natives', '.savira-loader', '.savira-pack.json', '.savira-launch.args', 'resources']);
const DEFAULT_ON = new Set(['config', 'mods', 'resourcepacks', 'shaderpacks', 'datapacks', 'options.txt', 'defaultconfigs', 'kubejs']);
const LOADER_KEYS = { fabric: 'fabric-loader', quilt: 'quilt-loader', forge: 'forge', neoforge: 'neoforge' };
const PACK_STATE = '.savira-pack.json';
const MAX_EXPORT = 1024 * 1048576;
// Already compressed: stored, not packed again.
const STORED = /\.(jar|zip|png|jpe?g|ogg|gz|mrpack)$/i;

/** Top-level entries of a profile folder for the export checklist. */
async function exportEntries(root) {
  let entries = [];
  try { entries = await fs.readdir(root, { withFileTypes: true }); } catch { return []; }
  return Promise.all(entries.filter(entry => !INTERNAL.has(entry.name) && (entry.isDirectory() || entry.isFile())).map(async entry => ({
    name: entry.name, folder: entry.isDirectory(), modified: (await fs.stat(path.join(root, entry.name))).mtimeMs, selected: DEFAULT_ON.has(entry.name),
  }))).then(list => list.sort((a, b) => Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name)));
}

async function walk(dir, base = '') {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const relative = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...await walk(path.join(dir, entry.name), relative));
    else if (entry.isFile()) out.push(relative);
  }
  return out;
}

/** Writes the chosen parts of a profile as .mrpack to target. */
async function exportPack(root, profile, include, target, progress = () => {}) {
  const chosen = include.filter(name => typeof name === 'string' && !INTERNAL.has(name) && !name.includes('/') && !name.includes('\\') && name !== '..');
  const files = [];
  for (const name of chosen) {
    const full = contained(root, name);
    const stat = await fs.stat(full).catch(() => null);
    if (!stat) continue;
    if (stat.isDirectory()) files.push(...(await walk(full)).map(relative => `${name}/${relative}`));
    else files.push(name);
  }
  // Files the launcher adds itself on every start stay out.
  const kept = files.filter(file => !(profile.savira && (file.startsWith('mods/') && MANAGED.test(file.slice(5)) || /^config\/savira(-cape\.png|\.json)$/.test(file))) && !file.endsWith('.tmp'));
  const contentDirs = new Set(Object.values(KINDS).map(kind => kind.dir));
  const hashed = [];
  let total = 0;
  const data = new Map();
  for (const file of kept) {
    const bytes = await fs.readFile(contained(root, file));
    total += bytes.length;
    if (total > MAX_EXPORT) throw new Error('Der Export wäre größer als 1 GB. Wähle weniger Ordner aus, zum Beispiel ohne Welten.');
    data.set(file, bytes);
    if (contentDirs.has(file.split('/')[0]) && file.split('/').length === 2 && /\.(jar|zip)$/i.test(file)) hashed.push({ file, sha1: sha('sha1', bytes), sha512: sha('sha512', bytes), size: bytes.length });
  }
  progress('Dateien werden bei Modrinth nachgeschlagen …');
  let known = new Map();
  try { known = await identify(hashed.map(item => item.sha1)); } catch { /* Offline: everything goes into overrides. */ }
  const index = { formatVersion: 1, game: 'minecraft', versionId: '1.0.0', name: profile.name, summary: `Exportiert mit Savira`, files: [], dependencies: { minecraft: profile.version, ...(LOADER_KEYS[profile.loader] ? { [LOADER_KEYS[profile.loader]]: profile.loaderVersion } : {}) } };
  const downloads = new Set();
  // Modrinth's own file record gives the CDN address; only exact matches become downloads.
  const versionFiles = new Map();
  const versionIds = [...new Set([...known.values()].filter(Boolean).map(item => item.versionId))];
  for (let i = 0; i < versionIds.length; i += 200) {
    try { for (const version of await modrinth(`/versions?ids=${encodeURIComponent(JSON.stringify(versionIds.slice(i, i + 200)))}`)) for (const file of version.files) versionFiles.set(file.hashes.sha1, file); } catch { /* Overrides instead. */ }
  }
  for (const item of hashed) {
    const remote = versionFiles.get(item.sha1);
    if (!remote || new URL(remote.url).hostname !== 'cdn.modrinth.com') continue;
    index.files.push({ path: item.file, hashes: { sha1: item.sha1, sha512: item.sha512 }, env: { client: 'required', server: 'required' }, downloads: [remote.url], fileSize: item.size });
    downloads.add(item.file);
  }
  progress('Modpack wird gepackt …');
  const zip = { 'modrinth.index.json': strToU8(JSON.stringify(index, null, 2)) };
  for (const [file, bytes] of data) if (!downloads.has(file)) zip[`overrides/${file}`] = [new Uint8Array(bytes), { level: STORED.test(file) ? 0 : 6 }];
  if (profile.icon?.startsWith('data:image/png;base64,')) zip['icon.png'] = [new Uint8Array(Buffer.from(profile.icon.split(',')[1], 'base64')), { level: 0 }];
  await fs.writeFile(target, zipSync(zip));
  return { downloads: index.files.length, overrides: data.size - downloads.size };
}

/** Which Modrinth pack version an .mrpack file is, if any. */
async function packOrigin(bytes) {
  try {
    const version = await modrinth(`/version_file/${sha('sha512', bytes)}?algorithm=sha512`);
    const project = await modrinth(`/project/${version.project_id}`);
    return { projectId: project.id, versionId: version.id, versionNumber: String(version.version_number).slice(0, 64), title: String(project.title).slice(0, 60) };
  } catch { return null; }
}
/** Installs a pack and remembers its files, so a later version switch can remove them again. */
async function installTracked(pack, root, progress) {
  await installPack(pack, root, progress);
  await fs.writeFile(path.join(root, PACK_STATE), JSON.stringify({ files: pack.files.map(file => file.path) }));
}

async function packVersions(projectId) {
  const versions = await modrinth(`/project/${projectId}/version`);
  return versions.slice(0, 60).map(version => ({ id: version.id, number: version.version_number, name: version.name, date: version.date_published, downloads: version.downloads, gameVersions: version.game_versions.slice(0, 6), loaders: version.loaders, changelog: typeof version.changelog === 'string' ? version.changelog.slice(0, 4000) : '' }));
}

/** Switches an installed pack to another version: old pack mods out, new ones and overrides in. */
async function switchPack(root, projectId, versionId, progress = () => {}) {
  const version = await modrinth(`/version/${versionId}`);
  if (version.project_id !== projectId) throw new Error('Diese Version gehört zu einem anderen Modpack.');
  const file = version.files.find(item => item.primary && item.filename.endsWith('.mrpack')) || version.files.find(item => item.filename.endsWith('.mrpack'));
  if (!file) throw new Error('Diese Version enthält keine .mrpack-Datei.');
  const temp = path.join(root, '.savira-loader', 'pack.mrpack');
  progress('Modpack-Version wird geladen …');
  await download(file, temp);
  const pack = readPack(await fs.readFile(temp));
  await fs.rm(temp, { force: true });
  let previous = [];
  try { previous = JSON.parse(await fs.readFile(path.join(root, PACK_STATE), 'utf8')).files || []; } catch { /* Installed before tracking. */ }
  const next = new Set(pack.files.map(item => item.path));
  for (const old of previous) if (!next.has(old)) await fs.rm(contained(root, old), { force: true }).catch(() => {});
  await installTracked(pack, root, (done, total) => progress(`Mods werden geladen (${done}/${total}) …`));
  return { pack, origin: { projectId, versionId: version.id, versionNumber: String(version.version_number).slice(0, 64) } };
}

module.exports = { exportEntries, exportPack, packOrigin, installTracked, packVersions, switchPack };
