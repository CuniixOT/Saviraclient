// Savira's own installer and uninstaller. The setup exe (electron-builder "portable") unpacks the
// app to a temp folder and starts it with PORTABLE_EXECUTABLE_FILE set; the app then copies
// itself to the chosen folder, creates shortcuts and registers with "Apps & Features".
const { app, shell } = require('electron');
const path = require('node:path');
// Electron's patched fs treats resources/app.asar as a folder; copying must see the real file.
const fs = (() => { try { return require('original-fs').promises; } catch { return require('node:fs/promises'); } })();
const os = require('node:os');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);

const EXE = 'Savira.exe';
const MARKER = '.savira-install';
const UNINSTALL_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\SaviraClient';
const PORTABLE_ENV = ['PORTABLE_EXECUTABLE_DIR', 'PORTABLE_EXECUTABLE_FILE', 'PORTABLE_EXECUTABLE_APP_FILENAME'];

// Tests point this at a scratch folder: no registry writes, shortcuts land inside it.
const sandbox = () => process.env.SAVIRA_SETUP_SANDBOX || null;

function detectMode(argv = process.argv, env = process.env, packaged = app.isPackaged) {
  if (argv.includes('--uninstall')) return 'uninstall';
  if (argv.includes('--setup') || (packaged && env.PORTABLE_EXECUTABLE_FILE)) return 'setup';
  return null;
}

// The app always lives in a folder named "Savira". Uninstall deletes that folder, so it must
// never be a parent folder the user picked, such as C:\Games.
function resolveInstallDir(chosen) {
  if (typeof chosen !== 'string' || !chosen.trim() || chosen.length > 400) throw new Error('Bitte einen gültigen Installationsordner wählen.');
  if (!path.isAbsolute(chosen)) throw new Error('Der Installationsordner muss ein vollständiger Pfad sein.');
  const dir = path.resolve(chosen);
  if (dir === path.parse(dir).root) return path.join(dir, 'Savira');
  return path.basename(dir).toLowerCase() === 'savira' ? dir : path.join(dir, 'Savira');
}

function defaultDir() {
  return sandbox() ? path.join(sandbox(), 'Programs', 'Savira') : path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs', 'Savira');
}

function shortcutPaths() {
  const base = sandbox();
  return {
    desktop: path.join(base ? path.join(base, 'Desktop') : app.getPath('desktop'), 'Savira.lnk'),
    startMenu: path.join(base ? path.join(base, 'StartMenu') : path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'), 'Savira.lnk')
  };
}

function sourceDir() {
  if (process.env.SAVIRA_SETUP_SOURCE) return path.resolve(process.env.SAVIRA_SETUP_SOURCE);
  if (!app.isPackaged) throw new Error('Im Entwicklungsmodus SAVIRA_SETUP_SOURCE auf release/win-unpacked setzen.');
  return path.dirname(process.execPath);
}

const exists = file => fs.access(file).then(() => true, () => false);

async function listFiles(dir, prefix = '') {
  const files = [];
  for (const entry of await fs.readdir(path.join(dir, prefix), { withFileTypes: true })) {
    const rel = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(dir, rel));
    else if (entry.isFile()) files.push({ rel, size: (await fs.stat(path.join(dir, rel))).size });
  }
  return files;
}

async function existingInstall() {
  if (sandbox()) {
    try { return JSON.parse(await fs.readFile(path.join(sandbox(), 'registry.json'), 'utf8')).installLocation || null; } catch { return null; }
  }
  try {
    const { stdout } = await run('reg.exe', ['query', UNINSTALL_KEY, '/v', 'InstallLocation'], { windowsHide: true });
    const location = stdout.match(/InstallLocation\s+REG_SZ\s+(.+)/)?.[1]?.trim();
    return location && await exists(path.join(location, MARKER)) ? location : null;
  } catch { return null; }
}

async function info() {
  const source = sourceDir();
  const files = await listFiles(source);
  const existing = await existingInstall();
  const links = shortcutPaths();
  // An update keeps the shortcut choices of the existing installation.
  const shortcuts = existing ? { desktop: await exists(links.desktop), startMenu: await exists(links.startMenu) } : { desktop: true, startMenu: true };
  return { version: app.getVersion(), defaultDir: existing || defaultDir(), existing, shortcuts, sizeMb: Math.round(files.reduce((sum, file) => sum + file.size, 0) / 1048576) };
}

function friendly(error) {
  if (['EBUSY', 'EPERM', 'EACCES'].includes(error?.code)) return new Error('Savira läuft noch oder der Ordner ist geschützt. Schließe den Launcher und versuche es erneut.');
  if (error?.code === 'ENOSPC') return new Error('Nicht genug Speicherplatz auf dem Laufwerk.');
  return error instanceof Error ? error : new Error('Die Installation ist fehlgeschlagen.');
}

async function register(dir, sizeKb) {
  const exe = path.join(dir, EXE);
  const values = [
    ['DisplayName', 'REG_SZ', 'Savira Client'], ['DisplayVersion', 'REG_SZ', app.getVersion()], ['Publisher', 'REG_SZ', 'Savira'],
    ['DisplayIcon', 'REG_SZ', `"${exe}",0`], ['InstallLocation', 'REG_SZ', dir], ['UninstallString', 'REG_SZ', `"${exe}" --uninstall`],
    ['QuietUninstallString', 'REG_SZ', `"${exe}" --uninstall`], ['EstimatedSize', 'REG_DWORD', String(sizeKb)], ['NoModify', 'REG_DWORD', '1'], ['NoRepair', 'REG_DWORD', '1']
  ];
  if (sandbox()) { await fs.writeFile(path.join(sandbox(), 'registry.json'), JSON.stringify({ installLocation: dir, values })); return; }
  for (const [name, type, data] of values) await run('reg.exe', ['add', UNINSTALL_KEY, '/v', name, '/t', type, '/d', data, '/f'], { windowsHide: true });
}

async function install({ target, desktop, startMenu }, onProgress) {
  const source = sourceDir();
  const dir = resolveInstallDir(target);
  if (!await exists(path.join(source, EXE))) throw new Error('Setup-Dateien unvollständig. Bitte das Setup erneut herunterladen.');
  const relative = path.relative(source, dir);
  if (!relative || (!relative.startsWith('..') && !path.isAbsolute(relative))) throw new Error('Bitte einen anderen Installationsordner wählen.');
  try {
    // A half-removed earlier attempt may have lost its marker but still holds Savira's own files.
    const ownFolder = await exists(path.join(dir, MARKER)) || (await exists(path.join(dir, EXE)) && await exists(path.join(dir, 'resources', 'app.asar')));
    if (ownFolder) {
      // Update: replace the previous version completely so no stale files survive.
      onProgress({ step: 'prepare', progress: 0, file: 'Alte Version wird entfernt …' });
      // After an auto-update the old launcher may still be shutting down; give it a few seconds.
      for (let attempt = 0; ; attempt++) {
        try { await fs.rm(dir, { recursive: true, force: true }); break; }
        catch (error) {
          if (!['EBUSY', 'EPERM'].includes(error?.code) || attempt >= 30) throw error;
          if (attempt === 2) onProgress({ step: 'prepare', progress: 0, file: 'Warte, bis der alte Launcher beendet ist …' });
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    } else if (await exists(dir) && (await fs.readdir(dir)).length) {
      throw new Error(`Der Ordner „${dir}“ enthält bereits andere Dateien. Bitte einen leeren Ordner wählen.`);
    }
    const files = await listFiles(source);
    const total = files.reduce((sum, file) => sum + file.size, 0) || 1;
    let copied = 0, lastSent = 0;
    for (const file of files) {
      const destination = path.join(dir, file.rel);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.copyFile(path.join(source, file.rel), destination);
      copied += file.size;
      const now = Date.now();
      if (now - lastSent > 60 || copied === total) { lastSent = now; onProgress({ step: 'copy', progress: Math.round(copied / total * 90), file: file.rel }); }
    }
    await fs.writeFile(path.join(dir, MARKER), JSON.stringify({ version: app.getVersion(), installedAt: new Date().toISOString() }));

    onProgress({ step: 'shortcuts', progress: 93, file: 'Verknüpfungen' });
    const exe = path.join(dir, EXE), links = shortcutPaths();
    const link = { target: exe, cwd: dir, icon: exe, iconIndex: 0, description: 'Savira Minecraft Client', appUserModelId: 'gg.savira.launcher' };
    for (const [enabled, file] of [[desktop, links.desktop], [startMenu, links.startMenu]]) {
      if (enabled) { await fs.mkdir(path.dirname(file), { recursive: true }); if (!shell.writeShortcutLink(file, 'create', link)) throw new Error('Verknüpfung konnte nicht erstellt werden.'); }
      else await fs.rm(file, { force: true });
    }

    onProgress({ step: 'register', progress: 97, file: 'Apps & Features' });
    await register(dir, Math.round(total / 1024));
    onProgress({ step: 'done', progress: 100, file: '' });
    return { dir, exe };
  } catch (error) { throw friendly(error); }
}

function launchInstalled(exe) {
  const env = { ...process.env };
  for (const key of PORTABLE_ENV) delete env[key];
  spawn(exe, [], { cwd: path.dirname(exe), detached: true, stdio: 'ignore', env }).unref();
}

async function uninstall({ removeData }) {
  const dir = path.dirname(process.execPath);
  if (!await exists(path.join(dir, MARKER))) throw new Error('Diese Savira-Kopie wurde nicht mit dem Setup installiert und kann hier nicht entfernt werden.');
  const exe = path.join(dir, EXE);
  for (const file of Object.values(shortcutPaths())) {
    try { if (path.resolve(shell.readShortcutLink(file).target) === path.resolve(exe)) await fs.rm(file, { force: true }); } catch { /* No shortcut there. */ }
  }
  if (sandbox()) await fs.rm(path.join(sandbox(), 'registry.json'), { force: true });
  else await run('reg.exe', ['delete', UNINSTALL_KEY, '/f'], { windowsHide: true }).catch(() => {});

  // The running exe and Chromium's profile stay locked until this process exits, so a detached
  // script retries the deletion for a few seconds after Savira closes.
  const targets = [dir, ...(removeData ? [app.getPath('userData')] : [])];
  if (targets.some(target => /["%^&|<>]/.test(target))) throw new Error('Der Installationspfad enthält Zeichen, die nicht automatisch gelöscht werden können.');
  const lines = ['@echo off', ...targets.flatMap((target, index) => [
    `set n=0`, `:retry${index}`, `rmdir /s /q "${target}" 2>nul`, `if exist "${target}" (set /a n+=1 & if %n% lss 40 (ping -n 2 127.0.0.1 >nul & goto retry${index}))`
  ]), '(goto) 2>nul & del "%~f0"'];
  const script = path.join(os.tmpdir(), `savira-uninstall-${process.pid}.cmd`);
  await fs.writeFile(script, lines.join('\r\n'));
  // Start only on quit: the retry window must begin once Savira releases its files.
  app.once('will-quit', () => spawn('cmd.exe', ['/d', '/c', script], { cwd: os.tmpdir(), detached: true, stdio: 'ignore', windowsHide: true }).unref());
  return { dir };
}

module.exports = { detectMode, resolveInstallDir, defaultDir, info, install, uninstall, launchInstalled, MARKER };
