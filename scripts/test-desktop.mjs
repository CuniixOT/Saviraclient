import { _electron as electron, expect } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tools = path.join(root, '.tools');
await mkdir(tools, { recursive: true });
const userData = await mkdtemp(path.join(tools, 'smoke-'));
const env = { ...process.env, SAVIRA_TEST_USER_DATA: userData };
delete env.ELECTRON_RUN_AS_NODE;
let app;
let page;
const errors = [];
const javaPath = String.raw`C:\Savira Test\jdk-21\bin\java.exe`;
const shot = name => page.screenshot({ path: path.join(tools, `savira-${name}.png`), animations: 'disabled' });
async function start() {
  app = await electron.launch({ args: [root, '--smoke-test'], env, timeout: 60000 });
  page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.getByLabel('3D-Skin von Steve, mit der Maus drehbar')).toBeVisible();
}
try {
  await start();
  const bridge = await page.evaluate(() => ({ bridge: Boolean(window.savira), node: typeof window.require }));
  expect(bridge).toEqual({ bridge: true, node: 'undefined' });
  expect(await page.getByLabel('3D-Skin von Steve, mit der Maus drehbar').evaluate(canvas => canvas.width > 1 && canvas.height > 1)).toBe(true);
  const launchButton = page.getByRole('button', { name: 'anmelden', exact: true });
  await expect(launchButton).toBeVisible();
  const launchBox = await launchButton.boundingBox();
  const viewportHeight = await page.evaluate(() => innerHeight);
  expect(launchBox.y + launchBox.height).toBeLessThanOrEqual(viewportHeight);
  await page.waitForTimeout(1500);
  await shot('desktop');
  const sendStatus = status => app.evaluate(({ BrowserWindow }, next) => BrowserWindow.getAllWindows()[0].webContents.send('status', next), status);
  await sendStatus({ phase: 'installing', message: 'Minecraft: assets (1187/3410)', progress: 41 });
  await expect(page.getByRole('button', { name: 'lädt 41%' })).toBeVisible();
  await shot('installing');
  await sendStatus({ phase: 'error', message: 'Java wurde nicht gefunden. Bitte Java 21 installieren und unter Einstellungen auswählen.', progress: 0 });
  await expect(page.getByRole('alert')).toContainText('Java wurde nicht gefunden');
  await shot('error');
  await sendStatus({ phase: 'idle', message: 'Bereit, wenn du es bist.', progress: 0 });
  await page.getByRole('button', { name: /Savira 1\.21\.1/ }).click();
  await expect(page.getByRole('listbox', { name: 'Spielprofil' })).toBeVisible();
  await shot('profile-picker');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page.getByLabel('Profile suchen')).toBeVisible();
  await shot('profiles');
  await page.getByRole('button', { name: 'neues profil' }).click();
  await expect(page.getByRole('dialog', { name: 'version wählen' })).toBeVisible();
  await shot('profile-create');
  await page.getByRole('button', { name: /1\.8\.9/ }).click();
  await page.getByRole('button', { name: /weiter/ }).click();
  await page.getByLabel('Profilname').fill('Test 1.8.9');
  await page.getByRole('button', { name: /erstellen/ }).click();
  await expect(page.getByRole('heading', { name: /Test 1\.8\.9/ })).toBeVisible();

  await page.getByRole('button', { name: 'Module', exact: true }).click();
  await page.getByRole('switch', { name: 'Koordinaten aktivieren' }).click();
  await expect(page.getByRole('switch', { name: 'Koordinaten deaktivieren' })).toBeVisible();
  await shot('mods');

  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.getByLabel('Java-Pfad', { exact: true }).fill(javaPath);
  await shot('settings-dirty');
  await page.getByRole('button', { name: 'speichern' }).click();
  await expect(page.getByRole('button', { name: 'speichern' })).toHaveCount(0);
  await page.getByRole('radio', { name: 'Ozean' }).click();
  await expect(page.getByRole('radio', { name: 'Ozean' })).toHaveAttribute('aria-checked', 'true');
  await shot('settings');
  const invalid = await page.evaluate(async () => {
    const result = await window.savira.state();
    return window.savira.save({ ...result.data.settings, profiles: [{ ...result.data.settings.profiles[0], id: '../escape' }], selectedProfileId: '../escape' });
  });
  expect(invalid.ok).toBe(false);
  const launch = await page.evaluate(() => window.savira.launch());
  expect(launch).toEqual({ ok: false, error: 'Bitte zuerst mit Microsoft anmelden.' });

  await page.getByRole('button', { name: 'Über Savira' }).click();
  await expect(page.getByRole('heading', { name: 'über savira' })).toBeVisible();
  await page.locator('.account-chip').click();
  await expect(page.getByRole('dialog', { name: 'Account' })).toBeVisible();
  await shot('account');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Spielen', exact: true }).click();
  await page.waitForTimeout(800);
  await shot('desktop-blue');

  await app.close(); app = null;
  await start();
  const persisted = await page.evaluate(() => window.savira.state());
  expect(persisted.data.settings.javaPath).toBe(javaPath);
  expect(persisted.data.settings.accent).toBe('blue');
  expect(persisted.data.settings.hud.coordinates).toBe(true);
  expect(persisted.data.settings.profiles.some(profile => profile.name === 'Test 1.8.9' && profile.version === '1.8.9')).toBe(true);
  expect(errors).toEqual([]);
  console.log('Desktop-Smoke-Test erfolgreich: sichere Bridge, Profile, Module, Darstellung, Validierung, Startschutz, Account-Menü und Persistenz.');
  console.log(`Screenshots: ${path.join(tools, 'savira-*.png')}`);
} finally {
  if (app) await app.close();
}
