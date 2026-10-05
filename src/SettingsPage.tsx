import { Check, FolderOpen, GameController, HardDrives, Image, Palette, Sparkle, Square } from '@phosphor-icons/react';
import { useState, type CSSProperties } from 'react';
import { isDesktop, type Accent, type BackgroundMode, type Settings, type State } from './api';
import { PageHeader, Toggle, accents } from './ui';
import { UpdatePanel, type useUpdates } from './Update';

type Draft = Pick<Settings, 'memory' | 'javaPath' | 'fullscreen'>;
type Props = {
  state: State;
  locked: boolean;
  pending: string;
  onSave: (settings: Settings, message?: string) => void;
  onPickJava: () => Promise<string | null>;
  onFolder: () => void;
  updates: ReturnType<typeof useUpdates>;
  gameRunning: boolean;
};

const backgrounds: { id: BackgroundMode; label: string; detail: string; icon: typeof Image }[] = [
  { id: 'panorama', label: 'Panorama', detail: 'Minecraft-Titelbild, nach dem ersten Start', icon: Image },
  { id: 'particles', label: 'Partikel', detail: 'Aufsteigende Pixel in deiner Farbe', icon: Sparkle },
  { id: 'plain', label: 'Schlicht', detail: 'Ruhiger Farbverlauf', icon: Square }
];

export function SettingsPage({ state, locked, pending, onSave, onPickJava, onFolder, updates, gameRunning }: Props) {
  const { settings } = state;
  const initial = (): Draft => ({ memory: settings.memory, javaPath: settings.javaPath, fullscreen: settings.fullscreen });
  const [draft, setDraft] = useState<Draft>(initial);
  const dirty = draft.memory !== settings.memory || draft.javaPath !== settings.javaPath || draft.fullscreen !== settings.fullscreen;
  const javaInvalid = !draft.javaPath.trim();
  const memoryShare = (draft.memory - 2) / Math.max(1, state.maxMemory - 2);

  return <div className="page page-enter settings">
    <PageHeader kicker="launcher" title="einstellungen" />

    <section className="panel glass">
      <header className="panel-head"><Palette size={20} /><div><h2>Darstellung</h2><p>Gilt sofort, auch für das Mod-Menü im Spiel.</p></div></header>
      <div className="setting">
        <div><h3>Akzentfarbe</h3><p>Buttons, Schalter und Markierungen.</p></div>
        <div className="swatches" role="radiogroup" aria-label="Akzentfarbe">{(Object.keys(accents) as Accent[]).map(id => <button key={id} role="radio" aria-checked={settings.accent === id} aria-label={accents[id].label} title={accents[id].label} disabled={locked} className={settings.accent === id ? 'active' : ''} style={{ background: accents[id].hex }} onClick={() => onSave({ ...settings, accent: id }, `Akzentfarbe: ${accents[id].label}.`)}>{settings.accent === id && <Check size={14} weight="bold" />}</button>)}</div>
      </div>
      <div className="setting stacked">
        <div><h3>Hintergrund</h3><p>Was hinter dem Launcher liegt.</p></div>
        <div className="choice-grid" role="radiogroup" aria-label="Hintergrund">{backgrounds.map(item => <button key={item.id} role="radio" aria-checked={settings.background === item.id} disabled={locked} className={settings.background === item.id ? 'active' : ''} onClick={() => onSave({ ...settings, background: item.id }, `Hintergrund: ${item.label}.`)}><item.icon size={20} /><strong>{item.label}</strong><small>{item.detail}</small></button>)}</div>
      </div>
    </section>

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
    </section>

    <UpdatePanel updates={updates} version={state.version} autoUpdate={settings.autoUpdate} locked={locked} gameRunning={gameRunning} onAutoUpdate={() => onSave({ ...settings, autoUpdate: !settings.autoUpdate }, settings.autoUpdate ? 'Automatische Update-Suche aus.' : 'Automatische Update-Suche an.')} />

    <section className="panel glass">
      <header className="panel-head"><HardDrives size={20} /><div><h2>Spieldateien</h2><p>Jedes Profil hat einen eigenen Ordner.</p></div></header>
      <div className="setting"><code className="path">{isDesktop ? state.gameDirectory : 'Im Desktop-Launcher verfügbar'}</code><button className="btn" onClick={onFolder}><FolderOpen size={17} />Ordner öffnen</button></div>
    </section>

    <div className={`save-bar glass ${dirty ? 'visible' : ''}`} aria-hidden={!dirty}>
      <span>Ungespeicherte Änderungen</span>
      <button className="btn" tabIndex={dirty ? 0 : -1} disabled={locked} onClick={() => setDraft(initial())}>Verwerfen</button>
      <button className="btn btn-accent pixel" tabIndex={dirty ? 0 : -1} disabled={locked || javaInvalid} onClick={() => onSave({ ...settings, ...draft })}><Check size={15} weight="bold" />{pending === 'save' ? 'speichert …' : 'speichern'}</button>
    </div>
  </div>;
}
