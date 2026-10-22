import { CaretDown, CaretRight, Check, CheckSquare, Copy, Export, File, Folder, Package, Square, Trash, X } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { profilesApi, unwrap, type ExportEntry, type GameProfile, type PackVersion, type Settings } from './api';

const message = (error: unknown) => error instanceof Error ? error.message : 'Das hat nicht geklappt.';

/** Dialog frame shared by the profile dialogs; on the body so page animations never offset it. */
export function Dialog({ title, icon, wide = false, onClose, children, footer }: { title: string; icon?: ReactNode; wide?: boolean; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', close, true);
    return () => window.removeEventListener('keydown', close, true);
  }, [onClose]);
  return createPortal(<div className="modal-backdrop" onMouseDown={onClose}>
    <section className={`modal glass wizard ${wide ? 'is-wide' : 'is-small'}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={event => event.stopPropagation()}>
      <header className="wizard-head"><h2 className="pixel">{icon}{title}</h2><button className="btn btn-icon" aria-label="Schließen" onClick={onClose}><X size={16} /></button></header>
      <div className="wizard-body">{children}</div>
      {footer && <footer className="wizard-foot">{footer}</footer>}
    </section>
  </div>, document.body);
}

export type MenuItem = { label: string; icon: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean; hint?: string };
/** Small dropdown at a button, closed by clicking elsewhere or Escape. */
export function Menu({ items, onClose, align = 'right' }: { items: MenuItem[]; onClose: () => void; align?: 'left' | 'right' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent | KeyboardEvent) => { if (event instanceof KeyboardEvent ? event.key === 'Escape' : !ref.current?.contains(event.target as Node)) onClose(); };
    const timer = setTimeout(() => { window.addEventListener('mousedown', close); window.addEventListener('keydown', close); });
    return () => { clearTimeout(timer); window.removeEventListener('mousedown', close); window.removeEventListener('keydown', close); };
  }, [onClose]);
  return <div ref={ref} className={`menu glass align-${align}`} role="menu">
    {items.map((item, index) => <button key={index} role="menuitem" className={item.danger ? 'is-danger' : ''} disabled={item.disabled} title={item.hint} onClick={() => { onClose(); item.onClick(); }}>{item.icon}<span>{item.label}</span></button>)}
  </div>;
}

export function DuplicateDialog({ profile, onClose, onDone }: { profile: GameProfile; onClose: () => void; onDone: (settings: Settings, name: string) => void }) {
  const [name, setName] = useState(`${profile.name} (Kopie)`.slice(0, 40));
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  async function run() {
    setWorking(true); setError('');
    try { onDone(await unwrap(profilesApi.duplicate(profile.id, name.trim())), name.trim()); }
    catch (e) { setError(message(e)); setWorking(false); }
  }
  return <Dialog title="Profil duplizieren" icon={<Copy size={16} />} onClose={onClose} footer={<><button className="btn pixel" onClick={onClose}>abbrechen</button><button className="btn btn-accent pixel" disabled={!name.trim() || working} onClick={run}><Copy size={15} />{working ? 'kopiert …' : 'duplizieren'}</button></>}>
    {error && <p className="wizard-error" role="alert">{error}</p>}
    <p className="dialog-text">Es wird eine Kopie von „{profile.name}“ erstellt, mit Welten, Konfigurationen, Mods und Einstellungen.</p>
    <label className="field"><span>Neuer Profilname</span><input className="input" autoFocus maxLength={40} value={name} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && name.trim()) void run(); }} /></label>
  </Dialog>;
}

export function ExportDialog({ profile, onClose, onDone }: { profile: GameProfile; onClose: () => void; onDone: (text: string) => void }) {
  const [name, setName] = useState(profile.name);
  const [entries, setEntries] = useState<ExportEntry[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reveal, setReveal] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { unwrap(profilesApi.exportEntries(profile.id)).then(list => { setEntries(list); setSelected(new Set(list.filter(item => item.selected).map(item => item.name))); }, e => setError(message(e))); }, [profile.id]);
  const toggle = (entry: string) => setSelected(current => { const next = new Set(current); if (next.has(entry)) next.delete(entry); else next.add(entry); return next; });
  async function run() {
    setWorking(true); setError('');
    try {
      const result = await unwrap(profilesApi.exportPack(profile.id, { name, include: [...selected], reveal }));
      if (result) onDone(`Exportiert: ${result.downloads} Dateien von Modrinth, ${result.overrides} eingepackt.`); else setWorking(false);
    } catch (e) { setError(message(e)); setWorking(false); }
  }
  return <Dialog title={`Profil exportieren: ${profile.name}`} icon={<Export size={16} />} wide onClose={onClose} footer={<>
    <label className="check small"><input type="checkbox" checked={reveal} onChange={event => setReveal(event.target.checked)} /><span className="check-box"><Check size={12} weight="bold" /></span><span><strong className="pixel">ordner nach export öffnen</strong></span></label>
    <button className="btn btn-accent pixel" disabled={working || !name.trim()} onClick={run}><Export size={15} />{working ? 'exportiert …' : 'profil exportieren'}</button>
  </>}>
    {error && <p className="wizard-error" role="alert">{error}</p>}
    <label className="field"><span>Export-Dateiname</span><input className="input" maxLength={60} value={name} onChange={event => setName(event.target.value)} /><small className="field-help">Wird gespeichert als {name.trim() || 'Profil'}.mrpack (Modrinth-Format, lässt sich in Savira, Modrinth, Prism und anderen Launchern importieren).</small></label>
    <div className="field"><span>Dateien und Ordner</span><small className="field-help">Mods, Pakete und Shader, die es auf Modrinth gibt, werden als Download verlinkt, alles andere wird eingepackt.</small></div>
    <div className="export-actions"><button className="btn pixel" onClick={() => setSelected(new Set(entries?.map(item => item.name)))}><CheckSquare size={14} />alle auswählen</button><button className="btn pixel" onClick={() => setSelected(new Set())}><Square size={14} />alle abwählen</button></div>
    <ul className="export-list">{entries?.map(entry => <li key={entry.name}>
      <label><input type="checkbox" checked={selected.has(entry.name)} onChange={() => toggle(entry.name)} />{entry.folder ? <Folder size={16} weight="fill" /> : <File size={16} />}<span>{entry.name}</span><small>{new Date(entry.modified).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</small></label>
    </li>)}</ul>
    {entries && !entries.length && <p className="wizard-loading">Der Spielordner ist noch leer. Starte das Profil einmal.</p>}
  </Dialog>;
}

export function PackVersionsDialog({ profile, onClose, onDone }: { profile: GameProfile; onClose: () => void; onDone: (settings: Settings, version: string) => void }) {
  const [versions, setVersions] = useState<PackVersion[] | null>(null);
  const [picked, setPicked] = useState(profile.pack?.versionId ?? '');
  const [open, setOpen] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { unwrap(profilesApi.packVersions(profile.id)).then(setVersions, e => setError(message(e))); }, [profile.id]);
  async function run() {
    setWorking(true); setError('');
    try { onDone(await unwrap(profilesApi.switchPack(profile.id, picked)), versions?.find(item => item.id === picked)?.number ?? ''); }
    catch (e) { setError(message(e)); setWorking(false); }
  }
  return <Dialog title={`${profile.name} – Versionen`} icon={<Package size={16} weight="fill" />} wide onClose={onClose} footer={<><button className="btn pixel" onClick={onClose}>abbrechen</button><button className="btn btn-accent pixel" disabled={working || !picked || picked === profile.pack?.versionId} onClick={run}><Check size={15} weight="bold" />{working ? 'wechselt …' : 'version auswählen'}</button></>}>
    {error && <p className="wizard-error" role="alert">{error}</p>}
    {!versions && !error && <p className="wizard-loading">Versionen werden von Modrinth geladen …</p>}
    {versions && <p className="dialog-text">{versions.length} Versionen verfügbar. Klicke auf eine Version, um zu ihr zu wechseln. Deine Welten und Einstellungen bleiben.</p>}
    <div className="pack-versions">{versions?.map(version => <article key={version.id} className={picked === version.id ? 'active' : ''} onClick={() => setPicked(version.id)}>
      <header><strong className="pixel">{version.number}</strong>{version.id === profile.pack?.versionId && <span className="tag">aktuell</span>}<small>{Intl.NumberFormat('de-DE', { notation: 'compact' }).format(version.downloads)} · {new Date(version.date).toLocaleDateString('de-DE')}</small></header>
      <p>MC: {version.gameVersions.join(', ')} · {version.loaders.join(', ')}</p>
      {version.changelog && <button className="changelog-toggle" onClick={event => { event.stopPropagation(); setOpen(current => current === version.id ? null : version.id); }}>{open === version.id ? <CaretDown size={12} /> : <CaretRight size={12} />}Änderungsprotokoll</button>}
      {open === version.id && <pre className="changelog">{version.changelog}</pre>}
    </article>)}</div>
  </Dialog>;
}

export function DeleteDialog({ profile, onClose, onConfirm }: { profile: GameProfile; onClose: () => void; onConfirm: () => void }) {
  return <Dialog title="Profil löschen" icon={<Trash size={16} />} onClose={onClose} footer={<><button className="btn pixel" onClick={onClose}>abbrechen</button><button className="btn btn-danger pixel" onClick={() => { onClose(); onConfirm(); }}><Trash size={15} />löschen</button></>}>
    <p className="dialog-text">„{profile.name}“ wird aus der Liste entfernt. Der Spielordner mit Welten und Mods bleibt auf deinem PC, du findest ihn unter instances/{profile.id}.</p>
  </Dialog>;
}
