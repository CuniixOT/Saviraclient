import { ArrowDown, Copy, Cpu, CornersOut, FileText, FolderOpen, MagnifyingGlass, Memory, Minus, Monitor, Stop, Trash, X } from '@phosphor-icons/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { logsApi, unwrap, type GameSession, type GameStats, type LogLevel, type LogLine } from './api';
import { SkinHead, accentHex } from './ui';

const LEVELS: LogLevel[] = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'];
const ROW = 20, OVERSCAN = 30, MAX_LINES = 8000;
const clock = (ms: number) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const uptime = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`; };

export function LogWindow() {
  const [session, setSession] = useState<GameSession | null>(null);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [stats, setStats] = useState<GameStats>({ memory: 0, cpu: 0 });
  const [running, setRunning] = useState(false);
  const [enabled, setEnabled] = useState<Record<LogLevel, boolean>>({ ERROR: true, WARN: true, INFO: true, DEBUG: true, TRACE: false });
  const [query, setQuery] = useState('');
  const [following, setFollowing] = useState(true);
  const [confirmStop, setConfirmStop] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [view, setView] = useState({ top: 0, height: 600 });
  const scroller = useRef<HTMLDivElement>(null);

  const load = (state: { accent: string; session: GameSession | null }) => {
    document.documentElement.style.setProperty('--accent', accentHex(state.accent as never));
    setSession(state.session); setLines(state.session?.lines ?? []); setStats(state.session?.stats ?? { memory: 0, cpu: 0 }); setRunning(Boolean(state.session?.running));
  };
  useEffect(() => {
    unwrap(logsApi.state()).then(load).catch(e => setError(e.message));
    return logsApi.on((event, payload) => {
      if (event === 'lines') setLines(prev => { const next = prev.concat(payload as LogLine[]); return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next; });
      if (event === 'stats') setStats(payload as GameStats);
      if (event === 'reset') { load(payload as never); setFollowing(true); }
      if (event === 'ended') { setRunning(false); setConfirmStop(false); }
    });
  }, []);
  useEffect(() => { if (!running) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [running]);
  useEffect(() => { if (!confirmStop) return; const timer = setTimeout(() => setConfirmStop(false), 4000); return () => clearTimeout(timer); }, [confirmStop]);

  const needle = query.trim().toLowerCase();
  const visible = useMemo(() => lines.filter(l => enabled[l.level] && (!needle || l.text.toLowerCase().includes(needle))), [lines, enabled, needle]);
  const counts = useMemo(() => { const c = { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0, TRACE: 0 } as Record<LogLevel, number>; for (const l of lines) c[l.level]++; return c; }, [lines]);

  // Only the rows in view are rendered; Minecraft easily prints thousands of lines.
  const first = Math.max(0, Math.floor(view.top / ROW) - OVERSCAN);
  const last = Math.min(visible.length, Math.ceil((view.top + view.height) / ROW) + OVERSCAN);
  useLayoutEffect(() => { if (following && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [visible.length, following]);
  useEffect(() => {
    const el = scroller.current; if (!el) return;
    const observer = new ResizeObserver(() => setView(v => ({ ...v, height: el.clientHeight })));
    observer.observe(el); return () => observer.disconnect();
  }, []);
  const onScroll = () => {
    const el = scroller.current!; setView({ top: el.scrollTop, height: el.clientHeight });
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < ROW * 2;
    if (atBottom !== following) setFollowing(atBottom);
  };

  const act = (work: () => Promise<unknown>) => work().catch(e => setError(e instanceof Error ? e.message : 'Aktion fehlgeschlagen.'));
  const copyVisible = () => act(async () => { await navigator.clipboard.writeText(visible.map(l => `[${clock(l.time)}] ${l.text}`).join('\n')); setError(''); });
  const memoryMb = Math.round(stats.memory / 1048576), limitMb = (session?.profile.memory ?? 4) * 1024;

  return <div className="logwin" style={{ '--row': `${ROW}px` } as CSSProperties}>
    <header className="logwin-bar">
      <span className="logwin-title pixel"><Monitor size={16} />minecraft logs</span>
      <div className="window-actions">
        <button aria-label="Minimieren" onClick={() => act(() => unwrap(logsApi.window('minimize')))}><Minus size={15} /></button>
        <button aria-label="Maximieren" onClick={() => act(() => unwrap(logsApi.window('maximize')))}><CornersOut size={14} /></button>
        <button className="close" aria-label="Schließen" onClick={() => act(() => unwrap(logsApi.window('close')))}><X size={15} /></button>
      </div>
    </header>

    <div className="logwin-body">
      <section className="logwin-main">
        <div className="logwin-tools">
          <label className="search"><MagnifyingGlass size={15} /><input aria-label="Logs durchsuchen" placeholder="Logs durchsuchen" value={query} onChange={e => setQuery(e.target.value)} /></label>
          <div className="level-chips" role="group" aria-label="Log-Stufen">{LEVELS.map(level => <button key={level} className={`chip-level lvl-${level.toLowerCase()} ${enabled[level] ? 'on' : ''}`} aria-pressed={enabled[level]} onClick={() => setEnabled(e => ({ ...e, [level]: !e[level] }))}>{level}<small>{counts[level]}</small></button>)}</div>
        </div>

        <div className="logwin-lines" ref={scroller} onScroll={onScroll} role="log" aria-live="off">
          {visible.length === 0
            ? <div className="logwin-empty"><FileText size={34} weight="fill" /><strong className="pixel">{lines.length ? 'keine treffer' : 'noch keine logs'}</strong><small>{lines.length ? 'Suche oder Filter anpassen.' : session ? 'Warte auf Log-Ausgabe …' : 'Starte Minecraft, dann erscheint hier die Ausgabe des Spiels.'}</small></div>
            : <div style={{ height: visible.length * ROW, position: 'relative' }}>
              {visible.slice(first, last).map((l, i) => <div key={l.id} className={`log-row lvl-${l.level.toLowerCase()}`} style={{ transform: `translateY(${(first + i) * ROW}px)` }}><time>{clock(l.time)}</time><span title={l.text.length > 140 ? l.text : undefined}>{l.text}</span></div>)}
            </div>}
        </div>

        <footer className="logwin-foot">
          <span><FileText size={14} />{visible.length.toLocaleString('de-DE')}{visible.length !== lines.length && ` / ${lines.length.toLocaleString('de-DE')}`} Zeilen</span>
          <button className={following ? 'on' : ''} onClick={() => setFollowing(!following)}><ArrowDown size={14} />{following ? 'Folgt' : 'Folgen'}</button>
          <span className="grow" />
          {error && <span className="logwin-error" role="alert">{error}</span>}
          <button onClick={copyVisible} disabled={!visible.length}><Copy size={14} />Kopieren</button>
          <button onClick={() => act(async () => { await unwrap(logsApi.clear()); setLines([]); })} disabled={!lines.length}><Trash size={14} />Leeren</button>
        </footer>
      </section>

      <aside className="logwin-side">
        <h2 className="pixel"><Monitor size={16} />instanz</h2>
        {session ? <>
          <div className={`instance-card ${running ? 'is-running' : ''}`}>
            <SkinHead skin={null} size={44} />
            <div><strong>{session.profile.name}</strong><small>{session.account || 'Unbekannt'} · <span className={running ? 'live' : ''}>{running ? uptime(now - session.startedAt) : 'beendet'}</span></small></div>
          </div>
          <div className="instance-stats">
            <div className="stat-head"><span>{session.profile.name}</span><span className={running ? 'live' : ''}>{running ? uptime(now - session.startedAt) : 'beendet'}</span></div>
            <div className="stat"><span><Memory size={14} />RAM</span><b>{running ? `${memoryMb.toLocaleString('de-DE')} MB` : '–'}</b><i style={{ '--fill': `${running ? Math.min(100, memoryMb / limitMb * 100) : 0}%` } as CSSProperties} /></div>
            <div className="stat"><span><Cpu size={14} />CPU</span><b>{running ? `${stats.cpu}%` : '–'}</b><i style={{ '--fill': `${running ? stats.cpu : 0}%` } as CSSProperties} /></div>
            <div className="stat-actions">
              <button className={`btn stop ${confirmStop ? 'confirm' : ''}`} disabled={!running} onClick={() => confirmStop ? act(async () => { await unwrap(logsApi.stop()); setConfirmStop(false); }) : setConfirmStop(true)}><Stop size={14} weight="fill" />{confirmStop ? 'wirklich?' : 'stopp'}</button>
              <button className="btn btn-icon" title="Spielordner öffnen" aria-label="Spielordner öffnen" onClick={() => act(() => unwrap(logsApi.folder()))}><FolderOpen size={16} /></button>
            </div>
          </div>
          <p className="instance-foot">{running ? '1 läuft' : 'Keine Instanz aktiv'}</p>
        </> : <p className="instance-empty">Keine Instanz gestartet.</p>}
      </aside>
    </div>
  </div>;
}
