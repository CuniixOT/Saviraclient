import { ArrowClockwise, ArrowSquareOut, CalendarBlank, CaretDown, CaretRight, Check, DownloadSimple, Heart, Info, MagnifyingGlass, Plus, Sparkle, Trash, X } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { profilesApi, unwrap, type BrowseKind, type BrowseTags, type ContentKind, type GameProfile, type ProjectInfo, type SearchHit, type SearchOptions, type Settings } from './api';
import { Dialog, Menu } from './ProfileDialogs';
import { ProfileWizard } from './ProfileWizard';
import { loaderLabel, playedAgo, ProfileIcon } from './profileUi';
import { ProjectView } from './ProjectView';
import { Select, type SelectOption } from './Select';
import { SourceToggle } from './SourceLogo';

const TABS: { id: BrowseKind; label: string }[] = [{ id: 'modpacks', label: 'Modpacks' }, { id: 'mods', label: 'Mods' }, { id: 'resourcepacks', label: 'Resourcepacks' }, { id: 'shaderpacks', label: 'Shaders' }, { id: 'datapacks', label: 'Datapacks' }];
type Sort = NonNullable<SearchOptions['sort']>;
const SORTS: SelectOption<Sort>[] = [
  { value: 'relevance', label: 'Relevanz', icon: <Sparkle size={14} /> },
  { value: 'downloads', label: 'Downloads', icon: <DownloadSimple size={14} /> },
  { value: 'follows', label: 'Beliebt', icon: <Heart size={14} /> },
  { value: 'newest', label: 'Neueste', icon: <CalendarBlank size={14} /> },
  { value: 'updated', label: 'Aktualisiert', icon: <ArrowClockwise size={14} /> },
];
const compact = new Intl.NumberFormat('de-DE');
const message = (error: unknown) => error instanceof Error ? error.message : 'Das hat nicht geklappt.';
const label = (value: string) => value.replaceAll('-', ' ');

type Props = {
  /** In a profile (drawer): installs go straight into it. Without one (Mods page) a dialog asks where. */
  profile: GameProfile | null;
  kind: BrowseKind;
  mode: 'drawer' | 'page';
  /** Modrinth project ids already in the profile. */
  installed?: Set<string>;
  onClose?: () => void;
  onInstalled?: (kind: ContentKind, files: string[]) => void;
  /** Mods page only: all profiles, for the install dialog and new profiles. */
  settings?: Settings;
  maxMemory?: number;
  onSaveSettings?: (settings: Settings, notice: string) => Promise<void>;
  onSettings?: (settings: Settings, notice: string) => void;
  onNotice?: (text: string) => void;
};

/** Mods, packs, shaders and modpacks from Modrinth, filtered by version, loader, category and side. */
export function ContentBrowser(props: Props) {
  const { profile, mode, installed = new Set<string>(), onClose } = props;
  const tabs = mode === 'drawer' ? TABS.filter(tab => tab.id !== 'modpacks') : TABS;
  const [kind, setKind] = useState<BrowseKind>(props.kind);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const defaultLoaders = useCallback((next: BrowseKind) => profile && next === 'mods' && profile.loader !== 'vanilla' ? (profile.loader === 'quilt' ? ['quilt', 'fabric'] : [profile.loader]) : [], [profile]);
  const [versions, setVersions] = useState<string[]>(profile ? [profile.version] : []);
  const [loaders, setLoaders] = useState<string[]>(defaultLoaders(props.kind));
  const [categories, setCategories] = useState<string[]>([]);
  const [environment, setEnvironment] = useState<'client' | 'server' | null>(null);
  const [sort, setSort] = useState<Sort>('relevance');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tags, setTags] = useState<BrowseTags | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({ versions: true, loaders: true });
  const [versionQuery, setVersionQuery] = useState('');
  const [allVersions, setAllVersions] = useState(false);
  const [busy, setBusy] = useState<Record<string, 'installing' | 'done'>>({});
  const [menu, setMenu] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [target, setTarget] = useState<{ project: Pick<ProjectInfo, 'id' | 'title'>; kind: ContentKind; versionId?: string } | null>(null);
  const request = useRef(0);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode !== 'drawer') return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !menu && !target) { if (detail) setDetail(null); else onClose?.(); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [mode, onClose, menu, detail, target]);
  useEffect(() => { const timer = setTimeout(() => setDebounced(query.trim()), 300); return () => clearTimeout(timer); }, [query]);
  useEffect(() => { setTags(null); unwrap(profilesApi.tags(kind)).then(setTags, () => setTags({ categories: [], versions: [], loaders: [] })); }, [kind]);

  const search = async (offset: number) => {
    const id = ++request.current;
    setLoading(true); setError('');
    try {
      const result = await unwrap(profilesApi.search({ kind, query: debounced, versions, loaders, categories, environment, sort, offset }));
      if (id !== request.current) return;
      setTotal(result.total);
      setHits(current => offset ? [...current, ...result.hits] : result.hits);
    } catch (e) { if (id === request.current) setError(message(e)); }
    finally { if (id === request.current) setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void search(0); list.current?.scrollTo({ top: 0 }); }, [kind, debounced, versions, loaders, categories, environment, sort]);

  function switchKind(next: BrowseKind) {
    setKind(next); setHits([]); setCategories([]); setLoaders(defaultLoaders(next)); setMenu(null); setDetail(null);
  }
  const toggleIn = (values: string[], value: string) => values.includes(value) ? values.filter(item => item !== value) : [...values, value];
  const shownVersions = useMemo(() => (tags?.versions || []).filter(item => (allVersions || item.type === 'release') && item.id.includes(versionQuery.trim())).slice(0, 80), [tags, allVersions, versionQuery]);
  const chips = [...versions.map(value => ({ value, clear: () => setVersions(versions.filter(item => item !== value)) })), ...loaders.map(value => ({ value: label(value), clear: () => setLoaders(loaders.filter(item => item !== value)) })), ...categories.map(value => ({ value: label(value), clear: () => setCategories(categories.filter(item => item !== value)) })), ...(environment ? [{ value: environment === 'client' ? 'Client' : 'Server', clear: () => setEnvironment(null) }] : [])];

  // One place for all installs: into the open profile, as a new modpack profile, or via the profile dialog.
  async function install(project: Pick<ProjectInfo, 'id' | 'title'>, versionId?: string) {
    if (kind === 'modpacks') {
      setBusy(current => ({ ...current, [project.id]: 'installing' }));
      try {
        const next = await unwrap(profilesApi.installPack(project.id, versionId));
        setBusy(current => ({ ...current, [project.id]: 'done' }));
        props.onSettings?.(next, `Modpack „${project.title}“ ist als neues Profil bereit.`);
      } catch (e) { setBusy(current => { const next = { ...current }; delete next[project.id]; return next; }); throw e; }
      return;
    }
    if (!profile) { setTarget({ project, kind: kind as ContentKind, versionId }); return; }
    setBusy(current => ({ ...current, [project.id]: 'installing' }));
    try {
      const files = await unwrap(profilesApi.install(profile.id, kind as ContentKind, project.id, versionId));
      setBusy(current => ({ ...current, [project.id]: 'done' }));
      props.onInstalled?.(kind as ContentKind, files);
    } catch (e) { setBusy(current => { const next = { ...current }; delete next[project.id]; return next; }); throw e; }
  }
  const onScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (!loading && hits.length < total && element.scrollTop + element.clientHeight > element.scrollHeight - 300) void search(hits.length);
  };

  const section = (id: string, title: string, body: ReactNode) => <div className="filter-section">
    <button className="filter-head pixel" aria-expanded={Boolean(open[id])} onClick={() => setOpen(current => ({ ...current, [id]: !current[id] }))}>{title}{open[id] ? <CaretDown size={13} weight="fill" /> : <CaretRight size={13} weight="fill" />}</button>
    {open[id] && <div className="filter-body">{body}</div>}
  </div>;
  const option = (active: boolean, text: string, onClick: () => void) => <button key={text} className={`filter-option ${active ? 'active' : ''}`} aria-pressed={active} onClick={onClick}><span>{text}</span>{active && <Check size={12} weight="bold" />}</button>;
  const kindLabel = tabs.find(tab => tab.id === kind)?.label;

  const body = <div className="drawer-main">
    <div className="drawer-content">
      <div className="segmented drawer-tabs" role="tablist">{tabs.map(tab => <button key={tab.id} role="tab" aria-selected={kind === tab.id} className={kind === tab.id ? 'active' : ''} onClick={() => switchKind(tab.id)}>{tab.label}</button>)}</div>
      {detail ? <ProjectView projectId={detail} installed={installed.has(detail) || busy[detail] === 'done'} filter={profile ? { gameVersion: profile.version, loader: profile.loader === 'vanilla' ? undefined : profile.loader } : undefined} onBack={() => setDetail(null)} onInstall={(project, versionId) => install(project, versionId)} /> : <>
        <div className="drawer-search">
          <label className="search glass"><MagnifyingGlass size={16} /><input autoFocus aria-label={`${kindLabel} durchsuchen`} placeholder={`${kindLabel} durchsuchen …`} value={query} onChange={event => setQuery(event.target.value)} /></label>
          <Select label="Sortierung" value={sort} onChange={setSort} options={SORTS} width={170} />
          <SourceToggle />
        </div>
        {chips.length > 0 && <div className="filter-chips"><button className="chip-clear" onClick={() => { setVersions([]); setLoaders([]); setCategories([]); setEnvironment(null); }}><Trash size={12} />Alle löschen</button>{chips.map(chip => <button key={chip.value} className="filter-chip" onClick={chip.clear}>{chip.value}<X size={11} weight="bold" /></button>)}</div>}
        {error && <p className="wizard-error" role="alert">{error}</p>}
        <div className="result-list" ref={list} onScroll={onScroll}>
          {hits.map(hit => {
            const state = installed.has(hit.id) ? 'done' : busy[hit.id];
            return <article className="result" key={hit.id} onClick={event => { if (!(event.target as HTMLElement).closest('button, .menu')) setDetail(hit.id); }}>
              {hit.icon ? <img src={hit.icon} alt="" loading="lazy" /> : <span className="result-icon-empty" />}
              <div className="result-copy">
                <h3><button className="result-title" onClick={() => setDetail(hit.id)}>{hit.title}</button><small>von {hit.author}</small></h3>
                <p>{hit.description}</p>
                <div className="result-tags">{state === 'done' && <span className="tag">installiert</span>}{hit.categories.slice(0, 5).map(item => <span key={item}>{label(item)}</span>)}</div>
              </div>
              <div className="result-side">
                <small><DownloadSimple size={12} />{compact.format(hit.downloads)}</small>
                <div className="result-actions split-button">
                  <button className={`btn pixel ${state === 'done' && profile ? '' : 'btn-accent'}`} disabled={Boolean(state) && (Boolean(profile) || kind === 'modpacks')} onClick={() => install(hit).catch(e => setError(`${hit.title}: ${message(e)}`))}>{state === 'done' && (profile || kind === 'modpacks') ? <><Check size={14} weight="bold" />installiert</> : state === 'installing' ? 'lädt …' : <><DownloadSimple size={14} />install</>}</button>
                  <div className="menu-anchor"><button className="btn btn-accent btn-icon" aria-label={`Mehr zu ${hit.title}`} onClick={() => setMenu(current => current === hit.id ? null : hit.id)}><CaretDown size={14} weight="bold" /></button>
                    {menu === hit.id && <Menu onClose={() => setMenu(null)} items={[{ label: 'Infos und alle Versionen', icon: <Info size={15} />, onClick: () => setDetail(hit.id) }, { label: 'Auf Modrinth öffnen', icon: <ArrowSquareOut size={15} />, onClick: () => void profilesApi.openProject(hit.type, hit.slug) }]} />}</div>
                </div>
              </div>
            </article>;
          })}
          {loading && <p className="wizard-loading">Wird gesucht …</p>}
          {!loading && !hits.length && !error && <p className="wizard-loading">Nichts gefunden. Ändere die Suche oder entferne Filter.</p>}
        </div>
      </>}
    </div>
    {!detail && <div className="drawer-filters">
      {section('versions', 'Spielversionen', <>
        <label className="search glass small"><MagnifyingGlass size={13} /><input aria-label="Version suchen" placeholder="Version suchen …" value={versionQuery} onChange={event => setVersionQuery(event.target.value)} /></label>
        <div className="filter-scroll">{shownVersions.map(item => option(versions.includes(item.id), item.id, () => setVersions(toggleIn(versions, item.id))))}</div>
        <label className="check small"><input type="checkbox" checked={allVersions} onChange={event => setAllVersions(event.target.checked)} /><span className="check-box"><Check size={11} weight="bold" /></span><span><strong className="pixel">alle versionen anzeigen</strong></span></label>
      </>)}
      {(kind === 'mods' || kind === 'shaderpacks' || kind === 'modpacks') && section('loaders', kind === 'shaderpacks' ? 'Shader-Loader' : 'Mod-Loader', <div className="filter-scroll">{(tags?.loaders || []).map(item => option(loaders.includes(item), label(item), () => setLoaders(toggleIn(loaders, item))))}</div>)}
      {section('categories', 'Kategorien', <div className="filter-scroll">{(tags?.categories || []).map(item => option(categories.includes(item), label(item), () => setCategories(toggleIn(categories, item))))}</div>)}
      {kind === 'mods' && section('environment', 'Umgebung', <>{option(environment === 'client', 'Client', () => setEnvironment(environment === 'client' ? null : 'client'))}{option(environment === 'server', 'Server', () => setEnvironment(environment === 'server' ? null : 'server'))}</>)}
    </div>}
    {target && props.settings && <InstallDialog target={target} settings={props.settings} maxMemory={props.maxMemory ?? 8} onClose={() => setTarget(null)} onSaveSettings={props.onSaveSettings} onSettings={props.onSettings} onNotice={props.onNotice} />}
  </div>;

  if (mode === 'page') return <div className="browse-page page-enter">{body}</div>;
  return createPortal(<div className="drawer-backdrop" onMouseDown={() => onClose?.()}>
    <aside className="drawer glass" role="dialog" aria-modal="true" aria-label="Inhalte hinzufügen" onMouseDown={event => event.stopPropagation()}>
      <header className="drawer-head"><p className="pixel"><DownloadSimple size={14} />inhalte hinzufügen <span>/ {profile?.name}</span></p><button className="btn btn-icon" aria-label="Schließen (Esc)" title="Schließen (Esc)" onClick={onClose}><X size={16} /></button></header>
      {body}
    </aside>
  </div>, document.body);
}

/** "Installieren: X" from the Mods page: every profile, whether it has it, can run it, or not. */
function InstallDialog({ target, settings, maxMemory, onClose, onSaveSettings, onSettings, onNotice }: { target: { project: Pick<ProjectInfo, 'id' | 'title'>; kind: ContentKind; versionId?: string }; settings: Settings; maxMemory: number; onClose: () => void; onSaveSettings?: (settings: Settings, notice: string) => Promise<void>; onSettings?: (settings: Settings, notice: string) => void; onNotice?: (text: string) => void }) {
  const [status, setStatus] = useState<Record<string, { installed: boolean; compatible: boolean }> | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const load = useCallback(() => unwrap(profilesApi.where(target.project.id, target.kind)).then(list => setStatus(Object.fromEntries(list.map(item => [item.id, item]))), e => setError(message(e))), [target]);
  useEffect(() => { void load(); }, [load, settings.profiles.length]);
  async function installInto(profile: GameProfile) {
    setWorking(profile.id); setError('');
    try {
      const files = await unwrap(profilesApi.install(profile.id, target.kind, target.project.id, target.versionId));
      setStatus(current => ({ ...current, [profile.id]: { installed: true, compatible: true } }));
      onNotice?.(`${target.project.title} in „${profile.name}“ installiert (${files.length} Datei${files.length === 1 ? '' : 'en'}).`);
    } catch (e) { setError(`${profile.name}: ${message(e)}`); } finally { setWorking(null); }
  }
  const profiles = [...settings.profiles].sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0)).filter(profile => profile.name.toLowerCase().includes(query.trim().toLowerCase()));
  return <>
    <Dialog title={`Installieren: ${target.project.title}`} onClose={onClose}>
      <div className="install-head">
        <label className="search glass"><MagnifyingGlass size={15} /><input autoFocus placeholder="Profile suchen …" value={query} onChange={event => setQuery(event.target.value)} /></label>
        {onSaveSettings && <button className="btn pixel" onClick={() => setCreating(true)}><Plus size={14} weight="bold" />neues profil</button>}
      </div>
      {error && <p className="wizard-error" role="alert">{error}</p>}
      <ul className="install-list">{profiles.map(profile => {
        const state = status?.[profile.id];
        return <li key={profile.id}>
          <ProfileIcon profile={profile} size={46} />
          <div><strong>{profile.name}</strong><small>{profile.version} · {loaderLabel(profile)} · {playedAgo(profile.lastPlayed)}</small></div>
          {!state ? <span className="install-state">prüft …</span>
            : state.installed ? <span className="install-state is-done"><Check size={13} weight="bold" />installiert</span>
            : state.compatible || target.versionId ? <button className="btn pixel" disabled={Boolean(working)} onClick={() => installInto(profile)}><DownloadSimple size={13} />{working === profile.id ? 'lädt …' : 'installieren'}</button>
            : <span className="install-state is-off" title={`Keine Version für ${profile.version}${profile.loader === 'vanilla' ? '' : ` mit ${profile.loader}`}`}>nicht kompatibel</span>}
        </li>;
      })}</ul>
    </Dialog>
    {creating && onSaveSettings && <ProfileWizard settings={settings} maxMemory={maxMemory} editing={null} onClose={() => setCreating(false)}
      onSave={async profile => { await onSaveSettings({ ...settings, profiles: [...settings.profiles, profile] }, `Profil „${profile.name}“ erstellt.`); setCreating(false); }}
      onImport={async () => { const next = await unwrap(profilesApi.importPack()); if (next) { onSettings?.(next, 'Modpack ist als neues Profil bereit.'); setCreating(false); } }} />}
  </>;
}
