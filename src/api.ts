export type Hud = { fps: boolean; cps: boolean; keystrokes: boolean; coordinates: boolean; ping: boolean; armor: boolean; potions: boolean; sprint: boolean; zoom: boolean; ram: boolean; scale: number };
export type GameProfile = { id: string; name: string; version: string; loader: 'savira' | 'vanilla' };
export type AccentPreset = 'mint' | 'emerald' | 'teal' | 'cyan' | 'blue' | 'indigo' | 'violet' | 'pink' | 'rose' | 'red' | 'orange' | 'amber' | 'slate';
/** A preset name or a custom "#rrggbb" colour. */
export type Accent = AccentPreset | `#${string}`;
export type BackgroundMode = 'panorama' | 'particles' | 'plain' | 'grid' | 'aurora' | 'stars' | 'glyphs' | 'waves' | 'blocks';
export type Settings = { memory: number; javaPath: string; selectedProfileId: string; profiles: GameProfile[]; fullscreen: boolean; accent: Accent; background: BackgroundMode; autoUpdate: boolean; animations: boolean; hideOnLaunch: boolean; logsOnLaunch: boolean; hud: Hud };
export type Account = { name: string; uuid: string; skin: string | null };
export type Status = { phase: 'idle' | 'preparing' | 'installing' | 'running' | 'error'; message: string; progress: number };
export type State = { settings: Settings; account: Account | null; status: Status; maxMemory: number; gameDirectory: string; version: string };
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
interface Bridge {
  state(): Promise<Result<State>>;
  save(settings: Settings): Promise<Result<Settings>>;
  login(): Promise<Result<Account>>;
  logout(): Promise<Result<void>>;
  launch(): Promise<Result<void>>;
  panorama(): Promise<Result<string[] | null>>;
  openFolder(): Promise<Result<void>>;
  selectJava(): Promise<Result<string | null>>;
  window(action: 'minimize' | 'maximize' | 'close'): Promise<Result<void>>;
  onStatus(callback: (status: Status) => void): () => void;
  setup?: SetupBridge;
  update?: UpdateBridge;
  logs?: LogsBridge;
  debug?: DebugBridge;
}
export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE';
export type LogLine = { id: number; time: number; level: LogLevel; text: string };
export type GameStats = { memory: number; cpu: number };
export type GameSession = { lines: LogLine[]; profile: { id: string; name: string; version: string; loader: string; memory: number }; account: string; startedAt: number; stats: GameStats; running: boolean; starting: boolean };
export type LogsState = { accent: Accent; session: GameSession | null };
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
export const defaultSettings: Settings = { memory: 4, javaPath: 'java', selectedProfileId: 'savira-1-21-1', profiles: [{ id: 'savira-1-21-1', name: 'Savira 1.21.1', version: '1.21.1', loader: 'savira' }, { id: 'vanilla-1-21-1', name: 'Vanilla 1.21.1', version: '1.21.1', loader: 'vanilla' }], fullscreen: false, accent: 'mint', background: 'panorama', autoUpdate: true, animations: true, hideOnLaunch: false, logsOnLaunch: false, hud: { fps: true, cps: true, keystrokes: true, coordinates: false, ping: true, armor: true, potions: true, sprint: true, zoom: false, ram: true, scale: 1 } };
const unavailable = async <T,>(): Promise<Result<T>> => ({ ok: false, error: 'Diese Funktion ist im Desktop-Launcher verfügbar. Starte Savira mit „npm run dev“.' });
export const api: Bridge = window.savira ?? {
  state: async () => {
    let settings = defaultSettings;
    try { settings = { ...defaultSettings, ...JSON.parse(localStorage.getItem('savira-preview') || 'null') }; } catch { /* Default preview. */ }
    return { ok: true, data: { settings, account: null, status: { phase: 'idle', message: 'Browser-Vorschau · Desktop-App zum Spielen starten.', progress: 0 }, maxMemory: 16, gameDirectory: 'Im Desktop-Launcher verfügbar', version: '0.1.0' } };
  },
  save: async settings => { try { localStorage.setItem('savira-preview', JSON.stringify(settings)); } catch { /* Preview only. */ } return { ok: true, data: settings }; },
  panorama: async () => ({ ok: true, data: null }),
  login: unavailable, logout: unavailable, launch: unavailable, openFolder: unavailable, selectJava: unavailable, window: unavailable,
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
