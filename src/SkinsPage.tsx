import { ArrowsClockwise, Check, FolderOpen, GlobeHemisphereWest, Heart, MagnifyingGlass, PencilSimple, Plus, Spinner, TShirt, Trash, UploadSimple, X } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { skinsApi, unwrap, type Accounts, type GallerySkin, type GalleryTag, type LibrarySkin, type SkinVariant, type Wardrobe } from './api';
import { SkinStage } from './SkinStage';
import { skinPose } from './skinPose';
import { PageHeader } from './ui';

type Props = {
  hasAccount: boolean;
  locked: boolean;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
  onApplied: (accounts: Accounts) => void;
};
type Draft = { id?: string; name: string; variant: SkinVariant; png: string; swapped?: boolean };
type Tab = 'mine' | 'favorites' | 'all';
const tabs: { id: Tab; label: string }[] = [{ id: 'mine', label: 'meine skins' }, { id: 'favorites', label: 'favoriten' }, { id: 'all', label: 'alle skins' }];
type Gallery = { skins: GallerySkin[]; next: string | null; state: 'idle' | 'loading' | 'error' };
// German names for SkinMC's tags; unknown ones keep SkinMC's name.
const TAG_NAMES: Record<string, string> = {
  girl: 'Mädchen', boy: 'Junge', cute: 'Niedlich', cool: 'Cool', animal: 'Tier', cat: 'Katze', 'cat-ears': 'Katzenohren', dog: 'Hund', fox: 'Fuchs',
  duck: 'Ente', penguin: 'Pinguin', christmas: 'Weihnachten', snowman: 'Schneemann', suit: 'Anzug', mask: 'Maske', king: 'König', maid: 'Zimmermädchen',
  'long-hair': 'Lange Haare', 'black-hair': 'Schwarze Haare', scarf: 'Schal', sunglasses: 'Sonnenbrille', food: 'Essen', onesie: 'Einteiler',
  red: 'Rot', blue: 'Blau', green: 'Grün', pink: 'Rosa', purple: 'Lila', black: 'Schwarz', white: 'Weiß', anime: 'Anime', halloween: 'Halloween'
};
const TAGS_SHOWN = 14;   // the most used; the rest folds out
const tagName = (tag: GalleryTag) => TAG_NAMES[tag.id] ?? tag.name;

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Das Bild konnte nicht gelesen werden.'));
  image.src = src;
});

/** Slim skins leave the outer two columns of the right arm (x 54–55) transparent. */
async function detectVariant(png: string): Promise<SkinVariant> {
  const image = await loadImage(png);
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0);
  const alpha = (x: number, y: number) => ctx.getImageData(x, y, 1, 1).data[3];
  return image.height === 64 && alpha(55, 20) === 0 && alpha(54, 25) === 0 ? 'slim' : 'classic';
}

function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (file.type && file.type !== 'image/png') { reject(new Error('Bitte eine PNG-Datei wählen.')); return; }
    if (file.size > 2_000_000) { reject(new Error('Die Datei ist zu groß.')); return; }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Die Datei konnte nicht gelesen werden.'));
    reader.readAsDataURL(file);
  });
}
const nameFromFile = (file: File) => file.name.replace(/\.png$/i, '').slice(0, 32).trim() || 'Neuer Skin';

/**
 * Flat front view of a skin (head, body, arms, legs plus their overlay layer),
 * for a card whose 3D picture cannot be rendered.
 */
function SkinFront({ png, variant, className = '' }: { png: string; variant: SkinVariant; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    loadImage(png).then(image => {
      const canvas = ref.current, ctx = canvas?.getContext('2d');
      if (cancelled || !canvas || !ctx) return;
      const u = 8, arm = variant === 'slim' ? 3 : 4, legacy = image.height === 32;
      canvas.width = 16 * u; canvas.height = 32 * u;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const part = (sx: number, sy: number, w: number, h: number, dx: number, dy: number, mirror = false) => {
        ctx.save();
        if (mirror) { ctx.translate((dx + w) * u, dy * u); ctx.scale(-1, 1); ctx.drawImage(image, sx, sy, w, h, 0, 0, w * u, h * u); }
        else ctx.drawImage(image, sx, sy, w, h, dx * u, dy * u, w * u, h * u);
        ctx.restore();
      };
      part(8, 8, 8, 8, 4, 0); part(20, 20, 8, 12, 4, 8);
      part(44, 20, arm, 12, 4 - arm, 8);
      if (legacy) part(44, 20, arm, 12, 12, 8, true); else part(36, 52, arm, 12, 12, 8);
      part(4, 20, 4, 12, 4, 20);
      if (legacy) part(4, 20, 4, 12, 8, 20, true); else part(20, 52, 4, 12, 8, 20);
      part(40, 8, 8, 8, 4, 0);
      if (!legacy) { part(20, 36, 8, 12, 4, 8); part(44, 36, arm, 12, 4 - arm, 8); part(52, 52, arm, 12, 12, 8); part(4, 36, 4, 12, 4, 20); part(4, 52, 4, 12, 8, 20); }
    }).catch(() => { /* Broken image: the card stays empty. */ });
    return () => { cancelled = true; };
  }, [png, variant]);
  return <canvas ref={ref} className={`skin-front ${className}`} aria-hidden="true" />;
}

/** A SkinMC skin, posed like the own ones; its texture is only fetched once the card scrolls into view. */
function GalleryArt({ id }: { id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [picture, setPicture] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || visible) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) setVisible(true); }, { rootMargin: '200px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    unwrap(skinsApi.texture(id)).then(async png => skinPose(png, await detectVariant(png)))
      .then(next => { if (!cancelled) setPicture(next); }, () => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [visible, id]);
  return <div ref={ref} className="skin-gallery-art">
    {picture ? <img className="skin-pose" src={picture} alt="" draggable={false} /> : failed ? <TShirt size={40} weight="thin" /> : <Spinner size={22} className="spin" />}
  </div>;
}

/** The skin of a card, posed in 3D. */
function SkinCardArt({ png, variant }: { png: string; variant: SkinVariant }) {
  const [picture, setPicture] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    skinPose(png, variant).then(next => { if (!cancelled) setPicture(next); }, () => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [png, variant]);
  if (failed) return <SkinFront png={png} variant={variant} />;
  return picture ? <img className="skin-pose" src={picture} alt="" draggable={false} /> : null;
}

export function SkinsPage({ hasAccount, locked, onNotice, onError, onApplied }: Props) {
  const [tab, setTab] = useState<Tab>('mine');
  const [wardrobe, setWardrobe] = useState<Wardrobe | null>(null);
  const [gallery, setGallery] = useState<Gallery>({ skins: [], next: null, state: 'idle' });
  const [tags, setTags] = useState<GalleryTag[]>([]);
  const [tag, setTag] = useState<string | null>(null);
  const [allTags, setAllTags] = useState(false);
  const galleryToken = useRef(0);
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<'source' | 'preview' | null>(null);
  const [source, setSource] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const editing = Boolean(draft?.id);

  useEffect(() => { unwrap(skinsApi.list()).then(setWardrobe).catch(e => onError(e.message)); }, [onError]);
  // The gallery loads page by page; a newer request (other tag) wins over one still running.
  const loadGallery = useCallback((nextTag: string | null, next: string | null) => {
    const token = ++galleryToken.current;
    setGallery(current => ({ skins: next ? current.skins : [], next: next ? current.next : null, state: 'loading' }));
    unwrap(skinsApi.browse({ tag: nextTag, next })).then(page => {
      if (token !== galleryToken.current) return;
      if (page.tags) setTags(page.tags);
      setGallery(current => {
        const known = new Set(next ? current.skins.map(skin => skin.id) : []);
        return { skins: [...(next ? current.skins : []), ...page.skins.filter(skin => !known.has(skin.id))], next: page.next, state: 'idle' };
      });
    }).catch(() => { if (token === galleryToken.current) setGallery(current => ({ ...current, state: 'error' })); });
  }, []);
  useEffect(() => { if (tab === 'all' && !gallery.skins.length && gallery.state === 'idle') loadGallery(tag, null); }, [tab, tag, gallery, loadGallery]);
  const pickTag = (next: string | null) => { if (next === tag) return; setTag(next); loadGallery(next, null); };
  useEffect(() => {
    if (!confirmDelete) return;
    const timer = setTimeout(() => setConfirmDelete(null), 3500);
    return () => clearTimeout(timer);
  }, [confirmDelete]);

  async function run(name: string, work: () => Promise<void>) {
    if (busy) return;
    setBusy(name);
    try { await work(); } catch (e) { onError(e instanceof Error ? e.message : 'Das hat nicht geklappt.'); }
    finally { setBusy(''); }
  }
  const close = () => { setDialog(null); setDraft(null); setSource(''); };
  const openAdd = () => { setDraft(null); setSource(''); setDialog('source'); };
  const openEdit = (skin: LibrarySkin) => { setDraft({ id: skin.id, name: skin.name, variant: skin.variant, png: skin.png }); setDialog('preview'); };

  async function fromFile(file: File | undefined) {
    if (!file) return;
    await run('file', async () => {
      const png = await readFile(file);
      const variant = await detectVariant(png);
      // Swapping the texture of an existing skin keeps its name.
      setDraft(current => current?.id ? { ...current, png, variant, swapped: true } : { name: nameFromFile(file), variant, png });
      setDialog('preview');
    });
  }
  const fetchSource = () => run('fetch', async () => {
    const found = await unwrap(skinsApi.fetch(source));
    setDraft({ name: found.name, png: found.png, variant: found.variant ?? await detectVariant(found.png) });
    setDialog('preview');
  });
  const save = () => run('save', async () => {
    if (!draft) return;
    const next = await unwrap(skinsApi.save({ id: draft.id, name: draft.name, variant: draft.variant, png: !draft.id || draft.swapped ? draft.png : undefined }));
    setWardrobe(next);
    onNotice(editing ? `Skin „${draft.name.trim()}“ gespeichert.` : `Skin „${draft.name.trim()}“ hinzugefügt.`);
    close();
  });
  const remove = (skin: LibrarySkin) => {
    if (confirmDelete !== skin.id) { setConfirmDelete(skin.id); return; }
    void run(`delete-${skin.id}`, async () => { setWardrobe(await unwrap(skinsApi.remove(skin.id))); setConfirmDelete(null); onNotice(`Skin „${skin.name}“ gelöscht.`); });
  };
  const wear = async (skin: LibrarySkin) => {
    const result = await unwrap(skinsApi.apply(skin.id));
    onApplied(result);
    setWardrobe(current => current ? { ...current, applied: result.applied } : current);
    onNotice(`Du trägst jetzt „${skin.name}“.`);
  };
  const apply = (skin: LibrarySkin) => run(`apply-${skin.id}`, () => wear(skin));
  const favorite = (key: string, author?: string | null) => run(`fav-${key}`, async () => setWardrobe(await unwrap(skinsApi.favorite(key, author))));
  // A gallery skin goes into "Meine Skins" first, then it is worn like an own skin.
  const adopt = (skin: GallerySkin) => run(`adopt-${skin.id}`, async () => {
    const source = `skinmc:${skin.id}`;
    let saved = wardrobe?.skins.find(item => item.source === source);
    if (!saved) {
      const png = await unwrap(skinsApi.texture(skin.id));
      const next = await unwrap(skinsApi.save({ name: (skin.author || 'SkinMC-Skin').slice(0, 32), variant: await detectVariant(png), png, source }));
      setWardrobe(next);
      saved = next.skins.find(item => item.source === source);
    }
    if (!saved) return;
    if (hasAccount) await wear(saved);
    else onNotice(`„${saved.name}“ unter Meine Skins gespeichert.`);
  });
  const onDrop = (event: DragEvent) => { event.preventDefault(); setDragging(false); void fromFile(event.dataTransfer.files[0]); };

  const match = (name: string) => name.toLowerCase().includes(query.trim().toLowerCase());
  const visible = (wardrobe?.skins || []).filter(skin => match(skin.name));
  const favorites = new Set(wardrobe?.favorites || []);
  const favOwn = visible.filter(skin => favorites.has(`own:${skin.id}`));
  const favGallery: GallerySkin[] = (wardrobe?.favorites || []).filter(key => key.startsWith('skinmc:'))
    .map(key => ({ id: key.slice(7), author: wardrobe?.authors[key] ?? null })).filter(skin => match(skin.author || 'SkinMC-Skin'));
  const nameInvalid = !draft?.name.trim() || draft.name.trim().length > 32;

  const heart = (key: string, name: string, author?: string | null) => <button className={`cape-heart ${favorites.has(key) ? 'on' : ''}`} aria-pressed={favorites.has(key)} aria-label={favorites.has(key) ? `${name} aus Favoriten entfernen` : `${name} zu Favoriten`} onClick={() => favorite(key, author)}><Heart size={15} weight={favorites.has(key) ? 'fill' : 'bold'} /></button>;
  const ownCard = (skin: LibrarySkin, index: number) => {
    const active = wardrobe?.applied === skin.id;
    return <article key={skin.id} className={`skin-card glass ${active ? 'active' : ''}`} style={{ '--i': index } as CSSProperties}>
      {heart(`own:${skin.id}`, skin.name)}
      <div className="skin-card-art"><SkinCardArt png={skin.png} variant={skin.variant} />{active && <span className="tag skin-active"><Check size={10} weight="bold" />aktiv</span>}</div>
      <div className="skin-card-actions">
        <button className="btn btn-icon" aria-label={`${skin.name} bearbeiten`} title="Umbenennen, Modell ändern oder Datei austauschen" disabled={locked} onClick={() => openEdit(skin)}><PencilSimple size={15} /></button>
        <button className={`btn btn-icon ${confirmDelete === skin.id ? 'danger' : ''}`} aria-label={confirmDelete === skin.id ? `${skin.name} wirklich löschen` : `${skin.name} löschen`} title={confirmDelete === skin.id ? 'Nochmal klicken zum Löschen' : 'Löschen'} disabled={locked} onClick={() => remove(skin)}><Trash size={15} /></button>
      </div>
      <h2>{skin.name}</h2>
      <small className="skin-variant">{skin.variant === 'slim' ? 'Schlank (Alex)' : 'Klassisch (Steve)'}</small>
      <button className={`btn w-full pixel ${active ? '' : 'btn-accent'}`} disabled={locked || active || !hasAccount || Boolean(busy)} title={hasAccount ? undefined : 'Melde dich zuerst mit Microsoft an.'} onClick={() => apply(skin)}>
        {busy === `apply-${skin.id}` ? <><Spinner size={15} className="spin" />wird gesetzt …</> : active ? <><Check size={15} weight="bold" />ausgewählt</> : 'auswählen'}
      </button>
    </article>;
  };
  const galleryCard = (skin: GallerySkin, index: number) => {
    const name = skin.author || 'SkinMC-Skin';
    const saved = wardrobe?.skins.find(item => item.source === `skinmc:${skin.id}`);
    const active = Boolean(saved && wardrobe?.applied === saved.id);
    const done = active || (!hasAccount && Boolean(saved));
    return <article key={`skinmc-${skin.id}`} className={`skin-card glass ${active ? 'active' : ''}`} style={{ '--i': index % 24 } as CSSProperties}>
      {heart(`skinmc:${skin.id}`, name, skin.author)}
      <div className="skin-card-art"><GalleryArt id={skin.id} />{active && <span className="tag skin-active"><Check size={10} weight="bold" />aktiv</span>}</div>
      <h2>{name}</h2>
      <small className="skin-variant">{saved ? 'In Meine Skins' : 'SkinMC'}</small>
      <button className={`btn w-full pixel ${done ? '' : 'btn-accent'}`} disabled={locked || done || Boolean(busy)} title={hasAccount ? 'Unter Meine Skins speichern und tragen' : 'Unter Meine Skins speichern. Zum Tragen mit Microsoft anmelden.'} onClick={() => adopt(skin)}>
        {busy === `adopt-${skin.id}` ? <><Spinner size={15} className="spin" />{hasAccount ? 'wird gesetzt …' : 'speichert …'}</> : active ? <><Check size={15} weight="bold" />ausgewählt</> : done ? <><Check size={15} weight="bold" />gespeichert</> : hasAccount ? 'auswählen' : 'speichern'}
      </button>
    </article>;
  };
  const empty = (icon: ReactNode, title: string, text: string, action?: ReactNode) => <div className="empty glass">{icon}<h2 className="pixel">{title}</h2><p>{text}</p>{action}</div>;

  return <div className={`page page-enter skins-page ${dragging ? 'is-dropping' : ''}`}
    onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragging(true); } }}
    onDragLeave={event => { if (event.currentTarget === event.target) setDragging(false); }} onDrop={onDrop}>
    <PageHeader kicker={`${wardrobe?.skins.length ?? 0} gespeichert`} title="Skins">
      <button className="btn btn-accent pixel" disabled={locked} onClick={openAdd}><Plus size={16} weight="bold" />skin hinzufügen</button>
    </PageHeader>
    <div className="settings-tabs cape-tabs" role="tablist" aria-label="Skin-Kategorien">
      {tabs.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} className={`pixel ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>)}
    </div>
    {tab === 'all'
      ? <div className="server-cats skin-tags" role="group" aria-label="Tags">
        <button className={tag === null ? 'active' : ''} aria-pressed={tag === null} onClick={() => pickTag(null)}>Neueste</button>
        {(allTags ? tags : tags.filter((item, i) => i < TAGS_SHOWN || item.id === tag)).map(item => <button key={item.id} className={tag === item.id ? 'active' : ''} aria-pressed={tag === item.id} onClick={() => pickTag(item.id)}>{tagName(item)}</button>)}
        {tags.length > TAGS_SHOWN && <button className="skin-tags-more" aria-expanded={allTags} onClick={() => setAllTags(open => !open)}>{allTags ? "weniger" : `+${tags.length - TAGS_SHOWN} weitere`}</button>}
      </div>
      : <label className="search glass skins-search"><MagnifyingGlass size={18} /><input aria-label="Skins durchsuchen" placeholder="Skins durchsuchen …" value={query} onChange={e => setQuery(e.target.value)} /></label>}
    <input ref={fileRef} type="file" accept="image/png" hidden onChange={e => { void fromFile(e.target.files?.[0]); e.target.value = ''; }} />

    <div className="skin-grid" role="tabpanel">
      {tab === 'mine' && <>
        {!query && <button className="skin-card skin-add glass" disabled={locked} onClick={openAdd}>
          <span className="skin-add-art"><TShirt size={46} weight="thin" /><i><Plus size={18} weight="bold" /></i></span>
          <strong>Neuen Skin hinzufügen</strong><small><UploadSimple size={13} />Datei, Benutzername, UUID oder Link. PNG auch hierher ziehen.</small>
        </button>}
        {visible.map(ownCard)}
        {wardrobe && query && !visible.length && empty(<TShirt size={34} weight="thin" />, 'Kein Skin gefunden', `Kein Skin heißt wie „${query}“.`)}
      </>}
      {tab === 'favorites' && (favOwn.length || favGallery.length
        ? [...favOwn.map(ownCard), ...favGallery.map((skin, i) => galleryCard(skin, favOwn.length + i))]
        : empty(<Heart size={34} weight="thin" />, query ? 'Kein Favorit gefunden' : 'Keine Favoriten', query ? 'Nichts passt zur Suche.' : 'Tippe bei einem Skin auf das Herz, dann findest du ihn hier wieder.'))}
      {tab === 'all' && (gallery.skins.length ? gallery.skins.map(galleryCard)
        : gallery.state === 'error' ? empty(<GlobeHemisphereWest size={34} weight="thin" />, 'Nicht erreichbar', 'Die Skins von SkinMC konnten nicht geladen werden.', <button className="btn" onClick={() => loadGallery(tag, null)}>Erneut versuchen</button>)
        : gallery.state === 'loading' ? <div className="empty glass"><Spinner size={30} className="spin" /><p>Skins werden geladen …</p></div>
        : empty(<TShirt size={34} weight="thin" />, 'Keine Skins', 'Unter diesem Tag gibt es gerade keine Skins.'))}
    </div>
    {tab === 'all' && Boolean(gallery.skins.length) && (gallery.next || gallery.state !== 'idle') && <div className="skin-more">
      {gallery.state === 'error' ? <button className="btn" onClick={() => loadGallery(tag, gallery.next)}>Erneut versuchen</button>
        : <button className="btn pixel" disabled={gallery.state === 'loading'} onClick={() => loadGallery(tag, gallery.next)}>{gallery.state === 'loading' ? <><Spinner size={15} className="spin" />lädt …</> : 'mehr laden'}</button>}
    </div>}
    {tab === 'all' && <p className="fine skins-fine">Die Skins kommen von skinmc.net und wurden dort von der Community hochgeladen. Beim Auswählen wird der Skin unter „Meine Skins“ gespeichert.</p>}
    {tab !== 'all' && !hasAccount && <p className="fine skins-fine">Zum Auswählen eines Skins musst du mit Microsoft angemeldet sein. Speichern und Vorschau gehen auch ohne.</p>}

    {/* Portal: the page animates with a transform, which would pin a fixed backdrop to the page. */}
    {dialog && createPortal(<div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) close(); }}>
      <section className="modal glass skin-modal" role="dialog" aria-modal="true" aria-labelledby="skin-dialog-title">
        <header className="modal-head"><div><p className="kicker pixel">{dialog === 'source' ? 'schritt 1 / 2' : editing ? 'garderobe' : 'schritt 2 / 2'}</p><h2 id="skin-dialog-title" className="pixel">{dialog === 'source' ? 'Skin hinzufügen' : editing ? 'Skin bearbeiten' : 'Vorschau'}</h2></div>
          <button className="btn btn-icon" aria-label="Dialog schließen" disabled={Boolean(busy)} onClick={close}><X size={18} /></button></header>

        {dialog === 'source' && <form className="skin-source" onSubmit={event => { event.preventDefault(); if (source.trim()) void fetchSource(); }}>
          <label className="field" htmlFor="skin-source"><span>Skin</span></label>
          <div className="input-row">
            <input id="skin-source" className="input" autoFocus placeholder="Benutzername, UUID oder Bild-Link" value={source} spellCheck={false} onChange={e => setSource(e.target.value)} />
            <button type="button" className="btn btn-icon" aria-label="PNG-Datei auswählen" title="PNG-Datei auswählen" onClick={() => fileRef.current?.click()}><FolderOpen size={18} /></button>
          </div>
          <div className={`skin-drop ${dragging ? 'over' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDrop={onDrop} onClick={() => fileRef.current?.click()} role="button" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') fileRef.current?.click(); }}>
            <UploadSimple size={22} /><span>PNG-Datei hierher ziehen oder klicken</span><small>64×64 Pixel, wie bei minecraft.net</small>
          </div>
          <footer className="modal-foot">
            <button type="button" className="btn" disabled={Boolean(busy)} onClick={close}>Abbrechen</button>
            <button type="submit" className="btn btn-accent pixel" disabled={!source.trim() || Boolean(busy)}>{busy === 'fetch' ? <><Spinner size={15} className="spin" />lädt …</> : 'skin-vorschau'}</button>
          </footer>
        </form>}

        {dialog === 'preview' && draft && <div className="skin-edit">
          <label className="field" htmlFor="skin-name"><span>Name</span></label>
          <input id="skin-name" className={`input ${nameInvalid ? 'invalid' : ''}`} value={draft.name} maxLength={32} onChange={e => setDraft({ ...draft, name: e.target.value })} />
          <div className="skin-stage-box"><SkinStage skin={draft.png} variant={draft.variant} name={draft.name.trim() || 'Skin'} animated /></div>
          <div className="segmented skin-variant-pick" role="radiogroup" aria-label="Skin-Modell">
            {(['classic', 'slim'] as const).map(variant => <button key={variant} type="button" role="radio" aria-checked={draft.variant === variant} className={draft.variant === variant ? 'active' : ''} onClick={() => setDraft({ ...draft, variant })}>{variant === 'classic' ? 'Klassisch (Steve)' : 'Schlank (Alex)'}</button>)}
          </div>
          <footer className="modal-foot">
            {editing ? <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => fileRef.current?.click()}><ArrowsClockwise size={16} />Datei austauschen</button>
              : <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => setDialog('source')}>Zurück</button>}
            <button type="button" className="btn btn-accent pixel" disabled={nameInvalid || Boolean(busy)} onClick={save}>{busy === 'save' ? 'speichert …' : 'skin speichern'}</button>
          </footer>
        </div>}
      </section>
    </div>, document.body)}
  </div>;
}
