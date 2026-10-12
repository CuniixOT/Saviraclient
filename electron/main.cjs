const { app, BrowserWindow, ipcMain, safeStorage, shell, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createHash } = require('node:crypto');
const { Client } = require('./minecraft.cjs');
const { Auth } = require('msmc');
const { accentRgb, defaults, maxMemory, validateSettings } = require('./settings.cjs');
const log = require('./logger.cjs');
const logfiles = require('./logfiles.cjs');
const { createSession } = require('./gamesession.cjs');
const { normalizeSkinUrl, validSkinPng } = require('./skin.cjs');
const { createSkinLibrary, assertSkin } = require('./skins.cjs');
const { createCapeLibrary } = require('./capes.cjs');
const { createPanoramaStore } = require('./panoramas.cjs');
const setup = require('./setup.cjs');
const { createUpdater } = require('./updater.cjs');
const { createAccountStore } = require('./accounts.cjs');
const { createPresence } = require('./discord.cjs');
const { existsSync } = require('node:fs');
const packageInfo = require('../package.json');
// Tests point the updater at a local server and their own key; releases use package.json.
// "github": "owner/repo" is enough; GitHub serves the newest release's assets under /latest/download/.
const githubRepo = /^[\w.-]+\/[\w.-]+$/.test(packageInfo.saviraUpdate?.github || '') ? packageInfo.saviraUpdate.github : '';
const updateFeed = process.env.SAVIRA_UPDATE_FEED || packageInfo.saviraUpdate?.feed
  || (githubRepo ? `https://github.com/${githubRepo}/releases/latest/download/latest.json` : '');
// Discord invite for the in-game main menu; only real invite links are passed on.
const DISCORD_INVITE = /^https:\/\/(discord\.gg|(www\.)?discord\.com\/invite)\/[A-Za-z0-9-]{2,32}$/;
const discordUrl = () => DISCORD_INVITE.test(packageInfo.saviraLinks?.discord || '') ? packageInfo.saviraLinks.discord : '';
// Rich Presence needs the id of a Discord application (Developer Portal → Applications).
const discordClientId = /^\d{17,20}$/.test(packageInfo.saviraLinks?.discordClientId || '') ? packageInfo.saviraLinks.discordClientId : '';
const updatePublicKey = process.env.SAVIRA_UPDATE_PUBLIC_KEY || packageInfo.saviraUpdate?.publicKey || '';
const run = promisify(execFile);
const SAVIRA_MC = '1.21.1';
const LOADER = '0.16.14';
app.setName('Savira');
// Same id as the installer's shortcuts, so Windows groups the window with them and uses their icon.
if (process.platform === 'win32') app.setAppUserModelId('gg.savira.launcher');
// Tests isolate their profile via this variable. It is inherited through updater → setup →
// relaunch, so a test launcher never collides with a real Savira running on the same machine.
if (process.env.SAVIRA_TEST_USER_DATA) app.setPath('userData', path.resolve(process.env.SAVIRA_TEST_USER_DATA));
let win, logWin = null, settings = structuredClone(defaults), account = null, accounts = [], busy = false, loggingIn = false;
let store = null, presence = null, wardrobe = null, capes = null, panoramas = null, page = 'home';
const launcherStarted = Date.now();
// The running (or last) Minecraft process and its log buffer for the log window.
let session = null, gameChild = null;
let status = { phase: 'idle', message: 'Bereit, wenn du es bist.', progress: 0 };
const root = () => app.getPath('userData');
const selectedProfile = () => settings.profiles.find(profile => profile.id === settings.selectedProfileId) || settings.profiles[0];
const instance = () => path.join(root(), 'instances', selectedProfile().id);
// Before 0.1.7 a single account lived in account.bin / skin.png; it is moved into the account store.
const legacyTokenPath = () => path.join(root(), 'account.bin');
const legacySkinPath = () => path.join(root(), 'skin.png');
function publish(next) {
  status = { ...status, ...next };
  if (win && !win.isDestroyed()) win.webContents.send('status', status);
  updatePresence();
}
async function atomicWrite(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file + '.tmp', data);
  await fs.rename(file + '.tmp', file);
}
async function json(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'Savira/0.1.0 (Minecraft Launcher)' } });
  if (!response.ok) throw new Error(`Download fehlgeschlagen (${response.status}). Bitte erneut versuchen.`);
  return response.json();
}
async function cacheSkin(mc) {
  const skinPath = store.skinPath(mc.profile.id.replace(/-/g, '').toLowerCase());
  let skins = mc.profile.skins || [];
  try {
    if (!skins.length && mc.mcToken) {
      const profileResponse = await fetch('https://api.minecraftservices.com/minecraft/profile', {
        signal: AbortSignal.timeout(30000), redirect: 'error', headers: { Authorization: `Bearer ${mc.mcToken}`, 'User-Agent': 'Savira/0.1.0' }
      });
      if (profileResponse.ok) skins = (await profileResponse.json()).skins || [];
    }
    const value = skins.find(skin => skin.state === 'ACTIVE')?.url || skins[0]?.url;
    if (value) {
      // Mojang still returns legacy HTTP texture URLs for some profiles. Upgrade only its exact texture path.
      const url = normalizeSkinUrl(value);
      const response = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: 'error' });
      if (!response.ok) throw new Error(`Skin-Download fehlgeschlagen (${response.status}).`);
      const length = Number(response.headers.get('content-length') || 0);
      if (length > 2_000_000) throw new Error('Skin-Datei ist zu groß.');
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!validSkinPng(bytes)) throw new Error('Skin-Datei ist keine gültige PNG-Datei.');
      await atomicWrite(skinPath, bytes);
    }
  } catch (error) {
    console.warn('[Savira] Skin konnte nicht aktualisiert werden:', error instanceof Error ? error.message : 'Unbekannter Fehler');
  }
}
async function readSkin(uuid) {
  try { return `data:image/png;base64,${(await fs.readFile(store.skinPath(uuid))).toString('base64')}`; } catch { return null; }
}
// Public view of the store for the renderer: never contains tokens.
async function refreshAccounts() {
  accounts = await Promise.all(store.list().map(async entry => ({ name: entry.name, uuid: entry.uuid, skin: await readSkin(entry.uuid) })));
  const active = store.active();
  account = active ? accounts.find(entry => entry.uuid === active.uuid) || null : null;
  return { account, accounts };
}
// interactive: Microsoft window, adds or refreshes an account and makes it active.
// Otherwise the active account's saved token is renewed (or the given legacy token).
async function authenticate(interactive, legacyToken) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows-Anmeldedatenschutz ist nicht verfügbar.');
  const auth = new Auth('select_account');
  const saved = interactive || legacyToken ? null : store.active();
  if (!interactive && !legacyToken && !saved) throw new Error('Bitte zuerst mit Microsoft anmelden.');
  const xbox = interactive
    ? await auth.launch('electron', { width: 520, height: 700, parent: win, autoHideMenuBar: true, webPreferences: { nodeIntegration: false, contextIsolation: true } })
    : await auth.refresh(legacyToken || saved.token);
  const mc = await xbox.getMinecraft();
  if (mc.isDemo()) throw new Error('Dieses Microsoft-Konto besitzt keine Minecraft Java Edition.');
  await store.upsert({ uuid: mc.profile.id, name: mc.profile.name, token: xbox.save() });
  await cacheSkin(mc);
  const uuid = mc.profile.id.replace(/-/g, '').toLowerCase();
  void vanillaCapes(mc.profile).then(result => rememberVanillaCape(uuid, result.capes)).catch(() => { /* Cape stays as it was. */ });
  await refreshAccounts();
  log.info(`Angemeldet als ${account.name}${interactive ? ' (Microsoft-Fenster)' : ' (gespeicherte Sitzung)'}`);
  return mc;
}
const pageLabels = { home: 'Startseite', profiles: 'Profile', skins: 'Skins', capes: 'Capes', mods: 'Module', settings: 'Einstellungen', about: 'Über Savira' };
// Skin sources for the wardrobe: a Minecraft name or UUID (via Mojang) or a direct https image link.
async function download(url, limit = 1_000_000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Savira/0.1.0' } });
  if (!response.ok) throw new Error(`Download fehlgeschlagen (${response.status}).`);
  if (Number(response.headers.get('content-length') || 0) > limit) throw new Error('Die Datei ist zu groß.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > limit) throw new Error('Die Datei ist zu groß.');
  return bytes;
}
async function resolveSkin(query) {
  const value = typeof query === 'string' ? query.trim() : '';
  if (!value || value.length > 400) throw new Error('Bitte einen Benutzernamen, eine UUID oder einen Bild-Link eingeben.');
  if (/^https:\/\//i.test(value)) {
    const url = new URL(value);
    // Only public hosts: no localhost or raw IP addresses from the local network.
    if (url.hostname === 'localhost' || require('node:net').isIP(url.hostname.replace(/^\[|\]$/g, ''))) throw new Error('Dieser Link ist nicht erlaubt.');
    const name = decodeURIComponent(url.pathname.split('/').pop() || '').replace(/\.png$/i, '').slice(0, 32).trim() || 'Neuer Skin';
    return { name, variant: null, png: `data:image/png;base64,${assertSkin(await download(url)).toString('base64')}` };
  }
  let uuid = value.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(uuid)) {
    if (!/^[A-Za-z0-9_]{3,16}$/.test(value)) throw new Error('Unbekanntes Format. Erlaubt sind Benutzername, UUID oder ein https-Bild-Link.');
    const response = await fetch(`https://api.mojang.com/users/profiles/minecraft/${value}`, { signal: AbortSignal.timeout(20000) });
    if (response.status === 404 || response.status === 204) throw new Error(`Kein Minecraft-Konto mit dem Namen „${value}“ gefunden.`);
    if (!response.ok) throw new Error(`Mojang ist gerade nicht erreichbar (${response.status}).`);
    uuid = (await response.json()).id;
  }
  const response = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`, { signal: AbortSignal.timeout(20000) });
  if (response.status === 204 || response.status === 404) throw new Error('Kein Minecraft-Konto mit dieser UUID gefunden.');
  if (!response.ok) throw new Error(`Mojang ist gerade nicht erreichbar (${response.status}).`);
  const profile = await response.json();
  const encoded = profile.properties?.find(property => property.name === 'textures')?.value;
  const skin = encoded ? JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')).textures?.SKIN : null;
  if (!skin?.url) throw new Error(`${profile.name} nutzt den Standard-Skin.`);
  const bytes = assertSkin(await download(normalizeSkinUrl(skin.url)));
  return { name: profile.name, variant: skin.metadata?.model === 'slim' ? 'slim' : 'classic', png: `data:image/png;base64,${bytes.toString('base64')}` };
}
async function wardrobeState() {
  return { skins: await wardrobe.list(), applied: account ? wardrobe.appliedFor(account.uuid) : null };
}
// Uploads the skin to the active Minecraft account, like changing it on minecraft.net.
async function applySkin(id) {
  if (busy || loggingIn) throw new Error('Skins können nach dem Beenden von Minecraft gewechselt werden.');
  if (!account) throw new Error('Bitte zuerst mit Microsoft anmelden.');
  const skin = wardrobe.get(id), bytes = await wardrobe.texture(id);
  const mc = await authenticate(false);
  const form = new FormData();
  form.append('variant', skin.variant);
  form.append('file', new Blob([bytes], { type: 'image/png' }), 'skin.png');
  const response = await fetch('https://api.minecraftservices.com/minecraft/profile/skins', {
    method: 'POST', body: form, redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${mc.mcToken}`, 'User-Agent': 'Savira/0.1.0' }
  });
  if (response.status === 429) throw new Error('Zu viele Skin-Wechsel hintereinander. Bitte eine Minute warten.');
  if (!response.ok) throw new Error(`Mojang hat den Skin abgelehnt (${response.status}).`);
  const profile = await response.json().catch(() => null);
  if (Array.isArray(profile?.skins)) mc.profile.skins = profile.skins;
  await cacheSkin(mc);
  await wardrobe.markApplied(account.uuid, skin.id);
  await refreshAccounts();
  log.info(`Skin „${skin.name}“ für ${account.name} gesetzt`);
  return { account, accounts, applied: skin.id };
}
// Vanilla capes: the ones Mojang gave this account (Migrator, Pan, …); one or none can be shown.
async function minecraftProfile(mc) {
  const response = await fetch('https://api.minecraftservices.com/minecraft/profile', {
    redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${mc.mcToken}`, 'User-Agent': 'Savira/0.1.0' }
  });
  if (!response.ok) throw new Error(`Mojang ist gerade nicht erreichbar (${response.status}).`);
  return response.json();
}
async function vanillaCapes(profile) {
  const list = await Promise.all((Array.isArray(profile?.capes) ? profile.capes : []).map(async cape => {
    let png = null;
    try { png = `data:image/png;base64,${(await download(normalizeSkinUrl(cape.url), 500_000)).toString('base64')}`; } catch { /* Shown without picture. */ }
    return { id: String(cape.id), name: String(cape.alias || 'Cape').replace(/_/g, ' '), png, active: cape.state === 'ACTIVE' };
  }));
  return { capes: list, active: list.find(cape => cape.active)?.id || null };
}
async function capeAccount() {
  if (busy || loggingIn) throw new Error('Capes können nach dem Beenden von Minecraft gewechselt werden.');
  if (!account) throw new Error('Bitte zuerst mit Microsoft anmelden.');
  return authenticate(false);
}
// The figure on the start page wears the own Savira cape, otherwise the account's vanilla cape.
const vanillaCapePath = uuid => path.join(root(), 'skins', `${uuid}-cape.png`);
async function rememberVanillaCape(uuid, list) {
  const active = list.find(cape => cape.active && cape.png);
  try {
    if (active) await atomicWrite(vanillaCapePath(uuid), Buffer.from(active.png.slice(active.png.indexOf(',') + 1), 'base64'));
    else await fs.rm(vanillaCapePath(uuid), { force: true });
  } catch { /* Only a preview. */ }
}
async function currentCape() {
  const file = capes?.activeFile() || (account ? vanillaCapePath(account.uuid) : null);
  if (!file) return null;
  try { return `data:image/png;base64,${(await fs.readFile(file)).toString('base64')}`; } catch { return null; }
}
async function setVanillaCape(capeId) {
  const mc = await capeAccount();
  const id = capeId === null ? null : String(capeId);
  if (id !== null && !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Unbekanntes Cape.');
  const response = await fetch('https://api.minecraftservices.com/minecraft/profile/capes/active', {
    method: id ? 'PUT' : 'DELETE', redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${mc.mcToken}`, 'User-Agent': 'Savira/0.1.0', ...(id ? { 'Content-Type': 'application/json' } : {}) },
    body: id ? JSON.stringify({ capeId: id }) : undefined
  });
  if (response.status === 429) throw new Error('Zu viele Cape-Wechsel hintereinander. Bitte eine Minute warten.');
  if (!response.ok) throw new Error(`Mojang hat den Cape-Wechsel abgelehnt (${response.status}).`);
  // A vanilla choice replaces the own Savira cape, so what the player picked is what they see.
  await capes.setActive(null);
  log.info(id ? 'Vanilla-Cape gewechselt' : 'Vanilla-Cape ausgeblendet');
  const vanilla = await vanillaCapes(await response.json().catch(async () => minecraftProfile(mc)));
  await rememberVanillaCape(account.uuid, vanilla.capes);
  return { vanilla, library: await capes.list() };
}
const loaderLabel = loader => loader === 'savira' ? 'Savira Client' : 'Vanilla';
// What Discord shows: the launcher page, or the profile and version being started or played.
function updatePresence() {
  if (!presence) return;
  const playing = session && (status.phase === 'running' || status.phase === 'preparing' || status.phase === 'installing');
  const profile = playing ? session.snapshot().profile : selectedProfile();
  const assets = { large_image: `https://raw.githubusercontent.com/CuniixOT/Saviraclient/main/public/icon.png?v=${app.getVersion()}`, large_text: `Savira Client ${app.getVersion()}` };
  if (status.phase === 'running' && session) {
    presence.set({ details: `Spielt ${profile.name}`, state: `Minecraft ${profile.version} · ${loaderLabel(profile.loader)}`, timestamps: { start: session.snapshot().startedAt }, assets });
  } else if (status.phase === 'preparing' || status.phase === 'installing') {
    presence.set({ details: `Startet ${profile.name}`, state: `Minecraft ${profile.version} wird vorbereitet`, timestamps: { start: launcherStarted }, assets });
  } else {
    presence.set({ details: `Im Launcher · ${pageLabels[page] || 'Startseite'}`, state: `Profil: ${profile.name} (${profile.version})`, timestamps: { start: launcherStarted }, assets });
  }
}
async function prepareFabric(gameRoot, minecraftVersion) {
  if (minecraftVersion !== SAVIRA_MC) throw new Error(`Der Savira-Mod unterstützt aktuell nur Minecraft ${SAVIRA_MC}. Wähle für andere Versionen Vanilla.`);
  publish({ phase: 'installing', message: 'Fabric-Profil wird vorbereitet …', progress: 4 });
  const id = `fabric-loader-${LOADER}-${minecraftVersion}`;
  const profile = await json(`https://meta.fabricmc.net/v2/versions/loader/${minecraftVersion}/${LOADER}/profile/json`);
  await atomicWrite(path.join(gameRoot, 'versions', id, `${id}.json`), JSON.stringify(profile));
  const mods = path.join(gameRoot, 'mods');
  await fs.mkdir(mods, { recursive: true });
  const source = app.isPackaged ? path.join(process.resourcesPath, 'mods', 'savira-client-0.1.0.jar') : path.join(__dirname, '..', 'client-mod', 'build', 'libs', 'savira-client-0.1.0.jar');
  try { await fs.access(source); } catch { throw new Error('Savira-Mod fehlt. Bitte zuerst „npm run build:mod“ ausführen oder das Vanilla-Profil wählen.'); }
  await fs.copyFile(source, path.join(mods, 'savira-client-0.1.0.jar'));
  const versions = await json(`https://api.modrinth.com/v2/project/fabric-api/version?loaders=%5B%22fabric%22%5D&game_versions=%5B%22${minecraftVersion}%22%5D`);
  const version = versions.find(v => v.version_type === 'release');
  const file = version?.files.find(f => f.primary) || version?.files[0];
  if (!file || new URL(file.url).hostname !== 'cdn.modrinth.com' || !/^[a-zA-Z0-9._+\-]+\.jar$/.test(file.filename)) throw new Error('Fabric API konnte nicht aufgelöst werden.');
  const destination = path.join(mods, file.filename);
  let valid = false;
  try { valid = createHash('sha512').update(await fs.readFile(destination)).digest('hex') === file.hashes.sha512; } catch { /* First install. */ }
  if (!valid) {
    publish({ message: 'Fabric API wird heruntergeladen …', progress: 8 });
    const response = await fetch(file.url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error('Fabric-API-Download fehlgeschlagen.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (createHash('sha512').update(bytes).digest('hex') !== file.hashes.sha512) throw new Error('Prüfsumme der Fabric API stimmt nicht.');
    await atomicWrite(destination, bytes);
  }
  for (const name of await fs.readdir(mods)) {
    if (name.startsWith('fabric-api-') && name.endsWith('.jar') && name !== file.filename) await fs.unlink(path.join(mods, name));
  }
  // First start: give the panorama download a moment, so the menu offers them right away.
  if (panoramas) await Promise.race([panoramas.ensure().catch(() => []), new Promise(resolve => setTimeout(resolve, 20000))]);
  const capeFile = capes?.activeFile(), capeTarget = path.join(gameRoot, 'config', 'savira-cape.png');
  let customCape = false;
  if (capeFile) {
    try { await fs.mkdir(path.dirname(capeTarget), { recursive: true }); await fs.copyFile(capeFile, capeTarget); customCape = true; } catch (error) { log.warn('Cape konnte nicht übernommen werden', error); }
  }
  if (!customCape) await fs.rm(capeTarget, { force: true });
  const hudPath = path.join(gameRoot, 'config', 'savira.json');
  let inGame = {};
  try { inGame = JSON.parse(await fs.readFile(hudPath, 'utf8')) || {}; } catch { /* First launch or invalid config. */ }
  // Layout and snapping belong to the in-game editor, while launcher toggles stay authoritative.
  await atomicWrite(hudPath, JSON.stringify({ ...settings.hud, accent: accentRgb(settings.accent), discordUrl: discordUrl(), launcherVersion: app.getVersion(), customTitleScreen: inGame.customTitleScreen !== false, customCape, panoramaDir: panoramas ? panoramas.dir : '', menuBackground: typeof inGame.menuBackground === 'string' && /^[a-z]{1,16}$/.test(inGame.menuBackground) ? inGame.menuBackground : 'current', layout: inGame.layout || {}, styles: inGame.styles || {}, snap: inGame.snap !== false }, null, 2));
  return id;
}
// The title-screen panorama ships with the game assets the player already downloaded.
// Nothing from Mojang is bundled; without an installed instance the renderer uses its own art.
const PANORAMA = [0, 1, 2, 3].map(i => `minecraft/textures/gui/title/background/panorama_${i}.png`);
async function panorama() {
  const assetRoots = [];
  try { for (const name of await fs.readdir(path.join(root(), 'instances'))) assetRoots.push(path.join(root(), 'instances', name, 'assets')); } catch { /* No instance yet. */ }
  if (!app.isPackaged) assetRoots.push(path.join(__dirname, '..', '.tools', 'demo-runtime', 'assets'));
  for (const assets of assetRoots) {
    let indexes = [];
    try { indexes = (await fs.readdir(path.join(assets, 'indexes'))).filter(name => /^[\w.-]+\.json$/.test(name)); } catch { continue; }
    for (const index of indexes) {
      try {
        const objects = JSON.parse(await fs.readFile(path.join(assets, 'indexes', index), 'utf8')).objects || {};
        const hashes = PANORAMA.map(key => objects[key]?.hash);
        if (!hashes.every(hash => typeof hash === 'string' && /^[a-f0-9]{40}$/.test(hash))) continue;
        const images = [];
        for (const hash of hashes) {
          const bytes = await fs.readFile(path.join(assets, 'objects', hash.slice(0, 2), hash));
          if (bytes.length > 8_000_000 || !validSkinPng(bytes.subarray(0, 24))) throw new Error('Kein gültiges Panorama.');
          images.push(`data:image/png;base64,${bytes.toString('base64')}`);
        }
        return images;
      } catch { /* Try the next index or instance. */ }
    }
  }
  return null;
}
async function launch() {
  if (busy || loggingIn) throw new Error('Ein Vorgang läuft bereits.');
  if (!account) throw new Error('Bitte zuerst mit Microsoft anmelden.');
  busy = true;
  try {
    const profile = selectedProfile();
    publish({ phase: 'preparing', message: `${profile.name}: Java wird geprüft …`, progress: 0 });
    let java;
    try { java = await run(settings.javaPath, ['-version'], { timeout: 10000, windowsHide: true }); }
    catch { throw new Error('Java wurde nicht gefunden. Bitte Java 21 installieren und unter Einstellungen auswählen.'); }
    const major = Number((java.stderr + java.stdout).match(/version "(\d+)/)?.[1]);
    if (profile.version !== '1.8.9' && major !== 21) throw new Error(`Minecraft ${profile.version} benötigt in Savira Java 21. Bitte den passenden Java-Pfad auswählen.`);
    if (profile.version === '1.8.9' && ![8, 17, 21].includes(major)) throw new Error('Minecraft 1.8.9 benötigt eine kompatible Java-Version (8, 17 oder 21).');
    publish({ message: 'Minecraft-Anmeldung wird erneuert …' });
    const mc = await authenticate(false);
    const gameRoot = instance();
    await fs.mkdir(gameRoot, { recursive: true });
    const custom = profile.loader === 'savira' ? await prepareFabric(gameRoot, profile.version) : undefined;
    publish({ phase: 'installing', message: 'Minecraft-Dateien werden geprüft und geladen …', progress: 10 });
    log.info(`Start: ${profile.name} (Minecraft ${profile.version}, ${profile.loader}, ${settings.memory} GB)`);
    const launcher = new Client();
    launcher.on('progress', e => publish({ message: `Minecraft: ${e.type} (${e.task}/${e.total})`, progress: e.total ? Math.min(95, 10 + Math.round(e.task / e.total * 85)) : 10 }));
    session = createSession({
      profile: { id: profile.id, name: profile.name, version: profile.version, loader: profile.loader, memory: settings.memory }, account: account?.name || '',
      onLines: lines => sendToLogs('logs-lines', lines),
      onStats: stats => sendToLogs('logs-stats', stats)
    });
    sendToLogs('logs-reset', logsState());
    if (settings.logsOnLaunch) openLogWindow();
    let lastError = '';
    // Only game output goes to the log window; MCLC's 'debug' events contain the access token.
    launcher.on('data', line => {
      session?.push(line);
      if (/\b(ERROR|Exception)\b/.test(line)) lastError = log.redact(line).slice(0, 350);
    });
    launcher.on('close', code => {
      busy = false; gameChild = null;
      session?.end();
      sendToLogs('logs-ended', { code });
      log[code === 0 ? 'info' : 'warn'](`Minecraft beendet (Code ${code})`, code === 0 ? undefined : lastError);
      if (settings.hideOnLaunch && win && !win.isDestroyed()) { win.show(); win.focus(); }
      publish({ phase: code === 0 ? 'idle' : 'error', message: code === 0 ? 'Minecraft wurde beendet. Bis zur nächsten Runde.' : `Minecraft wurde mit Code ${code} beendet. ${lastError || 'Details stehen im Spielordner unter logs/latest.log.'}`, progress: 0 });
    });
    const child = await launcher.launch({
      authorization: mc.mclc(), root: gameRoot, javaPath: settings.javaPath,
      version: { number: profile.version, type: 'release', ...(custom ? { custom } : {}) },
      memory: { min: '1G', max: `${settings.memory}G` },
      window: { width: 1280, height: 800, fullscreen: settings.fullscreen },
      overrides: { detached: false }, timeout: 60000
    });
    if (!child || !child.pid) throw new Error('Minecraft konnte nicht gestartet werden. Prüfe Java und die Internetverbindung.');
    child.once('error', () => { busy = false; gameChild = null; log.error('Minecraft-Prozess konnte nicht ausgeführt werden'); publish({ phase: 'error', message: 'Der Minecraft-Prozess konnte nicht ausgeführt werden.', progress: 0 }); });
    gameChild = child;
    session.attach(child.pid);
    // The log window was told "not running" while files downloaded; now the game process exists.
    sendToLogs('logs-reset', logsState());
    log.info(`Minecraft läuft (PID ${child.pid})`);
    if (busy) {
      publish({ phase: 'running', message: 'Minecraft läuft. Viel Spaß mit Savira.', progress: 100 });
      if (settings.hideOnLaunch) win?.hide();
    }
  } catch (error) {
    busy = false;
    log.error('Start fehlgeschlagen', error);
    publish({ phase: 'error', message: error instanceof Error ? error.message : 'Anmeldung oder Download fehlgeschlagen. Bitte erneut anmelden und versuchen.', progress: 0 });
    throw new Error(status.message);
  }
}
// scope 'main': only the launcher window; 'logs': launcher or the log window.
function handle(channel, callback, scope = 'main') {
  ipcMain.handle(channel, async (event, ...args) => {
    const allowed = [win, ...(scope === 'logs' ? [logWin] : [])].filter(w => w && !w.isDestroyed()).map(w => w.webContents);
    const sender = allowed.find(contents => contents === event.sender);
    if (!sender || event.senderFrame !== sender.mainFrame) throw new Error('Unzulässiger Aufruf.');
    try { return { ok: true, data: await callback(...args) }; }
    catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Microsoft-Anmeldung fehlgeschlagen oder abgebrochen. Bitte erneut versuchen.' }; }
  });
}
function loadRenderer(query, target = win) {
  if (process.argv.includes('--dev')) return target.loadURL(`http://127.0.0.1:5173/?${new URLSearchParams(query)}`);
  return target.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { query });
}
const windowOptions = { frame: false, backgroundColor: '#0b0d10', icon: path.join(__dirname, '..', 'dist', 'icon.png'), webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } };
function sendToLogs(channel, payload) { if (logWin && !logWin.isDestroyed()) logWin.webContents.send(channel, payload); }
function logsState() {
  const snapshot = session?.snapshot();
  // starting: Minecraft is still being prepared/downloaded; running: the Java process exists.
  return { accent: settings.accent, radius: settings.radius, session: snapshot ? { ...snapshot, running: snapshot.running && Boolean(gameChild), starting: snapshot.running && !gameChild } : null };
}
function openLogWindow() {
  if (logWin && !logWin.isDestroyed()) { if (logWin.isMinimized()) logWin.restore(); logWin.show(); logWin.focus(); return; }
  logWin = new BrowserWindow({ ...windowOptions, width: 1200, height: 780, minWidth: 820, minHeight: 520, title: 'Minecraft Logs' });
  logWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  logWin.webContents.on('will-navigate', event => event.preventDefault());
  logWin.on('closed', () => { logWin = null; });
  loadRenderer({ mode: 'logs' }, logWin);
}
function startSetup(mode) {
  // Uninstall must not keep the install folder busy as working directory.
  if (mode === 'uninstall') process.chdir(require('node:os').tmpdir());
  // Holding the lock during uninstall also stops the launcher from starting mid-removal.
  const launcherRunning = mode === 'uninstall' && !app.requestSingleInstanceLock();
  let installing = false, installed = null;
  app.whenReady().then(async () => {
    win = new BrowserWindow({ width: 920, height: 580, resizable: false, maximizable: false, frame: false, center: true, backgroundColor: '#0b0d10', title: mode === 'setup' ? 'Savira Setup' : 'Savira entfernen', icon: path.join(__dirname, '..', 'dist', 'icon.png'), webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    handle('setup-info', async () => ({ ...(mode === 'setup' ? await setup.info() : { version: app.getVersion(), defaultDir: path.dirname(process.execPath), existing: path.dirname(process.execPath), sizeMb: 0 }), launcherRunning }));
    handle('setup-dir', async current => {
      const result = await dialog.showOpenDialog(win, { title: 'Installationsordner wählen', defaultPath: typeof current === 'string' ? current : undefined, properties: ['openDirectory', 'createDirectory'] });
      return result.canceled ? null : setup.resolveInstallDir(result.filePaths[0]);
    });
    handle('setup-install', async options => {
      if (mode !== 'setup' || installing) throw new Error('Die Installation läuft bereits.');
      installing = true;
      try { installed = await setup.install(options || {}, progress => win?.webContents.send('setup-progress', progress)); return installed; }
      finally { installing = false; }
    });
    handle('setup-uninstall', async options => {
      if (mode !== 'uninstall') throw new Error('Unzulässiger Aufruf.');
      if (launcherRunning) throw new Error('Savira läuft noch. Bitte den Launcher schließen und erneut versuchen.');
      return setup.uninstall({ removeData: Boolean(options?.removeData) });
    });
    handle('setup-launch', async () => { if (!installed) throw new Error('Savira ist noch nicht installiert.'); setup.launchInstalled(installed.exe); app.quit(); });
    handle('window', async action => {
      if (action === 'minimize') win.minimize();
      if (action === 'close') {
        if (installing) {
          const result = await dialog.showMessageBox(win, { type: 'warning', message: 'Die Installation läuft noch. Wirklich abbrechen?', detail: 'Savira ist dann nicht vollständig installiert.', buttons: ['Weiter installieren', 'Abbrechen'], defaultId: 0, cancelId: 0 });
          if (result.response !== 1) return;
        }
        win.close();
      }
    });
    await loadRenderer(mode === 'setup' && process.argv.includes('--update') ? { mode, update: '1' } : { mode });
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => presence?.destroy());
}
const setupMode = setup.detectMode();
if (setupMode === 'setup') app.setPath('userData', path.join(app.getPath('temp'), 'savira-setup'));
if (setupMode) startSetup(setupMode);
else if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { win?.restore(); win?.focus(); });
  app.whenReady().then(async () => {
    log.init(path.join(root(), 'logs'));
    try { settings = validateSettings(JSON.parse(await fs.readFile(path.join(root(), 'settings.json'), 'utf8'))); } catch { /* Use validated defaults. */ }
    win = new BrowserWindow({ ...windowOptions, width: 1380, height: 900, minWidth: 960, minHeight: 700, title: 'Savira' });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.on('closed', () => { if (logWin && !logWin.isDestroyed()) logWin.close(); });
    handle('state', async () => ({ settings, account, accounts, cape: await currentCape(), status, maxMemory, gameDirectory: instance(), version: app.getVersion() }));
    handle('save', async input => {
      if (busy) throw new Error('Einstellungen können nach dem Beenden von Minecraft geändert werden.');
      const next = validateSettings(input);
      await atomicWrite(path.join(root(), 'settings.json'), JSON.stringify(next, null, 2));
      settings = next;
      presence?.setEnabled(settings.discordPresence);
      updatePresence();
      return settings;
    });
    handle('login', async () => {
      if (loggingIn || busy) throw new Error('Ein Vorgang läuft bereits.');
      loggingIn = true;
      try { await authenticate(true); return { account, accounts }; } catch (error) { log.warn('Anmeldung fehlgeschlagen', error); throw error; } finally { loggingIn = false; }
    });
    // Switching only changes the active account; its token is renewed when the game starts.
    handle('account-switch', async uuid => {
      if (busy || loggingIn) throw new Error('Konten können nach dem Beenden von Minecraft gewechselt werden.');
      const entry = await store.setActive(uuid);
      log.info(`Konto gewechselt zu ${entry.name}`);
      return refreshAccounts();
    });
    handle('logout', async uuid => {
      if (busy || loggingIn) throw new Error('Ein Vorgang läuft bereits.');
      const target = uuid === undefined ? store.active()?.uuid : uuid;
      if (target) await store.remove(target);
      return refreshAccounts();
    });
    // Wardrobe: saved skins, adding from file, name, UUID or link, and wearing one.
    handle('skins-list', wardrobeState);
    handle('skins-fetch', resolveSkin);
    handle('skins-save', async input => {
      const { id, name, variant, png } = input || {};
      if (id) await wardrobe.update(id, { name, variant, png }); else await wardrobe.add({ name, variant, png });
      return wardrobeState();
    });
    handle('skins-delete', async id => { await wardrobe.remove(id); return wardrobeState(); });
    handle('skins-apply', applySkin);
    // Capes: own capes (worn in Savira), favourites, the account's vanilla capes and a template.
    handle('capes-list', () => capes.list());
    handle('capes-vanilla', async () => { const result = await vanillaCapes(await minecraftProfile(await capeAccount())); await rememberVanillaCape(account.uuid, result.capes); return result; });
    handle('cape-current', currentCape);
    handle('capes-vanilla-set', setVanillaCape);
    handle('capes-add', async input => { await capes.add({ name: input?.name, png: input?.png, visibility: input?.visibility }); return capes.list(); });
    handle('capes-update', async (id, changes) => { await capes.update(id, { name: changes?.name, visibility: changes?.visibility }); return capes.list(); });
    handle('capes-delete', async id => { await capes.remove(id); return capes.list(); });
    handle('capes-wear', async id => { if (busy) throw new Error('Capes können nach dem Beenden von Minecraft gewechselt werden.'); await capes.setActive(id ?? null); return capes.list(); });
    handle('capes-favorite', async key => { await capes.toggleFavorite(key); return capes.list(); });
    handle('capes-template', async (kind, png) => {
      const match = typeof png === 'string' && /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(png);
      const bytes = match ? Buffer.from(match[1], 'base64') : null;
      if (!bytes || !validSkinPng(bytes)) throw new Error('Die Vorlage konnte nicht erstellt werden.');
      const result = await dialog.showSaveDialog(win, { title: 'Cape-Vorlage speichern', defaultPath: path.join(app.getPath('downloads'), kind === 'hd' ? 'savira-cape-vorlage-hd.png' : 'savira-cape-vorlage.png'), filters: [{ name: 'PNG-Bild', extensions: ['png'] }] });
      if (result.canceled || !result.filePath) return null;
      await fs.writeFile(result.filePath, bytes);
      return result.filePath;
    });
    handle('presence-page', next => { if (Object.hasOwn(pageLabels, next)) { page = next; updatePresence(); } });
    handle('launch', launch);
    handle('panorama', panorama);
    handle('folder', async () => { await fs.mkdir(instance(), { recursive: true }); const error = await shell.openPath(instance()); if (error) throw new Error(error); });
    handle('java', async () => {
      const result = await dialog.showOpenDialog(win, { title: 'Java 21 auswählen', properties: ['openFile'], filters: [{ name: 'Java', extensions: ['exe'] }] });
      return result.canceled ? null : result.filePaths[0];
    });
    handle('window', async action => {
      if (action === 'minimize') win.minimize();
      if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
      if (action === 'close') {
        if (busy) {
          const result = await dialog.showMessageBox(win, { type: 'question', message: 'Minecraft läuft oder wird vorbereitet. Launcher trotzdem schließen?', detail: 'Der laufende Spielprozess wird nicht automatisch beendet.', buttons: ['Zurück', 'Launcher schließen'], defaultId: 0, cancelId: 0 });
          if (result.response !== 1) return;
        }
        win.close();
      }
    });

    // Log window: live game output, process stats, stop button.
    handle('logs-open', () => { openLogWindow(); });
    handle('logs-state', logsState, 'logs');
    handle('logs-clear', () => { session?.clear(); }, 'logs');
    handle('logs-stop', () => {
      if (!gameChild) throw new Error('Minecraft läuft nicht.');
      log.warn('Minecraft über das Log-Fenster gestoppt');
      // "java" may be Oracle's javapath stub with the real JVM as a child: end the whole tree,
      // otherwise only the stub dies and the game keeps running.
      if (process.platform === 'win32') execFile('taskkill', ['/pid', String(gameChild.pid), '/t', '/f'], { windowsHide: true }, () => {});
      else gameChild.kill();
    }, 'logs');
    handle('logs-folder', async () => {
      const dir = session ? path.join(root(), 'instances', session.snapshot().profile.id) : instance();
      await fs.mkdir(dir, { recursive: true });
      const error = await shell.openPath(dir); if (error) throw new Error(error);
    }, 'logs');
    handle('logs-window', action => {
      if (!logWin || logWin.isDestroyed()) return;
      if (action === 'minimize') logWin.minimize();
      if (action === 'maximize') logWin.isMaximized() ? logWin.unmaximize() : logWin.maximize();
      if (action === 'close') logWin.close();
    }, 'logs');

    // Debug tab: launcher logs, Minecraft logs and crash reports.
    handle('debug-list', kind => logfiles.list(root(), kind));
    handle('debug-read', file => logfiles.read(root(), file));
    handle('debug-open', async file => { const error = await shell.openPath(await logfiles.assertAllowed(root(), file)); if (error) throw new Error(error); });
    handle('debug-reveal', async file => { shell.showItemInFolder(await logfiles.assertAllowed(root(), file)); });
    handle('debug-folder', async () => { const dir = log.logDir(); await fs.mkdir(dir, { recursive: true }); const error = await shell.openPath(dir); if (error) throw new Error(error); });

    const updates = createUpdater({
      app, currentVersion: app.getVersion(), feed: updateFeed, publicKey: updatePublicKey,
      // Loopback http is only for the package test, which always sets its own feed.
      allowLoopback: Boolean(process.env.SAVIRA_UPDATE_FEED),
      isInstalled: () => existsSync(path.join(path.dirname(process.execPath), setup.MARKER)),
      isBusy: () => busy || loggingIn,
      onStatus: next => { if (win && !win.isDestroyed()) win.webContents.send('update-status', next); }
    });
    handle('update-state', () => updates.status());
    handle('update-check', () => updates.check());
    handle('update-download', () => updates.download());
    handle('update-cancel', () => updates.cancel());
    handle('update-install', () => updates.install());
    // Panoramas of earlier updates for the in-game menu, fetched once in the background.
    panoramas = createPanoramaStore({ dir: path.join(root(), 'panoramas'), fetchJson: json, fetchBytes: url => download(url, 6_000_000), log: message => log.info(message) });
    setTimeout(() => panoramas.ensure().then(list => log.info(`Menü-Panoramen bereit: ${list.length}`)).catch(error => log.warn('Menü-Panoramen nicht geladen', error)), 8000);
    capes = createCapeLibrary({ dir: path.join(root(), 'capes') });
    await capes.load();
    wardrobe = createSkinLibrary({ dir: path.join(root(), 'wardrobe') });
    await wardrobe.load();
    store = createAccountStore({ dir: root(), encrypt: text => safeStorage.encryptString(text), decrypt: bytes => safeStorage.decryptString(bytes) });
    presence = createPresence({ clientId: discordClientId, log: message => log.info(message) });
    presence.setEnabled(settings.discordPresence);
    updatePresence();
    try {
      if (safeStorage.isEncryptionAvailable()) {
        await store.load();
        if (existsSync(legacyTokenPath())) {
          await authenticate(false, safeStorage.decryptString(await fs.readFile(legacyTokenPath())));
          await Promise.all([fs.rm(legacyTokenPath(), { force: true }), fs.rm(legacySkinPath(), { force: true })]);
        // The desktop smoke test seeds fake accounts; their tokens must not be sent to Microsoft.
        } else if (store.active() && !process.argv.includes('--smoke-test')) await authenticate(false);
      }
    } catch (error) { log.warn('Gespeicherte Anmeldung ungültig', error); }
    // Saved accounts stay listed even if renewing the token failed (e.g. offline).
    if (store.list().length) await refreshAccounts().catch(() => {});
    await loadRenderer({});
    // Read the setting when the timer fires, so switching it on later takes effect without a restart.
    const autoCheck = () => { if (settings.autoUpdate) updates.check({ quiet: true }); };
    setTimeout(autoCheck, 4000);
    setInterval(autoCheck, 6 * 60 * 60 * 1000);
  });
  app.on('window-all-closed', () => app.quit());
}
