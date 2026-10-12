import { ArrowsClockwise, Check, FolderOpen, MagnifyingGlass, PencilSimple, Plus, Spinner, TShirt, Trash, UploadSimple, X } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import type { SkinViewer } from 'skinview3d';
import { skinsApi, unwrap, type Accounts, type LibrarySkin, type SkinVariant, type Wardrobe } from './api';
import { PageHeader } from './ui';

type Props = {
  hasAccount: boolean;
  locked: boolean;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
  onApplied: (accounts: Accounts) => void;
};
type Draft = { id?: string; name: string; variant: SkinVariant; png: string; swapped?: boolean };

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
 * cheap enough for a whole grid of cards.
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

/** Turning 3D preview for the add/edit dialog. */
function SkinPreview3D({ png, variant }: { png: string; variant: SkinVariant }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<SkinViewer | null>(null);
  useEffect(() => {
    let disposed = false;
    void import('skinview3d').then(({ SkinViewer, IdleAnimation }) => {
      if (disposed || !canvasRef.current) return;
      const viewer = new SkinViewer({ canvas: canvasRef.current, width: 210, height: 250, zoom: .85, fov: 40 });
      viewer.background = null;
      viewer.autoRotate = true;
      viewer.autoRotateSpeed = .7;
      viewer.controls.enableZoom = false;
      viewer.animation = new IdleAnimation();
      viewer.globalLight.intensity = 2.6;
      viewerRef.current = viewer;
      void viewer.loadSkin(png, { model: variant === 'slim' ? 'slim' : 'default' });
    });
    return () => { disposed = true; viewerRef.current?.dispose(); viewerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { void viewerRef.current?.loadSkin(png, { model: variant === 'slim' ? 'slim' : 'default' }); }, [png, variant]);
  return <canvas ref={canvasRef} className="skin-preview-3d" aria-label="3D-Vorschau des Skins. Ziehen zum Drehen." />;
}

export function SkinsPage({ hasAccount, locked, onNotice, onError, onApplied }: Props) {
  const [wardrobe, setWardrobe] = useState<Wardrobe | null>(null);
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
  const apply = (skin: LibrarySkin) => run(`apply-${skin.id}`, async () => {
    const result = await unwrap(skinsApi.apply(skin.id));
    onApplied(result);
    setWardrobe(current => current ? { ...current, applied: result.applied } : current);
    onNotice(`Du trägst jetzt „${skin.name}“.`);
  });
  const onDrop = (event: DragEvent) => { event.preventDefault(); setDragging(false); void fromFile(event.dataTransfer.files[0]); };

  const visible = (wardrobe?.skins || []).filter(skin => skin.name.toLowerCase().includes(query.trim().toLowerCase()));
  const nameInvalid = !draft?.name.trim() || draft.name.trim().length > 32;

  return <div className={`page page-enter skins-page ${dragging ? 'is-dropping' : ''}`}
    onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragging(true); } }}
    onDragLeave={event => { if (event.currentTarget === event.target) setDragging(false); }} onDrop={onDrop}>
    <PageHeader kicker={`${wardrobe?.skins.length ?? 0} gespeichert`} title="Skins">
      <button className="btn btn-accent pixel" disabled={locked} onClick={openAdd}><Plus size={16} weight="bold" />skin hinzufügen</button>
    </PageHeader>
    <label className="search glass skins-search"><MagnifyingGlass size={18} /><input aria-label="Skins durchsuchen" placeholder="Skins durchsuchen …" value={query} onChange={e => setQuery(e.target.value)} /></label>
    <input ref={fileRef} type="file" accept="image/png" hidden onChange={e => { void fromFile(e.target.files?.[0]); e.target.value = ''; }} />

    <div className="skin-grid">
      {!query && <button className="skin-card skin-add glass" disabled={locked} onClick={openAdd}>
        <span className="skin-add-art"><TShirt size={46} weight="thin" /><i><Plus size={18} weight="bold" /></i></span>
        <strong>Neuen Skin hinzufügen</strong><small><UploadSimple size={13} />Datei, Benutzername, UUID oder Link. PNG auch hierher ziehen.</small>
      </button>}
      {visible.map((skin, index) => {
        const active = wardrobe?.applied === skin.id;
        return <article key={skin.id} className={`skin-card glass ${active ? 'active' : ''}`} style={{ '--i': index } as CSSProperties}>
          <div className="skin-card-art"><SkinFront png={skin.png} variant={skin.variant} />{active && <span className="tag skin-active"><Check size={10} weight="bold" />aktiv</span>}</div>
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
      })}
      {wardrobe && query && !visible.length && <div className="empty glass"><TShirt size={34} weight="thin" /><h2 className="pixel">Kein Skin gefunden</h2><p>Kein Skin heißt wie „{query}“.</p></div>}
    </div>
    {!hasAccount && <p className="fine skins-fine">Zum Auswählen eines Skins musst du mit Microsoft angemeldet sein. Speichern und Vorschau gehen auch ohne.</p>}

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
          <div className="skin-stage-box"><SkinPreview3D png={draft.png} variant={draft.variant} /></div>
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
