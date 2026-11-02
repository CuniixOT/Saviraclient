import { ArrowsClockwise, CaretDown, CaretUp, Check, Copy, DiscordLogo, Eye, GlobeHemisphereWest, Globe, MagnifyingGlass, Play, ShoppingCart, SortAscending, X } from '@phosphor-icons/react';
import { useCallback, useDeferredValue, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { profilesApi, unwrap, type GameProfile, type ServerStatus, type Settings } from './api';
import { PageHeader } from './ui';
import { ProfileIcon, loaderLabel } from './profileUi';
import { Select } from './Select';
import avoroLogo from './assets/avoro-logo.webp';
import { serverAd, serverCategories, serverRegions, servers, type ServerCategory, type ServerEntry, type ServerLinkKind } from './servers';

type Sort = 'recommended' | 'players' | 'ping' | 'name';
type Live = { state: 'loading' } | { state: 'down' } | ({ state: 'ok' } & ServerStatus);
type Props = { settings: Settings; locked: boolean; onPlay: (profileId: string, address: string) => void; onNotice: (message: string) => void; onError: (message: string) => void };

const REFRESH = 30000;
const banners = import.meta.glob<string>('./assets/servers/*.{png,jpg,jpeg,webp}', { eager: true, query: '?url', import: 'default' });
const bannerOf = (id: string) => Object.entries(banners).find(([file]) => file.split('/').pop()?.split('.')[0] === id)?.[1];
const number = new Intl.NumberFormat('de-DE');
const linkInfo: Record<ServerLinkKind, { label: string; icon: typeof Globe }> = {
  website: { label: 'Website', icon: Globe }, store: { label: 'Shop', icon: ShoppingCart }, discord: { label: 'Discord', icon: DiscordLogo }
};

function Bars({ ms }: { ms: number | null }) {
  const level = ms === null ? 0 : ms < 60 ? 5 : ms < 100 ? 4 : ms < 160 ? 3 : ms < 250 ? 2 : 1;
  return <span className="server-bars" aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <i key={i} className={i < level ? 'on' : ''} style={{ height: 4 + i * 2 }} />)}</span>;
}

/** The server's own picture if there is one, otherwise its colours with blocks and its name. */
function Banner({ server, compact }: { server: ServerEntry; compact?: boolean }) {
  const [failed, setFailed] = useState<string[]>([]);
  const usable = (url?: string) => url && !failed.includes(url) ? url : undefined;
  const fail = (url: string) => setFailed(list => [...list, url]);
  const picture = usable(bannerOf(server.id)) ?? usable(server.banner);
  if (picture) return <div className="server-banner"><img src={picture} alt="" draggable={false} referrerPolicy="no-referrer" onError={() => fail(picture)} /></div>;
  const logo = usable(server.logo);
  // The blocks are placed from the name, so every server keeps its own pattern.
  const seed = [...server.id].reduce((sum, ch) => sum * 31 + ch.charCodeAt(0) >>> 0, 7);
  const blocks = Array.from({ length: 16 }, (_, i) => { const r = (seed * (i + 3) * 2654435761) >>> 0; return { x: r % 100, y: (r >>> 8) % 100, s: 4 + (r >>> 16) % 9, o: .05 + ((r >>> 24) % 16) / 100 }; });
  return <div className="server-banner is-drawn" style={{ '--a': server.colors[0], '--b': server.colors[1] } as CSSProperties}>
    {blocks.map((b, i) => <i key={i} style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.s}%`, opacity: b.o }} />)}
    {logo ? <img className="server-banner-logo" src={logo} alt="" draggable={false} referrerPolicy="no-referrer" onError={() => fail(logo)} /> : !compact && <strong>{server.name}</strong>}
  </div>;
}
/** The icon the server sends in its ping; until then, or without one, its initial. */
const Tile = ({ server, size, live }: { server: ServerEntry; size: number; live?: Live }) => {
  const icon = live?.state === 'ok' ? live.icon : null;
  return icon ? <span className="server-tile has-icon" style={{ width: size, height: size }}><img src={icon} alt="" draggable={false} /></span>
    : <span className="server-tile" style={{ width: size, height: size, fontSize: size * .5, background: server.colors[0] }}>{server.name[0]}</span>;
};
const onlineText = (live: Live) => live.state === 'ok' ? `${number.format(live.online)} online` : live.state === 'down' ? 'Nicht erreichbar' : 'Wird abgefragt …';

export function ServersPage({ settings, locked, onPlay, onNotice, onError }: Props) {
  const [live, setLive] = useState<Record<string, Live>>({});
  const [query, setQuery] = useState('');
  const search = useDeferredValue(query.trim().toLowerCase());
  const [category, setCategory] = useState<ServerCategory | null>(null);
  const [region, setRegion] = useState('all');
  const [sort, setSort] = useState<Sort>('recommended');
  const [openId, setOpenId] = useState<string | null>(null);

  const pingOne = useCallback(async (server: ServerEntry) => {
    try { const status = await unwrap(profilesApi.serverPing(server.address)); setLive(all => ({ ...all, [server.id]: { state: 'ok', ...status } })); }
    catch { setLive(all => ({ ...all, [server.id]: { state: 'down' } })); }
  }, []);
  useEffect(() => {
    const all = () => servers.forEach(server => void pingOne(server));
    all();
    const timer = setInterval(all, REFRESH);
    return () => clearInterval(timer);
  }, [pingOne]);

  const visible = useMemo(() => {
    const list = servers.filter(server => (!category || server.categories.includes(category)) && (region === 'all' || server.region === region)
      && (!search || `${server.name} ${server.address} ${server.description} ${server.categories.join(' ')}`.toLowerCase().includes(search)));
    const players = (s: ServerEntry) => { const l = live[s.id]; return l?.state === 'ok' ? l.online : -1; };
    const latency = (s: ServerEntry) => { const l = live[s.id]; return l?.state === 'ok' ? l.ms : Infinity; };
    if (sort === 'players') list.sort((a, b) => players(b) - players(a));
    if (sort === 'ping') list.sort((a, b) => latency(a) - latency(b));
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    return list;
  }, [category, region, search, sort, live]);

  const selected = settings.profiles.find(profile => profile.id === settings.selectedProfileId) ?? settings.profiles[0];
  const open = servers.find(server => server.id === openId);
  const openLink = (url: string) => unwrap(profilesApi.openLink(url)).catch(e => onError(e instanceof Error ? e.message : 'Link konnte nicht geöffnet werden.'));

  return <section className="page servers-page">
    <PageHeader kicker="spielen" title="Server">
      <button className="server-ad" onClick={() => void openLink(serverAd.url)} title={serverAd.url}>
        <small className="pixel">anzeige</small><img src={avoroLogo} alt={serverAd.name} draggable={false} /><i /><span>{serverAd.tagline}</span>
      </button>
    </PageHeader>

    <div className="server-toolbar">
      <label className="server-search glass"><MagnifyingGlass size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={`${servers.length} Server durchsuchen …`} aria-label="Server suchen" />
        {query && <button aria-label="Suche leeren" onClick={() => setQuery('')}><X size={14} /></button>}</label>
      <Select<Sort> label="Sortierung" value={sort} onChange={setSort} icon={<SortAscending size={15} />} width={190} options={[{ value: 'recommended', label: 'Empfohlen' }, { value: 'players', label: 'Meiste Spieler' }, { value: 'ping', label: 'Bester Ping' }, { value: 'name', label: 'Name' }]} />
      <Select<string> label="Region" value={region} onChange={setRegion} icon={<GlobeHemisphereWest size={15} />} width={170} options={[{ value: 'all', label: 'Alle Regionen' }, ...serverRegions.map(value => ({ value, label: value }))]} />
    </div>
    <div className="server-cats" role="group" aria-label="Kategorien">
      <button className={category === null ? 'active' : ''} aria-pressed={category === null} onClick={() => setCategory(null)}>Alle</button>
      {serverCategories.map(item => <button key={item} className={category === item ? 'active' : ''} aria-pressed={category === item} onClick={() => setCategory(category === item ? null : item)}>{item}</button>)}
    </div>

    {visible.length ? <div className="server-grid">{visible.map((server, index) => {
      const status = live[server.id] ?? { state: 'loading' as const };
      return <article key={server.id} className="server-card" style={{ '--i': Math.min(index, 9) } as CSSProperties}>
        <button className="server-card-open" aria-label={`${server.name}: Details`} onClick={() => setOpenId(server.id)}><Banner server={server} /></button>
        <footer>
          <Tile server={server} size={38} live={status} />
          <div><h2>{server.name}</h2><p className={status.state === 'down' ? 'is-down' : ''}>{onlineText(status)}</p></div>
          <button className="server-icon-btn" aria-label={`${server.name}: Details`} title="Details" onClick={() => setOpenId(server.id)}><Eye size={17} weight="fill" /></button>
          <button className="server-icon-btn is-play" aria-label={`${server.name} spielen`} title={selected ? `Mit ${selected.name} spielen` : 'Spielen'} disabled={locked || !selected} onClick={() => selected && onPlay(selected.id, server.address)}><Play size={16} weight="fill" /></button>
        </footer>
      </article>;
    })}</div> : <div className="empty glass"><MagnifyingGlass size={30} /><h2>Keine Server gefunden</h2><p>Andere Suche oder Kategorie probieren.</p></div>}

    {open && <ServerDialog server={open} status={live[open.id] ?? { state: 'loading' }} profiles={settings.profiles} selected={selected} locked={locked} onClose={() => setOpenId(null)}
      onRefresh={() => { setLive(all => ({ ...all, [open.id]: { state: 'loading' } })); void pingOne(open); }}
      onLink={url => void openLink(url)} onNotice={onNotice} onError={onError}
      onPlay={profile => { setOpenId(null); onPlay(profile.id, open.address); }} />}
  </section>;
}

function ServerDialog({ server, status, profiles, selected, locked, onClose, onRefresh, onLink, onPlay, onNotice, onError }: { server: ServerEntry; status: Live; profiles: GameProfile[]; selected?: GameProfile; locked: boolean; onClose: () => void; onRefresh: () => void; onLink: (url: string) => void; onPlay: (profile: GameProfile) => void; onNotice: (message: string) => void; onError: (message: string) => void }) {
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { if (menu) setMenu(false); else onClose(); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [menu, onClose]);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 1600); return () => clearTimeout(timer); }, [copied]);
  const copy = () => navigator.clipboard.writeText(server.address).then(() => { setCopied(true); onNotice('Server-IP kopiert.'); }, () => onError('Server-IP konnte nicht kopiert werden.'));
  const others = profiles.filter(profile => profile.id !== selected?.id);

  return createPortal(<div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal glass server-dialog" role="dialog" aria-modal="true" aria-labelledby="server-dialog-title">
      <div className="server-dialog-banner"><Banner server={server} compact />
        <button className="server-dialog-close" aria-label="Dialog schließen" onClick={onClose}><X size={16} /></button></div>
      <div className="server-dialog-body">
        <header><Tile server={server} size={62} live={status} /><h2 id="server-dialog-title">{server.name}</h2></header>
        <p className="server-about">{server.description}</p>
        <div className="server-ip"><span>{server.address}</span><button aria-label="Server-IP kopieren" title="Server-IP kopieren" onClick={() => void copy()}>{copied ? <Check size={16} weight="bold" /> : <Copy size={16} />}</button></div>
        <div className="server-facts">
          <div><small className="pixel">ping <button aria-label="Ping neu messen" title="Neu messen" onClick={onRefresh}><ArrowsClockwise size={13} /></button></small>
            <b><Bars ms={status.state === 'ok' ? status.ms : null} />{status.state === 'ok' ? `${status.ms} ms` : status.state === 'down' ? 'offline' : '…'}</b></div>
          <div><small className="pixel">version</small><b>{status.state === 'ok' && status.version ? status.version : server.version}</b></div>
          <div><small className="pixel">region</small><b><GlobeHemisphereWest size={15} />{server.region}</b></div>
        </div>
        <p className="server-players">{onlineText(status)}{status.state === 'ok' && status.max > 0 ? ` von ${number.format(status.max)} Plätzen` : ''}</p>
        <div className="server-tags">{server.categories.map(item => <span key={item}>{item}</span>)}</div>
        <footer>
          <div className="server-links">{server.links.map(link => { const info = linkInfo[link.kind]; return <button key={link.url} aria-label={info.label} title={info.label} onClick={() => onLink(link.url)}><info.icon size={18} weight="fill" /></button>; })}</div>
          <div className="server-play">
            {menu && <div className="server-play-menu" role="menu">
              <small className="pixel">mit anderem profil spielen</small>
              {others.length ? others.map(profile => <button key={profile.id} role="menuitem" onClick={() => onPlay(profile)}><ProfileIcon profile={profile} size={28} /><span><b>{profile.name}</b><em>{profile.version} · {loaderLabel(profile)}</em></span></button>) : <p>Noch kein weiteres Profil.</p>}
            </div>}
            <button className="server-play-main" disabled={locked || !selected} title={selected ? `Mit ${selected.name} (${selected.version}) spielen` : undefined} onClick={() => selected && onPlay(selected)}><Play size={15} weight="fill" /><span>Spielen</span>{selected && <small>{selected.version}</small>}</button>
            <button className="server-play-more" aria-label="Profil wählen" aria-expanded={menu} disabled={locked} onClick={() => setMenu(value => !value)}>{menu ? <CaretUp size={13} weight="fill" /> : <CaretDown size={13} weight="fill" />}</button>
          </div>
        </footer>
      </div>
    </section>
  </div>, document.body);
}
