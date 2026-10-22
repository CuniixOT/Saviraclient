export type Hud = { fps: boolean; cps: boolean; keystrokes: boolean; coordinates: boolean; ping: boolean; armor: boolean; potions: boolean; sprint: boolean; zoom: boolean; ram: boolean; scale: number };
export type Loader = 'vanilla' | 'fabric' | 'forge' | 'neoforge' | 'quilt';
/** memory in MB; icon a data URL; savira: the Savira mod (Fabric, saviraVersions only). */
export type GameProfile = { id: string; name: string; version: string; loader: Loader; loaderVersion: string | null; savira: boolean; memory: number; group: string; icon: string | null; lastPlayed: number | null; playTime: number; pack: PackOrigin | null };
export type PackOrigin = { projectId: string; versionId: string; versionNumber: string; title: string };
/** Minecraft versions with the Savira mod; keep in line with electron/settings.cjs. */
export const saviraVersions = ['1.21.1'];
export const saviraAvailable = (version: string, loader: Loader) => loader === 'fabric' && saviraVersions.includes(version);
export type MinecraftVersion = { id: string; type: 'release' | 'snapshot'; released: string };
export type LoaderVersion = { version: string; stable: boolean };
export type BlockIcon = { id: string; png: string };
export interface ProfilesBridge {
  minecraftVersions(): Promise<Result<MinecraftVersion[]>>;
  loaderVersions(loader: Exclude<Loader, 'vanilla'>, minecraft: string): Promise<Result<LoaderVersion[]>>;
  /** Asks for a .mrpack/.zip; null when cancelled, otherwise the settings with the new profile. */
  importPack(): Promise<Result<Settings | null>>;
  openFolder(id: string): Promise<Result<void>>;
  blockIcons(): Promise<Result<BlockIcon[]>>;
  iconFromFile(): Promise<Result<string | null>>;
  iconFromUrl(url: string): Promise<Result<string>>;
  content(id: string, kind: ContentKind): Promise<Result<ContentItem[]>>;
  toggle(id: string, kind: ContentKind, file: string, enabled: boolean): Promise<Result<void>>;
  remove(id: string, kind: ContentKind, file: string): Promise<Result<void>>;
  update(id: string, kind: ContentKind, file: string): Promise<Result<string>>;
  install(id: string, kind: ContentKind, projectId: string, versionId?: string): Promise<Result<string[]>>;
  project(projectId: string): Promise<Result<ProjectInfo>>;
  versions(projectId: string): Promise<Result<ProjectVersion[]>>;
  where(projectId: string, kind: ContentKind): Promise<Result<{ id: string; installed: boolean; compatible: boolean }[]>>;
  /** A Modrinth modpack as a new profile; returns the settings with it. */
  installPack(projectId: string, versionId?: string): Promise<Result<Settings>>;
  openLink(url: string): Promise<Result<void>>;
  folder(id: string, kind: ContentKind | 'worlds' | 'screenshots' | 'logs'): Promise<Result<void>>;
  addFiles(id: string, kind: ContentKind): Promise<Result<number>>;
  search(options: SearchOptions): Promise<Result<SearchResult>>;
  tags(kind: BrowseKind): Promise<Result<BrowseTags>>;
  openProject(type: string, slug: string): Promise<Result<void>>;
  worlds(id: string): Promise<Result<{ worlds: World[]; servers: Server[] }>>;
  play(id: string, target?: { world: string } | { server: string }): Promise<Result<void>>;
  screenshots(id: string): Promise<Result<Screenshot[]>>;
  openScreenshot(id: string, file: string, reveal?: boolean): Promise<Result<void>>;
  deleteScreenshot(id: string, file: string): Promise<Result<void>>;
  stats(id: string): Promise<Result<{ size: number }>>;
  duplicate(id: string, name: string): Promise<Result<Settings>>;
  exportEntries(id: string): Promise<Result<ExportEntry[]>>;
  exportPack(id: string, options: { name: string; include: string[]; reveal: boolean }): Promise<Result<{ file: string; downloads: number; overrides: number } | null>>;
  packVersions(id: string): Promise<Result<PackVersion[]>>;
  switchPack(id: string, versionId: string): Promise<Result<Settings>>;
}
export type ContentKind = 'mods' | 'resourcepacks' | 'shaderpacks' | 'datapacks';
/** What the Mods page can browse: profile contents plus whole modpacks. */
export type BrowseKind = ContentKind | 'modpacks';
export type ProjectInfo = { id: string; slug: string; type: string; kind: BrowseKind | null; title: string; description: string; body: string; icon: string | null; downloads: number; followers: number; categories: string[]; gameVersions: string[]; loaders: string[]; client: string; server: string; license: string | null; published: string; updated: string; links: { label: string; url: string }[]; gallery: { url: string; title: string }[]; team: { name: string; role: string; avatar: string | null }[] };
export type ProjectVersion = { id: string; name: string; number: string; type: 'release' | 'beta' | 'alpha'; gameVersions: string[]; loaders: string[]; date: string; downloads: number };
export type ContentItem = { file: string; name: string; version: string | null; description: string | null; icon: string | null; size: number; enabled: boolean; folder: boolean; managed: boolean; modrinth: { projectId: string; slug: string; type: string; title: string } | null; update: { versionId: string; versionNumber: string } | null };
export type SearchOptions = { kind: BrowseKind; query?: string; versions?: string[]; categories?: string[]; loaders?: string[]; environment?: 'client' | 'server' | null; sort?: 'relevance' | 'downloads' | 'follows' | 'newest' | 'updated'; offset?: number };
export type SearchHit = { id: string; slug: string; title: string; author: string; description: string; icon: string | null; downloads: number; categories: string[]; type: string };
export type SearchResult = { total: number; hits: SearchHit[] };
export type BrowseTags = { categories: string[]; versions: { id: string; type: 'release' | 'snapshot' }[]; loaders: string[] };
export type World = { folder: string; name: string; mode: string | null; version: string | null; lastPlayed: number; icon: string | null };
export type Server = { name: string; address: string; icon: string | null };
export type Screenshot = { file: string; time: number; thumbnail: string | null };
export type ExportEntry = { name: string; folder: boolean; modified: number; selected: boolean };
export type PackVersion = { id: string; number: string; name: string; date: string; downloads: number; gameVersions: string[]; loaders: string[]; changelog: string };
export type AccentPreset = 'mint' | 'emerald' | 'teal' | 'cyan' | 'blue' | 'indigo' | 'violet' | 'pink' | 'rose' | 'red' | 'orange' | 'amber' | 'slate';
/** A preset name or a custom "#rrggbb" colour. */
export type Accent = AccentPreset | `#${string}`;
export type BackgroundMode = 'panorama' | 'particles' | 'plain' | 'grid' | 'aurora' | 'stars' | 'glyphs' | 'waves' | 'blocks' | 'snow' | 'rain' | 'fireflies' | 'hexgrid' | 'network' | 'embers';
export type Settings = { memory: number; javaPath: string; selectedProfileId: string; profiles: GameProfile[]; fullscreen: boolean; accent: Accent; background: BackgroundMode; autoUpdate: boolean; animations: boolean; hideOnLaunch: boolean; logsOnLaunch: boolean; discordPresence: boolean; radius: number; emotes: boolean; hud: Hud };
export type Account = { name: string; uuid: string; skin: string | null };
export type Status = { phase: 'idle' | 'preparing' | 'installing' | 'running' | 'error'; message: string; progress: number };
export type Accounts = { account: Account | null; accounts: Account[] };
export type State = { settings: Settings; account: Account | null; accounts: Account[]; cape?: string | null; status: Status; maxMemory: number; gameDirectory: string; version: string };
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
interface Bridge {
  state(): Promise<Result<State>>;
  save(settings: Settings): Promise<Result<Settings>>;
  login(): Promise<Result<Accounts>>;
  /** Removes the given account (default: the active one). */
  logout(uuid?: string): Promise<Result<Accounts>>;
  switchAccount(uuid: string): Promise<Result<Accounts>>;
  presence(page: string): Promise<Result<void>>;
  launch(): Promise<Result<void>>;
  panorama(): Promise<Result<string[] | null>>;
  openFolder(): Promise<Result<void>>;
  selectJava(): Promise<Result<string | null>>;
  window(action: 'minimize' | 'maximize' | 'close'): Promise<Result<void>>;
  onStatus(callback: (status: Status) => void): () => void;
  /** Settings changed by the launcher itself, e.g. module switches taken over from the game. */
  onSettings?(callback: (settings: Settings) => void): () => void;
  setup?: SetupBridge;
  update?: UpdateBridge;
  logs?: LogsBridge;
  skins?: SkinsBridge;
  capes?: CapesBridge;
  profiles?: ProfilesBridge;
  debug?: DebugBridge;
}
export type SkinVariant = 'classic' | 'slim';
export type LibrarySkin = { id: string; name: string; variant: SkinVariant; added: number; png: string };
export type Wardrobe = { skins: LibrarySkin[]; applied: string | null };
/** A skin found by name, UUID or link; variant null means "detect from the texture". */
export type FetchedSkin = { name: string; variant: SkinVariant | null; png: string };
interface SkinsBridge {
  list(): Promise<Result<Wardrobe>>;
  fetch(query: string): Promise<Result<FetchedSkin>>;
  save(skin: { id?: string; name: string; variant: SkinVariant; png?: string }): Promise<Result<Wardrobe>>;
  remove(id: string): Promise<Result<Wardrobe>>;
  apply(id: string): Promise<Result<Accounts & { applied: string }>>;
}
export type CapeVisibility = 'private' | 'public';
export type OwnCape = { id: string; name: string; added: number; png: string; visibility: CapeVisibility };
export type CapeLibrary = { capes: OwnCape[]; favorites: string[]; active: string | null };
export type VanillaCape = { id: string; name: string; png: string | null; active: boolean };
export type VanillaCapes = { capes: VanillaCape[]; active: string | null };
interface CapesBridge {
  list(): Promise<Result<CapeLibrary>>;
  /** The cape the start page figure wears: own Savira cape, else the active vanilla cape. */
  current(): Promise<Result<string | null>>;
  vanilla(): Promise<Result<VanillaCapes>>;
  setVanilla(capeId: string | null): Promise<Result<{ vanilla: VanillaCapes; library: CapeLibrary }>>;
  add(cape: { name: string; png: string; visibility: CapeVisibility }): Promise<Result<CapeLibrary>>;
  update(id: string, changes: { name?: string; visibility?: CapeVisibility }): Promise<Result<CapeLibrary>>;
  remove(id: string): Promise<Result<CapeLibrary>>;
  wear(id: string | null): Promise<Result<CapeLibrary>>;
  favorite(key: string): Promise<Result<CapeLibrary>>;
  template(kind: 'pixel' | 'hd', png: string): Promise<Result<string | null>>;
}
export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE';
export type LogLine = { id: number; time: number; level: LogLevel; text: string };
export type GameStats = { memory: number; cpu: number };
export type GameSession = { lines: LogLine[]; profile: { id: string; name: string; version: string; loader: string; memory: number }; account: string; startedAt: number; stats: GameStats; running: boolean; starting: boolean };
export type LogsState = { accent: Accent; radius?: number; session: GameSession | null };
type LogsEvent = 'lines' | 'stats' | 'reset' | 'ended';
interface LogsBridge {
  open(): Promise<Result<void>>;
  state(): Promise<Result<LogsState>>;
  clear(): Promise<Result<void>>;
  stop(): Promise<Result<void>>;
  folder(): Promise<Result<void>>;
  window(action: 'minimize' | 'maximize' | 'close'): Promise<Result<void>>;
  on(callback: (event: LogsEvent, payload: unknown) => void): () => void;
}
export type LogFileKind = 'launcher' | 'minecraft' | 'crash';
export type LogFile = { name: string; path: string; size: number; modified: number; instance: string | null };
interface DebugBridge {
  list(kind: LogFileKind): Promise<Result<LogFile[]>>;
  read(file: string): Promise<Result<string>>;
  open(file: string): Promise<Result<void>>;
  reveal(file: string): Promise<Result<void>>;
  folder(): Promise<Result<void>>;
}
export type UpdateStatus = { state: 'idle' | 'disabled' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'installing' | 'error'; version: string | null; notes: string[]; date: string | null; size: number; progress: number; error: string; checkedAt: string | null };
interface UpdateBridge {
  state(): Promise<Result<UpdateStatus>>;
  check(): Promise<Result<UpdateStatus>>;
  download(): Promise<Result<UpdateStatus>>;
  cancel(): Promise<Result<void>>;
  install(): Promise<Result<UpdateStatus>>;
  onStatus(callback: (status: UpdateStatus) => void): () => void;
}
declare global { interface Window { savira?: Bridge } }
export const isDesktop = Boolean(window.savira);
export const defaultSettings: Settings = { memory: 4, javaPath: 'java', selectedProfileId: 'savira-1-21-1', profiles: [{ id: 'savira-1-21-1', name: 'Savira 1.21.1', version: '1.21.1', loader: 'fabric', loaderVersion: '0.16.14', savira: true, memory: 4096, group: '', icon: null, lastPlayed: null, playTime: 0, pack: null }, { id: 'vanilla-1-21-1', name: 'Vanilla 1.21.1', version: '1.21.1', loader: 'vanilla', loaderVersion: null, savira: false, memory: 4096, group: '', icon: null, lastPlayed: null, playTime: 0, pack: null }], fullscreen: false, accent: 'mint', background: 'panorama', autoUpdate: true, animations: true, hideOnLaunch: false, logsOnLaunch: false, discordPresence: true, radius: 12, emotes: true, hud: { fps: true, cps: true, keystrokes: true, coordinates: false, ping: true, armor: true, potions: true, sprint: true, zoom: false, ram: true, scale: 1 } };
const unavailable = async <T,>(): Promise<Result<T>> => ({ ok: false, error: 'Diese Funktion ist im Desktop-Launcher verfügbar. Starte Savira mit „npm run dev“.' });
export const api: Bridge = window.savira ?? {
  state: async () => {
    let settings = defaultSettings;
    try { settings = { ...defaultSettings, ...JSON.parse(localStorage.getItem('savira-preview') || 'null') }; } catch { /* Default preview. */ }
    return { ok: true, data: { settings, account: null, accounts: [], status: { phase: 'idle', message: 'Browser-Vorschau · Desktop-App zum Spielen starten.', progress: 0 }, maxMemory: 16, gameDirectory: 'Im Desktop-Launcher verfügbar', version: '0.1.0' } };
  },
  save: async settings => { try { localStorage.setItem('savira-preview', JSON.stringify(settings)); } catch { /* Preview only. */ } return { ok: true, data: settings }; },
  panorama: async () => ({ ok: true, data: null }),
  login: unavailable, logout: unavailable, switchAccount: unavailable, presence: async () => ({ ok: true, data: undefined }), launch: unavailable, openFolder: unavailable, selectJava: unavailable, window: unavailable,
  onStatus: () => () => {}
};
export async function unwrap<T>(promise: Promise<Result<T>>): Promise<T> {
  const result = await promise;
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

export type SetupInfo = { version: string; defaultDir: string; existing: string | null; shortcuts?: { desktop: boolean; startMenu: boolean }; sizeMb: number; launcherRunning: boolean };
export type SetupProgress = { step: 'prepare' | 'copy' | 'shortcuts' | 'register' | 'done'; progress: number; file: string };
type InstallOptions = { target: string; desktop: boolean; startMenu: boolean };
export interface SetupBridge {
  info(): Promise<Result<SetupInfo>>;
  chooseDir(current: string): Promise<Result<string | null>>;
  install(options: InstallOptions): Promise<Result<{ dir: string; exe: string }>>;
  uninstall(options: { removeData: boolean }): Promise<Result<{ dir: string }>>;
  launch(): Promise<Result<void>>;
  onProgress(callback: (progress: SetupProgress) => void): () => void;
}
// Browser preview (?mode=setup) fakes the copy so the screens can be designed without Electron.
const previewListeners = new Set<(progress: SetupProgress) => void>();
export const setupApi: SetupBridge = window.savira?.setup ?? {
  info: async () => ({ ok: true, data: { version: '0.1.0', defaultDir: String.raw`C:\Users\Spieler\AppData\Local\Programs\Savira`, existing: null, sizeMb: 352, launcherRunning: false } }),
  chooseDir: async () => ({ ok: true, data: null }),
  install: async options => {
    for (let p = 0; p <= 100; p += 4) {
      await new Promise(resolve => setTimeout(resolve, 70));
      previewListeners.forEach(cb => cb({ step: p < 90 ? 'copy' : p < 97 ? 'shortcuts' : p < 100 ? 'register' : 'done', progress: p, file: String.raw`resources\app.asar` }));
    }
    return { ok: true, data: { dir: options.target, exe: `${options.target}\\Savira.exe` } };
  },
  uninstall: async () => ({ ok: true, data: { dir: '' } }),
  launch: unavailable,
  onProgress: callback => { previewListeners.add(callback); return () => previewListeners.delete(callback); }
};

const updateOffline: UpdateStatus = { state: 'disabled', version: null, notes: [], date: null, size: 0, progress: 0, error: 'Updates gibt es nur im Desktop-Launcher.', checkedAt: null };
export const updateApi: UpdateBridge = window.savira?.update ?? {
  state: async () => ({ ok: true, data: updateOffline }),
  check: async () => ({ ok: true, data: updateOffline }),
  download: unavailable, cancel: unavailable, install: unavailable,
  onStatus: () => () => {}
};

export const logsApi: LogsBridge = window.savira?.logs ?? {
  open: unavailable, clear: unavailable, stop: unavailable, folder: unavailable, window: unavailable,
  state: async () => ({ ok: true, data: { accent: 'mint', session: null } }),
  on: () => () => {}
};
export const debugApi: DebugBridge = window.savira?.debug ?? {
  list: async () => ({ ok: true, data: [] }), read: unavailable, open: unavailable, reveal: unavailable, folder: unavailable
};

// Browser preview keeps skins in memory so the page can be designed without Electron.
let previewSkins: LibrarySkin[] = [];
export const skinsApi: SkinsBridge = window.savira?.skins ?? {
  list: async () => ({ ok: true, data: { skins: previewSkins, applied: null } }),
  fetch: unavailable,
  save: async skin => {
    previewSkins = skin.id ? previewSkins.map(s => s.id === skin.id ? { ...s, ...skin, png: skin.png ?? s.png } : s) : [{ id: crypto.randomUUID(), added: Date.now(), name: skin.name, variant: skin.variant, png: skin.png || '' }, ...previewSkins];
    return { ok: true, data: { skins: previewSkins, applied: null } };
  },
  remove: async id => { previewSkins = previewSkins.filter(s => s.id !== id); return { ok: true, data: { skins: previewSkins, applied: null } }; },
  apply: unavailable
};

let previewCapes: CapeLibrary = { capes: [], favorites: [], active: null };
const capeResult = async () => ({ ok: true as const, data: previewCapes });
export const capesApi: CapesBridge = window.savira?.capes ?? {
  list: capeResult,
  current: async () => ({ ok: true, data: previewCapes.capes.find(c => c.id === previewCapes.active)?.png ?? null }),
  vanilla: unavailable,
  setVanilla: unavailable,
  add: async cape => { previewCapes = { ...previewCapes, capes: [{ id: crypto.randomUUID(), added: Date.now(), ...cape }, ...previewCapes.capes] }; return capeResult(); },
  update: async (id, changes) => { previewCapes = { ...previewCapes, capes: previewCapes.capes.map(c => c.id === id ? { ...c, ...changes } : c) }; return capeResult(); },
  remove: async id => { previewCapes = { ...previewCapes, capes: previewCapes.capes.filter(c => c.id !== id) }; return capeResult(); },
  wear: async id => { previewCapes = { ...previewCapes, active: id }; return capeResult(); },
  favorite: async key => { const has = previewCapes.favorites.includes(key); previewCapes = { ...previewCapes, favorites: has ? previewCapes.favorites.filter(k => k !== key) : [...previewCapes.favorites, key] }; return capeResult(); },
  template: unavailable
};

// Browser preview: a short fixed version list, so the profile wizard can be designed without Electron.
const previewVersions: MinecraftVersion[] = ['26.3', '26.2', '26.1.2', '26.1', '1.21.11', '1.21.10', '1.21.4', '1.21.1', '1.20.1', '1.8.9'].map((id): MinecraftVersion => ({ id, type: 'release', released: '' }))
  .concat(['26.4-snapshot-5', '26.4-snapshot-4'].map((id): MinecraftVersion => ({ id, type: 'snapshot', released: '' })));
export const profilesApi: ProfilesBridge = window.savira?.profiles ?? {
  minecraftVersions: async () => ({ ok: true, data: previewVersions }),
  loaderVersions: async loader => ({ ok: true, data: (loader === 'forge' ? ['52.1.20', '52.1.19'] : loader === 'neoforge' ? ['21.1.264', '21.1.263'] : ['0.20.1', '0.19.5']).map((version, i) => ({ version, stable: i === 1 || loader !== 'fabric' })) }),
  importPack: unavailable, openFolder: unavailable,
  blockIcons: async () => ({ ok: true, data: [] }),
  iconFromFile: unavailable, iconFromUrl: unavailable,
  content: async () => ({ ok: true, data: [] }), toggle: unavailable, remove: unavailable, update: unavailable, install: unavailable, folder: unavailable, addFiles: unavailable,
  search: async () => ({ ok: true, data: { total: 0, hits: [] } }), project: unavailable, versions: async () => ({ ok: true, data: [] }), where: async () => ({ ok: true, data: [] }), installPack: unavailable, openLink: unavailable, tags: async () => ({ ok: true, data: { categories: [], versions: [], loaders: [] } }), openProject: unavailable,
  worlds: async () => ({ ok: true, data: { worlds: [], servers: [] } }), play: unavailable, screenshots: async () => ({ ok: true, data: [] }), openScreenshot: unavailable, deleteScreenshot: unavailable,
  stats: async () => ({ ok: true, data: { size: 0 } }), duplicate: unavailable, exportEntries: async () => ({ ok: true, data: [] }), exportPack: unavailable, packVersions: async () => ({ ok: true, data: [] }), switchPack: unavailable
};
