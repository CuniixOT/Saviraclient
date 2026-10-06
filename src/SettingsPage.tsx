import { Check, Eyedropper, FolderOpen, GameController, Palette, Sparkle, ToggleLeft } from '@phosphor-icons/react';
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { isDesktop, type AccentPreset, type BackgroundMode, type Settings, type State } from './api';
import { PageHeader, Toggle, accentHex, accents, isCustomAccent } from './ui';
import { BackgroundPreview } from './Background';
import { UpdatePanel, type useUpdates } from './Update';
import { DebugPanel } from './DebugPanel';
import { ColorPicker } from './ColorPicker';

type Tab = 'general' | 'background' | 'advanced' | 'debug';
type Draft = Pick<Settings, 'memory' | 'javaPath' | 'fullscreen'>;
type Props = {
  state: State;
  locked: boolean;
  pending: string;
  onSave: (settings: Settings, message?: string) => void;
  onPickJava: () => Promise<string | null>;
  onFolder: () => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
  updates: ReturnType<typeof useUpdates>;
  gameRunning: boolean;
};

const tabs: { id: Tab; label: string }[] = [{ id: 'general', label: 'allgemein' }, { id: 'background', label: 'hintergrund' }, { id: 'advanced', label: 'erweitert' }, { id: 'debug', label: 'debug' }];
const backgrounds: { id: BackgroundMode; label: string; detail: string }[] = [
  { id: 'panorama', label: 'Panorama', detail: 'Minecraft-Titelbild, nach dem ersten Start' },
  { id: 'grid', label: 'Retro-Grid', detail: 'Leuchtender Gitterboden mit Horizont' },
  { id: 'aurora', label: 'Nordlicht', detail: 'Weiche, wabernde Farbschleier' },
  { id: 'stars', label: 'Sternenhimmel', detail: 'Funkelnde Sterne und Sternschnuppen' },
  { id: 'glyphs', label: 'Verzauberung', detail: 'Fallende Runen wie am Zaubertisch' },
  { id: 'blocks', label: 'Blöcke', detail: 'Schwebende Pixel-Würfel' },
  { id: 'waves', label: 'Wellen', detail: 'Fließende Linien' },
  { id: 'particles', label: 'Partikel', detail: 'Aufsteigende Pixel' },
  { id: 'plain', label: 'Schlicht', detail: 'Ruhiger Farbverlauf' }
];
const switches: { key: 'autoUpdate' | 'hideOnLaunch' | 'logsOnLaunch'; label: string; help: string; on: string; off: string }[] = [
  { key: 'autoUpdate', label: 'Automatische Updates', help: 'Beim Start und alle sechs Stunden nach neuen Versionen suchen.', on: 'Automatische Update-Suche an.', off: 'Automatische Update-Suche aus.' },
  { key: 'hideOnLaunch', label: 'Fenster beim Start ausblenden', help: 'Der Launcher verschwindet, solange Minecraft läuft, und kommt danach zurück.', on: 'Launcher wird beim Spielstart ausgeblendet.', off: 'Launcher bleibt beim Spielstart sichtbar.' },
  { key: 'logsOnLaunch', label: 'Logs nach Start öffnen', help: 'Öffnet beim Spielstart automatisch das Log-Fenster. Nützlich zur Fehlersuche.', on: 'Log-Fenster öffnet sich beim Spielstart.', off: 'Log-Fenster öffnet sich nicht mehr automatisch.' }
];
const readTab = (): Tab => { try { const t = localStorage.getItem('savira-settings-tab'); return tabs.some(x => x.id === t) ? t as Tab : 'general'; } catch { return 'general'; } };

export function SettingsPage({ state, locked, pending, onSave, onPickJava, onFolder, onNotice, onError, updates, gameRunning }: Props) {
  const { settings } = state;
  const [tab, setTab] = useState<Tab>(readTab);
  const initial = (): Draft => ({ memory: settings.memory, javaPath: settings.javaPath, fullscreen: settings.fullscreen });
  const [draft, setDraft] = useState<Draft>(initial);
  const dirty = draft.memory !== settings.memory || draft.javaPath !== settings.javaPath || draft.fullscreen !== settings.fullscreen;
  const javaInvalid = !draft.javaPath.trim();
  const memoryShare = (draft.memory - 2) / Math.max(1, state.maxMemory - 2);
  const accent = accentHex(settings.accent);
  const custom = isCustomAccent(settings.accent);
  const [picking, setPicking] = useState(false);
  // The picker previews by recolouring the whole launcher; cancelling puts the saved colour back.
  const previewAccent = useCallback((hex: string) => document.documentElement.style.setProperty('--accent', hex), []);
  const closePicker = useCallback(() => { setPicking(false); previewAccent(accent); }, [accent, previewAccent]);

  useEffect(() => { try { localStorage.setItem('savira-settings-tab', tab); } catch { /* Convenience only. */ } }, [tab]);

  return <div className="page page-enter settings">
    <PageHeader kicker="launcher" title="einstellungen">
      <button className="btn" onClick={onFolder}><FolderOpen size={16} />Verzeichnis öffnen</button>
    </PageHeader>

    <div className="settings-tabs" role="tablist" aria-label="Einstellungs-Kategorien">
      {tabs.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} className={`pixel ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>)}
    </div>

    {tab === 'general' && <div className="tab-body" role="tabpanel">
      <section className="panel glass">
        <header className="panel-head"><Palette size={20} /><div><h2>Akzentfarbe</h2><p>Buttons, Schalter und Markierungen. Gilt sofort, auch für das Mod-Menü im Spiel.</p></div></header>
        <div className="accent-row">
          <div className="swatches" role="radiogroup" aria-label="Akzentfarbe">{(Object.keys(accents) as AccentPreset[]).map(id => <button key={id} role="radio" aria-checked={settings.accent === id} aria-label={accents[id].label} title={accents[id].label} disabled={locked} className={settings.accent === id ? 'active' : ''} style={{ background: accents[id].hex }} onClick={() => onSave({ ...settings, accent: id }, `Akzentfarbe: ${accents[id].label}.`)}>{settings.accent === id && <Check size={14} weight="bold" />}</button>)}</div>
          <button type="button" className={`custom-accent ${custom ? 'active' : ''}`} disabled={locked} onClick={() => setPicking(true)} aria-label="Eigene Akzentfarbe wählen">
            <span className="custom-swatch" style={{ background: custom ? accent : 'conic-gradient(#e5566b, #e8a33d, #5ccf95, #4f8dff, #8f72f2, #e5566b)' }} />
            <span><strong>Eigene</strong><small>{custom ? accent.toUpperCase() : 'Farbwähler'}</small></span>
            <Eyedropper size={16} />
          </button>
        </div>
        {picking && <ColorPicker value={accent} onPreview={previewAccent} onCancel={closePicker}
          onApply={hex => { setPicking(false); onSave({ ...settings, accent: hex as `#${string}` }, `Eigene Akzentfarbe: ${hex.toUpperCase()}.`); }} />}
      </section>

      <section className="panel glass">
        <header className="panel-head"><ToggleLeft size={20} /><div><h2>Verhalten</h2><p>Bewege die Maus über einen Eintrag für eine Erklärung.</p></div></header>
        <div className="switch-grid">{switches.map(s => <div key={s.key} className="switch-tile" title={s.help}>
          <span><strong>{s.label}</strong><small>{s.help}</small></span>
          <Toggle label={s.label} disabled={locked} value={settings[s.key]} onChange={() => onSave({ ...settings, [s.key]: !settings[s.key] }, settings[s.key] ? s.off : s.on)} />
        </div>)}</div>
      </section>

      <UpdatePanel updates={updates} version={state.version} autoUpdate={settings.autoUpdate} locked={locked} gameRunning={gameRunning} />
    </div>}

    {tab === 'background' && <div className="tab-body" role="tabpanel">
      <section className="panel glass">
        <header className="panel-head"><Sparkle size={20} /><div><h2>Hintergrundeffekt</h2><p>Was hinter dem Launcher liegt. Animationen pausieren immer, solange Minecraft läuft.</p></div>
          <div className="panel-head-side"><span>Animationen</span><Toggle label="Animationen" disabled={locked} value={settings.animations} onChange={() => onSave({ ...settings, animations: !settings.animations }, settings.animations ? 'Animationen aus.' : 'Animationen an.')} /></div>
        </header>
        <div className="choice-grid with-thumbs bg-choices" role="radiogroup" aria-label="Hintergrund">{backgrounds.map(item => <button key={item.id} role="radio" aria-checked={settings.background === item.id} disabled={locked} className={settings.background === item.id ? 'active' : ''} onClick={() => onSave({ ...settings, background: item.id }, `Hintergrund: ${item.label}.`)}>
          <span className={`bg-thumb thumb-${item.id}`} aria-hidden="true">{item.id === 'panorama' && <img src="./landscape.svg" alt="" />}<BackgroundPreview mode={item.id} accent={accent} />{settings.background === item.id && <i className="thumb-check"><Check size={12} weight="bold" /></i>}</span>
          <strong>{item.label}</strong><small>{item.detail}</small>
        </button>)}</div>
      </section>
    </div>}

    {tab === 'advanced' && <div className="tab-body" role="tabpanel">
      <section className="panel glass">
        <header className="panel-head"><GameController size={20} /><div><h2>Spiel</h2><p>Minecraft 1.21.1 braucht Java 21.</p></div></header>
        <div className="setting stacked">
          <div className="setting-row"><div><h3><label htmlFor="memory">Arbeitsspeicher</label></h3><p>4 GB reichen für die meisten PvP-Server.</p></div><output htmlFor="memory" className="value pixel">{draft.memory} GB</output></div>
          <input id="memory" className="range" type="range" min={2} max={state.maxMemory} value={draft.memory} disabled={locked} style={{ '--fill': `${memoryShare * 100}%` } as CSSProperties} onChange={e => setDraft({ ...draft, memory: Number(e.target.value) })} />
          <div className="range-labels"><span>2 GB</span><span>{state.maxMemory} GB frei für Minecraft</span></div>
        </div>
        <div className="setting">
          <div><h3>Im Vollbild starten</h3><p>Minecraft öffnet ohne Fensterrahmen.</p></div>
          <Toggle label="Im Vollbild starten" disabled={locked} value={draft.fullscreen} onChange={() => setDraft({ ...draft, fullscreen: !draft.fullscreen })} />
        </div>
        <div className="setting stacked">
          <label className="field" htmlFor="java"><span>Java-Pfad</span></label>
          <div className="input-row"><input id="java" className={`input ${javaInvalid ? 'invalid' : ''}`} value={draft.javaPath} disabled={locked} spellCheck={false} aria-invalid={javaInvalid} aria-describedby="java-help" onChange={e => setDraft({ ...draft, javaPath: e.target.value })} />
            <button className="btn" disabled={locked} onClick={async () => { const javaPath = await onPickJava(); if (javaPath) setDraft({ ...draft, javaPath }); }}><FolderOpen size={17} />Auswählen</button></div>
          {javaInvalid ? <small id="java-help" className="field-error">Bitte einen Java-Pfad angeben, zum Beispiel „java“.</small> : <small id="java-help" className="field-help">„java“ nutzt deine Systeminstallation. Alternativ die java.exe einer Java-21-Installation wählen.</small>}
        </div>
        <div className="setting"><div><h3>Spieldateien</h3><p>Jedes Profil hat einen eigenen Ordner.</p></div><button className="btn" onClick={onFolder}><FolderOpen size={17} />Ordner öffnen</button></div>
        {isDesktop && <code className="path">{state.gameDirectory}</code>}
      </section>
    </div>}

    {tab === 'debug' && <div className="tab-body" role="tabpanel"><DebugPanel onNotice={onNotice} onError={onError} /></div>}

    <div className={`save-bar glass ${dirty ? 'visible' : ''}`} aria-hidden={!dirty}>
      <span>Ungespeicherte Änderungen</span>
      <button className="btn" tabIndex={dirty ? 0 : -1} disabled={locked} onClick={() => setDraft(initial())}>Verwerfen</button>
      <button className="btn btn-accent pixel" tabIndex={dirty ? 0 : -1} disabled={locked || javaInvalid} onClick={() => onSave({ ...settings, ...draft })}><Check size={15} weight="bold" />{pending === 'save' ? 'speichert …' : 'speichern'}</button>
    </div>
  </div>;
}
