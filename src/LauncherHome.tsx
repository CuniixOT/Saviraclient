import { ArrowClockwise, ArrowRight, CaretUp, Check, CheckCircle, FolderOpen, Newspaper, Play, Terminal, Warning } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { SkinStage } from './SkinStage';
import type { State } from './api';
import { NewsArt } from './NewsArt';
import { news as allNews } from './news';
import { Toggle } from './ui';
import { loaderLabel, ProfileIcon } from './profileUi';

type Props = {
  state: State;
  pending: string;
  locked: boolean;
  active: boolean;
  onLaunch: () => void;
  onProfile: (profileId: string) => void;
  onProfiles: () => void;
  onFolder: () => void;
  onLogs: () => void;
  onSkinAnimation: () => void;
};

// The start page has room for the three newest entries.
const news = allNews.slice(0, 3);

export function LauncherHome({ state, pending, locked, active, onLaunch, onProfile, onProfiles, onFolder, onLogs, onSkinAnimation }: Props) {
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

  const label = pending === 'login' ? 'Anmelden …' : loading ? `Lädt ${progress}%` : phase === 'running' ? 'Im Spiel' : failed ? 'Erneut' : state.account ? 'Spielen' : 'Anmelden';

  return <div className="home page-enter">
    <section className="stage" aria-label="Spiel starten">
      <SkinStage skin={state.account?.skin || null} name={name} paused={phase === 'running'} animated={state.settings.emotes} cape={state.cape ?? null} />
      <div className="stage-toggle"><span className="pixel">skin-animation</span><Toggle label="Skin-Animation" disabled={locked} value={state.settings.emotes} onChange={onSkinAnimation} /></div>

      <div className="launch-area">
        {failed && <div className="launch-error" role="alert"><Warning size={18} weight="fill" /><p>{state.status.message}</p></div>}
        {loading && <p className="launch-message" role="status" aria-live="polite">{state.status.message}</p>}

        <div className="launch-bar">
          <div className="profile-picker" ref={pickerRef}>
            <button className="glass picker-button" disabled={locked} aria-haspopup="listbox" aria-expanded={picker} onClick={() => setPicker(open => !open)}>
              <ProfileIcon profile={profile} size={44} />
              <span className="picker-copy"><strong>{profile.name}</strong><small>{profile.version} · {loaderLabel(profile)}</small></span>
              <CaretUp size={14} className={picker ? '' : 'flip'} />
            </button>
            {picker && <div className="glass picker-menu" role="listbox" aria-label="Spielprofil">
              {state.settings.profiles.map(item => <button role="option" aria-selected={item.id === profile.id} key={item.id} onClick={() => { setPicker(false); if (item.id !== profile.id) onProfile(item.id); }}>
                <ProfileIcon profile={item} size={32} />
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

          <div className="icon-stack">
            <button className="glass icon-square" aria-label="Log-Fenster öffnen" title="Log-Fenster öffnen" onClick={onLogs}><Terminal size={20} /></button>
            <button className="glass icon-square" aria-label="Spielordner öffnen" title="Spielordner öffnen" onClick={onFolder}><FolderOpen size={20} /></button>
          </div>
        </div>

        <p className="launch-meta"><span className={`dot ${state.account ? 'ok' : ''}`} />{state.account ? 'Microsoft verbunden' : 'Anmeldung erforderlich'}<i />{state.settings.memory} GB RAM<i />Java 21</p>
      </div>
    </section>

    <aside className="news glass" aria-label="Neuigkeiten">
      <header><span className="pixel"><Newspaper size={16} /> news</span></header>
      <div className="news-list">{news.map((item, index) => <article className="news-card" key={item.title} style={{ '--i': index } as CSSProperties}>
        <div className="news-art"><NewsArt kind={item.art} /></div>
        <div><p><span>{item.kicker}</span>{item.date}</p><h2>{item.title}</h2><small>{item.body}</small></div>
      </article>)}</div>
    </aside>
  </div>;
}
