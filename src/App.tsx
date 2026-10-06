import { useEffect, useRef, useState } from 'react';
import { CheckCircle, CornersOut, GearSix, Info, Minus, Play, PuzzlePiece, ShieldCheck, SignOut, Stack, WindowsLogo, X } from '@phosphor-icons/react';
import { api, isDesktop, unwrap, type Settings, type State } from './api';
import { Background } from './Background';
import { LauncherHome } from './LauncherHome';
import { ProfilesPage } from './ProfilesPage';
import { ModsPage } from './ModsPage';
import { SettingsPage } from './SettingsPage';
import { AboutPage } from './AboutPage';
import { Logo, SkinHead, accents } from './ui';
import { UpdateChip, useUpdates } from './Update';

type Page = 'home' | 'profiles' | 'mods' | 'settings' | 'about';
const nav: { id: Page; label: string; icon: typeof Play }[] = [
  { id: 'home', label: 'Spielen', icon: Play },
  { id: 'profiles', label: 'Profile', icon: Stack },
  { id: 'mods', label: 'Module', icon: PuzzlePiece },
  { id: 'settings', label: 'Einstellungen', icon: GearSix },
  { id: 'about', label: 'Über Savira', icon: Info }
];

export function App() {
  const [state, setState] = useState<State | null>(null);
  const [page, setPage] = useState<Page>('home');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  const [panorama, setPanorama] = useState<string[] | null>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const updates = useUpdates();

  useEffect(() => {
    unwrap(api.state()).then(setState).catch(e => setError(e.message));
    return api.onStatus(status => setState(s => s ? { ...s, status } : s));
  }, []);
  // Re-check after a launch finishes: the first install is what downloads the panorama assets.
  const phase = state?.status.phase;
  useEffect(() => {
    if (panorama || phase === 'installing' || phase === 'preparing') return;
    api.panorama().then(result => { if (result.ok && result.data) setPanorama(result.data); }).catch(() => { /* Fallback art stays. */ });
  }, [phase, panorama]);
  const accent = accents[state?.settings.accent || 'mint'].hex;
  useEffect(() => { document.documentElement.style.setProperty('--accent', accent); }, [accent]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    if (!accountOpen) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    };
    window.addEventListener('mousedown', close); window.addEventListener('keydown', close);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', close); };
  }, [accountOpen]);

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
  const login = () => action('login', async () => { const account = await unwrap(api.login()); setState(s => s ? { ...s, account } : s); setNotice(`Willkommen, ${account.name}.`); setAccountOpen(false); });
  const logout = () => action('logout', async () => { await unwrap(api.logout()); setState(s => s ? { ...s, account: null } : s); setAccountOpen(false); setNotice('Du bist abgemeldet.'); });
  const openFolder = () => action('folder', async () => { await unwrap(api.openFolder()); });
  const launchProfile = (selectedProfileId: string) => action('profile-launch', async () => {
    if (!state) return;
    const settings = await unwrap(api.save({ ...state.settings, selectedProfileId }));
    setState(current => current ? { ...current, settings } : current); setPage('home');
    if (!state.account) {
      const account = await unwrap(api.login());
      setState(current => current ? { ...current, account } : current);
    }
    await unwrap(api.launch());
  });

  return <div className="app">
    <a className="skip-link" href="#main">Zum Inhalt springen</a>
    {/* No animation while Minecraft runs: the launcher should not take GPU time from the game. */}
    <Background mode={state?.settings.background || 'panorama'} panorama={panorama} accent={accent} paused={phase === 'running'} />

    <header className="topbar">
      <div className="topbar-brand"><Logo /><span className="chip">v{state?.version || '0.1.0'}</span>{!isDesktop && <span className="chip chip-warn">Browser-Vorschau</span>}</div>
      <div className="topbar-right">
        <UpdateChip updates={updates} gameRunning={active} />
        <div className="account" ref={accountRef}>
          <button className="account-chip" aria-haspopup="dialog" aria-expanded={accountOpen} onClick={() => setAccountOpen(open => !open)}>
            <SkinHead skin={state?.account?.skin || null} size={26} />
            <span><strong>{state?.account?.name || 'Nicht angemeldet'}</strong><small className={state?.account ? 'ok' : ''}>{state?.account ? 'online' : 'Microsoft-Login'}</small></span>
          </button>
          {accountOpen && <section className="account-menu glass" role="dialog" aria-label="Account">
            <div className="account-head"><SkinHead skin={state?.account?.skin || null} size={48} /><div><strong className="pixel">{state?.account?.name || 'Hey.'}</strong><small>{state?.account ? 'Microsoft-Konto verbunden' : 'Melde dich mit dem Konto an, das Minecraft Java besitzt.'}</small></div></div>
            {state?.account
              ? <button className="btn w-full" disabled={locked} onClick={logout}><SignOut size={17} />Abmelden</button>
              : <button className="btn btn-accent pixel w-full" disabled={locked} onClick={login}><WindowsLogo size={17} weight="fill" />{pending === 'login' ? 'läuft …' : 'mit microsoft anmelden'}</button>}
            <p className="fine"><ShieldCheck size={14} />Die Anmeldung läuft direkt über Microsoft. Savira sieht dein Passwort nicht.</p>
          </section>}
        </div>
        <div className="window-actions">
          <button aria-label="Minimieren" onClick={() => api.window('minimize')}><Minus size={15} /></button>
          <button aria-label="Maximieren" onClick={() => api.window('maximize')}><CornersOut size={14} /></button>
          <button className="close" aria-label="Schließen" onClick={() => api.window('close')}><X size={15} /></button>
        </div>
      </div>
    </header>

    <nav className="rail glass" aria-label="Hauptnavigation">
      {nav.map(item => <button key={item.id} aria-label={item.label} aria-current={page === item.id ? 'page' : undefined} className={page === item.id ? 'active' : ''} onClick={() => setPage(item.id)}>
        <item.icon size={22} weight={page === item.id ? 'fill' : 'bold'} /><span className="rail-tip pixel">{item.label}</span>
      </button>)}
    </nav>

    <main id="main" className="content" tabIndex={-1}>
      {error && <div className="alert glass" role="alert"><Info size={18} weight="fill" /><span>{error}</span><button className="btn btn-icon" aria-label="Meldung schließen" onClick={() => setError('')}><X size={16} /></button></div>}
      {!state ? <div className="loading" aria-busy="true"><div className="skeleton stage-skeleton" /><div className="skeleton news-skeleton" />{error && <button className="btn" onClick={() => location.reload()}>Erneut laden</button>}</div> : <>
        {page === 'home' && <LauncherHome state={state} pending={pending} locked={locked} active={active} onProfiles={() => setPage('profiles')} onFolder={openFolder} panorama={panorama}
          onLaunch={() => state.account ? action('launch', async () => { await unwrap(api.launch()); }) : login()}
          onProfile={selectedProfileId => save({ ...state.settings, selectedProfileId }, 'Profil gewechselt.')} />}
        {page === 'profiles' && <ProfilesPage settings={state.settings} locked={locked} onSave={async (next, message) => save(next, message)} onUse={launchProfile} />}
        {page === 'mods' && <ModsPage settings={state.settings} locked={locked} onSave={save} />}
        {page === 'settings' && <SettingsPage state={state} locked={locked} pending={pending} onSave={save} onFolder={openFolder} updates={updates} gameRunning={active}
          onPickJava={async () => { try { return await unwrap(api.selectJava()); } catch (e) { setError(e instanceof Error ? e.message : 'Java konnte nicht ausgewählt werden.'); return null; } }} />}
        {page === 'about' && <AboutPage version={state.version} />}
      </>}
    </main>

    {notice && <div className="toast glass" role="status"><CheckCircle size={18} weight="fill" />{notice}</div>}
  </div>;
}
