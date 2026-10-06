const os = require('node:os');
const maxMemory = Math.max(2, Math.min(32, Math.floor(os.totalmem() / 1073741824) - 2));
const defaultProfiles = [
  { id: 'savira-1-21-1', name: 'Savira 1.21.1', version: '1.21.1', loader: 'savira' },
  { id: 'vanilla-1-21-1', name: 'Vanilla 1.21.1', version: '1.21.1', loader: 'vanilla' }
];
// Accent values are shared with the Fabric mod so launcher and in-game menu use the same color.
const accents = { mint: 0x5ccf95, blue: 0x4f8dff, rose: 0xe5566b, amber: 0xe8a33d, violet: 0x8f72f2 };
const backgrounds = ['panorama', 'particles', 'plain', 'grid', 'aurora', 'stars', 'glyphs', 'waves', 'blocks'];
const defaults = {
  memory: Math.min(4, maxMemory), javaPath: 'java', selectedProfileId: defaultProfiles[0].id, profiles: defaultProfiles, fullscreen: false,
  accent: 'mint', background: 'panorama', autoUpdate: true,
  hud: { fps: true, cps: true, keystrokes: true, coordinates: false, ping: true, armor: true, potions: true, sprint: true, zoom: false, ram: true, scale: 1 }
};
function validateProfile(profile) {
  if (!profile || typeof profile !== 'object') throw new Error('Ungültiges Spielprofil.');
  if (typeof profile.id !== 'string' || !/^[a-z0-9][a-z0-9-]{2,47}$/.test(profile.id)) throw new Error('Ungültige Profil-ID.');
  if (typeof profile.name !== 'string' || !profile.name.trim() || profile.name.trim().length > 40 || /[\x00-\x1f]/.test(profile.name)) throw new Error('Ungültiger Profilname.');
  if (typeof profile.version !== 'string' || !/^\d+\.\d+(?:\.\d+)?$/.test(profile.version) || profile.version.length > 16) throw new Error('Ungültige Minecraft-Version.');
  if (!['savira', 'vanilla'].includes(profile.loader)) throw new Error('Unbekannter Profil-Loader.');
  if (profile.loader === 'savira' && profile.version !== '1.21.1') throw new Error('Der Savira-Mod unterstützt aktuell nur Minecraft 1.21.1.');
  return { id: profile.id, name: profile.name.trim(), version: profile.version, loader: profile.loader };
}
function validateSettings(input) {
  if (!input || typeof input !== 'object') throw new Error('Ungültige Einstellungen.');
  if (!Number.isInteger(input.memory) || input.memory < 2 || input.memory > maxMemory) throw new Error(`Arbeitsspeicher muss zwischen 2 und ${maxMemory} GB liegen.`);
  if (typeof input.javaPath !== 'string' || !input.javaPath.trim() || input.javaPath.length > 1024) throw new Error('Bitte einen gültigen Java-Pfad angeben.');
  let profiles, selectedProfileId;
  if (Array.isArray(input.profiles)) {
    if (!input.profiles.length || input.profiles.length > 30) throw new Error('Es müssen zwischen 1 und 30 Profile vorhanden sein.');
    profiles = input.profiles.map(validateProfile);
    if (new Set(profiles.map(profile => profile.id)).size !== profiles.length) throw new Error('Profil-IDs müssen eindeutig sein.');
    selectedProfileId = input.selectedProfileId;
  } else {
    if (!['savira', 'vanilla'].includes(input.profile)) throw new Error('Unbekanntes Spielprofil.');
    profiles = structuredClone(defaultProfiles);
    selectedProfileId = input.profile === 'vanilla' ? 'vanilla-1-21-1' : 'savira-1-21-1';
  }
  if (typeof selectedProfileId !== 'string' || !profiles.some(profile => profile.id === selectedProfileId)) throw new Error('Das ausgewählte Spielprofil existiert nicht.');
  if (typeof input.fullscreen !== 'boolean') throw new Error('Ungültiger Fenstermodus.');
  // Settings saved before 0.2 have no appearance fields; fall back instead of rejecting them.
  const accent = input.accent ?? defaults.accent, background = input.background ?? defaults.background;
  if (typeof accent !== 'string' || !Object.hasOwn(accents, accent)) throw new Error('Unbekannte Akzentfarbe.');
  if (!backgrounds.includes(background)) throw new Error('Unbekannter Hintergrund.');
  const autoUpdate = input.autoUpdate ?? defaults.autoUpdate;
  if (typeof autoUpdate !== 'boolean') throw new Error('Ungültige Update-Einstellung.');
  const hud = {};
  for (const key of ['fps', 'cps', 'keystrokes', 'coordinates', 'ping', 'armor', 'potions', 'sprint', 'zoom', 'ram']) {
    if (typeof input.hud?.[key] !== 'boolean') throw new Error(`Ungültige HUD-Einstellung: ${key}`);
    hud[key] = input.hud[key];
  }
  if (![0.75, 1, 1.25, 1.5].includes(input.hud.scale)) throw new Error('Ungültige HUD-Größe.');
  hud.scale = input.hud.scale;
  return { memory: input.memory, javaPath: input.javaPath.trim(), selectedProfileId, profiles, fullscreen: input.fullscreen, accent, background, autoUpdate, hud };
}
module.exports = { accents, defaults, maxMemory, validateSettings, validateProfile };
