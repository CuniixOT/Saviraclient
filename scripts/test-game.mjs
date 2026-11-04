import { Client } from '../electron/minecraft.cjs';
import { mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

// Uses Minecraft's official demo mode, never a real account or a multiplayer login.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const game = path.join(root, '.tools', 'demo-runtime');
const menuTest = process.argv.includes('--menu');
const id = 'fabric-loader-0.20.1-1.21.1';
await mkdir(path.join(game, 'versions', id), { recursive: true });
await mkdir(path.join(game, 'mods'), { recursive: true });
const profile = await fetch('https://meta.fabricmc.net/v2/versions/loader/1.21.1/0.20.1/profile/json');
if (!profile.ok) throw new Error('Fabric profile unavailable');
await writeFile(path.join(game, 'versions', id, `${id}.json`), await profile.text());
await copyFile(path.join(root, 'client-mod/build/libs/savira-client-0.1.0.jar'), path.join(game, 'mods/savira-client-0.1.0.jar'));
const fixture = path.join(game, 'mods/savira-menu-test.jar');
if (menuTest) await copyFile(path.join(root, 'client-mod/build/menu-test/savira-menu-test.jar'), fixture);
else await rm(fixture, { force: true });
// The menu test checks that the mod loads a cape the launcher put into the config folder.
const capeFixture = path.join(game, 'config', 'savira-cape.png');
if (menuTest) { await mkdir(path.dirname(capeFixture), { recursive: true }); await copyFile(path.join(root, 'client-mod/src/menuTest/resources/test-cape.png'), capeFixture); }
else await rm(capeFixture, { force: true });
// Real panoramas of earlier updates, fetched from Mojang like the launcher does, for the menu picker.
if (menuTest) {
  const { createPanoramaStore } = createRequire(import.meta.url)('../electron/panoramas.cjs');
  const store = createPanoramaStore({
    dir: path.join(root, '.tools', 'panoramas'),
    fetchJson: async url => { const r = await fetch(url); if (!r.ok) throw new Error(String(r.status)); return r.json(); },
    fetchBytes: async url => { const r = await fetch(url); if (!r.ok) throw new Error(String(r.status)); return Buffer.from(await r.arrayBuffer()); }
  });
  const list = await store.ensure();
  console.log(`Panoramen für den Test: ${list.map(p => p.label).join(', ')}`);
  const configFile = path.join(game, 'config', 'savira.json');
  let config = {};
  try { config = JSON.parse(await readFile(configFile, 'utf8')); } catch { /* First run. */ }
  await writeFile(configFile, JSON.stringify({ ...config, panoramaDir: store.dir, menuBackground: 'current' }, null, 2));
}
// Fabric API and the other default mods, exactly as the launcher puts them into a Savira profile.
const { syncDefaultMods } = createRequire(import.meta.url)('../electron/defaultmods.cjs');
const defaults = await syncDefaultMods(path.join(game, 'mods'), '1.21.1', { onProgress: message => console.log(message) });
if (!defaults.some(file => file.startsWith('fabric-api-'))) throw new Error('Fabric API unavailable');
console.log(`Standard-Mods: ${defaults.length}`);
const launcher = new Client();
let lastType = '', lastBucket = -1, output = '', processHandle;
launcher.on('progress', ({ type, task, total }) => {
  const bucket = Math.floor(task / total * 4);
  if (type !== lastType || bucket !== lastBucket) console.log(`${type}: ${task}/${total}`);
  lastType = type; lastBucket = bucket;
});
launcher.on('data', line => { output += line; if (!menuTest || /SAVIRA_UI_SMOKE_/.test(line)) console.log(line.trim()); });
try {
  processHandle = await launcher.launch({
    root: game, javaPath: 'java', demo: true,
    authorization: { name: 'SaviraDemo', uuid: '00000000000000000000000000000000', access_token: '0', meta: {} },
    version: { number: '1.21.1', custom: id }, memory: { min: '1G', max: '3G' },
    window: menuTest ? { width: 1600, height: 900, fullscreen: false } : { width: 960, height: 600, fullscreen: false }
  });
  let exited = false;
  processHandle.on('exit', () => { exited = true; });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { clearInterval(timer); reject(new Error('Minecraft demo startup timed out.')); }, menuTest ? 300000 : 120000);
    const timer = setInterval(() => {
      if (exited) { clearInterval(timer); clearTimeout(timeout); reject(new Error('Minecraft exited before rendering.')); }
      else if (/SAVIRA_UI_SMOKE_FAILED/.test(output)) {
        clearInterval(timer); clearTimeout(timeout); reject(new Error('Ingame-Menütest fehlgeschlagen.'));
      }
      else if (menuTest ? /SAVIRA_UI_SMOKE_OK/.test(output) : /Created:.*textures\/atlas\/gui/.test(output) && /savira 0\.1\.0/.test(output)) {
        clearInterval(timer); clearTimeout(timeout); resolve();
      }
    }, 500);
  });
  await new Promise(resolve => setTimeout(resolve, 5000));
  if (exited) throw new Error('Minecraft crashed after resource loading.');
  console.log('Minecraft-Demo-Runtimetest erfolgreich: Fabric, Savira-Mixin und GUI-Ressourcen geladen.');
} finally {
  if (processHandle && processHandle.exitCode === null) {
    if (process.platform === 'win32') {
      // Oracle's javapath shim can spawn a second process; stop the entire test-owned tree.
      await promisify(execFile)('taskkill', ['/PID', String(processHandle.pid), '/T', '/F']).catch(() => processHandle.kill());
    } else processHandle.kill();
  }
  await writeFile(path.join(game, 'savira-runtime-test.log'), output);
  await rm(fixture, { force: true, recursive: true, maxRetries: 15, retryDelay: 300 });
}
