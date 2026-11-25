import { ArrowClockwise, CaretDown, Check, CheckCircle, ClipboardText, Copy, FolderOpen, Lightning, Play, Terminal, Ticket, Warning } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { SkinStage } from './SkinStage';
import { profilesApi, type ServerStatus, type State } from './api';
import { NewsArt } from './NewsArt';
import { news as allNews } from './news';
import { Toggle } from './ui';
import { loaderLabel, ProfileIcon } from './profileUi';
import { servers } from './servers';
import { QuestRow, readyTiers, claimableQuests, resetIn, TierStrip, XpBar, type SeasonState } from './season';

type Props = {
  state: State;
  pending: string;
  locked: boolean;
  active: boolean;
  season: SeasonState;
  onLaunch: () => void;
  onProfile: (profileId: string) => void;
  onProfiles: () => void;
  onServers: () => void;
  onSeason: () => void;
  onNews: () => void;
  onPlayServer: (address: string) => void;
  onFolder: () => void;
  onLogs: () => void;
  onNotice: (message: string) => void;
  onSkinAnimation: () => void;
};

// The news reel has room for the three newest entries; each stays 7 seconds.
const news = allNews.slice(0, 3);
export const LAST_SERVER_KEY = 'savira-last-server';
type LastServer = { address: string; at: number };
const readLast = (): LastServer | null => { try { return JSON.parse(localStorage.getItem(LAST_SERVER_KEY) || 'null'); } catch { return null; } };
const ago = (at: number) => {
  const minutes = Math.round((Date.now() - at) / 60000);
  if (minutes < 60) return `vor ${Math.max(1, minutes)} Min.`;
  if (minutes < 1440) return `vor ${Math.round(minutes / 60)} Std.`;
  return `vor ${Math.round(minutes / 1440)} Tagen`;
};

export function LauncherHome({ state, pending, locked, active, season: seasonState, onLaunch, onProfile, onProfiles, onServers, onSeason, onNews, onPlayServer, onFolder, onLogs, onNotice, onSkinAnimation }: Props) {
  const { season, claimQuest, claimTier } = seasonState;
  const [picker, setPicker] = useState(false);
  const [panel, setPanel] = useState<'daily' | 'season' | null>(null);
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState<ServerStatus | null | 'offline'>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const name = state.account?.name || 'Steve';
  const profile = state.settings.profiles.find(item => item.id === state.settings.selectedProfileId) || state.settings.profiles[0];
  const phase = state.status.phase;
  const loading = phase === 'preparing' || phase === 'installing';
  const failed = phase === 'error';
  const progress = Math.max(0, Math.min(100, Math.round(state.status.progress)));
  // Quick Play: the server last joined through the launcher, else a partner server to try.
  const last = readLast();
  const quick = (last && servers.find(item => item.address === last.address)) || servers[0];
  const quickAddress = last?.address || quick.address;

  useEffect(() => {
    if (!picker) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !pickerRef.current?.contains(event.target as Node)) setPicker(false);
    };
    window.addEventListener('mousedown', close); window.addEventListener('keydown', close);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', close); };
  }, [picker]);
  useEffect(() => {
    let cancelled = false;
    setStatus(null);
    profilesApi.serverPing(quickAddress).then(result => { if (!cancelled) setStatus(result.ok ? result.data : 'offline'); }).catch(() => { if (!cancelled) setStatus('offline'); });
    return () => { cancelled = true; };
  }, [quickAddress]);

  const label = pending === 'login' ? 'Anmelden …' : loading ? `Lädt ${progress}%` : phase === 'running' ? 'Im Spiel' : failed ? 'Erneut' : state.account ? 'Spielen' : 'Anmelden';
  const copyIp = () => navigator.clipboard.writeText(quickAddress).then(() => onNotice('Server-IP kopiert.'), () => onNotice(quickAddress));
  const questsReady = claimableQuests(season), tiersReady = readyTiers(season);
  const togglePanel = (next: 'daily' | 'season') => setPanel(current => current === next ? null : next);
  const live = status && status !== 'offline' ? status : null;

  return <div className="home-h page-enter">
    <section className="home-hero" aria-label="Spiel starten">
      <span className="mono home-kicker">Savira · Startseite</span>
      <h1>Bereit für die<br />nächste Runde?</h1>

      <div className="home-launch">
        <div className="profile-picker" ref={pickerRef}>
          <button className="glass home-profile" disabled={locked} aria-haspopup="listbox" aria-expanded={picker} onClick={() => setPicker(open => !open)}>
            <ProfileIcon profile={profile} size={40} />
            <span><b>{profile.name}</b><small className="mono">{loaderLabel(profile)}</small></span>
            <CaretDown size={13} weight="bold" />
          </button>
          {picker && <div className="glass picker-menu" role="listbox" aria-label="Spielprofil">
            {state.settings.profiles.map(item => <button role="option" aria-selected={item.id === profile.id} key={item.id} onClick={() => { setPicker(false); if (item.id !== profile.id) onProfile(item.id); }}>
              <ProfileIcon profile={item} size={32} />
              <span className="picker-copy"><strong>{item.name}</strong><small>{item.version}</small></span>
              {item.id === profile.id && <Check size={14} weight="bold" />}
            </button>)}
            <button className="picker-manage" onClick={() => { setPicker(false); onProfiles(); }}>Profile verwalten →</button>
          </div>}
        </div>
        <button className={`home-play ${loading ? 'is-loading' : ''} ${failed ? 'is-failed' : ''}`} disabled={locked} onClick={onLaunch} style={{ '--progress': progress / 100 } as CSSProperties}>
          <span className="home-play-fill" aria-hidden="true" />
          <span className="home-play-dot">{failed ? <ArrowClockwise size={13} weight="bold" /> : phase === 'running' ? <CheckCircle size={14} weight="fill" /> : <Play size={11} weight="fill" />}</span>
          {label}<small className="mono">{profile.version}</small>
        </button>
        <button className="glass round-btn" aria-label="Log-Fenster öffnen" title="Log-Fenster öffnen" onClick={onLogs}><Terminal size={17} /></button>
        <button className="glass round-btn" aria-label="Spielordner öffnen" title="Spielordner öffnen" onClick={onFolder}><FolderOpen size={17} /></button>
      </div>
      {failed && <p className="home-error" role="alert"><Warning size={16} weight="fill" />{state.status.message}</p>}
      {loading && <p className="home-status-msg" role="status" aria-live="polite">{state.status.message}</p>}
      <p className="mono home-meta">
        <span><i className={state.account ? 'on' : ''} />{state.account ? 'Microsoft verbunden' : 'Anmeldung erforderlich'}</span>
        <span><i className="ring" />Java 21</span>
        <span><i className="white" />{state.settings.memory} GB RAM</span>
      </p>

      <div className="glass quick-play">
        <div className="quick-glow" aria-hidden="true" />
        <header><b><Lightning size={14} weight="fill" />Quick Play</b><small className="mono">{last ? `Zuletzt gespielt · ${ago(last.at)}` : 'Vorschlag'}</small></header>
        <div className="quick-server">
          {live?.icon ? <img className="quick-icon" src={live.icon} alt="" /> : <span className="quick-icon" style={{ background: `linear-gradient(135deg, ${quick.colors[0]}, ${quick.colors[1]})` }}>{quick.name.slice(0, 2)}</span>}
          <span>
            <b>{last && !servers.some(item => item.address === last.address) ? last.address : quick.name}</b>
            <small className="mono"><span>{quickAddress}</span>
              {live ? <><span><i className="on" />{live.ms} ms</span><span>{live.online.toLocaleString('de-DE')} online</span></> : <span>{status === 'offline' ? 'Nicht erreichbar' : 'Wird abgefragt …'}</span>}
            </small>
          </span>
        </div>
        <div className="quick-actions">
          <button className="quick-join" disabled={locked} onClick={() => onPlayServer(quickAddress)}><Play size={12} weight="fill" />Direkt joinen</button>
          <button className="btn" onClick={copyIp}><Copy size={14} />IP kopieren</button>
          <button className="btn" onClick={onServers}>Anderer Server</button>
        </div>
      </div>
    </section>

    <section className="home-stage" aria-label="Deine Figur">
      <SkinStage skin={state.account?.skin || null} name={name} paused={phase === 'running'} animated={state.settings.emotes} cape={state.cape ?? null} />
      <div className="glass anim-toggle">
        <b>Skin-Animation</b><small className={`mono ${state.settings.emotes ? 'on' : ''}`}>{state.settings.emotes ? 'Aktiv' : 'Aus'}</small>
        <Toggle label="Skin-Animation" value={state.settings.emotes} onChange={onSkinAnimation} disabled={locked} />
      </div>
    </section>

    {season && <>
      <div className="edge-tabs">
        <button className={`edge-tab ${panel === 'daily' ? 'open' : ''}`} aria-label="Daily Quests" aria-expanded={panel === 'daily'} onClick={() => togglePanel('daily')}>
          <span className="edge-icon"><ClipboardText size={14} weight="bold" /></span><span className="mono edge-label">Daily Quests</span>
          {questsReady > 0 && <span className="edge-dot" />}
        </button>
        <button className={`edge-tab ${panel === 'season' ? 'open' : ''}`} aria-label="Season Pass" aria-expanded={panel === 'season'} onClick={() => togglePanel('season')}>
          <span className="edge-icon amber"><Ticket size={14} weight="bold" /></span><span className="mono edge-label">Season Pass</span>
          {tiersReady > 0 && <span className="edge-count mono">{tiersReady}</span>}
        </button>
      </div>
      {panel === 'daily' && <section className="edge-panel" aria-label="Daily Quests">
        <header><b>Daily Quests</b><small className="mono">{resetIn(season.dailyResetAt)}</small></header>
        {season.daily.map(quest => <QuestRow key={quest.id} quest={quest} onClaim={claimQuest} />)}
        <p className="edge-foot">Quest-XP fließt direkt in deinen Season Pass.</p>
      </section>}
      {panel === 'season' && <section className="edge-panel season-mini" aria-label="Season Pass">
        <header><span><b>Season Pass</b><small className="mono">{season.season.name} · endet in {season.season.endsInDays} Tagen</small></span><span className="level-pill"><b>{season.level}</b><small className="mono">Level</small></span></header>
        <XpBar season={season} />
        <TierStrip season={season} />
        {(() => { const ready = season.tiers.find(t => t.free.ready); return ready && <div className="reward-ready">
          <span className="reward-gift"><Ticket size={15} weight="bold" /></span>
          <span><b>Belohnung bereit</b><small>Level {ready.level}: {ready.free.name}</small></span>
          <button onClick={() => claimTier(ready.level)}>Abholen</button>
        </div>; })()}
        <button className="btn btn-primary" onClick={onSeason}>Season Pass öffnen →</button>
      </section>}
    </>}

    <section className="news-reel" aria-label="News" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <header>
        <h2>News</h2>
        <div className="reel-progress">{news.map((item, i) => <span key={item.title}>
          {i === slide && <i key={slide} className={`seg ${paused ? 'paused' : ''}`} onAnimationEnd={() => setSlide(current => (current + 1) % news.length)} />}
          {i < slide && <i className="seg-done" />}
        </span>)}</div>
        <button className="reel-all" onClick={onNews}>Alle News →</button>
      </header>
      <div className="reel-cards">{news.map((item, i) => <button key={item.title} className={`reel-card ${i === slide ? 'active' : ''}`} onClick={() => setSlide(i)} aria-label={item.title}>
        {item.image ? <img src={item.image} alt="" className={i === slide ? 'kb' : ''} draggable={false} /> : <span className="reel-art"><NewsArt kind={item.art} /></span>}
        <span className="reel-shade" />
        <span className="reel-copy">
          <small className="mono">{item.kicker} · {item.date}</small>
          <b>{item.title}</b>
          {i === slide && <em>{item.body}</em>}
        </span>
        {i === 0 && <span className="reel-new mono">Neu</span>}
      </button>)}</div>
    </section>
    <img className="home-glow" src={news[slide]?.image} alt="" aria-hidden="true" />
  </div>;
}
