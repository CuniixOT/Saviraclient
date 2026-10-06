import { ArrowSquareOut, Bug, Copy, FileText, FolderOpen, Terminal, WarningOctagon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { debugApi, logsApi, unwrap, type LogFile, type LogFileKind } from './api';

const kinds: { id: LogFileKind; label: string; empty: string; icon: typeof FileText }[] = [
  { id: 'launcher', label: 'Launcher-Logs', empty: 'Noch keine Launcher-Logs. Sie entstehen ab dem nächsten Start.', icon: FileText },
  { id: 'minecraft', label: 'MC-Logs', empty: 'Noch keine Minecraft-Logs. Starte das Spiel einmal.', icon: Terminal },
  { id: 'crash', label: 'Crash-Reports', empty: 'Keine Abstürze bisher. So soll es sein.', icon: WarningOctagon }
];
const size = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const when = (ms: number) => new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function DebugPanel({ onNotice, onError }: { onNotice: (message: string) => void; onError: (message: string) => void }) {
  const [kind, setKind] = useState<LogFileKind>('launcher');
  const [files, setFiles] = useState<LogFile[] | null>(null);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    let alive = true;
    setFiles(null);
    unwrap(debugApi.list(kind)).then(list => { if (alive) setFiles(list); }).catch(e => { if (alive) { setFiles([]); onError(e.message); } });
    return () => { alive = false; };
  }, [kind]);

  async function act(file: LogFile, work: () => Promise<unknown>) {
    setBusy(file.path);
    try { await work(); } catch (e) { onError(e instanceof Error ? e.message : 'Aktion fehlgeschlagen.'); } finally { setBusy(''); }
  }
  const copy = (file: LogFile) => act(file, async () => {
    await navigator.clipboard.writeText(await unwrap(debugApi.read(file.path)));
    onNotice(`${file.name} in die Zwischenablage kopiert.`);
  });
  const current = kinds.find(k => k.id === kind)!;

  return <div className="debug">
    <div className="debug-bar">
      <div className="subtabs" role="tablist" aria-label="Log-Art">{kinds.map(k => <button key={k.id} role="tab" aria-selected={kind === k.id} className={kind === k.id ? 'active' : ''} onClick={() => setKind(k.id)}><k.icon size={15} />{k.label}</button>)}</div>
      <div className="debug-actions">
        <button className="btn" onClick={() => unwrap(logsApi.open()).catch(e => onError(e.message))}><Terminal size={16} />Log-Fenster</button>
        {kind === 'launcher' && <button className="btn" onClick={() => unwrap(debugApi.folder()).catch(e => onError(e.message))}><FolderOpen size={16} />Ordner</button>}
      </div>
    </div>

    {files === null ? <div className="file-list">{[0, 1, 2].map(i => <div key={i} className="skeleton file-skeleton" />)}</div>
      : files.length === 0 ? <div className="empty glass"><Bug size={34} weight="thin" /><h2 className="pixel">alles ruhig</h2><p>{current.empty}</p></div>
      : <ul className="file-list glass">{files.map(file => <li key={file.path} className="file-row">
        <current.icon size={18} className="file-icon" />
        <div className="file-copy"><strong>{file.name}{file.instance && <span className="tag-plain"> · {file.instance}</span>}</strong><small title={file.path}>{file.path}</small></div>
        <span className="file-meta">{size(file.size)}</span>
        <span className="file-meta">{when(file.modified)}</span>
        <div className="file-actions">
          <button className="btn btn-icon" title="Inhalt kopieren" aria-label={`${file.name} kopieren`} disabled={busy === file.path} onClick={() => copy(file)}><Copy size={16} /></button>
          <button className="btn btn-icon" title="Öffnen" aria-label={`${file.name} öffnen`} onClick={() => act(file, () => unwrap(debugApi.open(file.path)))}><ArrowSquareOut size={16} /></button>
          <button className="btn btn-icon" title="Im Ordner zeigen" aria-label={`${file.name} im Ordner zeigen`} onClick={() => act(file, () => unwrap(debugApi.reveal(file.path)))}><FolderOpen size={16} /></button>
        </div>
      </li>)}</ul>}
  </div>;
}
