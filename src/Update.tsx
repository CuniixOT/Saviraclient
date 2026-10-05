import { ArrowClockwise, ArrowCircleUp, CheckCircle, CloudArrowDown, Sparkle, Warning, X } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { unwrap, updateApi, type UpdateStatus } from './api';
import { Toggle } from './ui';

const initial: UpdateStatus = { state: 'idle', version: null, notes: [], date: null, size: 0, progress: 0, error: '', checkedAt: null };
const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1).replace('.', ',')} MB`;
const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

export function useUpdates() {
  const [status, setStatus] = useState<UpdateStatus>(initial);
  const [error, setError] = useState('');
  useEffect(() => {
    updateApi.state().then(result => { if (result.ok) setStatus(result.data); });
    return updateApi.onStatus(setStatus);
  }, []);
  const run = (work: () => Promise<unknown>) => { setError(''); work().catch(e => setError(e instanceof Error ? e.message : 'Update fehlgeschlagen.')); };
  return {
    status, error: error || status.error,
    check: () => run(() => unwrap(updateApi.check())),
    // One click: download if needed, then hand over to the setup.
    update: () => run(async () => { await unwrap(updateApi.download()); await unwrap(updateApi.install()); }),
    cancel: () => run(() => unwrap(updateApi.cancel()))
  };
}
type Updates = ReturnType<typeof useUpdates>;
const pending = (state: UpdateStatus['state']) => ['available', 'downloading', 'ready', 'installing'].includes(state);

function UpdateAction({ updates, gameRunning }: { updates: Updates; gameRunning: boolean }) {
  const { status } = updates;
  if (status.state === 'downloading') return <div className="update-progress">
    <div className="setup-track" role="progressbar" aria-label="Update-Download" aria-valuemin={0} aria-valuemax={100} aria-valuenow={status.progress} style={{ '--progress': status.progress / 100 } as CSSProperties}><span /></div>
    <div className="update-progress-row"><span>{status.progress}% von {mb(status.size)}</span><button className="btn btn-icon" aria-label="Download abbrechen" title="Abbrechen" onClick={updates.cancel}><X size={15} /></button></div>
  </div>;
  if (status.state === 'installing') return <p className="update-hint"><ArrowClockwise size={15} className="spin" />Savira startet gleich neu …</p>;
  return <>
    <button className="btn btn-accent pixel w-full update-cta" disabled={gameRunning} onClick={updates.update}>
      <ArrowCircleUp size={18} weight="bold" />{status.state === 'ready' ? 'installieren & neu starten' : 'jetzt aktualisieren'}
    </button>
    <p className="update-hint">{gameRunning ? 'Minecraft läuft. Das Update ist nach dem Beenden des Spiels möglich.' : `Lädt ${mb(status.size)}, installiert und startet Savira neu. Deine Einstellungen bleiben erhalten.`}</p>
  </>;
}

export function UpdateChip({ updates, gameRunning }: { updates: Updates; gameRunning: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { status } = updates;
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close); window.addEventListener('keydown', close);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', close); };
  }, [open]);
  if (!pending(status.state)) return null;
  return <div className="update" ref={ref}>
    <button className="update-chip" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
      {status.state === 'downloading' ? <CloudArrowDown size={15} weight="bold" /> : <Sparkle size={15} weight="fill" />}
      <span className="pixel">{status.state === 'downloading' ? `${status.progress}%` : `update ${status.version}`}</span>
    </button>
    {open && <section className="update-menu glass" role="dialog" aria-label="Update">
      <header><p className="kicker pixel">neue version</p><h2 className="pixel">savira {status.version}</h2>{status.date && <small>{day(status.date)}</small>}</header>
      {status.notes.length > 0 && <ul className="update-notes">{status.notes.map(note => <li key={note}><CheckCircle size={15} weight="fill" />{note}</li>)}</ul>}
      {updates.error && <p className="update-error" role="alert"><Warning size={15} weight="fill" />{updates.error}</p>}
      <UpdateAction updates={updates} gameRunning={gameRunning} />
    </section>}
  </div>;
}

export function UpdatePanel({ updates, version, autoUpdate, locked, gameRunning, onAutoUpdate }: { updates: Updates; version: string; autoUpdate: boolean; locked: boolean; gameRunning: boolean; onAutoUpdate: () => void }) {
  const { status } = updates;
  const line = {
    idle: 'Noch nicht gesucht.', disabled: status.error, checking: 'Suche nach Updates …', none: `Savira ist aktuell${status.checkedAt ? ` · geprüft ${new Date(status.checkedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr` : ''}.`,
    available: `Version ${status.version} ist verfügbar.`, downloading: `Version ${status.version} wird geladen …`, ready: `Version ${status.version} ist bereit.`, installing: 'Update wird installiert …', error: status.error
  }[status.state];
  return <section className="panel glass">
    <header className="panel-head"><ArrowCircleUp size={20} /><div><h2>Updates</h2><p>Installierte Version {version}</p></div></header>
    <div className="setting">
      <div><h3>Automatisch nach Updates suchen</h3><p>Beim Start und alle sechs Stunden. Installiert wird erst nach deinem Klick.</p></div>
      <Toggle label="Automatisch nach Updates suchen" disabled={locked} value={autoUpdate} onChange={onAutoUpdate} />
    </div>
    <div className="setting stacked">
      <div className="setting-row">
        <p className={`update-line ${status.state === 'error' ? 'is-error' : ''}`} role="status">{status.state === 'none' && <CheckCircle size={15} weight="fill" />}{status.state === 'error' && <Warning size={15} weight="fill" />}{line}</p>
        {!pending(status.state) && <button className="btn" disabled={status.state === 'checking' || status.state === 'disabled'} onClick={updates.check}><ArrowClockwise size={16} className={status.state === 'checking' ? 'spin' : ''} />Nach Updates suchen</button>}
      </div>
      {pending(status.state) && <div className="update-inline">
        {status.notes.length > 0 && <ul className="update-notes">{status.notes.map(note => <li key={note}><CheckCircle size={15} weight="fill" />{note}</li>)}</ul>}
        {updates.error && status.state !== 'error' && <p className="update-error" role="alert"><Warning size={15} weight="fill" />{updates.error}</p>}
        <UpdateAction updates={updates} gameRunning={gameRunning} />
      </div>}
    </div>
  </section>;
}
