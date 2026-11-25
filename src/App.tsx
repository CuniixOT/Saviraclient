import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Check, CheckCircle, CornersOut, GearSix, Gift, Info, Lightning, Minus, Plus, ShieldCheck, Ticket, Trash, Trophy, WindowsLogo, X } from '@phosphor-icons/react';
import { ContentBrowser } from './ContentBrowser';
import { api, capesApi, isDesktop, logsApi, profilesApi, unwrap, type Accounts, type Settings, type State } from './api';
import { Background } from './Background';
import { LAST_SERVER_KEY, LauncherHome } from './LauncherHome';
import { ProfilesPage } from './ProfilesPage';
import { ServersPage } from './ServersPage';
import { SettingsPage } from './SettingsPage';
import { AboutPage } from './AboutPage';
import { WardrobePage } from './WardrobePage';
import { SeasonPage } from './SeasonPage';
import { CasesPage } from './CasesPage';
import { NewsPage } from './NewsPage';
import { SkinHead, accentHex } from './ui';
import { UpdateChip, useUpdates } from './Update';
import { CoinsChip } from './Coins';
import { claimableQuests, ownedCases, readyTiers, SeasonToast, useSeason } from './season';
import { news } from './news';

type Page = 'home' | 'profiles' | 'mods' | 'servers' | 'wardrobe' | 'news' | 'season' | 'cases' | 'settings' | 'about';
const nav: { id: Page; label: string }[] = [
  { id: 'home', label: 'Spielen' },
  { id: 'profiles', label: 'Profile' },
  { id: 'mods', label: 'Mods' },
  { id: 'servers', label: 'Server' },
  { id: 'wardrobe', label: 'Garderobe' },
  { id: 'news', label: 'News' }
];
type Notification = { id: string; icon: 'quest' | 'reward' | 'update' | 'news'; text: string; meta: string; go?: Page };
const SEEN_KEY = 'savira-seen-notifications';
const readSeen = (): string[] => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return []; } };

export function App() {
  const [state, setState] = useState<State | null>(null);
  const [page, setPage] = useState<Page>('home');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [seen, setSeen] = useState<string[]>(readSeen);
  const [panorama, setPanorama] = useState<string[] | null>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const updates = useUpdates();
  const seasonState = useSeason(setError);
  const { season } = seasonState;

  useEffect(() => {
    unwrap(api.state()).then(setState).catch(e => setError(e.message));
    const offSettings = api.onSettings?.(settings => setState(s => s ? { ...s, settings } : s));
    const offStatus = api.onStatus(status => setState(s => s ? { ...s, status } : s));
    return () => { offStatus(); offSettings?.(); };
  }, []);
  // Re-check after a launch finishes: the first install is what downloads the panorama assets.
  const phase = state?.status.phase;
  useEffect(() => {
    if (panorama || phase === 'installing' || phase === 'preparing') return;
    api.panorama().then(result => { if (result.ok && result.data) setPanorama(result.data); }).catch(() => { /* Fallback art stays. */ });
  }, [phase, panorama]);
  const accent = accentHex(state?.settings.accent);
  useEffect(() => { document.documentElement.style.setProperty('--accent', accent); }, [accent]);
  // While the settings slider moves, its preview wins over the saved value.
  const [radiusPreview, setRadiusPreview] = useState<number | null>(null);
  const radius = radiusPreview ?? state?.settings.radius ?? 12;
  useEffect(() => { document.documentElement.style.setProperty('--rk', String(radius / 12)); }, [radius]);
  // Discord shows which launcher page is open.
  useEffect(() => { api.presence(page === 'wardrobe' ? 'skins' : page).catch(() => { /* Presence is optional. */ }); }, [page]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(timer); }, [notice]);
  // Popovers close on a click outside or Escape.
  useEffect(() => {
    if (!accountOpen && !notifOpen) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      const outside = (ref: React.RefObject<HTMLDivElement | null>) => !ref.current?.contains(event.target as Node);
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : outside(accountRef) && outside(notifRef)) { setAccountOpen(false); setNotifOpen(false); }
    };
    window.addEventListener('mousedown', close); window.addEventListener('keydown', close);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', close); };
  }, [accountOpen, notifOpen]);

  async function action(name: string, work: () => Promise<void>) {
    if (pending) return;
    setPending(name); setError('');
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : 'Das hat nicht geklappt. Bitte erneut versuchen.'); }
    finally { setPending(''); }
  }
  const save = (next: Settings, message = 'Einstellungen gespeichert.') => action('save', async () => {
    const settings = await unwrap(api.save(next));
    setState(s => s ? { ...s, settings } : s); setNotice(message);
  });
  const active = phase === 'running' || phase === 'installing' || phase === 'preparing';
  const locked = Boolean(pending) || active;
  const applyAccounts = (next: Accounts) => setState(s => s ? { ...s, ...next } : s);
  const refreshCape = useCallback(() => { capesApi.current().then(result => { if (result.ok) setState(s => s ? { ...s, cape: result.data } : s); }).catch(() => { /* Keeps the old cape. */ }); }, []);
  // Another account may wear another vanilla cape.
  const accountUuid = state?.account?.uuid;
  useEffect(() => { if (accountUuid !== undefined) refreshCape(); }, [accountUuid, refreshCape]);
  const login = () => action('login', async () => { const next = await unwrap(api.login()); applyAccounts(next); setNotice(`Willkommen, ${next.account?.name}.`); setAccountOpen(false); });
  const switchAccount = (uuid: string) => action('account', async () => { const next = await unwrap(api.switchAccount(uuid)); applyAccounts(next); setNotice(`Aktives Konto: ${next.account?.name}.`); });
  const removeAccount = (uuid: string, name: string) => action('account', async () => { const next = await unwrap(api.logout(uuid)); applyAccounts(next); setNotice(`${name} wurde entfernt.`); });
  const openFolder = () => action('folder', async () => { await unwrap(api.openFolder()); });
  // The server also becomes the start page's Quick Play entry.
  const playOn = (profileId: string, server: string) => action('profile-launch', async () => {
    try { localStorage.setItem(LAST_SERVER_KEY, JSON.stringify({ address: server, at: Date.now() })); } catch { /* Only a convenience. */ }
    if (!state?.account) applyAccounts(await unwrap(api.login()));
    await unwrap(profilesApi.play(profileId, { server }));
  });
  const launchProfile = (selectedProfileId: string) => action('profile-launch', async () => {
    if (!state) return;
    const settings = await unwrap(api.save({ ...state.settings, selectedProfileId }));
    setState(current => current ? { ...current, settings } : current); setPage('home');
    if (!state.account) {
      applyAccounts(await unwrap(api.login()));
    }
    await unwrap(api.launch());
  });

  // Notifications come from what the launcher knows: quests, rewards, updates and news.
  const notifications: Notification[] = [
    ...(season ? [...season.daily, ...season.weekly].filter(q => q.done && !q.claimed).map(q => ({ id: `quest-${q.id}-${season.xp}`, icon: 'quest' as const, text: `Quest geschafft: ${q.title}. Hol dir +${q.xp} XP.`, meta: 'Quests', go: 'season' as Page })) : []),
    ...(season ? season.tiers.filter(t => t.free.ready).map(t => ({ id: `tier-${t.level}`, icon: 'reward' as const, text: `Level ${t.level} erreicht: ${t.free.name} wartet.`, meta: 'Season Pass', go: 'season' as Page })) : []),
    ...(updates.status.state === 'available' || updates.status.state === 'ready' ? [{ id: `update-${updates.status.version}`, icon: 'update' as const, text: `Savira ${updates.status.version} ist da.`, meta: 'Update', go: 'settings' as Page }] : []),
    ...news.slice(0, 2).map(item => ({ id: `news-${item.title}`, icon: 'news' as const, text: item.title, meta: `${item.kicker} · ${item.date}` }))
  ];
  const unread = notifications.filter(item => !seen.includes(item.id)).length;
  const markAll = () => { const ids = notifications.map(item => item.id); setSeen(ids); try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids)); } catch { /* Only a convenience. */ } };
  const seasonPing = claimableQuests(season) + readyTiers(season) > 0;
  const cases = ownedCases(season) + (season?.inventory.keys ?? 0);
  const go = (next: Page) => { setPage(next); setNotifOpen(false); setAccountOpen(false); };
  const notifIcon = { quest: <Trophy size={15} weight="bold" />, reward: <Gift size={15} weight="bold" />, update: <Lightning size={15} weight="fill" />, news: <Lightning size={15} weight="bold" /> };
  const notifTint = { quest: 'rgb(212 244 92 / .14)', reward: 'rgb(242 169 59 / .16)', update: '#2f4a3c', news: '#2d3550' };

  return <div className="app">
    <a className="skip-link" href="#main">Zum Inhalt springen</a>
    {/* No animation while Minecraft runs: the launcher should not take GPU time from the game. */}
    <Background mode={state?.settings.background || 'panorama'} panorama={panorama} accent={accent} paused={phase === 'running' || state?.settings.animations === false} />

    <header className="topbar">
      <div className="topbar-brand">
        <button className="brand" aria-label="Über Savira" onClick={() => go('about')}>
          <span className="brand-mark"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg></span>
          <span className="brand-name"><b>Savira</b><small>PvP Client</small></span>
        </button>
        <span className="chip">v{state?.version || '0.1.0'}</span>
        {!isDesktop && <span className="chip chip-warn">Browser-Vorschau</span>}
        <UpdateChip updates={updates} gameRunning={active} />
      </div>

      <nav className="main-nav" aria-label="Hauptnavigation">
        {nav.map(item => <button key={item.id} aria-current={page === item.id ? 'page' : undefined} onClick={() => go(item.id)}>{item.label}</button>)}
        <span className="nav-sep" aria-hidden="true" />
        <button className="nav-icon" aria-label="Season Pass" title="Season Pass" aria-current={page === 'season' ? 'page' : undefined} onClick={() => go('season')}>
          <Ticket size={16} weight={page === 'season' ? 'fill' : 'regular'} />{seasonPing && <span className="nav-ping" />}
        </button>
        <button className="nav-icon" aria-label="Kisten" title="Kisten" aria-current={page === 'cases' ? 'page' : undefined} onClick={() => go('cases')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 10h18v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /><path d="M4 10V7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v3" /><path d="M10 10v3h4v-3" /></svg>
          {cases > 0 && <span className="nav-count">{cases}</span>}
        </button>
        <div className="notif-wrap" ref={notifRef}>
          <button className={`nav-icon ${notifOpen ? 'open' : ''}`} aria-label="Benachrichtigungen" aria-expanded={notifOpen} onClick={() => { setNotifOpen(open => !open); setAccountOpen(false); }}>
            <Bell size={16} />{unread > 0 && <span className="nav-count">{unread}</span>}
          </button>
          {notifOpen && <div className="notif-pop" role="dialog" aria-label="Benachrichtigungen">
            <header><b>Benachrichtigungen</b><button className="btn-link" onClick={markAll}>Alle als gelesen markieren</button></header>
            {notifications.length ? notifications.map(item => <button key={item.id} className="notif-item" onClick={() => { if (item.go) go(item.go); }}>
              <span className={`notif-icon ${seen.includes(item.id) ? '' : 'unread'}`} style={{ background: notifTint[item.icon] }}>{notifIcon[item.icon]}</span>
              <span>{item.text}<small>{item.meta}</small></span>
            </button>) : <p className="notif-empty">Nichts Neues.</p>}
          </div>}
        </div>
        <button className="nav-icon" aria-label="Einstellungen" title="Einstellungen" aria-current={page === 'settings' ? 'page' : undefined} onClick={() => go('settings')}><GearSix size={16} weight={page === 'settings' ? 'fill' : 'regular'} /></button>
      </nav>

      <div className="topbar-right">
        <CoinsChip balance={season?.coins ?? 0} onCases={season ? () => go('cases') : undefined} />
        <div className="account" ref={accountRef}>
          <button className="chip-pill" aria-haspopup="dialog" aria-expanded={accountOpen} onClick={() => { setAccountOpen(open => !open); setNotifOpen(false); }}>
            <SkinHead skin={state?.account?.skin || null} size={30} />
            <span>{state?.account?.name || 'Nicht angemeldet'}</span>
            <span className={state?.account ? 'online' : 'offline'} aria-label={state?.account ? 'online' : 'nicht angemeldet'} />
          </button>
          {accountOpen && <section className="account-menu glass" role="dialog" aria-label="Minecraft-Konten">
            <header className="account-menu-head"><span className="pixel">minecraft-konten</span><button className="btn btn-icon" aria-label="Kontenmenü schließen" onClick={() => setAccountOpen(false)}><X size={14} /></button></header>
            {state?.accounts.length
              ? <ul className="account-list" aria-label="Gespeicherte Konten">{state.accounts.map(entry => {
                const current = entry.uuid === state.account?.uuid;
                return <li key={entry.uuid} className={current ? 'active' : ''}>
                  <button className="account-pick" disabled={locked || current} aria-current={current ? 'true' : undefined} onClick={() => switchAccount(entry.uuid)}>
                    <SkinHead skin={entry.skin} size={32} /><span><strong>{entry.name}</strong><small>{current ? 'Aktiv' : 'Zum Wechseln klicken'}</small></span>{current && <Check size={15} weight="bold" />}
                  </button>
                  <button className="btn btn-icon account-remove" aria-label={`${entry.name} entfernen`} title="Konto entfernen" disabled={locked} onClick={() => removeAccount(entry.uuid, entry.name)}><Trash size={15} /></button>
                </li>;
              })}</ul>
              : <div className="account-head"><SkinHead skin={null} size={48} /><div><strong>Hey.</strong><small>Melde dich mit dem Konto an, das Minecraft Java besitzt.</small></div></div>}
            <button className="btn btn-primary w-full" disabled={locked} onClick={login}>{state?.accounts.length ? <Plus size={16} weight="bold" /> : <WindowsLogo size={17} weight="fill" />}{pending === 'login' ? 'Läuft …' : state?.accounts.length ? 'Konto hinzufügen' : 'Mit Microsoft anmelden'}</button>
            <p className="fine"><ShieldCheck size={14} />Die Anmeldung läuft direkt über Microsoft. Savira sieht dein Passwort nicht.</p>
          </section>}
        </div>
        <div className="window-actions">
          <button aria-label="Minimieren" onClick={() => api.window('minimize')}><Minus size={14} /></button>
          <button aria-label="Maximieren" onClick={() => api.window('maximize')}><CornersOut size={13} /></button>
          <button className="close" aria-label="Schließen" onClick={() => api.window('close')}><X size={14} /></button>
        </div>
      </div>
    </header>

    <main id="main" className={`content page-${page}`} tabIndex={-1}>
      {error && <div className="alert glass" role="alert"><Info size={18} weight="fill" /><span>{error}</span><button className="btn btn-icon" aria-label="Meldung schließen" onClick={() => setError('')}><X size={16} /></button></div>}
      {!state ? <div className="loading" aria-busy="true"><div className="skeleton stage-skeleton" /><div className="skeleton news-skeleton" />{error && <button className="btn" onClick={() => location.reload()}>Erneut laden</button>}</div> : <>
        {page === 'home' && <LauncherHome state={state} pending={pending} locked={locked} active={active} season={seasonState} onProfiles={() => go('profiles')} onServers={() => go('servers')} onSeason={() => go('season')} onNews={() => go('news')} onFolder={openFolder}
          onLogs={() => unwrap(logsApi.open()).catch(e => setError(e.message))} onNotice={setNotice} onPlayServer={server => playOn(state.settings.selectedProfileId, server)}
          onLaunch={() => state.account ? action('launch', async () => { await unwrap(api.launch()); }) : login()}
          onProfile={selectedProfileId => save({ ...state.settings, selectedProfileId }, 'Profil gewechselt.')}
          onSkinAnimation={() => save({ ...state.settings, emotes: !state.settings.emotes }, state.settings.emotes ? 'Skin-Animation aus.' : 'Skin-Animation an.')} />}
        {page === 'profiles' && <ProfilesPage settings={state.settings} maxMemory={state.maxMemory} locked={locked} onSave={async (next, message) => save(next, message)} onUse={launchProfile}
          onPlay={(profileId, target) => action('profile-launch', async () => { if (!state.account) applyAccounts(await unwrap(api.login())); await unwrap(profilesApi.play(profileId, target)); })}
          onSettings={(settings, message) => { setState(s => s ? { ...s, settings } : s); setNotice(message); }} onNotice={setNotice} onError={setError} />}
        {page === 'mods' && <ContentBrowser mode="page" profile={null} kind="mods" settings={state.settings} maxMemory={state.maxMemory} onNotice={setNotice}
          onSaveSettings={async (next, message) => save(next, message)} onSettings={(settings, message) => { setState(s => s ? { ...s, settings } : s); setNotice(message); }} />}
        {page === 'servers' && <ServersPage settings={state.settings} locked={locked} onNotice={setNotice} onError={setError} onPlay={playOn} />}
        {page === 'wardrobe' && <WardrobePage state={state} locked={locked} onNotice={setNotice} onError={setError} onApplied={({ account, accounts }) => applyAccounts({ account, accounts })} onCapeChange={refreshCape} />}
        {page === 'season' && <SeasonPage season={seasonState} />}
        {page === 'cases' && <CasesPage season={seasonState} onError={setError} />}
        {page === 'news' && <NewsPage onHome={() => go('home')} onError={setError} />}
        {page === 'settings' && <SettingsPage state={state} locked={locked} pending={pending} onSave={save} onFolder={openFolder} onNotice={setNotice} onError={setError} updates={updates} gameRunning={active} onRadiusPreview={setRadiusPreview}
          onPickJava={async () => { try { return await unwrap(api.selectJava()); } catch (e) { setError(e instanceof Error ? e.message : 'Java konnte nicht ausgewählt werden.'); return null; } }} />}
        {page === 'about' && <AboutPage version={state.version} />}
      </>}
    </main>

    <SeasonToast toast={seasonState.toast} />
    {notice && <div className="toast glass" role="status"><CheckCircle size={18} weight="fill" />{notice}</div>}
  </div>;
}
