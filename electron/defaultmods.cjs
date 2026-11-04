const fs = require('node:fs/promises');
const path = require('node:path');
const content = require('./content.cjs');

// Mods every profile with Savira features gets, like the bundle of the NoRisk client. Nothing is shipped
// with the launcher: each start fetches the newest fitting release from Modrinth, checks its hash and
// keeps it up to date. Required dependencies come along. A mod the player installed himself wins.
const DEFAULT_MODS = [
  { id: 'P7dR8mSH', name: 'Fabric API' },
  { id: 'AANobbMI', name: 'Sodium' },
  { id: 'gvQqBUqZ', name: 'Lithium' },
  { id: 'uXXizFIs', name: 'FerriteCore' },
  { id: '5ZwdcRci', name: 'ImmediatelyFast' },
  { id: 'NNAgCjsB', name: 'Entity Culling' },
  { id: '51shyZVL', name: 'More Culling' },
  { id: 'zV5r3pPn', name: '3D Skin Layers' },
  { id: 'EsAfCjCV', name: 'AppleSkin' },
  { id: 'ETlrkaYF', name: 'Cubes Without Borders' },
  { id: 'bubOj4AD', name: 'Tiers' },
  { id: '9eGKb6K1', name: 'Simple Voice Chat' },
  { id: 'htkVd6dQ', name: 'Health Indicators' },
  { id: '2M01OLQq', name: 'Shulker Box Tooltip' },
  { id: 'mOgUt4GM', name: 'Mod Menu' },
  { id: '1eAoo2KR', name: 'YetAnotherConfigLib' },
  { id: '9s6osm5g', name: 'Cloth Config API' },
  { id: 'Y8uFrUil', name: 'ukulib' },
  { id: 'Ha28R6CL', name: 'Fabric Language Kotlin' },
  { id: '8BmcQJ2H', name: 'Geckolib' },
  { id: 'aTaCgKLW', name: 'Silk' },
  { id: 'ccKDOlHs', name: 'owo-lib' },
];
const MANIFEST = '.savira-defaults.json';
const DISABLED = '.disabled';
const PROJECT_ID = /^[A-Za-z0-9]{8}$/;
const FILE_NAME = /^[\w.+\-]{1,160}\.jar$/;
const MAX_MODS = 60;

/** Which files in the mods folder the launcher put there itself: project id -> file name (without .disabled). */
async function readManifest(mods) {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(mods, MANIFEST), 'utf8'));
    return Object.fromEntries(Object.entries(raw?.files || {}).filter(([id, file]) => PROJECT_ID.test(id) && typeof file === 'string' && FILE_NAME.test(file)));
  } catch { return {}; }
}
async function writeManifest(mods, files) {
  const target = path.join(mods, MANIFEST);
  await fs.writeFile(target + '.tmp', JSON.stringify({ files }, null, 2));
  await fs.rename(target + '.tmp', target);
}
const exists = file => fs.access(file).then(() => true, () => false);

/** Newest fitting release of each project (a beta when there is no release), with its required dependencies. */
async function resolve(minecraftVersion) {
  const query = `loaders=${encodeURIComponent('["fabric"]')}&game_versions=${encodeURIComponent(JSON.stringify([minecraftVersion]))}`;
  const resolved = new Map(), queue = DEFAULT_MODS.map(mod => mod.id);
  while (queue.length && resolved.size < MAX_MODS) {
    const batch = queue.splice(0, 8).filter(id => !resolved.has(id));
    const versions = await Promise.all(batch.map(async id => {
      const list = await content.modrinth(`/project/${id}/version?${query}`);
      return [id, list.find(version => version.version_type === 'release') || list[0] || null];
    }));
    for (const [id, version] of versions) {
      const file = version && content.primaryFile(version, '.jar');
      if (!file || !FILE_NAME.test(file.filename)) continue;   // Not available for this version: skipped.
      resolved.set(id, file);
      for (const dependency of version.dependencies || []) {
        if (dependency.dependency_type === 'required' && PROJECT_ID.test(dependency.project_id || '') && !resolved.has(dependency.project_id) && !queue.includes(dependency.project_id)) queue.push(dependency.project_id);
      }
    }
  }
  return resolved;
}

/**
 * Brings the default mods in one profile's mods folder up to date. A mod switched off in the profile
 * stays off after an update. Without internet the files from the last start are kept.
 */
async function syncDefaultMods(mods, minecraftVersion, { onProgress = () => {}, log = console } = {}) {
  await fs.mkdir(mods, { recursive: true });
  const previous = await readManifest(mods);
  let resolved;
  try { resolved = await resolve(minecraftVersion); }
  catch (error) { log.warn?.('Standard-Mods konnten nicht geprüft werden; die vorhandenen bleiben.', error); return Object.values(previous); }

  // Mods the player added himself (identified by Modrinth) are not downloaded a second time.
  const ours = new Set(Object.values(previous));
  const own = new Set();
  // Fabric API and the Savira mod were placed by earlier launcher versions; they are ours as well.
  const others = (await fs.readdir(mods)).filter(name => /\.jar(\.disabled)?$/.test(name) && !ours.has(name.replace(/\.disabled$/, '')) && !content.MANAGED.test(name));
  if (others.length) {
    try {
      const hashes = new Map();
      for (const name of others) hashes.set(content.sha('sha1', await fs.readFile(path.join(mods, name))), name);
      for (const known of (await content.identify([...hashes.keys()])).values()) if (known) own.add(known.projectId);
    } catch { /* Unknown files do not block the defaults. */ }
  }

  const files = {};
  let step = 0;
  for (const [id, file] of resolved) {
    step++;
    const old = previous[id];
    if (own.has(id)) {
      if (old) { await fs.rm(path.join(mods, old), { force: true }); await fs.rm(path.join(mods, old + DISABLED), { force: true }); }
      continue;
    }
    const wasOff = old ? await exists(path.join(mods, old + DISABLED)) : false;
    const target = path.join(mods, file.filename + (wasOff ? DISABLED : ''));
    let valid = false;
    try { valid = content.sha('sha512', await fs.readFile(target)) === file.hashes?.sha512; } catch { /* Not there yet. */ }
    if (!valid) {
      onProgress(`${DEFAULT_MODS.find(mod => mod.id === id)?.name || file.filename} wird geladen …`, step / resolved.size);
      try { await content.download(file, target); }
      catch (error) { log.warn?.(`${file.filename} konnte nicht geladen werden`, error); if (old) files[id] = old; continue; }
    }
    if (old && old !== file.filename) { await fs.rm(path.join(mods, old), { force: true }); await fs.rm(path.join(mods, old + DISABLED), { force: true }); }
    files[id] = file.filename;
  }
  // Defaults that are no longer in the list go away; a failed download keeps the old file above.
  for (const [id, old] of Object.entries(previous)) {
    if (files[id] || Object.values(files).includes(old)) continue;
    await fs.rm(path.join(mods, old), { force: true }); await fs.rm(path.join(mods, old + DISABLED), { force: true });
  }
  for (const name of await fs.readdir(mods)) {
    if (/^fabric-api-.*\.jar$/.test(name) && files.P7dR8mSH && name !== files.P7dR8mSH) await fs.rm(path.join(mods, name), { force: true });
  }
  await writeManifest(mods, files);
  return Object.values(files);
}

/** Takes the default mods out again, when a profile switches its Savira features off. */
async function removeDefaultMods(mods) {
  const previous = await readManifest(mods);
  for (const file of Object.values(previous)) { await fs.rm(path.join(mods, file), { force: true }); await fs.rm(path.join(mods, file + DISABLED), { force: true }); }
  await fs.rm(path.join(mods, MANIFEST), { force: true });
}

/** File names of the default mods in this folder, for the profile's mod list. */
async function defaultModFiles(mods) { return new Set(Object.values(await readManifest(mods))); }

module.exports = { DEFAULT_MODS, syncDefaultMods, removeDefaultMods, defaultModFiles, MANIFEST };
