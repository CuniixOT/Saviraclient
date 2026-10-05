import { Client } from '../electron/minecraft.cjs';
import { mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Uses Minecraft's official demo mode, never a real account or a multiplayer login.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const game = path.join(root, '.tools', 'demo-runtime');
const menuTest = process.argv.includes('--menu');
const id = 'fabric-loader-0.16.14-1.21.1';
await mkdir(path.join(game, 'versions', id), { recursive: true });
await mkdir(path.join(game, 'mods'), { recursive: true });
const profile = await fetch('https://meta.fabricmc.net/v2/versions/loader/1.21.1/0.16.14/profile/json');
if (!profile.ok) throw new Error('Fabric profile unavailable');
await writeFile(path.join(game, 'versions', id, `${id}.json`), await profile.text());
await copyFile(path.join(root, 'client-mod/build/libs/savira-client-0.1.0.jar'), path.join(game, 'mods/savira-client-0.1.0.jar'));
const fixture = path.join(game, 'mods/savira-menu-test.jar');
if (menuTest) await copyFile(path.join(root, 'client-mod/build/menu-test/savira-menu-test.jar'), fixture);
else await rm(fixture, { force: true });
const versionsResponse = await fetch('https://api.modrinth.com/v2/project/fabric-api/version?loaders=%5B%22fabric%22%5D&game_versions=%5B%221.21.1%22%5D');
if (!versionsResponse.ok) throw new Error('Fabric API metadata unavailable');
const versions = await versionsResponse.json();
const file = versions.find(v => v.version_type === 'release').files.find(f => f.primary);
const apiResponse = await fetch(file.url);
if (!apiResponse.ok) throw new Error('Fabric API unavailable');
const bytes = Buffer.from(await apiResponse.arrayBuffer());
if (createHash('sha512').update(bytes).digest('hex') !== file.hashes.sha512) throw new Error('Fabric API hash mismatch');
await writeFile(path.join(game, 'mods', file.filename), bytes);
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
    window: { width: 960, height: 600, fullscreen: false }
  });
  let exited = false;
  processHandle.on('exit', () => { exited = true; });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { clearInterval(timer); reject(new Error('Minecraft demo startup timed out.')); }, 120000);
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
