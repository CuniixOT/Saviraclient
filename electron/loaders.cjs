const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { unzipSync, strFromU8 } = require('fflate');
const { MANIFEST, request, verifiedFile, mavenPath, contained } = require('./minecraft.cjs');

/*
 * Minecraft and loader versions for the profile wizard, and installing a loader into a profile:
 * Fabric and Quilt ship a ready launcher profile, Forge and NeoForge an installer whose steps
 * (libraries, data files, processors) are run here the same way their own installer does.
 */
const META_HOSTS = new Set(['piston-meta.mojang.com', 'meta.fabricmc.net', 'meta.quiltmc.org', 'maven.minecraftforge.net', 'files.minecraftforge.net', 'maven.neoforged.net']);
const USER_AGENT = 'Savira (Minecraft Launcher)';
const cache = new Map();

async function fetchText(url) {
  if (!META_HOSTS.has(new URL(url).hostname)) throw new Error('Unbekannte Quelle für Versionsdaten.');
  const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`Versionsliste konnte nicht geladen werden (HTTP ${response.status}).`);
  return response.text();
}
// Version lists change rarely; ten minutes keep the wizard fast without going stale.
async function cached(key, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 600000) return hit.value;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}
const fetchJson = async url => JSON.parse(await fetchText(url));

/** Releases and snapshots, newest first. */
function minecraftVersions() {
  return cached('minecraft', async () => (await fetchJson(MANIFEST)).versions
    .filter(version => version.type === 'release' || version.type === 'snapshot')
    .map(version => ({ id: version.id, type: version.type, released: version.releaseTime })));
}

// 0.24.0 > 0.20.0 > 0.20.0-beta.9: numbers compared one by one, a pre-release below its release.
function compareVersions(a, b) {
  const [mainA, preA] = a.split('-'), [mainB, preB] = b.split('-');
  const partsA = mainA.split('.').map(Number), partsB = mainB.split('.').map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const diff = (partsA[i] || 0) - (partsB[i] || 0);
    if (diff) return diff;
  }
  if (!preA || !preB) return preA ? -1 : preB ? 1 : 0;
  return preA.localeCompare(preB, 'en', { numeric: true });
}

// Forge changed its installer with 1.13; the older format is not supported.
function modernForge(minecraft) {
  const match = /^1\.(\d+)/.exec(minecraft);
  return !match || Number(match[1]) >= 13;
}
// NeoForge numbers its builds after the Minecraft version: 1.21.1 → 21.1.x, 1.21 → 21.0.x, 26.1 → 26.1.x.
function neoforgePrefix(minecraft) {
  const old = /^1\.(\d+)(?:\.(\d+))?$/.exec(minecraft);
  if (old) return [`${old[1]}.${old[2] ?? 0}.`];
  return /^\d+\.\d+(\.\d+)?$/.test(minecraft) ? [`${minecraft}.`, ...(minecraft.split('.').length === 2 ? [`${minecraft}.0.`] : [])] : [];
}

/** Loader builds for a Minecraft version, newest first; stable marks the recommended ones. */
function loaderVersions(loader, minecraft) {
  return cached(`${loader}:${minecraft}`, async () => {
    const mc = encodeURIComponent(minecraft);
    if (loader === 'fabric') return (await fetchJson(`https://meta.fabricmc.net/v2/versions/loader/${mc}`)).map(entry => ({ version: entry.loader.version, stable: entry.loader.stable === true }));
    if (loader === 'quilt') return (await fetchJson(`https://meta.quiltmc.org/v3/versions/loader/${mc}`)).map(entry => ({ version: entry.loader.version, stable: !/beta|alpha|rc|pre/i.test(entry.loader.version) })).sort((a, b) => compareVersions(b.version, a.version));
    if (loader === 'forge') {
      if (!modernForge(minecraft)) return [];
      const [metadata, promotions] = await Promise.all([
        fetchText('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml'),
        fetchJson('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json').catch(() => ({ promos: {} }))
      ]);
      const recommended = promotions.promos?.[`${minecraft}-recommended`];
      return [...metadata.matchAll(/<version>([^<]+)<\/version>/g)].map(match => match[1])
        .filter(full => full.startsWith(`${minecraft}-`)).map(full => full.slice(minecraft.length + 1))
        .reverse().map(version => ({ version, stable: version === recommended }));
    }
    if (loader === 'neoforge') {
      const prefixes = neoforgePrefix(minecraft);
      const { versions = [] } = await fetchJson('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge');
      return versions.filter(version => prefixes.some(prefix => version.startsWith(prefix))).reverse().map(version => ({ version, stable: !/beta|alpha/i.test(version) }));
    }
    return [];
  });
}

const sha1 = bytes => createHash('sha1').update(bytes).digest('hex');
async function fileSha1(file) { try { return sha1(await fs.readFile(file)); } catch { return null; } }
async function writeFile(file, bytes) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file + '.tmp', bytes);
  await fs.rename(file + '.tmp', file);
}

// The vanilla version file and client jar; Forge's processors patch that jar.
async function vanillaClient(root, minecraft) {
  const manifest = JSON.parse((await request(MANIFEST)).toString());
  const entry = manifest.versions.find(version => version.id === minecraft);
  if (!entry) throw new Error(`Minecraft ${minecraft} wurde nicht gefunden.`);
  const version = JSON.parse((await verifiedFile(entry.url, path.join(root, 'versions', entry.id, `${entry.id}.json`), entry.sha1)).toString());
  const jar = path.join(root, 'versions', entry.id, `${entry.id}.jar`);
  await verifiedFile(version.downloads.client.url, jar, version.downloads.client.sha1);
  return jar;
}

function runJava(javaPath, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(javaPath, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const collect = data => { output = (output + data.toString('utf8')).slice(-4000); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`Loader-Installation fehlgeschlagen (Code ${code}): ${output.trim().split('\n').slice(-3).join(' ')}`)));
  });
}

async function installForgeLike({ root, loader, minecraft, loaderVersion, javaPath, progress }) {
  const artifact = loader === 'forge' ? `net/minecraftforge/forge/${minecraft}-${loaderVersion}/forge-${minecraft}-${loaderVersion}-installer.jar`
    : `net/neoforged/neoforge/${loaderVersion}/neoforge-${loaderVersion}-installer.jar`;
  const url = loader === 'forge' ? `https://maven.minecraftforge.net/${artifact}` : `https://maven.neoforged.net/releases/${artifact}`;
  const libRoot = path.join(root, 'libraries');
  progress('Installer wird geladen …');
  const hash = (await request(`${url}.sha1`)).toString().trim().split(/\s/)[0];
  const installerPath = contained(libRoot, artifact);
  const installer = unzipSync(new Uint8Array(await verifiedFile(url, installerPath, hash)));
  const read = name => { const entry = installer[name]; if (!entry) throw new Error(`Der Installer enthält ${name} nicht.`); return entry; };
  const profile = JSON.parse(strFromU8(read('install_profile.json')));
  if (!Array.isArray(profile.processors)) throw new Error('Dieser Forge-Installer ist zu alt und wird nicht unterstützt.');
  const version = JSON.parse(strFromU8(read((profile.json || '/version.json').replace(/^\//, ''))));
  if (typeof version.id !== 'string' || !/^[\w.+-]{1,80}$/.test(version.id)) throw new Error('Ungültige Version im Installer.');
  const versionDir = contained(root, `versions/${version.id}`);
  const marker = path.join(versionDir, '.savira-installer');
  // Already installed from this exact installer: nothing to do.
  try { if ((await fs.readFile(marker, 'utf8')) === hash) return version.id; } catch { /* First install. */ }

  const minecraftJar = await vanillaClient(root, minecraft);
  // Libraries of the installer and of the profile: inside the installer under maven/, otherwise from their maven.
  const libraries = [...(profile.libraries || []), ...(version.libraries || [])];
  let done = 0;
  for (const library of libraries) {
    progress(`Loader-Bibliotheken (${++done}/${libraries.length}) …`);
    const relative = library.downloads?.artifact?.path || mavenPath(library.name);
    const target = contained(libRoot, relative);
    const bundled = installer[`maven/${relative}`];
    if (bundled) { if (await fileSha1(target) !== sha1(bundled)) await writeFile(target, bundled); continue; }
    const download = library.downloads?.artifact;
    if (download?.url) await verifiedFile(download.url, target, download.sha1 || (await request(`${download.url}.sha1`)).toString().trim().split(/\s/)[0]);
  }

  // Data values: [maven:coordinate] is a library file, 'text' a literal, /path a file inside the installer.
  const work = path.join(root, '.savira-loader', version.id);
  const data = { SIDE: 'client', MINECRAFT_JAR: minecraftJar, MINECRAFT_VERSION: minecraft, ROOT: root, INSTALLER: installerPath, LIBRARY_DIR: libRoot };
  for (const [key, value] of Object.entries(profile.data || {})) {
    const raw = value.client;
    if (typeof raw !== 'string') continue;
    if (raw.startsWith('[') && raw.endsWith(']')) data[key] = contained(libRoot, mavenPath(raw.slice(1, -1)));
    else if (raw.startsWith('\'') && raw.endsWith('\'')) data[key] = raw.slice(1, -1);
    else if (raw.startsWith('/')) { const file = contained(work, raw.slice(1)); await writeFile(file, read(raw.slice(1))); data[key] = file; }
    else data[key] = raw;
  }
  const resolve = argument => {
    if (argument.startsWith('[') && argument.endsWith(']')) return contained(libRoot, mavenPath(argument.slice(1, -1)));
    return argument.replace(/\{(\w+)\}/g, (_, key) => { if (!(key in data)) throw new Error(`Unbekannter Installer-Wert: ${key}`); return data[key]; });
  };
  const processors = profile.processors.filter(processor => !processor.sides || processor.sides.includes('client'));
  done = 0;
  for (const processor of processors) {
    progress(`Loader wird eingerichtet (${++done}/${processors.length}) …`);
    const outputs = Object.entries(processor.outputs || {}).map(([file, expected]) => [resolve(file), resolve(expected).replace(/^'|'$/g, '')]);
    // Outputs already there and correct: this step ran before.
    if (outputs.length && (await Promise.all(outputs.map(async ([file, expected]) => await fileSha1(file) === expected))).every(Boolean)) continue;
    const jar = contained(libRoot, mavenPath(processor.jar));
    const manifest = strFromU8(unzipSync(new Uint8Array(await fs.readFile(jar)), { filter: file => file.name === 'META-INF/MANIFEST.MF' })['META-INF/MANIFEST.MF'] || new Uint8Array());
    const mainClass = /^Main-Class:\s*(\S+)/m.exec(manifest)?.[1];
    if (!mainClass) throw new Error(`Installer-Schritt ohne Startklasse: ${processor.jar}`);
    const classpath = [jar, ...(processor.classpath || []).map(name => contained(libRoot, mavenPath(name)))].join(path.delimiter);
    await runJava(javaPath, ['-cp', classpath, mainClass, ...(processor.args || []).map(resolve)], root);
    for (const [file, expected] of outputs) if (await fileSha1(file) !== expected) throw new Error(`Installer-Schritt hat eine fehlerhafte Datei erzeugt: ${path.basename(file)}`);
  }
  await writeFile(path.join(versionDir, `${version.id}.json`), JSON.stringify(version));
  await writeFile(marker, hash);
  await fs.rm(work, { recursive: true, force: true });
  return version.id;
}

/** Puts the loader into the profile folder and returns the id of its version file. */
async function installLoader(options) {
  const { root, loader, minecraft, loaderVersion } = options;
  const progress = options.progress || (() => {});
  if (loader === 'fabric' || loader === 'quilt') {
    progress(`${loader === 'fabric' ? 'Fabric' : 'Quilt'} wird vorbereitet …`);
    const id = `${loader}-loader-${loaderVersion}-${minecraft}`;
    const base = loader === 'fabric' ? 'https://meta.fabricmc.net/v2' : 'https://meta.quiltmc.org/v3';
    const profile = await fetchJson(`${base}/versions/loader/${encodeURIComponent(minecraft)}/${encodeURIComponent(loaderVersion)}/profile/json`);
    await writeFile(contained(root, `versions/${id}/${id}.json`), JSON.stringify({ ...profile, id }));
    return id;
  }
  if (loader === 'forge' || loader === 'neoforge') return installForgeLike({ ...options, progress });
  throw new Error('Unbekannter Loader.');
}

module.exports = { minecraftVersions, loaderVersions, installLoader, neoforgePrefix, modernForge, compareVersions };
