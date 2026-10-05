import { ArrowClockwise, ArrowRight, CaretUp, Check, CheckCircle, Cube, FolderOpen, Newspaper, Package, Play, Warning } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { SkinStage } from './SkinStage';
import type { State } from './api';

type Props = {
  state: State;
  pending: string;
  locked: boolean;
  active: boolean;
  onLaunch: () => void;
  onProfile: (profileId: string) => void;
  onProfiles: () => void;
  onFolder: () => void;
  panorama: string[] | null;
};

const news = [
  { kicker: 'HUD Studio', date: '28. Sep', title: 'Dein HUD sitzt jetzt pixelgenau.', body: 'Module im Spiel verschieben, skalieren und einrasten lassen.', crop: '18%' },
  { kicker: 'Launcher', date: '19. Sep', title: 'Neuer Look, gleiche Leistung.', body: 'Akzentfarben, Panorama-Hintergrund und eine neue Startseite.', crop: '56%' },
  { kicker: 'Module', date: '07. Sep', title: 'Zoom, Effekte und RAM im Blick.', body: 'Drei neue Anzeigen im Savira-Profil, einzeln schaltbar.', crop: '84%' }
];

export function LauncherHome({ state, pending, locked, active, onLaunch, onProfile, onProfiles, onFolder, panorama }: Props) {
  const [picker, setPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const name = state.account?.name || 'Steve';
  const profile = state.settings.profiles.find(item => item.id === state.settings.selectedProfileId) || state.settings.profiles[0];
  const phase = state.status.phase;
  const loading = phase === 'preparing' || phase === 'installing';
  const failed = phase === 'error';
  const progress = Math.max(0, Math.min(100, Math.round(state.status.progress)));

  useEffect(() => {
    if (!picker) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !pickerRef.current?.contains(event.target as Node)) setPicker(false);
    };
    window.addEventListener('mousedown', close); window.addEventListener('keydown', close);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', close); };
  }, [picker]);

  const label = pending === 'login' ? 'anmelden …' : loading ? `lädt ${progress}%` : phase === 'running' ? 'im spiel' : failed ? 'erneut' : state.account ? 'spielen' : 'anmelden';

  return <div className="home page-enter">
    <section className="stage" aria-label="Spiel starten">
      <SkinStage skin={state.account?.skin || null} name={name} />

      <div className="launch-area">
        {failed && <div className="launch-error" role="alert"><Warning size={18} weight="fill" /><p>{state.status.message}</p></div>}
        {loading && <p className="launch-message" role="status" aria-live="polite">{state.status.message}</p>}

        <div className="launch-bar">
          <div className="profile-picker" ref={pickerRef}>
            <button className="glass picker-button" disabled={locked} aria-haspopup="listbox" aria-expanded={picker} onClick={() => setPicker(open => !open)}>
              <span className={`picker-icon ${profile.loader}`}>{profile.loader === 'savira' ? <Package size={20} weight="fill" /> : <Cube size={20} weight="fill" />}</span>
              <span className="picker-copy"><strong>{profile.name}</strong><small>{profile.loader === 'savira' ? 'Fabric · Savira' : 'Vanilla'} · {profile.version}</small></span>
              <CaretUp size={14} className={picker ? '' : 'flip'} />
            </button>
            {picker && <div className="glass picker-menu" role="listbox" aria-label="Spielprofil">
              {state.settings.profiles.map(item => <button role="option" aria-selected={item.id === profile.id} key={item.id} onClick={() => { setPicker(false); if (item.id !== profile.id) onProfile(item.id); }}>
                <span className={`picker-icon ${item.loader}`}>{item.loader === 'savira' ? <Package size={16} weight="fill" /> : <Cube size={16} weight="fill" />}</span>
                <span className="picker-copy"><strong>{item.name}</strong><small>{item.version}</small></span>
                {item.id === profile.id && <Check size={14} weight="bold" />}
              </button>)}
              <button className="picker-manage" onClick={() => { setPicker(false); onProfiles(); }}>Profile verwalten <ArrowRight size={13} /></button>
            </div>}
          </div>

          <button className={`play-button ${loading ? 'is-loading' : ''} ${failed ? 'is-failed' : ''}`} disabled={locked} onClick={onLaunch} style={{ '--progress': progress / 100 } as CSSProperties}>
            <span className="play-fill" aria-hidden="true" />
            <span className="play-label pixel">{failed ? <ArrowClockwise size={26} weight="bold" /> : phase === 'running' ? <CheckCircle size={26} weight="fill" /> : !loading && <Play size={26} weight="fill" />}{label}</span>
          </button>

          <button className="glass icon-square" aria-label="Spielordner öffnen" title="Spielordner öffnen" onClick={onFolder}><FolderOpen size={22} /></button>
        </div>

        <p className="launch-meta"><span className={`dot ${state.account ? 'ok' : ''}`} />{state.account ? 'Microsoft verbunden' : 'Anmeldung erforderlich'}<i />{state.settings.memory} GB RAM<i />Java 21</p>
      </div>
    </section>

    <aside className="news glass" aria-label="Neuigkeiten">
      <header><span className="pixel"><Newspaper size={16} /> news</span></header>
      <div className="news-list">{news.map((item, index) => <article className="news-card" key={item.title} style={{ '--crop': item.crop, '--i': index, '--zoom': panorama ? 1 : 1.5 + index * .3 } as CSSProperties}>
        <div className="news-art"><img src={panorama?.[index + 1] || './landscape.svg'} alt="" /></div>
        <div><p><span>{item.kicker}</span>{item.date}</p><h2>{item.title}</h2><small>{item.body}</small></div>
      </article>)}</div>
    </aside>
  </div>;
}
