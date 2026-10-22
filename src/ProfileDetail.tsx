import { ArrowClockwise, ArrowLeft, ArrowSquareOut, Camera, CaretDown, Check, Clock, Copy, Cube, DotsThree, DownloadSimple, Export, FilePlus, Flask, FolderOpen, GameController, GearSix, Globe, HardDrives, Hourglass, Image, Lightning, MagnifyingGlass, Package, PencilSimple, Play, Plus, Scroll, Sparkle, Star, Stack, Trash, Tree } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { debugApi, profilesApi, saviraAvailable, unwrap, type ContentItem, type ContentKind, type GameProfile, type LogFile, type MinecraftVersion, type Screenshot, type Server, type World } from './api';
import { ContentBrowser } from './ContentBrowser';
import { Menu, type MenuItem } from './ProfileDialogs';
import { loaderNames, playedAgo, ProfileIcon } from './profileUi';

export type ProfileAction = 'edit' | 'duplicate' | 'export' | 'folder' | 'versions' | 'delete';
type Section = ContentKind | 'savira' | 'worlds' | 'screenshots' | 'logs';
const CONTENT: { id: ContentKind; label: string; icon: ReactNode; noun: string }[] = [
  { id: 'mods', label: 'Mods', icon: <Lightning size={15} weight="fill" />, noun: 'Mods' },
  { id: 'resourcepacks', label: 'Ressourcenpakete', icon: <Image size={15} />, noun: 'Ressourcenpakete' },
  { id: 'shaderpacks', label: 'Shader-Pakete', icon: <Sparkle size={15} />, noun: 'Shader-Pakete' },
  { id: 'datapacks', label: 'Datenpakete', icon: <Stack size={15} />, noun: 'Datenpakete' },
];
const message = (error: unknown) => error instanceof Error ? error.message : 'Das hat nicht geklappt.';
const bytes = (size: number) => size > 1073741824 ? `${(size / 1073741824).toFixed(2)} GB` : size > 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
const duration = (seconds: number) => { const h = Math.floor(seconds / 3600), m = Math.round(seconds % 3600 / 60); return seconds < 60 ? (seconds ? '< 1 min' : '—') : h ? `${h}h ${m}m` : `${m} min`; };

type Props = {
  profile: GameProfile;
  locked: boolean;
  onBack: () => void;
  onAction: (action: ProfileAction) => void;
  onPlay: (target?: { world: string } | { server: string }) => void;
  onSaveProfile: (profile: GameProfile, notice: string) => Promise<void>;
  onNotice: (text: string) => void;
  onError: (text: string) => void;
};

/** One profile with everything in it, like the instance page of the NoRisk launcher. */
export function ProfileDetail({ profile, locked, onBack, onAction, onPlay, onSaveProfile, onNotice, onError }: Props) {
  const [section, setSection] = useState<Section>('mods');
  const [items, setItems] = useState<Partial<Record<ContentKind, ContentItem[]>>>({});
  const [size, setSize] = useState<number | null>(null);
  const [browser, setBrowser] = useState<ContentKind | null>(null);
  const [menu, setMenu] = useState(false);
  const [chip, setChip] = useState<'version' | 'loader' | 'group' | null>(null);

  const load = useCallback(async (kind: ContentKind) => {
    try { const list = await unwrap(profilesApi.content(profile.id, kind)); setItems(current => ({ ...current, [kind]: list })); }
    catch (e) { onError(message(e)); setItems(current => ({ ...current, [kind]: [] })); }
  }, [profile.id, onError]);
  useEffect(() => { void load('mods'); unwrap(profilesApi.stats(profile.id)).then(stats => setSize(stats.size), () => setSize(null)); }, [load, profile.id]);
  useEffect(() => { if (section in { mods: 1, resourcepacks: 1, shaderpacks: 1, datapacks: 1 } && !items[section as ContentKind]) void load(section as ContentKind); }, [section, items, load]);

  const actions: MenuItem[] = [
    { label: 'Profil bearbeiten', icon: <GearSix size={15} />, onClick: () => onAction('edit') },
    { label: 'Duplizieren', icon: <Copy size={15} />, onClick: () => onAction('duplicate') },
    { label: 'Exportieren', icon: <Export size={15} />, onClick: () => onAction('export') },
    { label: 'Ordner öffnen', icon: <FolderOpen size={15} />, onClick: () => onAction('folder') },
    { label: 'Modpack-Versionen', icon: <Package size={15} />, onClick: () => onAction('versions'), disabled: !profile.pack, hint: profile.pack ? undefined : 'Nur für Profile aus einem Modrinth-Modpack' },
    { label: 'Löschen', icon: <Trash size={15} />, onClick: () => onAction('delete'), danger: true },
  ];
  const installed = useMemo(() => new Set(Object.values(items).flat().map(item => item?.modrinth?.projectId).filter(Boolean) as string[]), [items]);

  return <div className="page profile-page page-enter">
    <nav className="crumbs"><button onClick={onBack}><ArrowLeft size={13} />zurück</button><span>/</span><strong>{profile.name}</strong>
      <div className="crumb-actions">
        <button className="btn btn-icon" title="Ordner öffnen" aria-label="Ordner öffnen" onClick={() => onAction('folder')}><FolderOpen size={16} /></button>
        <button className="btn btn-icon" title="Duplizieren" aria-label="Duplizieren" disabled={locked} onClick={() => onAction('duplicate')}><Copy size={16} /></button>
        <button className="btn btn-icon" title="Exportieren" aria-label="Exportieren" onClick={() => onAction('export')}><Export size={16} /></button>
        <div className="menu-anchor"><button className="btn btn-icon" title="Weitere Optionen" aria-label="Weitere Optionen" aria-expanded={menu} onClick={() => setMenu(open => !open)}><DotsThree size={18} weight="bold" /></button>{menu && <Menu items={actions} onClose={() => setMenu(false)} />}</div>
      </div>
    </nav>

    <header className="profile-hero">
      <button className="hero-icon" title="Profil bearbeiten" onClick={() => onAction('edit')}><ProfileIcon profile={profile} size={78} /><span className="hero-icon-badge"><PencilSimple size={12} /></span></button>
      <div className="hero-copy">
        <h1 className="pixel">{profile.name}</h1>
        <div className="hero-chips">
          <ChipPopover open={chip === 'version'} onToggle={() => setChip(chip === 'version' ? null : 'version')} icon={<GameController size={14} />} text={profile.version} disabled={locked}>
            <VersionPicker profile={profile} onClose={() => setChip(null)} onSave={onSaveProfile} />
          </ChipPopover>
          {profile.loader !== 'vanilla' && <ChipPopover open={chip === 'loader'} onToggle={() => setChip(chip === 'loader' ? null : 'loader')} icon={<Cube size={14} />} text={`${loaderNames[profile.loader]} ${profile.loaderVersion}`} disabled={locked}>
            <LoaderPicker profile={profile} onClose={() => setChip(null)} onSave={onSaveProfile} />
          </ChipPopover>}
          <ChipPopover open={chip === 'group'} onToggle={() => setChip(chip === 'group' ? null : 'group')} icon={<FolderOpen size={14} />} text={profile.group || 'keine gruppe'} disabled={locked}>
            <GroupEditor profile={profile} onClose={() => setChip(null)} onSave={onSaveProfile} />
          </ChipPopover>
          {profile.pack && <button className="hero-chip" onClick={() => onAction('versions')} title="Modpack-Versionen"><Package size={14} /><span>{profile.pack.title}</span><small>{profile.pack.versionNumber}</small><PencilSimple size={11} /></button>}
          {profile.savira && <span className="hero-chip is-static"><Star size={13} weight="fill" />Savira</span>}
        </div>
        <div className="hero-stats">
          <div><Clock size={16} /><span><small>zuletzt gespielt</small><strong>{playedAgo(profile.lastPlayed)}</strong></span></div>
          <div><Hourglass size={16} /><span><small>spielzeit</small><strong>{duration(profile.playTime)}</strong></span></div>
          <div><HardDrives size={16} /><span><small>speicher</small><strong>{size === null ? '…' : bytes(size)}</strong></span></div>
        </div>
      </div>
      <div className="hero-play"><button className="play-button small" disabled={locked} onClick={() => onPlay()}><span className="play-label pixel"><Play size={20} weight="fill" />spielen</span></button><button className="btn btn-icon" title="Profil bearbeiten" aria-label="Profil bearbeiten" disabled={locked} onClick={() => onAction('edit')}><GearSix size={18} /></button></div>
    </header>

    <div className="profile-body">
      <main className="profile-main">
        {CONTENT.some(item => item.id === section) && <ContentSection key={section} profile={profile} kind={section as ContentKind} items={items[section as ContentKind]} locked={locked} onReload={() => load(section as ContentKind)} onBrowse={() => setBrowser(section as ContentKind)} onNotice={onNotice} onError={onError} />}
        {section === 'savira' && <SaviraSection profile={profile} items={items.mods} locked={locked} onSave={onSaveProfile} />}
        {section === 'worlds' && <WorldsSection profile={profile} locked={locked} onPlay={onPlay} onError={onError} />}
        {section === 'screenshots' && <ScreenshotsSection profile={profile} onError={onError} />}
        {section === 'logs' && <LogsSection profile={profile} onError={onError} />}
      </main>
      <aside className="profile-side">
        <p className="side-title pixel">inhalte</p>
        {CONTENT.map(item => <button key={item.id} className={section === item.id ? 'active' : ''} onClick={() => setSection(item.id)}>{item.icon}<span>{item.label}</span>{items[item.id] && <small>{items[item.id]!.length}</small>}</button>)}
        <button className={section === 'savira' ? 'active' : ''} onClick={() => setSection('savira')}><Star size={15} weight="fill" /><span>Savira Client</span></button>
        <p className="side-title pixel">welt</p>
        <button className={section === 'worlds' ? 'active' : ''} onClick={() => setSection('worlds')}><Globe size={15} /><span>Welten</span></button>
        <button className={section === 'screenshots' ? 'active' : ''} onClick={() => setSection('screenshots')}><Camera size={15} /><span>Screenshots</span></button>
        <button className={section === 'logs' ? 'active' : ''} onClick={() => setSection('logs')}><Scroll size={15} /><span>Logs</span></button>
      </aside>
    </div>

    {browser && <ContentBrowser profile={profile} kind={browser} installed={installed} onClose={() => { setBrowser(null); void load(browser); }} onInstalled={(kind, files) => { onNotice(`Installiert: ${files.join(', ')}`); void load(kind); }} />}
  </div>;
}

function ChipPopover({ open, onToggle, icon, text, disabled, children }: { open: boolean; onToggle: () => void; icon: ReactNode; text: string; disabled: boolean; children: ReactNode }) {
  return <div className="menu-anchor">
    <button className={`hero-chip ${open ? 'is-open' : ''}`} aria-expanded={open} disabled={disabled} onClick={onToggle}>{icon}<span>{text}</span><PencilSimple size={11} /></button>
    {open && <div className="popover glass" onMouseDown={event => event.stopPropagation()}>{children}</div>}
  </div>;
}
function useOutside(onClose: () => void) {
  useEffect(() => {
    const close = (event: MouseEvent | KeyboardEvent) => { if (event instanceof KeyboardEvent ? event.key === 'Escape' : !(event.target as HTMLElement).closest('.popover, .hero-chip')) onClose(); };
    window.addEventListener('mousedown', close); window.addEventListener('keydown', close);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', close); };
  }, [onClose]);
}

// Changing the Minecraft version takes the recommended build of the profile's loader for it.
function VersionPicker({ profile, onClose, onSave }: { profile: GameProfile; onClose: () => void; onSave: (profile: GameProfile, notice: string) => Promise<void> }) {
  useOutside(onClose);
  const [versions, setVersions] = useState<MinecraftVersion[] | null>(null);
  const [channel, setChannel] = useState<'release' | 'snapshot'>('release');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { unwrap(profilesApi.minecraftVersions()).then(setVersions, e => setError(message(e))); }, []);
  async function pick(version: string) {
    if (version === profile.version) return onClose();
    setError('');
    try {
      let loaderVersion = profile.loaderVersion;
      if (profile.loader !== 'vanilla') {
        const builds = await unwrap(profilesApi.loaderVersions(profile.loader, version));
        loaderVersion = (builds.find(item => item.stable) || builds[0])?.version ?? null;
        if (!loaderVersion) throw new Error(`${loaderNames[profile.loader]} gibt es nicht für Minecraft ${version}.`);
      }
      const savira = profile.savira && saviraAvailable(version, profile.loader);
      await onSave({ ...profile, version, loaderVersion, savira }, `Minecraft ${version}${profile.savira && !savira ? ' (ohne Savira-Funktionen)' : ''}. Prüfe, ob deine Mods dazu passen.`);
      onClose();
    } catch (e) { setError(message(e)); }
  }
  const shown = (versions || []).filter(item => item.type === channel && item.id.includes(query.trim()));
  return <>
    <label className="search glass small"><MagnifyingGlass size={13} /><input autoFocus placeholder="Versionen suchen …" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <div className="segmented small"><button className={channel === 'release' ? 'active' : ''} onClick={() => setChannel('release')}>Releases</button><button className={channel === 'snapshot' ? 'active' : ''} onClick={() => setChannel('snapshot')}><Flask size={11} />Snapshots</button></div>
    {error && <p className="popover-error">{error}</p>}
    <div className="popover-list">{shown.slice(0, 150).map(item => <button key={item.id} className={item.id === profile.version ? 'active' : ''} onClick={() => pick(item.id)}>{item.id}{item.id === profile.version && <Check size={12} weight="bold" />}</button>)}{!versions && !error && <p>lädt …</p>}</div>
  </>;
}
function LoaderPicker({ profile, onClose, onSave }: { profile: GameProfile; onClose: () => void; onSave: (profile: GameProfile, notice: string) => Promise<void> }) {
  useOutside(onClose);
  const [builds, setBuilds] = useState<{ version: string; stable: boolean }[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { if (profile.loader !== 'vanilla') unwrap(profilesApi.loaderVersions(profile.loader, profile.version)).then(setBuilds, e => setError(message(e))); }, [profile.loader, profile.version]);
  async function pick(version: string) {
    if (version !== profile.loaderVersion) await onSave({ ...profile, loaderVersion: version }, `${loaderNames[profile.loader]} ${version}.`).catch(e => setError(message(e)));
    onClose();
  }
  return <>
    <p className="popover-title pixel">{loaderNames[profile.loader]}-versionen</p>
    {error && <p className="popover-error">{error}</p>}
    <div className="popover-list">{builds?.map(item => <button key={item.version} className={item.version === profile.loaderVersion ? 'active' : ''} onClick={() => pick(item.version)}>{item.version}{item.stable && <small>stabil</small>}{item.version === profile.loaderVersion && <Check size={12} weight="bold" />}</button>)}{!builds && !error && <p>lädt …</p>}</div>
  </>;
}
function GroupEditor({ profile, onClose, onSave }: { profile: GameProfile; onClose: () => void; onSave: (profile: GameProfile, notice: string) => Promise<void> }) {
  useOutside(onClose);
  const [group, setGroup] = useState(profile.group);
  const save = () => { void onSave({ ...profile, group: group.trim() }, group.trim() ? `Gruppe: ${group.trim()}.` : 'Gruppe entfernt.').then(onClose); };
  return <form onSubmit={event => { event.preventDefault(); save(); }}>
    <input className="input" autoFocus maxLength={24} placeholder="Gruppe" value={group} onChange={event => setGroup(event.target.value)} />
    <div className="popover-actions"><button type="button" className="btn pixel" onClick={onClose}>abbrechen</button><button className="btn btn-accent pixel">speichern</button></div>
  </form>;
}

function ContentSection({ profile, kind, items, locked, onReload, onBrowse, onNotice, onError }: { profile: GameProfile; kind: ContentKind; items: ContentItem[] | undefined; locked: boolean; onReload: () => Promise<void>; onBrowse: () => void; onNotice: (text: string) => void; onError: (text: string) => void }) {
  const info = CONTENT.find(item => item.id === kind)!;
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'name' | 'enabled' | 'updates'>('name');
  const [menu, setMenu] = useState<string | null>(null);
  const [working, setWorking] = useState<Set<string>>(new Set());
  const mark = (file: string, on: boolean) => setWorking(current => { const next = new Set(current); if (on) next.add(file); else next.delete(file); return next; });
  const run = async (file: string, work: () => Promise<unknown>) => { mark(file, true); try { await work(); await onReload(); } catch (e) { onError(message(e)); } finally { mark(file, false); } };
  const updates = items?.filter(item => item.update) || [];
  const shown = (items || []).filter(item => `${item.name} ${item.file}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => sort === 'enabled' ? Number(b.enabled) - Number(a.enabled) : sort === 'updates' ? Number(Boolean(b.update)) - Number(Boolean(a.update)) : 0);

  async function updateAll() {
    for (const item of updates) { mark(item.file, true); try { await unwrap(profilesApi.update(profile.id, kind, item.file)); } catch (e) { onError(`${item.name}: ${message(e)}`); } mark(item.file, false); }
    await onReload(); onNotice(`${updates.length} ${info.noun} aktualisiert.`);
  }
  return <>
    <div className="content-toolbar">
      <label className="search glass"><MagnifyingGlass size={15} /><input aria-label={`${info.noun} durchsuchen`} placeholder={`${info.noun} durchsuchen …`} value={query} onChange={event => setQuery(event.target.value)} /></label>
      <select className="input sort-select" aria-label="Sortierung" value={sort} onChange={event => setSort(event.target.value as typeof sort)}><option value="name">Name</option><option value="enabled">Aktive zuerst</option><option value="updates">Updates zuerst</option></select>
      <div className="toolbar-right">
        <button className="btn btn-icon" title="Neu laden" aria-label="Neu laden" onClick={() => void onReload()}><ArrowClockwise size={15} /></button>
        {updates.length > 0 && <button className="btn pixel" disabled={locked} onClick={updateAll}><DownloadSimple size={14} />alle aktualisieren ({updates.length})</button>}
        <button className="btn btn-icon" title="Datei hinzufügen" aria-label="Datei hinzufügen" disabled={locked} onClick={() => unwrap(profilesApi.addFiles(profile.id, kind)).then(count => { if (count) { onNotice(`${count} Datei(en) hinzugefügt.`); void onReload(); } }, e => onError(message(e)))}><FilePlus size={15} /></button>
        <button className="btn btn-icon" title="Ordner öffnen" aria-label="Ordner öffnen" onClick={() => unwrap(profilesApi.folder(profile.id, kind)).catch(e => onError(message(e)))}><FolderOpen size={15} /></button>
        <button className="btn btn-accent pixel" disabled={locked} onClick={onBrowse}><Plus size={14} weight="bold" />{info.noun} hinzufügen</button>
      </div>
    </div>
    {kind === 'datapacks' && <p className="content-hint">Datenpakete liegen im Profil unter datapacks. Minecraft lädt sie pro Welt: Beim Erstellen einer Welt unter „Datenpakete“ den Ordner öffnen und sie hineinziehen.</p>}
    {kind === 'shaderpacks' && profile.loader === 'vanilla' && <p className="content-hint">Shader brauchen einen Mod wie Iris (Fabric/Quilt) oder Oculus (Forge). Mit Vanilla laufen sie nicht.</p>}
    {!items && <p className="wizard-loading">{info.noun} werden gelesen …</p>}
    {items && !items.length && <div className="content-empty"><span>{info.icon}</span><strong>Noch keine {info.noun.toLowerCase()}</strong><small>Klicke auf „{info.noun} hinzufügen“, um welche von Modrinth zu installieren.</small></div>}
    <div className="content-grid">{shown.map(item => {
      const busy = working.has(item.file);
      const itemMenu: MenuItem[] = [
        ...(item.update ? [{ label: `Auf ${item.update.versionNumber} aktualisieren`, icon: <DownloadSimple size={15} />, onClick: () => void run(item.file, () => unwrap(profilesApi.update(profile.id, kind, item.file))), disabled: locked }] : []),
        ...(item.modrinth ? [{ label: 'Auf Modrinth ansehen', icon: <ArrowSquareOut size={15} />, onClick: () => void profilesApi.openProject(item.modrinth!.type, item.modrinth!.slug) }] : []),
        { label: 'Löschen', icon: <Trash size={15} />, danger: true, disabled: locked || item.managed, hint: item.managed ? 'Savira legt diese Datei bei jedem Start selbst an.' : undefined, onClick: () => void run(item.file, () => unwrap(profilesApi.remove(profile.id, kind, item.file))) },
      ];
      return <article key={item.file} className={`content-item ${item.enabled ? '' : 'is-off'} ${busy ? 'is-busy' : ''}`}>
        {item.icon ? <img src={item.icon} alt="" loading="lazy" /> : <span className="content-icon-empty">{info.icon}</span>}
        <div className="content-copy">
          <h3>{item.name}{item.managed && <span className="tag" title="Kommt mit den Savira-Funktionen">savira</span>}</h3>
          <p>{item.version || item.description || item.file}{item.update && <button className="update-badge" disabled={locked || busy} title={`Update auf ${item.update.versionNumber}`} onClick={() => void run(item.file, () => unwrap(profilesApi.update(profile.id, kind, item.file)))}><DownloadSimple size={11} />{item.update.versionNumber}</button>}</p>
        </div>
        {!item.folder && <button type="button" className={`toggle ${item.enabled ? 'on' : ''}`} role="switch" aria-checked={item.enabled} aria-label={`${item.name} ${item.enabled ? 'ausschalten' : 'einschalten'}`} disabled={locked || busy || item.managed} onClick={() => void run(item.file, () => unwrap(profilesApi.toggle(profile.id, kind, item.file, !item.enabled)))}><span /></button>}
        <div className="menu-anchor"><button className="btn btn-icon" aria-label={`Mehr zu ${item.name}`} onClick={() => setMenu(current => current === item.file ? null : item.file)}><DotsThree size={16} weight="bold" /></button>{menu === item.file && <Menu items={itemMenu} onClose={() => setMenu(null)} />}</div>
      </article>;
    })}</div>
  </>;
}

function SaviraSection({ profile, items, locked, onSave }: { profile: GameProfile; items: ContentItem[] | undefined; locked: boolean; onSave: (profile: GameProfile, notice: string) => Promise<void> }) {
  const available = saviraAvailable(profile.version, profile.loader);
  return <div className="savira-section">
    <div className="savira-card glass">
      <Star size={28} weight="fill" />
      <div><h2 className="pixel">Savira-Client-Funktionen</h2><p>HUD, Rechts-Shift-Mod-Menü, eigene Capes, Icons und Nametags im Spiel. Savira legt dafür bei jedem Start den Savira-Mod und die Fabric API in den mods-Ordner.</p></div>
      {available ? <button type="button" className={`toggle ${profile.savira ? 'on' : ''}`} role="switch" aria-checked={profile.savira} aria-label="Savira-Funktionen" disabled={locked} onClick={() => void onSave({ ...profile, savira: !profile.savira }, profile.savira ? 'Savira-Funktionen aus.' : 'Savira-Funktionen an.')}><span /></button>
        : <p className="content-hint">Gibt es zurzeit nur für Fabric 1.21.1. Dieses Profil nutzt {loaderNames[profile.loader]} {profile.version}.</p>}
    </div>
    {profile.savira && <div className="content-grid">{(items || []).filter(item => item.managed).map(item => <article key={item.file} className="content-item">
      {item.icon ? <img src={item.icon} alt="" /> : <span className="content-icon-empty"><Star size={16} weight="fill" /></span>}
      <div className="content-copy"><h3>{item.name}</h3><p>{item.version || item.file}</p></div>
    </article>)}</div>}
  </div>;
}

function WorldsSection({ profile, locked, onPlay, onError }: { profile: GameProfile; locked: boolean; onPlay: (target: { world: string } | { server: string }) => void; onError: (text: string) => void }) {
  const [data, setData] = useState<{ worlds: World[]; servers: Server[] } | null>(null);
  const [query, setQuery] = useState('');
  const load = useCallback(() => { setData(null); unwrap(profilesApi.worlds(profile.id)).then(setData, e => { onError(message(e)); setData({ worlds: [], servers: [] }); }); }, [profile.id, onError]);
  useEffect(load, [load]);
  const match = (text: string) => text.toLowerCase().includes(query.trim().toLowerCase());
  return <>
    <div className="content-toolbar">
      <label className="search glass"><MagnifyingGlass size={15} /><input aria-label="Welten durchsuchen" placeholder="Welten und Server durchsuchen …" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className="toolbar-right"><button className="btn btn-icon" title="Neu laden" aria-label="Neu laden" onClick={load}><ArrowClockwise size={15} /></button><button className="btn pixel" onClick={() => unwrap(profilesApi.folder(profile.id, 'worlds')).catch(e => onError(message(e)))}><FolderOpen size={14} />welten-ordner</button></div>
    </div>
    {!data && <p className="wizard-loading">Welten werden gelesen …</p>}
    {data && !data.worlds.length && !data.servers.length && <div className="content-empty"><span><Tree size={18} /></span><strong>Noch keine Welten</strong><small>Starte das Profil und erstelle eine Welt oder füge einen Server hinzu.</small></div>}
    <div className="world-list">
      {data?.worlds.filter(world => match(world.name)).map(world => <article key={world.folder} className="world">
        {world.icon ? <img src={world.icon} alt="" /> : <span className="world-icon-empty"><Tree size={20} /></span>}
        <div><h3>{world.name}</h3><p>{[world.mode, world.version].filter(Boolean).join(' · ')}</p><small><Clock size={11} />{playedAgo(world.lastPlayed)}</small></div>
        <button className="btn btn-accent pixel" disabled={locked} onClick={() => onPlay({ world: world.folder })}><Play size={13} weight="fill" />spielen</button>
      </article>)}
      {data?.servers.filter(server => match(`${server.name} ${server.address}`)).map(server => <article key={server.address + server.name} className="world">
        {server.icon ? <img src={server.icon} alt="" /> : <span className="world-icon-empty"><HardDrives size={20} /></span>}
        <div><h3>{server.name}</h3><p>{server.address}</p><small>Server</small></div>
        <button className="btn btn-accent pixel" disabled={locked} onClick={() => onPlay({ server: server.address })}><ArrowSquareOut size={13} />beitreten</button>
      </article>)}
    </div>
  </>;
}

function ScreenshotsSection({ profile, onError }: { profile: GameProfile; onError: (text: string) => void }) {
  const [shots, setShots] = useState<Screenshot[] | null>(null);
  const [newest, setNewest] = useState(true);
  const load = useCallback(() => { setShots(null); unwrap(profilesApi.screenshots(profile.id)).then(setShots, e => { onError(message(e)); setShots([]); }); }, [profile.id, onError]);
  useEffect(load, [load]);
  const shown = [...(shots || [])].sort((a, b) => newest ? b.time - a.time : a.time - b.time);
  return <>
    <div className="content-toolbar">
      <select className="input sort-select" aria-label="Sortierung" value={newest ? 'new' : 'old'} onChange={event => setNewest(event.target.value === 'new')}><option value="new">Neueste zuerst</option><option value="old">Älteste zuerst</option></select>
      <div className="toolbar-right"><span className="count">{shots?.length ?? 0} Screenshots</span><button className="btn btn-icon" title="Neu laden" aria-label="Neu laden" onClick={load}><ArrowClockwise size={15} /></button><button className="btn btn-icon" title="Ordner öffnen" aria-label="Ordner öffnen" onClick={() => unwrap(profilesApi.folder(profile.id, 'screenshots')).catch(e => onError(message(e)))}><FolderOpen size={15} /></button></div>
    </div>
    {!shots && <p className="wizard-loading">Screenshots werden geladen …</p>}
    {shots && !shots.length && <div className="content-empty"><span><Camera size={18} /></span><strong>Noch keine Screenshots</strong><small>Drücke F2 im Spiel für einen Screenshot.</small></div>}
    <div className="shot-grid">{shown.map(shot => <figure key={shot.file} className="shot">
      <button className="shot-image" title="Öffnen" onClick={() => unwrap(profilesApi.openScreenshot(profile.id, shot.file)).catch(e => onError(message(e)))}>{shot.thumbnail ? <img src={shot.thumbnail} alt={shot.file} loading="lazy" /> : <Camera size={22} />}</button>
      <figcaption><span>{new Date(shot.time).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</span>
        <button className="btn btn-icon" title="Im Ordner zeigen" aria-label="Im Ordner zeigen" onClick={() => unwrap(profilesApi.openScreenshot(profile.id, shot.file, true)).catch(e => onError(message(e)))}><FolderOpen size={13} /></button>
        <button className="btn btn-icon" title="In den Papierkorb" aria-label="In den Papierkorb" onClick={() => unwrap(profilesApi.deleteScreenshot(profile.id, shot.file)).then(load, e => onError(message(e)))}><Trash size={13} /></button>
      </figcaption>
    </figure>)}</div>
  </>;
}

function LogsSection({ profile, onError }: { profile: GameProfile; onError: (text: string) => void }) {
  const [files, setFiles] = useState<LogFile[] | null>(null);
  const [current, setCurrent] = useState<LogFile | null>(null);
  const [text, setText] = useState('');
  const [filter, setFilter] = useState('');
  useEffect(() => {
    Promise.all([unwrap(debugApi.list('minecraft')), unwrap(debugApi.list('crash'))]).then(([logs, crashes]) => {
      const mine = [...logs, ...crashes].filter(file => file.instance === profile.id).sort((a, b) => b.modified - a.modified);
      setFiles(mine);
      setCurrent(mine.find(file => file.name === 'latest.log') || mine[0] || null);
    }, e => { onError(message(e)); setFiles([]); });
  }, [profile.id, onError]);
  useEffect(() => { if (current) unwrap(debugApi.read(current.path)).then(setText, e => setText(message(e))); else setText(''); }, [current]);
  const lines = useMemo(() => text.split(/\r?\n/).slice(-3000).filter(line => !filter || line.toLowerCase().includes(filter.toLowerCase())), [text, filter]);
  return <>
    <div className="content-toolbar">
      <select className="input log-select" aria-label="Log-Datei" value={current?.path ?? ''} onChange={event => setCurrent(files?.find(file => file.path === event.target.value) || null)}>
        {files?.map(file => <option key={file.path} value={file.path}>{file.name} · {new Date(file.modified).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</option>)}
      </select>
      <label className="search glass"><MagnifyingGlass size={15} /><input aria-label="Log filtern" placeholder="Zeilen filtern …" value={filter} onChange={event => setFilter(event.target.value)} /></label>
      <div className="toolbar-right">
        <button className="btn btn-icon" title="Kopieren" aria-label="Log kopieren" disabled={!text} onClick={() => void navigator.clipboard.writeText(text)}><Copy size={15} /></button>
        {current && <button className="btn btn-icon" title="Öffnen" aria-label="Log öffnen" onClick={() => unwrap(debugApi.open(current.path)).catch(e => onError(message(e)))}><ArrowSquareOut size={15} /></button>}
        <button className="btn btn-icon" title="Ordner öffnen" aria-label="Ordner öffnen" onClick={() => unwrap(profilesApi.folder(profile.id, 'logs')).catch(e => onError(message(e)))}><FolderOpen size={15} /></button>
      </div>
    </div>
    {files && !files.length && <div className="content-empty"><span><Scroll size={18} /></span><strong>Noch keine Logs</strong><small>Logs entstehen, sobald das Profil einmal gestartet wurde.</small></div>}
    {current && <pre className="log-view">{lines.map((line, index) => <span key={index} className={/\b(ERROR|FATAL)\b|Exception/.test(line) ? 'is-error' : /\bWARN\b/.test(line) ? 'is-warn' : ''}>{line}{'\n'}</span>)}</pre>}
  </>;
}
