import { CaretDown, CaretRight, Check, DownloadSimple, Info, MagnifyingGlass, Trash, X } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { profilesApi, unwrap, type BrowseTags, type ContentKind, type GameProfile, type SearchHit, type SearchOptions } from './api';
import { Menu } from './ProfileDialogs';

const TABS: { id: ContentKind; label: string }[] = [{ id: 'mods', label: 'Mods' }, { id: 'resourcepacks', label: 'Resourcepacks' }, { id: 'shaderpacks', label: 'Shaders' }, { id: 'datapacks', label: 'Datapacks' }];
const SORTS: { id: NonNullable<SearchOptions['sort']>; label: string }[] = [{ id: 'relevance', label: 'Relevanz' }, { id: 'downloads', label: 'Downloads' }, { id: 'follows', label: 'Beliebt' }, { id: 'newest', label: 'Neueste' }, { id: 'updated', label: 'Aktualisiert' }];
const compact = new Intl.NumberFormat('de-DE');
const message = (error: unknown) => error instanceof Error ? error.message : 'Das hat nicht geklappt.';
const label = (value: string) => value.replaceAll('-', ' ');

type Props = {
  profile: GameProfile;
  kind: ContentKind;
  /** Modrinth project ids already in the profile, per kind. */
  installed: Set<string>;
  onClose: () => void;
  onInstalled: (kind: ContentKind, files: string[]) => void;
};

/** Adding mods, packs and shaders from Modrinth, filtered by version, loader, category and side. */
export function ContentBrowser({ profile, kind: initialKind, installed, onClose, onInstalled }: Props) {
  const [kind, setKind] = useState<ContentKind>(initialKind);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [versions, setVersions] = useState<string[]>([profile.version]);
  const defaultLoaders = (next: ContentKind) => next === 'mods' && profile.loader !== 'vanilla' ? (profile.loader === 'quilt' ? ['quilt', 'fabric'] : [profile.loader]) : [];
  const [loaders, setLoaders] = useState<string[]>(defaultLoaders(initialKind));
  const [categories, setCategories] = useState<string[]>([]);
  const [environment, setEnvironment] = useState<'client' | 'server' | null>(null);
  const [sort, setSort] = useState<NonNullable<SearchOptions['sort']>>('relevance');
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
  const request = useRef(0);

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !menu) onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose, menu]);
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
  useEffect(() => { void search(0); }, [kind, debounced, versions, loaders, categories, environment, sort]);

  function switchKind(next: ContentKind) {
    setKind(next); setHits([]); setCategories([]); setLoaders(defaultLoaders(next)); setMenu(null);
  }
  const toggleIn = (list: string[], value: string) => list.includes(value) ? list.filter(item => item !== value) : [...list, value];
  const shownVersions = useMemo(() => (tags?.versions || []).filter(item => (allVersions || item.type === 'release') && item.id.includes(versionQuery.trim())).slice(0, 80), [tags, allVersions, versionQuery]);
  const chips = [...versions.map(value => ({ value, clear: () => setVersions(versions.filter(item => item !== value)) })), ...loaders.map(value => ({ value: label(value), clear: () => setLoaders(loaders.filter(item => item !== value)) })), ...categories.map(value => ({ value: label(value), clear: () => setCategories(categories.filter(item => item !== value)) })), ...(environment ? [{ value: environment === 'client' ? 'Client' : 'Server', clear: () => setEnvironment(null) }] : [])];

  async function install(hit: SearchHit) {
    setBusy(current => ({ ...current, [hit.id]: 'installing' })); setError('');
    try {
      const files = await unwrap(profilesApi.install(profile.id, kind, hit.id));
      setBusy(current => ({ ...current, [hit.id]: 'done' }));
      onInstalled(kind, files);
    } catch (e) {
      setBusy(current => { const next = { ...current }; delete next[hit.id]; return next; });
      setError(`${hit.title}: ${message(e)}`);
    }
  }
  const onScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    if (!loading && hits.length < total && target.scrollTop + target.clientHeight > target.scrollHeight - 300) void search(hits.length);
  };

  const section = (id: string, title: string, body: React.ReactNode) => <div className="filter-section">
    <button className="filter-head pixel" aria-expanded={Boolean(open[id])} onClick={() => setOpen(current => ({ ...current, [id]: !current[id] }))}>{title}{open[id] ? <CaretDown size={13} weight="fill" /> : <CaretRight size={13} weight="fill" />}</button>
    {open[id] && <div className="filter-body">{body}</div>}
  </div>;
  const option = (active: boolean, text: string, onClick: () => void) => <button key={text} className={`filter-option ${active ? 'active' : ''}`} aria-pressed={active} onClick={onClick}><span>{text}</span>{active && <Check size={12} weight="bold" />}</button>;

  return createPortal(<div className="drawer-backdrop" onMouseDown={onClose}>
    <aside className="drawer glass" role="dialog" aria-modal="true" aria-label="Inhalte hinzufügen" onMouseDown={event => event.stopPropagation()}>
      <header className="drawer-head"><p className="pixel"><DownloadSimple size={14} />inhalte hinzufügen <span>/ {profile.name}</span></p><button className="btn btn-icon" aria-label="Schließen (Esc)" title="Schließen (Esc)" onClick={onClose}><X size={16} /></button></header>
      <div className="drawer-main">
        <div className="drawer-content">
          <div className="segmented drawer-tabs" role="tablist">{TABS.map(tab => <button key={tab.id} role="tab" aria-selected={kind === tab.id} className={kind === tab.id ? 'active' : ''} onClick={() => switchKind(tab.id)}>{tab.label}</button>)}</div>
          <div className="drawer-search">
            <label className="search glass"><MagnifyingGlass size={16} /><input autoFocus aria-label={`${TABS.find(tab => tab.id === kind)?.label} durchsuchen`} placeholder={`${TABS.find(tab => tab.id === kind)?.label} durchsuchen …`} value={query} onChange={event => setQuery(event.target.value)} /></label>
            <select className="input sort-select" aria-label="Sortierung" value={sort} onChange={event => setSort(event.target.value as typeof sort)}>{SORTS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
            <div className="source-toggle" role="group" aria-label="Quelle"><button className="active">Modrinth</button><button disabled title="CurseForge gibt seine Schnittstelle nur mit einem eigenen API-Schlüssel frei, den Savira nicht hat.">CurseForge</button></div>
          </div>
          {chips.length > 0 && <div className="filter-chips"><button className="chip-clear" onClick={() => { setVersions([]); setLoaders([]); setCategories([]); setEnvironment(null); }}><Trash size={12} />Alle löschen</button>{chips.map(chip => <button key={chip.value} className="filter-chip" onClick={chip.clear}>{chip.value}<X size={11} weight="bold" /></button>)}</div>}
          {error && <p className="wizard-error" role="alert">{error}</p>}
          <div className="result-list" onScroll={onScroll}>
            {hits.map(hit => {
              const state = installed.has(hit.id) ? 'done' : busy[hit.id];
              return <article className="result" key={hit.id}>
                {hit.icon ? <img src={hit.icon} alt="" loading="lazy" /> : <span className="result-icon-empty" />}
                <div className="result-copy">
                  <h3><strong>{hit.title}</strong><small>von {hit.author}</small></h3>
                  <p>{hit.description}</p>
                  <div className="result-tags">{state === 'done' && <span className="tag">installiert</span>}{hit.categories.slice(0, 5).map(item => <span key={item}>{label(item)}</span>)}</div>
                </div>
                <div className="result-side">
                  <small><DownloadSimple size={12} />{compact.format(hit.downloads)}</small>
                  <div className="result-actions">
                    <button className={`btn pixel ${state === 'done' ? '' : 'btn-accent'}`} disabled={Boolean(state)} onClick={() => install(hit)}>{state === 'done' ? <><Check size={14} weight="bold" />installiert</> : state === 'installing' ? 'lädt …' : <><DownloadSimple size={14} />install</>}</button>
                    <div className="menu-anchor"><button className="btn btn-icon" aria-label={`Mehr zu ${hit.title}`} onClick={() => setMenu(current => current === hit.id ? null : hit.id)}><CaretDown size={14} /></button>
                      {menu === hit.id && <Menu onClose={() => setMenu(null)} items={[{ label: 'Infos auf Modrinth', icon: <Info size={15} />, onClick: () => void profilesApi.openProject(hit.type, hit.slug) }]} />}</div>
                  </div>
                </div>
              </article>;
            })}
            {loading && <p className="wizard-loading">Wird gesucht …</p>}
            {!loading && !hits.length && !error && <p className="wizard-loading">Nichts gefunden. Ändere die Suche oder entferne Filter.</p>}
          </div>
        </div>
        <div className="drawer-filters">
          {section('versions', 'Spielversionen', <>
            <label className="search glass small"><MagnifyingGlass size={13} /><input aria-label="Version suchen" placeholder="Version suchen …" value={versionQuery} onChange={event => setVersionQuery(event.target.value)} /></label>
            <div className="filter-scroll">{shownVersions.map(item => option(versions.includes(item.id), item.id, () => setVersions(toggleIn(versions, item.id))))}</div>
            <label className="check small"><input type="checkbox" checked={allVersions} onChange={event => setAllVersions(event.target.checked)} /><span className="check-box"><Check size={11} weight="bold" /></span><span><strong className="pixel">alle versionen anzeigen</strong></span></label>
          </>)}
          {(kind === 'mods' || kind === 'shaderpacks') && section('loaders', kind === 'mods' ? 'Mod-Loader' : 'Shader-Loader', <div className="filter-scroll">{(tags?.loaders || []).map(item => option(loaders.includes(item), label(item), () => setLoaders(toggleIn(loaders, item))))}</div>)}
          {section('categories', 'Kategorien', <div className="filter-scroll">{(tags?.categories || []).map(item => option(categories.includes(item), label(item), () => setCategories(toggleIn(categories, item))))}</div>)}
          {kind === 'mods' && section('environment', 'Umgebung', <>{option(environment === 'client', 'Client', () => setEnvironment(environment === 'client' ? null : 'client'))}{option(environment === 'server', 'Server', () => setEnvironment(environment === 'server' ? null : 'server'))}</>)}
        </div>
      </div>
    </aside>
  </div>, document.body);
}
