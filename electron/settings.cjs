const os = require('node:os');
const maxMemory = Math.max(2, Math.min(32, Math.floor(os.totalmem() / 1073741824) - 2));
// Loaders a profile can start with. The Savira mod is a Fabric mod and exists for these Minecraft versions.
const loaders = ['vanilla', 'fabric', 'forge', 'neoforge', 'quilt'];
const saviraVersions = ['1.21.1'];
const FABRIC_LOADER = '0.16.14';
const saviraAvailable = (version, loader) => loader === 'fabric' && saviraVersions.includes(version);
const defaultProfiles = [
  { id: 'savira-1-21-1', name: 'Savira 1.21.1', version: '1.21.1', loader: 'fabric', loaderVersion: FABRIC_LOADER, savira: true, memory: null, group: '', icon: null, lastPlayed: null, playTime: 0, pack: null },
  { id: 'vanilla-1-21-1', name: 'Vanilla 1.21.1', version: '1.21.1', loader: 'vanilla', loaderVersion: null, savira: false, memory: null, group: '', icon: null, lastPlayed: null, playTime: 0, pack: null }
];
// Accent values are handed to the Fabric mod; only its main menu (title screen) uses them.
// Besides these presets a custom "#rrggbb" value is allowed.
const accents = {
  mint: 0x5ccf95, emerald: 0x22b07d, teal: 0x2ec4b6, cyan: 0x22b8e6, blue: 0x4f8dff, indigo: 0x6c6cf0, violet: 0x8f72f2,
  pink: 0xe36bb5, rose: 0xe5566b, red: 0xe5484d, orange: 0xf07f2d, amber: 0xe8a33d, slate: 0x8b9dc3
};
const isCustomAccent = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const accentRgb = value => isCustomAccent(value) ? parseInt(value.slice(1), 16) : accents[value] ?? accents.mint;
const backgrounds = ['panorama', 'particles', 'plain', 'grid', 'aurora', 'stars', 'glyphs', 'waves', 'blocks', 'snow', 'rain', 'fireflies', 'hexgrid', 'network', 'embers'];
const defaults = {
  memory: Math.min(4, maxMemory), javaPath: 'java', selectedProfileId: defaultProfiles[0].id, profiles: defaultProfiles.map(profile => ({ ...profile, memory: Math.min(4, maxMemory) * 1024 })), fullscreen: false,
  accent: 'mint', background: 'panorama', autoUpdate: true, animations: true, hideOnLaunch: false, logsOnLaunch: false, discordPresence: true, radius: 12, emotes: true,
  hud: { fps: true, cps: true, keystrokes: true, coordinates: false, ping: true, armor: true, potions: true, sprint: true, zoom: false, ram: true, scale: 1 }
};
const ICON = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
/** memory: the launcher-wide RAM in MB, used by profiles that have none of their own. */
function validateProfile(profile, memory = defaults.memory * 1024) {
  if (!profile || typeof profile !== 'object') throw new Error('Ungültiges Spielprofil.');
  if (typeof profile.id !== 'string' || !/^[a-z0-9][a-z0-9-]{2,47}$/.test(profile.id)) throw new Error('Ungültige Profil-ID.');
  if (typeof profile.name !== 'string' || !profile.name.trim() || profile.name.trim().length > 40 || /[\x00-\x1f]/.test(profile.name)) throw new Error('Ungültiger Profilname.');
  // Minecraft ids: releases (1.21.1, 26.3), snapshots (25w14a) and pre-releases (1.21-pre1, "1.14 Pre-Release 1").
  if (typeof profile.version !== 'string' || !/^[\w.+-](?:[\w.+ -]{0,38}[\w.+-])?$/.test(profile.version) || profile.version.includes('..')) throw new Error('Ungültige Minecraft-Version.');
  // Profiles before 0.2.4 knew only "savira" (Fabric with the Savira mod) and "vanilla".
  const legacy = profile.loader === 'savira';
  const loader = legacy ? 'fabric' : profile.loader;
  if (!loaders.includes(loader)) throw new Error('Unbekannter Profil-Loader.');
  let loaderVersion = null;
  if (loader !== 'vanilla') {
    loaderVersion = profile.loaderVersion ?? (loader === 'fabric' ? FABRIC_LOADER : null);
    if (typeof loaderVersion !== 'string' || !/^[\w.+-]{1,64}$/.test(loaderVersion)) throw new Error('Ungültige Loader-Version.');
  }
  const savira = legacy || profile.savira === true;
  if (profile.savira !== undefined && typeof profile.savira !== 'boolean') throw new Error('Ungültige Savira-Einstellung.');
  if (savira && !saviraAvailable(profile.version, loader)) throw new Error(`Der Savira-Mod gibt es aktuell nur für Fabric ${saviraVersions.join(', ')}.`);
  const ram = profile.memory ?? null;
  if (ram !== null && (!Number.isInteger(ram) || ram < 1024 || ram > maxMemory * 1024)) throw new Error(`Der Arbeitsspeicher eines Profils muss zwischen 1024 und ${maxMemory * 1024} MB liegen.`);
  const group = profile.group ?? '';
  if (typeof group !== 'string' || group.trim().length > 24 || /[\x00-\x1f]/.test(group)) throw new Error('Ungültige Gruppe.');
  const icon = profile.icon ?? null;
  if (icon !== null && (typeof icon !== 'string' || icon.length > 300000 || !ICON.test(icon))) throw new Error('Ungültiges Profil-Icon.');
  const lastPlayed = profile.lastPlayed ?? null;
  if (lastPlayed !== null && (!Number.isInteger(lastPlayed) || lastPlayed < 0)) throw new Error('Ungültige Spielzeit.');
  const playTime = profile.playTime ?? 0;
  if (!Number.isInteger(playTime) || playTime < 0) throw new Error('Ungültige Spielzeit.');
  // The Modrinth pack an imported profile came from, for switching its version.
  let pack = profile.pack ?? null;
  if (pack !== null) {
    const id = /^[A-Za-z0-9]{8}$/;
    if (typeof pack !== 'object' || !id.test(pack.projectId) || !id.test(pack.versionId) || typeof pack.versionNumber !== 'string' || pack.versionNumber.length > 64 || typeof pack.title !== 'string' || pack.title.length > 60) throw new Error('Ungültige Modpack-Angabe.');
    pack = { projectId: pack.projectId, versionId: pack.versionId, versionNumber: pack.versionNumber, title: pack.title };
  }
  return { id: profile.id, name: profile.name.trim(), version: profile.version, loader, loaderVersion, savira, memory: ram ?? memory, group: group.trim(), icon, lastPlayed, playTime, pack };
}
function validateSettings(input) {
  if (!input || typeof input !== 'object') throw new Error('Ungültige Einstellungen.');
  if (!Number.isInteger(input.memory) || input.memory < 2 || input.memory > maxMemory) throw new Error(`Arbeitsspeicher muss zwischen 2 und ${maxMemory} GB liegen.`);
  if (typeof input.javaPath !== 'string' || !input.javaPath.trim() || input.javaPath.length > 1024) throw new Error('Bitte einen gültigen Java-Pfad angeben.');
  let profiles, selectedProfileId;
  if (Array.isArray(input.profiles)) {
    if (!input.profiles.length || input.profiles.length > 30) throw new Error('Es müssen zwischen 1 und 30 Profile vorhanden sein.');
    profiles = input.profiles.map(profile => validateProfile(profile, input.memory * 1024));
    if (new Set(profiles.map(profile => profile.id)).size !== profiles.length) throw new Error('Profil-IDs müssen eindeutig sein.');
    selectedProfileId = input.selectedProfileId;
  } else {
    if (!['savira', 'vanilla'].includes(input.profile)) throw new Error('Unbekanntes Spielprofil.');
    profiles = defaultProfiles.map(profile => validateProfile(profile, input.memory * 1024));
    selectedProfileId = input.profile === 'vanilla' ? 'vanilla-1-21-1' : 'savira-1-21-1';
  }
  if (typeof selectedProfileId !== 'string' || !profiles.some(profile => profile.id === selectedProfileId)) throw new Error('Das ausgewählte Spielprofil existiert nicht.');
  if (typeof input.fullscreen !== 'boolean') throw new Error('Ungültiger Fenstermodus.');
  // Settings saved before 0.2 have no appearance fields; fall back instead of rejecting them.
  const accent = input.accent ?? defaults.accent, background = input.background ?? defaults.background;
  if (typeof accent !== 'string' || !(Object.hasOwn(accents, accent) || isCustomAccent(accent))) throw new Error('Unbekannte Akzentfarbe.');
  if (!backgrounds.includes(background)) throw new Error('Unbekannter Hintergrund.');
  const flags = {};
  for (const key of ['autoUpdate', 'animations', 'hideOnLaunch', 'logsOnLaunch', 'discordPresence', 'emotes']) {
    flags[key] = input[key] ?? defaults[key];
    if (typeof flags[key] !== 'boolean') throw new Error(`Ungültige Einstellung: ${key}`);
  }
  // Corner radius of the launcher UI in pixels; the Minecraft mod has its own per-module setting.
  const radius = input.radius ?? defaults.radius;
  if (!Number.isInteger(radius) || radius < 0 || radius > 20) throw new Error('Der Eckenradius muss zwischen 0 und 20 px liegen.');
  const hud = {};
  for (const key of ['fps', 'cps', 'keystrokes', 'coordinates', 'ping', 'armor', 'potions', 'sprint', 'zoom', 'ram']) {
    if (typeof input.hud?.[key] !== 'boolean') throw new Error(`Ungültige HUD-Einstellung: ${key}`);
    hud[key] = input.hud[key];
  }
  if (![0.75, 1, 1.25, 1.5].includes(input.hud.scale)) throw new Error('Ungültige HUD-Größe.');
  hud.scale = input.hud.scale;
  return { memory: input.memory, javaPath: input.javaPath.trim(), selectedProfileId, profiles, fullscreen: input.fullscreen, accent: isCustomAccent(accent) ? accent.toLowerCase() : accent, background, ...flags, radius, hud };
}
const HUD_KEYS = ['fps', 'cps', 'keystrokes', 'coordinates', 'ping', 'armor', 'potions', 'sprint', 'zoom', 'ram'];
/** Settings with the module switches from the game's savira.json, or null when nothing changed. */
function mergeHudFromGame(current, inGame) {
  if (!inGame || typeof inGame !== 'object') return null;
  const hud = { ...current.hud };
  let changed = false;
  for (const key of HUD_KEYS) if (typeof inGame[key] === 'boolean' && inGame[key] !== hud[key]) { hud[key] = inGame[key]; changed = true; }
  return changed ? validateSettings({ ...current, hud }) : null;
}
module.exports = { mergeHudFromGame, loaders, saviraVersions, saviraAvailable, FABRIC_LOADER, backgrounds, accents, accentRgb, defaults, maxMemory, validateSettings, validateProfile };
