import { _electron as electron, chromium, expect } from '@playwright/test';
import { access, mkdtemp, readFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tools = path.join(root, '.tools');
const version = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
const exists = file => access(file).then(() => true, () => false);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

// 1. The unpacked launcher opens normally and ships the mod.
{
  const userData = await mkdtemp(path.join(tools, 'package-smoke-'));
  const app = await electron.launch({ executablePath: path.join(root, 'release/win-unpacked/Savira.exe'), args: ['--smoke-test'], env: { ...env, SAVIRA_TEST_USER_DATA: userData }, timeout: 60000 });
  try {
    const page = await app.firstWindow();
    await expect(page.getByLabel(/3D-Figur von/)).toBeVisible({ timeout: 30000 });
    const result = await page.evaluate(() => window.savira.state());
    expect(result.ok).toBe(true);
    expect(result.data.version).toBe(version);
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true);
    expect((await stat(path.join(root, 'release/win-unpacked/resources/mods/savira-client-0.1.0.jar'))).size).toBeGreaterThan(5000);
  } finally { await app.close(); }
}

// 2. The real setup exe installs into a sandbox, and the installed copy uninstalls itself.
async function attach(executable, args, extraEnv, port) {
  const child = spawn(executable, [...args, `--remote-debugging-port=${port}`], { env: { ...env, ...extraEnv }, stdio: 'ignore' });
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    try {
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      for (let i = 0; i < 50; i++) {
        const page = browser.contexts().flatMap(context => context.pages()).find(p => p.url().includes('index.html'));
        if (page) return { browser, page, child };
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch { await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  killTree(child);
  throw new Error(`${path.basename(executable)} hat kein Fenster geöffnet.`);
}
// The setup exe is a wrapper around Electron; kill the whole tree so no window survives a failure.
const killTree = child => { if (child.exitCode === null) spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' }); };
// Clicking a button that closes the window ends the CDP target mid-click; that is the expected outcome.
const closingClick = locator => locator.click().catch(error => { if (!/closed/i.test(error.message)) throw error; });
const exited = child => new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve));

const sandbox = await mkdtemp(path.join(tools, 'setup-sandbox-'));
const userData = await mkdtemp(path.join(tools, 'setup-userdata-'));
const sandboxEnv = { SAVIRA_SETUP_SANDBOX: sandbox, SAVIRA_TEST_USER_DATA: userData };
const installDir = path.join(sandbox, 'Programs', 'Savira');
const shot = (page, name) => page.screenshot({ path: path.join(tools, `savira-${name}.png`) });

const setupRun = await attach(path.join(root, 'release', `Savira-Setup-${version}.exe`), ['--smoke-test'], sandboxEnv, 9339);
try {
  const { page } = setupRun;
  await expect(page.getByRole('heading', { name: 'savira installieren' })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(installDir)).toBeVisible();
  await page.waitForTimeout(1200);
  await shot(page, 'setup-welcome');
  await page.getByRole('button', { name: /Installationsort/ }).click();
  await expect(page.getByLabel('Installationsordner')).toHaveValue(installDir);
  await shot(page, 'setup-options');
  await page.getByRole('button', { name: 'übernehmen' }).click();
  await page.getByRole('button', { name: 'installieren' }).click();
  await expect(page.getByRole('progressbar')).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, 'setup-progress');
  await expect(page.getByRole('heading', { name: 'bereit zum spielen.' })).toBeVisible({ timeout: 180000 });
  await shot(page, 'setup-done');
  for (const file of ['Savira.exe', '.savira-install', 'LICENSE', 'resources/app.asar', 'resources/mods/savira-client-0.1.0.jar']) expect(await exists(path.join(installDir, file)), file).toBe(true);
  for (const file of ['Desktop/Savira.lnk', 'StartMenu/Savira.lnk', 'registry.json']) expect(await exists(path.join(sandbox, file)), file).toBe(true);
  const registry = JSON.parse(await readFile(path.join(sandbox, 'registry.json'), 'utf8'));
  expect(registry.installLocation).toBe(installDir);
  expect(registry.values.find(([name]) => name === 'UninstallString')[2]).toBe(`"${path.join(installDir, 'Savira.exe')}" --uninstall`);
  await closingClick(page.getByRole('main').getByRole('button', { name: 'Schließen' }));
  await exited(setupRun.child);
} finally { killTree(setupRun.child); }

const uninstallRun = await attach(path.join(installDir, 'Savira.exe'), ['--uninstall', '--smoke-test'], sandboxEnv, 9340);
try {
  const { page } = uninstallRun;
  await expect(page.getByRole('heading', { name: 'savira entfernen' })).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(1200);
  await shot(page, 'uninstall');
  await page.getByRole('button', { name: 'entfernen' }).click();
  await expect(page.getByRole('heading', { name: 'savira entfernt.' })).toBeVisible({ timeout: 30000 });
  await shot(page, 'uninstall-done');
  await closingClick(page.getByRole('main').getByRole('button', { name: 'schließen' }));
  await exited(uninstallRun.child);
} finally { killTree(uninstallRun.child); }

const gone = Date.now() + 30000;
while (await exists(installDir) && Date.now() < gone) await new Promise(resolve => setTimeout(resolve, 500));
expect(await exists(installDir), 'Installationsordner entfernt').toBe(false);
for (const file of ['Desktop/Savira.lnk', 'StartMenu/Savira.lnk', 'registry.json']) expect(await exists(path.join(sandbox, file)), `${file} entfernt`).toBe(false);
console.log('Paket-Test erfolgreich: Launcher startet, Setup installiert mit Verknüpfungen und Registrierung, Deinstallation entfernt alles wieder.');
