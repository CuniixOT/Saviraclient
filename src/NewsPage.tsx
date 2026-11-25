import { ArrowLeft, ArrowSquareOut, CaretRight, Cube, Lightning, ListBullets, MagnifyingGlass, Newspaper, Notepad, Square, X } from '@phosphor-icons/react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { newsApi, profilesApi, unwrap, type ChangelogEntry, type FeedItem, type NewsBlock, type NewsSource } from './api';
import { news as bundled } from './news';

type Type = 'news' | 'patch' | 'changelog';
type Source = 'all' | NewsSource;
const SOURCES: Record<NewsSource, { label: string; icon: ReactNode }> = {
  client: { label: 'Savira', icon: <Lightning size={11} weight="fill" /> },
  minecraft: { label: 'Minecraft', icon: <Cube size={11} weight="bold" /> },
  mojang: { label: 'Mojang', icon: <Square size={11} weight="bold" /> },
};
const TYPES: { id: Type; label: string; icon: ReactNode }[] = [
  { id: 'news', label: 'News', icon: <Newspaper size={14} /> },
  { id: 'patch', label: 'Patchnotes', icon: <Notepad size={14} /> },
  { id: 'changelog', label: 'Changelog', icon: <ListBullets size={14} /> },
];
const MONTHS: Record<string, string> = { Jan: '01', Feb: '02', Mär: '03', Apr: '04', Mai: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Okt: '10', Nov: '11', Dez: '12' };
// Without the repository's news.json (offline, or not yet pushed) the posts shipped with the launcher show.
const fallback: FeedItem[] = bundled.map((item, i) => {
  const [day, month] = item.date.replace('.', '').split(' ');
  return { id: `local:${i}`, src: 'client', type: 'news', title: item.title, text: item.body, author: 'Savira-Team', image: item.image ?? null, link: null,
    date: MONTHS[month] ? `2026-${MONTHS[month]}-${day.padStart(2, '0')}T12:00:00.000Z` : null };
});
const formatDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

function Badge({ src }: { src: NewsSource }) {
  return <span className={`news-badge src-${src}`}>{SOURCES[src].icon}{SOURCES[src].label}</span>;
}
function Picture({ item, big = false }: { item: FeedItem; big?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (item.image && !failed) return <img className="news-img" src={item.image} alt="" loading="lazy" draggable={false} referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
  return <span className={`news-img news-art src-${item.src}`}>{item.src === 'client' ? <Lightning size={big ? 54 : 34} weight="thin" /> : item.src === 'minecraft' ? <Cube size={big ? 54 : 34} weight="thin" /> : <Square size={big ? 54 : 34} weight="thin" />}</span>;
}

/** "Neuigkeiten": Savira's posts, minecraft.net articles and Mojang's patch notes, plus Savira's changelog. */
export function NewsPage({ onHome, onError }: { onHome: () => void; onError: (message: string) => void }) {
  const [type, setType] = useState<Type>('news');
  const [source, setSource] = useState<Source>('all');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);
  const [offline, setOffline] = useState<string[]>([]);
  const [open, setOpen] = useState<FeedItem | null>(null);
  const [body, setBody] = useState<NewsBlock[] | null>(null);

  useEffect(() => {
    unwrap(newsApi.feed()).then(feed => {
      setItems(feed.sources.savira && feed.items.some(i => i.src === 'client') ? feed.items : [...feed.items, ...fallback].sort((a, b) => String(b.date).localeCompare(String(a.date))));
      setChangelog(feed.changelog);
      setOffline([!feed.sources.minecraft && 'Minecraft', !feed.sources.mojang && 'Mojang'].filter(Boolean) as string[]);
    }).catch(() => { setItems(fallback); setOffline(['Minecraft', 'Mojang']); });
  }, []);
  useEffect(() => {
    setBody(null);
    if (!open) return;
    if (open.body?.length) setBody(open.body);
    else if (open.bodyPath) unwrap(newsApi.patch(open.bodyPath)).then(setBody).catch(() => setBody([]));
    else setBody([]);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);

  const q = query.trim().toLowerCase();
  const match = (text: string) => !q || text.toLowerCase().includes(q);
  const pool = useMemo(() => (items || []).filter(item => item.type === type), [items, type]);
  const logs = type === 'changelog' ? changelog.filter(entry => (source === 'all' || source === 'client') && match(`${entry.version} ${entry.title} ${entry.items.join(' ')}`)) : [];
  const shown = type === 'changelog' ? [] : pool.filter(item => (source === 'all' || item.src === source) && match(`${item.title} ${item.text}`));
  const count = (src: Source) => type === 'changelog' ? (src === 'all' || src === 'client' ? changelog.length : 0) : src === 'all' ? pool.length : pool.filter(item => item.src === src).length;
  const total = type === 'changelog' ? logs.length : shown.length;
  const link = (url: string) => unwrap(profilesApi.openLink(url)).catch(e => onError(e.message));
  const [featured, ...rest] = shown;

  return <div className="news-page page-enter">
    {featured?.image && <img className="news-backdrop" src={featured.image} alt="" aria-hidden="true" />}
    <header className="news-head">
      <div>
        <button className="btn news-back" onClick={onHome}><ArrowLeft size={12} weight="bold" />Startseite</button>
        <h1>Neuigkeiten<small className="mono">{items ? `${total} ${type === 'changelog' ? 'Versionen' : 'Beiträge'}` : 'Lädt …'}</small></h1>
      </div>
      <label className="search news-search"><MagnifyingGlass size={14} /><input aria-label="Neuigkeiten durchsuchen" placeholder="Neuigkeiten durchsuchen …" value={query} onChange={e => setQuery(e.target.value)} /></label>
    </header>

    <div className="news-filters">
      <div className="news-seg" role="tablist" aria-label="Art">
        {TYPES.map(t => <button key={t.id} role="tab" aria-selected={type === t.id} className={type === t.id ? 'active' : ''} onClick={() => setType(t.id)}>{t.icon}{t.label}</button>)}
      </div>
      <span className="news-sep" />
      <div className="news-seg" role="tablist" aria-label="Quelle">
        {(['all', 'client', 'minecraft', 'mojang'] as Source[]).map(src => <button key={src} role="tab" aria-selected={source === src} className={source === src ? 'active' : ''} onClick={() => setSource(src)}>
          <i className={`dot src-${src}`} />{src === 'all' ? 'Alle' : SOURCES[src].label}<small className="mono">{count(src)}</small>
        </button>)}
      </div>
      {offline.length > 0 && <small className="news-offline mono">{offline.join(' und ')} gerade nicht erreichbar</small>}
    </div>

    <div className="news-body">
      {!items && <div className="news-empty">Neuigkeiten werden geladen …</div>}
      {featured && <button className="news-featured" onClick={() => setOpen(featured)}>
        <Picture item={featured} big />
        <span className="news-featured-shade" />
        <span className="news-featured-tags"><Badge src={featured.src} /><span className="news-latest mono">Neueste</span></span>
        <span className="news-featured-copy">
          <small className="mono">{formatDate(featured.date)} · {featured.author}</small>
          <b>{featured.title}</b>
          <em>{featured.text}</em>
          <span className="news-more">Weiterlesen<CaretRight size={12} weight="bold" /></span>
        </span>
      </button>}
      {rest.length > 0 && <div className="news-grid">{rest.map(item => <button key={item.id} className="news-card" onClick={() => setOpen(item)}>
        <span className="news-card-pic"><Picture item={item} /><span className="news-card-tag"><Badge src={item.src} /></span></span>
        <span className="news-card-copy"><small className="mono">{formatDate(item.date)} · {item.author}</small><b>{item.title}</b><em>{item.text}</em></span>
      </button>)}</div>}
      {logs.map(entry => <article key={entry.id} className="news-log">
        <div className="news-log-side"><Badge src="client" /><b>{entry.version}</b><small className="mono">{formatDate(entry.date)}</small></div>
        <div className="news-log-main"><b>{entry.title}</b>
          {entry.items.length ? entry.items.map((text, i) => <p key={i}><span className="news-log-tag mono">Neu</span><span>{text}</span></p>) : <p><span>Keine Notizen zu dieser Version.</span></p>}
        </div>
      </article>)}
      {items && total === 0 && <div className="news-empty">Hier gibt es gerade nichts. Probier eine andere Quelle oder Art.</div>}
    </div>

    {open && <div className="news-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(null); }}>
      <article className="news-detail" role="dialog" aria-modal="true" aria-label={open.title}>
        <div className="news-detail-pic"><Picture item={open} big /><span className="news-detail-shade" /><span className="news-detail-tag"><Badge src={open.src} /></span>
          <button className="news-close" aria-label="Schließen" onClick={() => setOpen(null)}><X size={12} weight="bold" /></button></div>
        <div className="news-detail-copy">
          <small className="mono">{formatDate(open.date)} · {open.author}{open.version ? ` · ${open.version}` : ''}</small>
          <h2>{open.title}</h2>
          {/* The patch notes repeat their summary as the first paragraph. */}
          {!(body && body.length) && <p className="lead">{open.text}</p>}
          {body === null ? <p className="muted">Lädt …</p> : body.map((block, i) => block.kind === 'heading' ? <h3 key={i}>{block.text}</h3> : block.kind === 'item' ? <p key={i} className="item">{block.text}</p> : <p key={i}>{block.text}</p>)}
          {open.link && <button className="btn btn-primary news-link" onClick={() => link(open.link!)}>{open.src === 'client' ? 'Mehr dazu' : 'Auf minecraft.net lesen'}<ArrowSquareOut size={14} /></button>}
          {open.src !== 'client' && <p className="news-source-note">Quelle: {open.src === 'mojang' ? 'Mojang Studios, Java-Edition-Patchnotes' : 'minecraft.net'}. Die Texte sind von Mojang und meist auf Englisch.</p>}
        </div>
      </article>
    </div>}
  </div>;
}
