import { ArrowClockwise, Check, CheckCircle, Desktop, FolderOpen, ListBullets, Minus, Play, Trash, Warning, X } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { api, setupApi, unwrap, type SetupInfo, type SetupProgress } from './api';
import { Background } from './Background';
import { SkinStage } from './SkinStage';
import { Logo, Toggle } from './ui';

type Mode = 'setup' | 'uninstall';
type Phase = 'welcome' | 'options' | 'working' | 'done' | 'error';
// Started by the launcher's auto-updater: install over the existing copy without questions.
const autoUpdate = new URLSearchParams(location.search).get('update') === '1';

const steps: { id: SetupProgress['step'][]; label: string }[] = [
  { id: ['prepare', 'copy'], label: 'Dateien kopieren' },
  { id: ['shortcuts'], label: 'Verknüpfungen anlegen' },
  { id: ['register', 'done'], label: 'Bei Windows registrieren' }
];

export function Setup({ mode }: { mode: Mode }) {
  const [info, setInfo] = useState<SetupInfo | null>(null);
  const [phase, setPhase] = useState<Phase>('welcome');
  const [target, setTarget] = useState('');
  const [desktop, setDesktop] = useState(true);
  const [startMenu, setStartMenu] = useState(true);
  const [removeData, setRemoveData] = useState(false);
  const [progress, setProgress] = useState<SetupProgress>({ step: 'prepare', progress: 0, file: '' });
  const [error, setError] = useState('');
  const [license, setLicense] = useState(false);
  const uninstalling = mode === 'uninstall';
  const autoStarted = useRef(false);

  useEffect(() => {
    unwrap(setupApi.info()).then(next => {
      setInfo(next); setTarget(next.defaultDir);
      if (next.shortcuts) { setDesktop(next.shortcuts.desktop); setStartMenu(next.shortcuts.startMenu); }
      if (autoUpdate && next.existing && !uninstalling && !autoStarted.current) { autoStarted.current = true; void run(next.existing, next.shortcuts); }
    }).catch(e => { setError(e.message); setPhase('error'); });
    return setupApi.onProgress(setProgress);
  }, []);

  async function run(dir = target, links = { desktop, startMenu }) {
    setPhase('working'); setError('');
    setProgress({ step: 'prepare', progress: 0, file: '' });
    try {
      if (uninstalling) {
        setProgress({ step: 'shortcuts', progress: 60, file: '' });
        await unwrap(setupApi.uninstall({ removeData }));
        setProgress({ step: 'done', progress: 100, file: '' });
      } else await unwrap(setupApi.install({ target: dir, desktop: links.desktop, startMenu: links.startMenu }));
      setPhase('done');
      if (autoUpdate && !uninstalling) setTimeout(() => { unwrap(setupApi.launch()).catch(e => { setError(e.message); setPhase('error'); }); }, 1400);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unbekannter Fehler.'); setPhase('error'); }
  }
  async function chooseDir() {
    try { const dir = await unwrap(setupApi.chooseDir(target)); if (dir) setTarget(dir); }
    catch (e) { setError(e instanceof Error ? e.message : 'Ordner konnte nicht gewählt werden.'); }
  }

  const update = Boolean(info?.existing) && !uninstalling;
  const pct = Math.max(0, Math.min(100, Math.round(progress.progress)));
  const currentStep = steps.findIndex(step => step.id.includes(progress.step));

  return <div className="setup">
    <Background mode="panorama" panorama={null} accent="#5ccf95" />
    <header className="topbar setup-bar">
      <div className="topbar-brand"><Logo /><span className="chip">{uninstalling ? 'deinstallation' : 'setup'} · v{info?.version || '0.1.0'}</span></div>
      <div className="window-actions">
        <button aria-label="Minimieren" onClick={() => api.window('minimize')}><Minus size={15} /></button>
        <button className="close" aria-label="Schließen" onClick={() => api.window('close')}><X size={15} /></button>
      </div>
    </header>

    <main className="setup-body">
      <section className="setup-copy page-enter" key={phase}>
        {phase === 'welcome' && (uninstalling ? <>
          <p className="kicker pixel">schade, dass du gehst</p>
          <h1 className="pixel">savira entfernen</h1>
          <p className="setup-text">Entfernt den Launcher, die Verknüpfungen und den Eintrag in „Apps & Features“.</p>
          {info?.launcherRunning && <div className="setup-alert" role="alert"><Warning size={18} weight="fill" />Savira läuft noch. Schließe den Launcher, dann dieses Fenster neu öffnen.</div>}
          <label className="setup-option danger">
            <span><strong>Auch meine Daten löschen</strong><small>Einstellungen, Account-Anmeldung und alle Spielordner mit Welten, Screenshots und Ressourcenpaketen unter %APPDATA%\Savira.</small></span>
            <Toggle value={removeData} label="Auch meine Daten löschen" onChange={() => setRemoveData(!removeData)} />
          </label>
          <div className="setup-actions">
            <button className="play-button setup-cta danger" disabled={!info || info.launcherRunning} onClick={() => run()}><span className="play-label pixel"><Trash size={22} weight="bold" />entfernen</span></button>
            <button className="btn" onClick={() => api.window('close')}>Abbrechen</button>
          </div>
        </> : <>
          <p className="kicker pixel">{update ? 'update verfügbar' : 'willkommen'}</p>
          <h1 className="pixel">{update ? 'savira aktualisieren' : 'savira installieren'}</h1>
          <p className="setup-text">{update ? 'Die neue Version ersetzt deine bisherige Installation. Profile, Einstellungen und Welten bleiben erhalten.' : 'Launcher, Fabric-Client und HUD-Mod in einem. Minecraft selbst lädt Savira beim ersten Start direkt von Mojang.'}</p>
          <button className="setup-path glass" onClick={() => setPhase('options')}>
            <FolderOpen size={20} /><span><small>Installationsort</small><strong>{target || '…'}</strong></span><em>ändern</em>
          </button>
          <div className="setup-actions">
            <button className="play-button setup-cta" disabled={!info} onClick={() => run()}><span className="play-label pixel"><Play size={24} weight="fill" />{update ? 'aktualisieren' : 'installieren'}</span></button>
            <span className="setup-size">{info ? `ca. ${info.sizeMb} MB` : ''}</span>
          </div>
          <p className="setup-legal">Mit der Installation akzeptierst du die <button onClick={() => setLicense(!license)}>MIT-Lizenz</button>. Savira ist nicht mit Mojang oder Microsoft verbunden.</p>
          {license && <pre className="setup-license glass">{'MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software, to deal in the Software without restriction. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.\n\nDen vollständigen Text findest du nach der Installation in der Datei LICENSE.'}</pre>}
        </>)}

        {phase === 'options' && <>
          <p className="kicker pixel">optionen</p>
          <h1 className="pixel">wohin damit?</h1>
          <div className="setup-field">
            <span>Installationsordner</span>
            <div className="input-row"><input className="input" value={target} spellCheck={false} aria-label="Installationsordner" onChange={e => setTarget(e.target.value)} /><button className="btn" onClick={chooseDir}><FolderOpen size={17} />Durchsuchen</button></div>
            <small className="field-help">Savira legt darin einen eigenen Ordner „Savira“ an. Keine Administratorrechte nötig.</small>
          </div>
          <label className="setup-option"><Desktop size={20} /><span><strong>Desktop-Verknüpfung</strong><small>Savira direkt vom Desktop starten.</small></span><Toggle value={desktop} label="Desktop-Verknüpfung" onChange={() => setDesktop(!desktop)} /></label>
          <label className="setup-option"><ListBullets size={20} /><span><strong>Startmenü-Eintrag</strong><small>Über die Windows-Suche auffindbar.</small></span><Toggle value={startMenu} label="Startmenü-Eintrag" onChange={() => setStartMenu(!startMenu)} /></label>
          <div className="setup-actions">
            <button className="btn btn-accent pixel" disabled={!target.trim()} onClick={() => setPhase('welcome')}><Check size={16} weight="bold" />übernehmen</button>
          </div>
        </>}

        {phase === 'working' && <>
          <p className="kicker pixel">{uninstalling ? 'wird entfernt' : update ? 'wird aktualisiert' : 'wird installiert'}</p>
          <div className="setup-percent pixel" aria-hidden="true">{pct}<span>%</span></div>
          <div className="setup-track" role="progressbar" aria-label="Fortschritt" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} style={{ '--progress': pct / 100 } as CSSProperties}><span /></div>
          <p className="setup-file" aria-live="polite">{progress.file || 'Bitte warten …'}</p>
          {!uninstalling && <ol className="setup-steps">{steps.map((step, index) => <li key={step.label} className={index < currentStep ? 'done' : index === currentStep ? 'current' : ''}>
            <i>{index < currentStep ? <Check size={11} weight="bold" /> : index + 1}</i>{step.label}
          </li>)}</ol>}
        </>}

        {phase === 'done' && (uninstalling ? <>
          <p className="kicker pixel">erledigt</p>
          <h1 className="pixel">savira entfernt.</h1>
          <p className="setup-text">Beim Schließen räumt Savira die letzten Dateien auf.{removeData ? ' Deine Daten werden ebenfalls gelöscht.' : ' Deine Daten unter %APPDATA%\\Savira bleiben erhalten.'}</p>
          <div className="setup-actions"><button className="btn btn-accent pixel" onClick={() => api.window('close')}><Check size={16} weight="bold" />schließen</button></div>
        </> : <>
          <p className="kicker pixel"><CheckCircle size={15} weight="fill" /> fertig</p>
          <h1 className="pixel">{autoUpdate ? 'update fertig.' : 'bereit zum spielen.'}</h1>
          <p className="setup-text">{autoUpdate ? `Savira ${info?.version} ist installiert und startet gleich neu.` : 'Savira ist installiert. Melde dich beim ersten Start mit dem Microsoft-Konto an, das Minecraft Java besitzt.'}</p>
          <div className="setup-actions">
            <button className="play-button setup-cta" onClick={() => unwrap(setupApi.launch()).catch(e => { setError(e.message); setPhase('error'); })}><span className="play-label pixel"><Play size={24} weight="fill" />starten</span></button>
            <button className="btn" onClick={() => api.window('close')}>Schließen</button>
          </div>
        </>)}

        {phase === 'error' && <>
          <p className="kicker pixel danger-text">das hat nicht geklappt</p>
          <h1 className="pixel">{uninstalling ? 'entfernen gestoppt' : 'installation gestoppt'}</h1>
          <div className="setup-alert" role="alert"><Warning size={18} weight="fill" />{error}</div>
          <div className="setup-actions">
            <button className="btn btn-accent pixel" onClick={() => run()} disabled={!info}><ArrowClockwise size={16} weight="bold" />erneut versuchen</button>
            {!uninstalling && <button className="btn" onClick={() => setPhase('options')}>Ordner ändern</button>}
          </div>
        </>}
      </section>

      <aside className={`setup-stage ${phase === 'working' ? 'is-working' : ''} ${uninstalling ? 'is-leaving' : ''}`}>
        <SkinStage skin={null} name={uninstalling ? 'Tschüss' : 'Savira'} />
      </aside>
    </main>
  </div>;
}
