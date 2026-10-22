const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { unzipSync } = require('fflate');

const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const HOSTS = new Set(['piston-meta.mojang.com', 'piston-data.mojang.com', 'launchermeta.mojang.com', 'launcher.mojang.com', 'libraries.minecraft.net', 'resources.download.minecraft.net', 'maven.fabricmc.net', 'maven.quiltmc.org', 'maven.minecraftforge.net', 'maven.neoforged.net']);
function checkUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !HOSTS.has(url.hostname)) throw new Error('Unbekannte Minecraft-Downloadquelle.');
  return url;
}
async function request(url) {
  checkUrl(url);
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(120000), redirect: 'error' });
      if (!response.ok) throw new Error(`Minecraft-Download fehlgeschlagen (HTTP ${response.status}).`);
      return Buffer.from(await response.arrayBuffer());
    } catch (e) {
      last = e;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw last;
}
function contained(root, relative) {
  const result = path.resolve(root, relative);
  if (!result.startsWith(path.resolve(root) + path.sep)) throw new Error('Ungültiger Dateipfad in Minecraft-Metadaten.');
  return result;
}
async function verifiedFile(url, destination, sha1) {
  if (!/^[a-f0-9]{40}$/i.test(sha1)) throw new Error('Ungültige Minecraft-Prüfsumme.');
  try {
    const bytes = await fs.readFile(destination);
    if (createHash('sha1').update(bytes).digest('hex') === sha1) return bytes;
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const bytes = await request(url);
  if (createHash('sha1').update(bytes).digest('hex') !== sha1) throw new Error('Minecraft-Datei ist beschädigt (Prüfsumme stimmt nicht).');
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination + '.tmp', bytes);
  await fs.rename(destination + '.tmp', destination);
  return bytes;
}
function allowed(rules, features = {}, platform = process.platform, arch = process.arch) {
  if (!rules) return true;
  let result = false;
  const name = { win32: 'windows', darwin: 'osx', linux: 'linux' }[platform];
  for (const rule of rules) {
    if (rule.os?.name && rule.os.name !== name) continue;
    if (rule.os?.arch && rule.os.arch !== arch && !(rule.os.arch === 'x86_64' && arch === 'x64')) continue;
    if (rule.os?.version && !new RegExp(rule.os.version).test(os.release())) continue;
    if (rule.features && !Object.entries(rule.features).every(([key, value]) => Boolean(features[key]) === value)) continue;
    result = rule.action === 'allow';
  }
  return result;
}
function argumentsFor(entries, values, features) {
  return entries.flatMap(entry => {
    if (typeof entry === 'string') return [entry];
    if (!allowed(entry.rules, features)) return [];
    return Array.isArray(entry.value) ? entry.value : [entry.value];
  }).map(value => value.replace(/\$\{([^}]+)\}/g, (_, key) => {
    if (!(key in values)) throw new Error(`Unbekannter Minecraft-Startparameter: ${key}`);
    return String(values[key]);
  }));
}
// Maven coordinate group:artifact:version[:classifier][@extension] → path below libraries/.
function mavenPath(name) {
  const [coordinate, extension = 'jar'] = name.split('@');
  const [group, artifact, version, classifier] = coordinate.split(':');
  if (!group || !artifact || !version) throw new Error('Ungültige Bibliothek in den Loader-Daten.');
  return `${group.replaceAll('.', '/')}/${artifact}/${version}/${artifact}-${version}${classifier ? `-${classifier}` : ''}.${extension}`;
}
function mavenArtifact(library) {
  const relative = mavenPath(library.name);
  return { path: relative, url: `${library.url || 'https://libraries.minecraft.net/'}${relative}` };
}
// The same library from Minecraft and from the loader: the loader's version wins, like in the official launcher.
function libraryKey(name) {
  const [group, artifact, , classifier] = name.split('@')[0].split(':');
  return `${group}:${artifact}${classifier ? `:${classifier}` : ''}`;
}
// Minecraft before 1.19 ships its native DLLs in jars that have to be unpacked before the start.
async function extractNatives(jar, directory) {
  const entries = unzipSync(new Uint8Array(jar), { filter: file => !file.name.startsWith('META-INF/') && !file.name.endsWith('/') });
  for (const [name, bytes] of Object.entries(entries)) {
    const target = contained(directory, name);
    // A running game keeps its DLLs locked; unchanged files stay as they are.
    try { if (Buffer.from(bytes).equals(await fs.readFile(target))) continue; } catch { /* Not there yet. */ }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
  }
}
async function pool(items, callback) {
  let index = 0;
  // Wait for every worker before surfacing errors so a retry never races old downloads.
  let failure;
  await Promise.all(Array.from({ length: Math.min(8, items.length) }, async () => {
    while (index < items.length && !failure) {
      const item = items[index++];
      try { await callback(item); } catch (e) { failure ??= e; }
    }
  }));
  if (failure) throw failure;
}
function javaArgument(value) {
  // Java argument-file syntax, independent of shell quoting. Also avoids Windows' command-line limit.
  return '"' + String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n').replaceAll('\r', '\\r') + '"';
}
function legacyArguments(value) {
  if (typeof value !== 'string') return [];
  return [...value.matchAll(/"([^"]*)"|'([^']*)'|([^\s]+)/g)].map(match => match[1] ?? match[2] ?? match[3]);
}

class Client extends EventEmitter {
  async launch(options) {
    if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Diese Savira-Version unterstützt Windows x64.');
    const root = path.resolve(options.root);
    await fs.mkdir(root, { recursive: true });
    const manifest = JSON.parse((await request(MANIFEST)).toString());
    const entry = manifest.versions.find(v => v.id === options.version.number);
    if (!entry) throw new Error('Minecraft-Version wurde nicht gefunden.');
    const version = JSON.parse((await verifiedFile(entry.url, path.join(root, 'versions', entry.id, `${entry.id}.json`), entry.sha1)).toString());
    const custom = options.version.custom ? JSON.parse(await fs.readFile(contained(root, `versions/${options.version.custom}/${options.version.custom}.json`), 'utf8')) : null;
    // Each Minecraft version names the Java it needs; older ones run on newer Java, newer ones not on older.
    const needed = version.javaVersion?.majorVersion ?? 8;
    if (options.javaMajor && options.javaMajor < needed) throw new Error(`Minecraft ${entry.id} benötigt Java ${needed}, ausgewählt ist Java ${options.javaMajor}. Bitte unter Einstellungen den passenden Java-Pfad wählen.`);
    const clientJar = path.join(root, 'versions', entry.id, `${entry.id}.jar`);
    this.emit('progress', { type: 'Spiel', task: 0, total: 1 });
    await verifiedFile(version.downloads.client.url, clientJar, version.downloads.client.sha1);
    const libRoot = path.join(root, 'libraries');
    // One folder per version, so two versions never overwrite each other's DLLs.
    const natives = path.join(root, 'natives', entry.id);
    await fs.mkdir(natives, { recursive: true });
    const classpath = [];
    const libraries = new Map();
    for (const library of [...version.libraries, ...(custom?.libraries || [])]) {
      if (allowed(library.rules)) libraries.set(libraryKey(library.name), library);
    }
    let completed = 0;
    await pool([...libraries.values()], async library => {
      // Old natives: a classifier jar that is unpacked instead of joining the classpath.
      const nativeKey = library.natives?.windows?.replace('${arch}', '64');
      if (nativeKey) {
        const native = library.downloads?.classifiers?.[nativeKey];
        if (native) await extractNatives(await verifiedFile(native.url, contained(libRoot, native.path), native.sha1), natives);
        if (!library.downloads?.artifact) return this.emit('progress', { type: 'Bibliotheken', task: ++completed, total: libraries.size });
      }
      const artifact = library.downloads?.artifact || mavenArtifact(library);
      const file = contained(libRoot, artifact.path || mavenPath(library.name));
      if (!artifact.url) {
        // Made by the Forge/NeoForge installer while preparing the profile, not downloadable.
        try { await fs.access(file); } catch { throw new Error(`Loader-Datei fehlt: ${path.basename(file)}. Bitte das Profil neu starten, damit der Loader neu installiert wird.`); }
      } else {
        const hash = artifact.sha1 || (await request(`${artifact.url}.sha1`)).toString().trim().split(/\s/)[0];
        await verifiedFile(artifact.url, file, hash);
      }
      classpath.push(file);
      this.emit('progress', { type: 'Bibliotheken', task: ++completed, total: libraries.size });
    });
    classpath.push(clientJar);
    const assets = path.join(root, 'assets');
    const assetIndex = JSON.parse((await verifiedFile(version.assetIndex.url, contained(assets, `indexes/${version.assetIndex.id}.json`), version.assetIndex.sha1)).toString());
    const objects = [...new Set(Object.values(assetIndex.objects).map(item => item.hash))];
    completed = 0;
    await pool(objects, async hash => {
      const relative = `${hash.slice(0, 2)}/${hash}`;
      await verifiedFile(`https://resources.download.minecraft.net/${relative}`, contained(assets, `objects/${relative}`), hash);
      this.emit('progress', { type: 'Spieldateien', task: ++completed, total: objects.length });
    });
    // Versions up to 1.7.2 read their assets from a flat folder ("legacy" or "pre-1.6" index).
    if (assetIndex.virtual || assetIndex.map_to_resources) {
      const flat = assetIndex.map_to_resources ? path.join(root, 'resources') : path.join(assets, 'virtual', version.assetIndex.id);
      for (const [name, item] of Object.entries(assetIndex.objects)) {
        const target = contained(flat, name);
        try { await fs.access(target); } catch { await fs.mkdir(path.dirname(target), { recursive: true }); await fs.copyFile(contained(assets, `objects/${item.hash.slice(0, 2)}/${item.hash}`), target); }
      }
    }
    const auth = options.authorization;
    // Quick play (1.20+): straight into a world or onto a server. Older versions only know --server.
    const quick = options.quickPlay || null;
    const quickSupported = JSON.stringify(version.arguments?.game || []).includes('is_quick_play_singleplayer');
    if (quick?.world && !quickSupported) throw new Error('Direkt in eine Welt starten geht erst ab Minecraft 1.20.');
    const features = { has_custom_resolution: !options.window.fullscreen, is_demo_user: options.demo === true, is_quick_play_singleplayer: Boolean(quick?.world && quickSupported), is_quick_play_multiplayer: Boolean(quick?.server && quickSupported) };
    const values = {
      auth_player_name: auth.name, auth_uuid: auth.uuid, auth_access_token: auth.access_token,
      auth_xuid: auth.meta?.xuid || '', clientid: auth.meta?.clientId || '', user_type: 'msa',
      version_name: custom?.id || version.id, version_type: 'release', game_directory: root,
      assets_root: assets, assets_index_name: version.assetIndex.id, auth_session: auth.access_token,
      game_assets: assetIndex.map_to_resources ? path.join(root, 'resources') : assetIndex.virtual ? path.join(assets, 'virtual', version.assetIndex.id) : assets,
      natives_directory: natives, launcher_name: 'Savira', launcher_version: '0.1.0',
      classpath: classpath.join(path.delimiter), library_directory: libRoot, classpath_separator: path.delimiter,
      resolution_width: options.window.width, resolution_height: options.window.height, user_properties: '{}',
      quickPlaySingleplayer: quick?.world || '', quickPlayMultiplayer: quick?.server || '', quickPlayPath: '', quickPlayRealms: ''
    };
    const baseJvm = version.arguments?.jvm || ['-Djava.library.path=${natives_directory}', '-cp', '${classpath}'];
    const baseGame = version.arguments?.game || legacyArguments(version.minecraftArguments);
    const jvm = argumentsFor([...baseJvm, ...(custom?.arguments?.jvm || [])], values, features);
    const game = argumentsFor([...baseGame, ...(custom?.arguments?.game || [])], values, features);
    if (options.window.fullscreen) game.push('--fullscreen');
    if (quick?.server && !quickSupported) {
      const [host, port] = quick.server.split(':');
      game.push('--server', host, ...(port ? ['--port', port] : []));
    }
    const logConfig = version.logging?.client;
    if (logConfig) {
      const logPath = contained(root, `assets/log_configs/${logConfig.file.id}`);
      await verifiedFile(logConfig.file.url, logPath, logConfig.file.sha1);
      jvm.push(logConfig.argument.replace('${path}', logPath));
    }
    const argFile = path.join(root, '.savira-launch.args');
    // The file contains only JVM/classpath arguments; game authentication follows on the command line.
    await fs.writeFile(argFile, [`-Xms${options.memory.min}`, `-Xmx${options.memory.max}`, ...jvm, custom?.mainClass || version.mainClass].map(javaArgument).join('\n'));
    this.emit('progress', { type: 'Start', task: 1, total: 1 });
    const child = spawn(options.javaPath, [`@${argFile}`, ...game], { cwd: root, windowsHide: true, detached: false, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => this.emit('data', data.toString('utf8')));
    child.stderr.on('data', data => this.emit('data', data.toString('utf8')));
    child.on('close', code => this.emit('close', code));
    return child;
  }
}
module.exports = { Client, MANIFEST, request, verifiedFile, allowed, argumentsFor, mavenArtifact, mavenPath, libraryKey, contained, javaArgument, legacyArguments };
