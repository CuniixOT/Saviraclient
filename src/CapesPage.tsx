import { CaretDown, Check, CloudArrowUp, DownloadSimple, FlagBanner, GearSix, Globe, Heart, Lock, MagnifyingGlass, Prohibit, Spinner, Trash, UploadSimple, X } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { SkinViewer } from 'skinview3d';
import { capesApi, unwrap, type CapeLibrary, type CapeVisibility, type OwnCape, type VanillaCape, type VanillaCapes } from './api';
import { PageHeader } from './ui';

type Tab = 'all' | 'mine' | 'favorites' | 'vanilla';
type Props = { hasAccount: boolean; skin: string | null; locked: boolean; onNotice: (message: string) => void; onError: (message: string) => void; onCapeChange: () => void };
const tabs: { id: Tab; label: string }[] = [{ id: 'all', label: 'alle' }, { id: 'mine', label: 'meine capes' }, { id: 'favorites', label: 'favoriten' }, { id: 'vanilla', label: 'vanilla' }];

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Das Bild konnte nicht gelesen werden.'));
  image.src = src;
});
function readCape(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (file.type && file.type !== 'image/png') { reject(new Error('Bitte eine PNG-Datei wählen.')); return; }
    if (file.size > 2_000_000) { reject(new Error('Die Datei ist zu groß.')); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const png = String(reader.result);
      try {
        const image = await loadImage(png);
        if (image.width !== image.height * 2 || ![64, 128, 256, 512, 1024].includes(image.width)) throw new Error(`Ein Cape muss 64×32 Pixel groß sein (oder 128×64, 256×128 …). Diese Datei: ${image.width}×${image.height}.`);
        resolve(png);
      } catch (error) { reject(error); }
    };
    reader.onerror = () => reject(new Error('Die Datei konnte nicht gelesen werden.'));
    reader.readAsDataURL(file);
  });
}

// Cape layout on the 64x32 grid; the template colours and names each part.
const PARTS: { x: number; y: number; w: number; h: number; color: string; label: string }[] = [
  { x: 1, y: 1, w: 10, h: 16, color: '#5ccf95', label: 'Außen' },
  { x: 12, y: 1, w: 10, h: 16, color: '#4f8dff', label: 'Innen' },
  { x: 0, y: 1, w: 1, h: 16, color: '#e8a33d', label: '' },
  { x: 11, y: 1, w: 1, h: 16, color: '#e8a33d', label: '' },
  { x: 1, y: 0, w: 10, h: 1, color: '#e5566b', label: '' },
  { x: 11, y: 0, w: 10, h: 1, color: '#8f72f2', label: '' },
  { x: 22, y: 0, w: 24, h: 22, color: '#2ec4b6', label: 'Elytra' }
];
async function makeTemplate(kind: 'pixel' | 'hd') {
  const scale = kind === 'hd' ? 8 : 1;
  const canvas = document.createElement('canvas');
  canvas.width = 64 * scale; canvas.height = 32 * scale;
  const ctx = canvas.getContext('2d')!;
  for (const part of PARTS) {
    ctx.fillStyle = part.color;
    ctx.fillRect(part.x * scale, part.y * scale, part.w * scale, part.h * scale);
  }
  if (kind === 'hd') {
    await document.fonts.ready;
    ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1;
    for (const part of PARTS) for (let x = 0; x <= part.w; x++) for (let y = 0; y <= part.h; y += part.h) {
      ctx.beginPath(); ctx.moveTo((part.x + x) * scale + .5, part.y * scale); ctx.lineTo((part.x + x) * scale + .5, (part.y + part.h) * scale); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const part of PARTS.filter(p => p.label)) {
      ctx.font = `bold ${part.w > 12 ? 22 : 18}px "Segoe UI", sans-serif`;
      ctx.fillText(part.label, (part.x + part.w / 2) * scale, (part.y + part.h / 2) * scale);
    }
    ctx.font = '600 13px "Segoe UI", sans-serif';
    ctx.fillText('Oben', 6 * scale, .5 * scale); ctx.fillText('Unten', 16 * scale, .5 * scale);
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.textAlign = 'left';
    ctx.fillText('Savira Cape-Vorlage · Außen ist die sichtbare Rückseite', 6, 24 * scale);
  }
  return canvas.toDataURL('image/png');
}

/** The visible outer side of a cape (10x16 at 64 px width), drawn pixel-sharp. */
function CapeArt({ png }: { png: string | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!png) return;
    let cancelled = false;
    loadImage(png).then(image => {
      const canvas = ref.current, ctx = canvas?.getContext('2d');
      if (cancelled || !canvas || !ctx) return;
      const s = image.width / 64;
      canvas.width = 10 * s; canvas.height = 16 * s;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, s, s, 10 * s, 16 * s, 0, 0, 10 * s, 16 * s);
    }).catch(() => { /* Broken picture stays empty. */ });
    return () => { cancelled = true; };
  }, [png]);
  return png ? <canvas ref={ref} className="cape-art" aria-hidden="true" /> : <span className="cape-art cape-art-empty" aria-hidden="true"><FlagBanner size={28} weight="thin" /></span>;
}

/** Player seen from behind wearing the cape. */
function CapePreview3D({ png, skin }: { png: string; skin: string | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<SkinViewer | null>(null);
  useEffect(() => {
    let disposed = false;
    void import('skinview3d').then(({ SkinViewer, IdleAnimation }) => {
      if (disposed || !canvasRef.current) return;
      const viewer = new SkinViewer({ canvas: canvasRef.current, width: 210, height: 250, zoom: .85, fov: 40, skin: skin || './default-skin.png' });
      viewer.background = null;
      // Seen from behind at an angle, so the cape is in view; dragging turns the player.
      viewer.controls.enableZoom = false;
      viewer.playerWrapper.rotation.y = Math.PI * .8;
      viewer.animation = new IdleAnimation();
      viewer.globalLight.intensity = 2.6;
      viewerRef.current = viewer;
      void viewer.loadCape(png);
    });
    return () => { disposed = true; viewerRef.current?.dispose(); viewerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { void viewerRef.current?.loadCape(png); }, [png]);
  return <canvas ref={canvasRef} className="skin-preview-3d" aria-label="3D-Vorschau: Spieler von hinten mit dem Cape. Ziehen zum Drehen." />;
}

// Publishing needs the Savira server; until it is live, capes can only be uploaded for yourself.
const PUBLISHING_AVAILABLE = false;
/** Who can see an own cape. "Öffentlich" stays locked until the Savira server exists. */
function VisibilityPick({ value, onChange }: { value: CapeVisibility; onChange: (value: CapeVisibility) => void }) {
  const options: { id: CapeVisibility; label: string; detail: string; icon: typeof Lock }[] = [
    { id: 'private', label: 'Nur für mich', detail: 'Nur du siehst es an deiner Figur.', icon: Lock },
    { id: 'public', label: 'Öffentlich', detail: PUBLISHING_AVAILABLE ? 'Erscheint unter „Alle“ und für andere Spieler.' : 'Kommt mit dem nächsten Update. Bis dahin lädst du Capes nur für dich hoch.', icon: Globe }
  ];
  return <div className="cape-visibility" role="radiogroup" aria-label="Sichtbarkeit">
    {options.map(option => {
      const locked = option.id === 'public' && !PUBLISHING_AVAILABLE;
      return <button key={option.id} type="button" role="radio" aria-checked={value === option.id} disabled={locked} className={`${value === option.id ? 'active' : ''} ${locked ? 'soon' : ''}`} onClick={() => onChange(option.id)}>
      <option.icon size={20} weight={value === option.id ? 'fill' : 'regular'} /><span><strong>{option.label}{locked && <em className="soon-tag">bald</em>}</strong><small>{option.detail}</small></span>
    </button>;
    })}
  </div>;
}
function VisibilityChip({ value }: { value: CapeVisibility }) {
  return <small className={`cape-visibility-chip ${value}`}>{value === 'public' ? <><Globe size={12} weight="bold" />Öffentlich</> : <><Lock size={12} weight="bold" />Nur für mich</>}</small>;
}

function Modal({ title, kicker, onClose, busy, children }: { title: string; kicker: string; onClose: () => void; busy: boolean; children: ReactNode }) {
  return createPortal(<div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="modal glass skin-modal" role="dialog" aria-modal="true" aria-labelledby="cape-dialog-title">
      <header className="modal-head"><div><p className="kicker pixel">{kicker}</p><h2 id="cape-dialog-title" className="pixel">{title}</h2></div>
        <button className="btn btn-icon" aria-label="Dialog schließen" disabled={busy} onClick={onClose}><X size={18} /></button></header>
      {children}
    </section>
  </div>, document.body);
}

export function CapesPage({ hasAccount, skin, locked, onNotice, onError, onCapeChange }: Props) {
  const [tab, setTab] = useState<Tab>('mine');
  const [library, setLibrary] = useState<CapeLibrary | null>(null);
  const [vanilla, setVanilla] = useState<VanillaCapes | null>(null);
  const [vanillaState, setVanillaState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState('');
  const [templateOpen, setTemplateOpen] = useState(false);
  const [upload, setUpload] = useState<{ name: string; png: string; visibility: CapeVisibility } | null>(null);
  const [managing, setManaging] = useState<{ id: string; name: string; visibility: CapeVisibility } | null>(null);
  const [mineFilter, setMineFilter] = useState<'all' | CapeVisibility>('all');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const templateRef = useRef<HTMLDivElement>(null);

  useEffect(() => { unwrap(capesApi.list()).then(setLibrary).catch(e => onError(e.message)); }, [onError]);
  const loadVanilla = useCallback(() => {
    setVanillaState('loading');
    unwrap(capesApi.vanilla()).then(next => { setVanilla(next); setVanillaState('idle'); onCapeChange(); }).catch(e => { setVanillaState('error'); onError(e.message); });
  }, [onError, onCapeChange]);
  // Vanilla capes come from Mojang, so they are only fetched when a tab needs them.
  useEffect(() => { if (hasAccount && !vanilla && vanillaState === 'idle' && (tab === 'vanilla' || tab === 'favorites')) loadVanilla(); }, [tab, hasAccount, vanilla, vanillaState, loadVanilla]);
  useEffect(() => { if (!confirmDelete) return; const timer = setTimeout(() => setConfirmDelete(null), 3500); return () => clearTimeout(timer); }, [confirmDelete]);
  useEffect(() => {
    if (!templateOpen) return;
    const close = (event: MouseEvent | KeyboardEvent) => { if (event instanceof KeyboardEvent ? event.key === 'Escape' : !templateRef.current?.contains(event.target as Node)) setTemplateOpen(false); };
    window.addEventListener('mousedown', close); window.addEventListener('keydown', close);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', close); };
  }, [templateOpen]);

  async function run(name: string, work: () => Promise<void>) {
    if (busy) return;
    setBusy(name);
    try { await work(); } catch (e) { onError(e instanceof Error ? e.message : 'Das hat nicht geklappt.'); }
    finally { setBusy(''); }
  }
  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    await run('file', async () => setUpload({ name: file.name.replace(/\.png$/i, '').slice(0, 32).trim() || 'Mein Cape', png: await readCape(file), visibility: 'private' }));
  };
  const onDrop = (event: DragEvent) => { event.preventDefault(); setDragging(false); void pickFile(event.dataTransfer.files[0]); };
  const saveUpload = () => run('upload', async () => {
    if (!upload) return;
    setLibrary(await unwrap(capesApi.add(upload)));
    onNotice(upload.visibility === 'public' ? `Cape „${upload.name.trim()}“ hochgeladen und zum Veröffentlichen markiert.` : `Cape „${upload.name.trim()}“ nur für dich hochgeladen.`);
    setUpload(null); setTab('mine'); setMineFilter('all');
  });
  const template = (kind: 'pixel' | 'hd') => run('template', async () => {
    setTemplateOpen(false);
    const saved = await unwrap(capesApi.template(kind, await makeTemplate(kind)));
    if (saved) onNotice('Vorlage gespeichert.');
  });
  const wear = (cape: OwnCape) => run(`wear-${cape.id}`, async () => {
    const off = library?.active === cape.id;
    setLibrary(await unwrap(capesApi.wear(off ? null : cape.id)));
    onCapeChange();
    onNotice(off ? 'Cape abgelegt.' : `Du trägst „${cape.name}“ im Spiel (Savira-Profil).`);
  });
  const favorite = (key: string) => run(`fav-${key}`, async () => setLibrary(await unwrap(capesApi.favorite(key))));
  const remove = (cape: OwnCape) => {
    if (confirmDelete !== cape.id) { setConfirmDelete(cape.id); return; }
    void run(`delete-${cape.id}`, async () => { setLibrary(await unwrap(capesApi.remove(cape.id))); onCapeChange(); setConfirmDelete(null); onNotice(`Cape „${cape.name}“ gelöscht.`); });
  };
  const saveManage = () => run('manage', async () => {
    if (!managing) return;
    const before = library?.capes.find(cape => cape.id === managing.id);
    setLibrary(await unwrap(capesApi.update(managing.id, { name: managing.name, visibility: managing.visibility })));
    onNotice(before && before.visibility !== managing.visibility ? (managing.visibility === 'public' ? 'Cape zum Veröffentlichen markiert.' : 'Cape ist jetzt nur für dich.') : 'Cape gespeichert.');
    setManaging(null);
  });
  const chooseVanilla = (cape: VanillaCape | null) => run(`vanilla-${cape?.id ?? 'none'}`, async () => {
    const next = await unwrap(capesApi.setVanilla(cape?.id ?? null));
    setVanilla(next.vanilla); setLibrary(next.library);
    onCapeChange();
    onNotice(cape ? `Vanilla-Cape „${cape.name}“ angelegt.` : 'Kein Cape: Dein Cape ist ausgeblendet.');
  });

  const match = (name: string) => name.toLowerCase().includes(query.trim().toLowerCase());
  const favorites = new Set(library?.favorites || []);
  const own = (library?.capes || []).filter(cape => match(cape.name));
  const mine = own.filter(cape => mineFilter === 'all' || cape.visibility === mineFilter);
  const published = (library?.capes || []).filter(cape => cape.visibility === 'public' && match(cape.name));
  const favOwn = own.filter(cape => favorites.has(`custom:${cape.id}`));
  const favVanilla = (vanilla?.capes || []).filter(cape => favorites.has(`vanilla:${cape.id}`) && match(cape.name));
  const nameInvalid = (value: string | undefined) => !value?.trim() || value.trim().length > 32;

  const heart = (key: string, name: string) => <button className={`cape-heart ${favorites.has(key) ? 'on' : ''}`} aria-pressed={favorites.has(key)} aria-label={favorites.has(key) ? `${name} aus Favoriten entfernen` : `${name} zu Favoriten`} onClick={() => favorite(key)}><Heart size={15} weight={favorites.has(key) ? 'fill' : 'bold'} /></button>;
  const ownCard = (cape: OwnCape, index: number) => {
    const worn = library?.active === cape.id;
    return <article key={cape.id} className={`cape-card glass ${worn ? 'active' : ''}`} style={{ '--i': index } as CSSProperties}>
      {heart(`custom:${cape.id}`, cape.name)}
      <div className="cape-card-art"><CapeArt png={cape.png} />{worn && <span className="tag skin-active"><Check size={10} weight="bold" />getragen</span>}</div>
      <button className="cape-gear" aria-label={`${cape.name} verwalten`} title="Verwalten: umbenennen, Sichtbarkeit, löschen" disabled={locked} onClick={() => setManaging({ id: cape.id, name: cape.name, visibility: cape.visibility })}><GearSix size={15} weight="bold" /></button>
      <h2>{cape.name}</h2>
      <VisibilityChip value={cape.visibility} />
      <button className={`btn w-full pixel ${worn ? '' : 'btn-accent'}`} disabled={locked || Boolean(busy)} onClick={() => wear(cape)}>{worn ? 'ablegen' : 'tragen'}</button>
    </article>;
  };
  const vanillaCard = (cape: VanillaCape | null, index: number) => {
    const active = cape ? vanilla?.active === cape.id && !library?.active : !vanilla?.active && !library?.active;
    const key = cape ? `vanilla-${cape.id}` : 'vanilla-none';
    return <article key={key} className={`cape-card glass ${active ? 'active' : ''}`} style={{ '--i': index } as CSSProperties}>
      {cape && heart(`vanilla:${cape.id}`, cape.name)}
      <button className="cape-pick" disabled={locked || active || Boolean(busy)} aria-pressed={active} aria-label={cape ? `${cape.name} anlegen` : 'Kein Cape'} onClick={() => chooseVanilla(cape)}>
        <div className="cape-card-art">{cape ? <CapeArt png={cape.png} /> : <span className="cape-art cape-art-empty"><Prohibit size={30} weight="thin" /></span>}{active && <span className="tag skin-active"><Check size={10} weight="bold" />aktiv</span>}{busy === key && <Spinner size={22} className="spin cape-busy" />}</div>
        <h2>{cape ? cape.name : 'Kein Cape'}</h2>
      </button>
    </article>;
  };
  const empty = (icon: ReactNode, title: string, text: string, action?: ReactNode) => <div className="empty glass">{icon}<h2 className="pixel">{title}</h2><p>{text}</p>{action}</div>;
  const uploadButton = <button className="btn btn-accent pixel" disabled={locked} onClick={() => fileRef.current?.click()}><UploadSimple size={16} />cape hochladen</button>;
  const signIn = empty(<Globe size={34} weight="thin" />, 'Anmeldung nötig', 'Melde dich mit Microsoft an, um die Vanilla-Capes deines Kontos zu sehen und zu wechseln.');

  return <div className={`page page-enter capes-page ${dragging ? 'is-dropping' : ''}`}
    onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragging(true); } }}
    onDragLeave={event => { if (event.currentTarget === event.target) setDragging(false); }} onDrop={onDrop}>
    <PageHeader kicker={`${library?.capes.length ?? 0} eigene`} title="Capes">
      <div className="cape-template" ref={templateRef}>
        <button className="btn" aria-haspopup="menu" aria-expanded={templateOpen} disabled={Boolean(busy)} onClick={() => setTemplateOpen(open => !open)}><DownloadSimple size={16} />Vorlage<CaretDown size={13} /></button>
        {templateOpen && <div className="cape-template-menu glass" role="menu">
          <button role="menuitem" onClick={() => template('pixel')}><strong>Pixel · 64×32</strong><small>Wie Minecraft, zum Pixeln</small></button>
          <button role="menuitem" onClick={() => template('hd')}><strong>HD · 512×256</strong><small>Beschriftet, für Bildbearbeitung</small></button>
        </div>}
      </div>
      <button className="btn btn-accent pixel" disabled={locked} onClick={() => fileRef.current?.click()}><CloudArrowUp size={16} />hochladen</button>
    </PageHeader>
    <input ref={fileRef} type="file" accept="image/png" hidden onChange={e => { void pickFile(e.target.files?.[0]); e.target.value = ''; }} />

    <div className="settings-tabs cape-tabs" role="tablist" aria-label="Cape-Kategorien">
      {tabs.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} className={`pixel ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>)}
    </div>
    <label className="search glass skins-search"><MagnifyingGlass size={18} /><input aria-label="Capes durchsuchen" placeholder={tab === 'vanilla' ? 'Vanilla-Capes durchsuchen …' : 'Capes durchsuchen …'} value={query} onChange={e => setQuery(e.target.value)} /></label>
    {PUBLISHING_AVAILABLE && tab === 'mine' && Boolean(library?.capes.length) && <div className="segmented cape-filter" role="radiogroup" aria-label="Meine Capes filtern">
      {([['all', 'alle'], ['private', 'nur für mich'], ['public', 'öffentlich']] as const).map(([id, label]) => <button key={id} role="radio" aria-checked={mineFilter === id} className={`pixel ${mineFilter === id ? 'active' : ''}`} onClick={() => setMineFilter(id)}>{label}</button>)}
    </div>}

    <div className="cape-grid" role="tabpanel">
      {tab === 'all' && (published.length ? published.map(ownCard) : empty(<Globe size={34} weight="thin" />, 'Kommt mit dem nächsten Update', 'Hier erscheinen bald die Capes aller Savira-Spieler, und du kannst eigene Capes veröffentlichen. Bis dahin lädst du Capes nur für dich hoch und trägst sie im Spiel.', uploadButton))}
      {tab === 'mine' && (mine.length ? mine.map(ownCard) : empty(<FlagBanner size={34} weight="thin" />, query || mineFilter !== 'all' ? 'Kein Cape gefunden' : 'Noch keine eigenen Capes', query || mineFilter !== 'all' ? 'Nichts passt zu Suche oder Filter.' : 'Lade ein 64×32-PNG hoch oder ziehe es hierher. Mit der Vorlage gestaltest du dein eigenes Design.', query || mineFilter !== 'all' ? undefined : uploadButton))}
      {tab === 'favorites' && (favOwn.length || favVanilla.length
        ? [...favOwn.map(ownCard), ...favVanilla.map((cape, i) => vanillaCard(cape, favOwn.length + i))]
        : empty(<Heart size={34} weight="thin" />, 'Keine Favoriten', 'Tippe bei einem Cape auf das Herz, dann findest du es hier wieder.'))}
      {tab === 'vanilla' && (!hasAccount ? signIn
        : vanillaState === 'loading' && !vanilla ? <div className="empty glass"><Spinner size={30} className="spin" /><p>Capes werden von Mojang geladen …</p></div>
        : vanillaState === 'error' && !vanilla ? empty(<Globe size={34} weight="thin" />, 'Nicht erreichbar', 'Die Capes konnten nicht geladen werden.', <button className="btn" onClick={loadVanilla}>Erneut versuchen</button>)
        : [vanillaCard(null, 0), ...(vanilla?.capes || []).filter(cape => match(cape.name)).map((cape, i) => vanillaCard(cape, i + 1))])}
    </div>
    {tab === 'vanilla' && hasAccount && vanilla && !vanilla.capes.length && <p className="fine skins-fine">Dein Konto besitzt keine Vanilla-Capes. Mojang verteilt sie z. B. bei Events oder für Minecon-Tickets.</p>}
    {(tab === 'mine' || tab === 'all') && Boolean(library?.capes.length) && <p className="fine skins-fine">Eigene Capes siehst du im Savira-Profil an deiner Figur. Veröffentlichen für andere Spieler kommt mit dem nächsten Update.</p>}

    {upload && <Modal title="Vorschau" kicker="cape hochladen" busy={Boolean(busy)} onClose={() => setUpload(null)}>
      <div className="skin-edit">
        <p className="cape-question">Sieht das richtig aus?</p>
        <div className="skin-stage-box"><CapePreview3D png={upload.png} skin={skin} /></div>
        <label className="field" htmlFor="cape-name"><span>Name</span></label>
        <input id="cape-name" className={`input ${nameInvalid(upload.name) ? 'invalid' : ''}`} value={upload.name} maxLength={32} onChange={e => setUpload({ ...upload, name: e.target.value })} />
        <VisibilityPick value={upload.visibility} onChange={visibility => setUpload({ ...upload, visibility })} />
        <footer className="modal-foot">
          <button className="btn" disabled={Boolean(busy)} onClick={() => setUpload(null)}>Abbrechen</button>
          <button className="btn btn-accent pixel" disabled={nameInvalid(upload.name) || Boolean(busy)} onClick={saveUpload}>{busy === 'upload' ? 'speichert …' : 'cape hochladen'}</button>
        </footer>
      </div>
    </Modal>}
    {managing && (() => {
      const cape = library?.capes.find(item => item.id === managing.id);
      if (!cape) return null;
      const worn = library?.active === cape.id;
      return <Modal title="Cape verwalten" kicker="meine capes" busy={Boolean(busy)} onClose={() => setManaging(null)}>
        <form className="skin-edit" onSubmit={event => { event.preventDefault(); if (!nameInvalid(managing.name)) void saveManage(); }}>
          <div className="cape-manage-head"><CapeArt png={cape.png} /><div><strong>{cape.name}</strong><small>{worn ? 'Wird gerade getragen' : 'Nicht angelegt'}</small>
            <button type="button" className={`btn pixel ${worn ? '' : 'btn-accent'}`} disabled={Boolean(busy)} onClick={() => wear(cape)}>{worn ? 'ablegen' : 'tragen'}</button></div></div>
          <label className="field" htmlFor="cape-rename"><span>Name</span></label>
          <input id="cape-rename" className={`input ${nameInvalid(managing.name) ? 'invalid' : ''}`} autoFocus value={managing.name} maxLength={32} onChange={e => setManaging({ ...managing, name: e.target.value })} />
          <span className="field-label">Sichtbarkeit</span>
          <VisibilityPick value={managing.visibility} onChange={visibility => setManaging({ ...managing, visibility })} />
          <footer className="modal-foot">
            <button type="button" className={`btn ${confirmDelete === cape.id ? 'btn-danger' : ''}`} disabled={Boolean(busy)} onClick={() => { if (confirmDelete === cape.id) setManaging(null); remove(cape); }}><Trash size={15} />{confirmDelete === cape.id ? 'Wirklich löschen?' : 'Löschen'}</button>
            <span className="modal-foot-actions"><button type="button" className="btn" onClick={() => setManaging(null)}>Abbrechen</button>
              <button type="submit" className="btn btn-accent pixel" disabled={nameInvalid(managing.name) || Boolean(busy)}>{busy === 'manage' ? 'speichert …' : 'speichern'}</button></span>
          </footer>
        </form>
      </Modal>;
    })()}
  </div>;
}
