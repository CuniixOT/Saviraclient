const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');

const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const HOSTS = new Set(['piston-meta.mojang.com', 'piston-data.mojang.com', 'launchermeta.mojang.com', 'launcher.mojang.com', 'libraries.minecraft.net', 'resources.download.minecraft.net', 'maven.fabricmc.net']);
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
function mavenArtifact(library) {
  const [group, artifact, version, classifier] = library.name.split(':');
  if (!group || !artifact || !version) throw new Error('Ungültige Fabric-Bibliothek.');
  const relative = `${group.replaceAll('.', '/')}/${artifact}/${version}/${artifact}-${version}${classifier ? `-${classifier}` : ''}.jar`;
  return { path: relative, url: `${library.url || 'https://libraries.minecraft.net/'}${relative}` };
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
    const clientJar = path.join(root, 'versions', entry.id, `${entry.id}.jar`);
    this.emit('progress', { type: 'Spiel', task: 0, total: 1 });
    await verifiedFile(version.downloads.client.url, clientJar, version.downloads.client.sha1);
    const libRoot = path.join(root, 'libraries');
    const classpath = [];
    const libraries = new Map();
    for (const library of [...version.libraries, ...(custom?.libraries || [])]) {
      if (allowed(library.rules)) libraries.set(library.name, library);
    }
    let completed = 0;
    await pool([...libraries.values()], async library => {
      const artifact = library.downloads?.artifact || mavenArtifact(library);
      const file = contained(libRoot, artifact.path);
      const hash = artifact.sha1 || (await request(`${artifact.url}.sha1`)).toString().trim().split(/\s/)[0];
      await verifiedFile(artifact.url, file, hash);
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
    const natives = path.join(root, 'natives');
    await fs.mkdir(natives, { recursive: true });
    const auth = options.authorization;
    const features = { has_custom_resolution: !options.window.fullscreen, is_demo_user: options.demo === true };
    const values = {
      auth_player_name: auth.name, auth_uuid: auth.uuid, auth_access_token: auth.access_token,
      auth_xuid: auth.meta?.xuid || '', clientid: auth.meta?.clientId || '', user_type: 'msa',
      version_name: custom?.id || version.id, version_type: 'release', game_directory: root,
      assets_root: assets, assets_index_name: version.assetIndex.id,
      natives_directory: natives, launcher_name: 'Savira', launcher_version: '0.1.0',
      classpath: classpath.join(path.delimiter), library_directory: libRoot, classpath_separator: path.delimiter,
      resolution_width: options.window.width, resolution_height: options.window.height, user_properties: '{}'
    };
    const baseJvm = version.arguments?.jvm || ['-Djava.library.path=${natives_directory}', '-cp', '${classpath}'];
    const baseGame = version.arguments?.game || legacyArguments(version.minecraftArguments);
    const jvm = argumentsFor([...baseJvm, ...(custom?.arguments?.jvm || [])], values, features);
    const game = argumentsFor([...baseGame, ...(custom?.arguments?.game || [])], values, features);
    if (options.window.fullscreen) game.push('--fullscreen');
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
module.exports = { Client, allowed, argumentsFor, mavenArtifact, contained, javaArgument, legacyArguments };
