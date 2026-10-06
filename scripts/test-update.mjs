// End-to-end auto-update: an installed Savira finds a signed update on a local server,
// downloads the real setup exe, hands over to it and comes back as a freshly installed copy.
import { chromium, expect } from '@playwright/test';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { createServer } from 'node:http';
import { cp, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import updater from '../electron/updater.cjs';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tools = path.join(root, '.tools');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const setupExe = path.join(root, 'release', `Savira-Setup-${pkg.version}.exe`);
const [major, minor, patch] = pkg.version.split('.').map(Number);
const nextVersion = `${major}.${minor}.${patch + 1}`;

// Signed manifest for a "newer" version that ships the current setup bytes.
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const bytes = await readFile(setupExe);
const manifest = { version: nextVersion, file: `Savira-Setup-${nextVersion}.exe`, sha512: createHash('sha512').update(bytes).digest('hex'), size: bytes.length, date: new Date().toISOString(), notes: ['Testupdate für den automatischen Ablauf', 'Signatur und Prüfsumme werden geprüft'] };
manifest.signature = sign(null, Buffer.from(updater.signedPayload(manifest)), privateKey).toString('base64');
// Behaves like GitHub: /releases/latest/download/* redirects to opaque CDN addresses, so a file
// name resolved against the redirected URL (instead of the feed) ends up as a 404.
const server = createServer((request, response) => {
  const base = '/releases/latest/download/';
  if (request.url === `${base}latest.json`) { response.writeHead(302, { Location: '/cdn/asset-1406?sig=a1' }); response.end(); }
  else if (request.url === `${base}${manifest.file}`) { response.writeHead(302, { Location: '/cdn/asset-2913?sig=b2' }); response.end(); }
  else if (request.url === '/cdn/asset-1406?sig=a1') { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(manifest)); }
  else if (request.url === '/cdn/asset-2913?sig=b2') { response.writeHead(200, { 'Content-Length': bytes.length }); response.end(bytes); }
  else { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const feed = `http://127.0.0.1:${server.address().port}/releases/latest/download/latest.json`;

// "Installed" copy in a sandbox, laid out exactly like the setup leaves it.
const sandbox = await mkdtemp(path.join(tools, 'update-sandbox-'));
const installDir = path.join(sandbox, 'Programs', 'Savira');
await cp(path.join(root, 'release', 'win-unpacked'), installDir, { recursive: true });
const before = new Date(Date.now() - 1000).toISOString();
await writeFile(path.join(installDir, '.savira-install'), JSON.stringify({ version: pkg.version, installedAt: before }));
await writeFile(path.join(sandbox, 'registry.json'), JSON.stringify({ installLocation: installDir, values: [] }));

const env = { ...process.env, SAVIRA_SETUP_SANDBOX: sandbox, SAVIRA_TEST_USER_DATA: await mkdtemp(path.join(tools, 'update-userdata-')), SAVIRA_UPDATE_FEED: feed, SAVIRA_UPDATE_PUBLIC_KEY: publicKey.export({ type: 'spki', format: 'pem' }) };
delete env.ELECTRON_RUN_AS_NODE;
const launcher = spawn(path.join(installDir, 'Savira.exe'), ['--smoke-test', '--remote-debugging-port=9341'], { env, stdio: 'ignore' });
const processesIn = async dir => {
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-Command', `@(Get-Process Savira -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '${dir.replace(/'/g, "''")}*' }).Count`]);
  return Number(stdout.trim());
};
try {
  let browser;
  for (let i = 0; i < 120 && !browser; i++) { try { browser = await chromium.connectOverCDP('http://127.0.0.1:9341'); } catch { await new Promise(resolve => setTimeout(resolve, 500)); } }
  let page;
  for (let i = 0; i < 50 && !page; i++) { page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('index.html')); if (!page) await new Promise(resolve => setTimeout(resolve, 200)); }
  const chip = page.getByRole('button', { name: `update ${nextVersion}` });
  await expect(chip).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: path.join(tools, 'savira-update-chip.png') });
  await chip.click();
  await expect(page.getByRole('dialog', { name: 'Update' })).toContainText('Testupdate für den automatischen Ablauf');
  await page.screenshot({ path: path.join(tools, 'savira-update-menu.png') });
  await page.getByRole('button', { name: 'jetzt aktualisieren' }).click().catch(error => { if (!/closed/i.test(error.message)) throw error; });

  // The old launcher quits, the setup replaces the folder and starts the new launcher.
  const deadline = Date.now() + 240000;
  let installedAt = before;
  while (Date.now() < deadline) {
    try { installedAt = JSON.parse(await readFile(path.join(installDir, '.savira-install'), 'utf8')).installedAt; } catch { /* Folder is being replaced. */ }
    if (installedAt !== before && await processesIn(installDir) > 0) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  expect(installedAt, 'Installation wurde durch das Update ersetzt').not.toBe(before);
  expect(await processesIn(installDir), 'Neuer Launcher läuft nach dem Update').toBeGreaterThan(0);
  expect((await stat(path.join(installDir, 'resources', 'app.asar'))).size).toBeGreaterThan(1000);
  console.log(`Update-Test erfolgreich: ${pkg.version} → ${nextVersion} gefunden, signiert geprüft, geladen, installiert und neu gestartet.`);
} finally {
  server.close();
  if (launcher.exitCode === null) spawn('taskkill', ['/pid', String(launcher.pid), '/t', '/f'], { stdio: 'ignore' });
  // Close the relaunched copy and any setup still unpacked in Temp.
  await run('powershell.exe', ['-NoProfile', '-Command', `Get-Process Savira -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '${installDir.replace(/'/g, "''")}*' -or $_.Path -like "$env:TEMP\\*" } | Stop-Process -Force`]).catch(() => {});
}
