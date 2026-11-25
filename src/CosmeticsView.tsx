import { ArrowClockwise, ArrowCounterClockwise, Crosshair, Pause, Play } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import type { SkinViewer } from 'skinview3d';
import type { Season, State } from './api';
import { RARITY } from './season';

// Categories and the planned cosmetics. None can be worn yet: they come with the next update.
// ids that match inventory entries (from cases or the Season Pass) show as owned.
type Cat = { id: string; label: string; title: string; d: string };
const CATS: Cat[] = [
  { id: 'all', label: 'Alle', title: 'Alle Cosmetics', d: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' },
  { id: 'hat', label: 'Hüte', title: 'Hüte & Mützen', d: 'M3 8l4 4 5-7 5 7 4-4-2 11H5z' },
  { id: 'back', label: 'Rücken', title: 'Rücken & Flügel', d: 'M6 8a6 6 0 0 1 12 0v12H6zM9 4V3h6v1M9 13h6v4H9z' },
  { id: 'hand', label: 'Hand', title: 'Hand-Items', d: 'M8 13V5a1.5 1.5 0 0 1 3 0v6M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3 14a1.6 1.6 0 0 1 2.6-1.8L8 15' },
  { id: 'balloon', label: 'Ballons', title: 'Ballons', d: 'M12 3a6 6 0 0 0-6 6c0 4 3.5 7 6 7s6-3 6-7a6 6 0 0 0-6-6zM12 16l-1 2h2zM12 18c0 2-2 2-2 3' },
  { id: 'pet', label: 'Pets', title: 'Pets & Begleiter', d: 'M8 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM16 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM5 15a2 2 0 1 0 0-4M19 15a2 2 0 1 0 0-4M12 13c-3 0-5 3-5 5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2c0-2-2-5-5-5z' },
  { id: 'cape', label: 'Capes', title: 'Capes', d: 'M5 4h14l-3 8 3 8H5' },
  { id: 'emote', label: 'Emotes', title: 'Emotes', d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01' },
  { id: 'overlay', label: 'Overlays', title: 'Overlays & Effekte', d: 'M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8zM19 15l.9 2.1 2.1.9-2.1.9L19 21l-.9-2.1-2.1-.9 2.1-.9z' },
];
type Rar = 'L' | 'E' | 'R' | 'U' | 'C';
const COS: { id: string; cat: string; name: string; r: Rar; kind: string }[] = [
  { id: 'krone', cat: 'hat', name: 'Goldene Krone', r: 'L', kind: 'Hut' },
  { id: 'zylinder', cat: 'hat', name: 'Zylinder', r: 'E', kind: 'Hut' },
  { id: 'frosch', cat: 'hat', name: 'Froschmütze', r: 'R', kind: 'Mütze' },
  { id: 'hase', cat: 'hat', name: 'Hasenohren', r: 'U', kind: 'Mütze' },
  { id: 'cap', cat: 'hat', name: 'Basecap', r: 'C', kind: 'Mütze' },
  { id: 'wings', cat: 'back', name: 'Flügel', r: 'L', kind: 'Rücken' },
  { id: 'katanas', cat: 'back', name: 'Katanas', r: 'E', kind: 'Rücken' },
  { id: 'rucksack', cat: 'back', name: 'Rucksack', r: 'R', kind: 'Rücken' },
  { id: 'jetpack', cat: 'back', name: 'Jetpack', r: 'U', kind: 'Rücken' },
  { id: 'stab', cat: 'hand', name: 'Arkaner Stab', r: 'L', kind: 'Hand-Item' },
  { id: 'fackel', cat: 'hand', name: 'Fackel', r: 'R', kind: 'Hand-Item' },
  { id: 'laterne', cat: 'hand', name: 'Laterne', r: 'U', kind: 'Hand-Item' },
  { id: 'b-savira', cat: 'balloon', name: 'Savira-Ballon', r: 'E', kind: 'Ballon' },
  { id: 'b-herz', cat: 'balloon', name: 'Herz-Ballon', r: 'R', kind: 'Ballon' },
  { id: 'b-rot', cat: 'balloon', name: 'Roter Ballon', r: 'C', kind: 'Ballon' },
  { id: 'fox', cat: 'pet', name: 'Fuchs', r: 'E', kind: 'Pet' },
  { id: 'owl', cat: 'pet', name: 'Schneeeule', r: 'R', kind: 'Pet' },
  { id: 'slime', cat: 'pet', name: 'Slime', r: 'U', kind: 'Pet' },
  { id: 'cape-season', cat: 'cape', name: 'Season-Cape', r: 'L', kind: 'Cape' },
  { id: 'cape-animated', cat: 'cape', name: 'Animiertes Cape', r: 'E', kind: 'Cape' },
  { id: 'cape-cross', cat: 'cape', name: 'Cape „Kreuz“', r: 'R', kind: 'Cape' },
  { id: 'emote-dance', cat: 'emote', name: 'Tanzen', r: 'E', kind: 'Emote' },
  { id: 'emote-cheer', cat: 'emote', name: 'Jubeln', r: 'R', kind: 'Emote' },
  { id: 'emote-clap', cat: 'emote', name: 'Klatschen', r: 'U', kind: 'Emote' },
  { id: 'particles', cat: 'overlay', name: 'Partikel-Spur', r: 'E', kind: 'Effekt' },
  { id: 'aura', cat: 'overlay', name: 'Frost-Aura', r: 'E', kind: 'Effekt' },
  { id: 'embers', cat: 'overlay', name: 'Glut-Partikel', r: 'R', kind: 'Effekt' },
  { id: 'glow', cat: 'overlay', name: 'Umriss-Glow', r: 'U', kind: 'Effekt' },
];
const iconOf = (cat: string) => (CATS.find(c => c.id === cat) ?? CATS[0]).d;

const REST_YAW = -0.45;
/**
 * The account's skin in 3D, without a name tag. Drag turns it in every direction (also from above
 * and below), the wheel zooms; the buttons turn it, let it spin on its own or reset the view.
 */
function Preview3D({ skin, cape }: { skin: string | null; cape: string | null }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<SkinViewer | null>(null);
  const [auto, setAuto] = useState(false);
  const [angle, setAngle] = useState(0);

  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    let disposed = false, observer: ResizeObserver | undefined, frame = 0;
    void import('skinview3d').then(({ SkinViewer, IdleAnimation }) => {
      if (disposed) return;
      const viewer = new SkinViewer({ canvas, width: wrap.clientWidth || 340, height: wrap.clientHeight || 420, skin: skin || './default-skin.png', zoom: .78, fov: 40 });
      viewerRef.current = viewer;
      viewer.background = null;
      viewer.globalLight.intensity = 2.6;
      viewer.cameraLight.intensity = .6;
      viewer.controls.enableRotate = true;
      viewer.controls.enablePan = false;
      viewer.controls.enableZoom = true;
      viewer.controls.minDistance = 30;
      viewer.controls.maxDistance = 90;
      viewer.controls.rotateSpeed = .8;
      viewer.controls.enableDamping = true;
      viewer.controls.dampingFactor = .12;
      viewer.controls.saveState();
      viewer.playerWrapper.rotation.y = REST_YAW;
      viewer.animation = new IdleAnimation();
      if (cape) void viewer.loadCape(cape);
      observer = new ResizeObserver(() => viewer.setSize(wrap.clientWidth, wrap.clientHeight));
      observer.observe(wrap);
      // The angle label follows the camera and the figure's own turn.
      const tick = () => {
        const azimuth = viewer.controls.getAzimuthalAngle() - viewer.playerWrapper.rotation.y;
        setAngle(Math.round((((azimuth * 180) / Math.PI) % 360 + 360) % 360));
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });
    return () => { disposed = true; cancelAnimationFrame(frame); observer?.disconnect(); viewerRef.current?.dispose(); viewerRef.current = null; };
    // The viewer is built once; skin and cape changes load into it below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { void viewerRef.current?.loadSkin(skin || './default-skin.png'); }, [skin]);
  useEffect(() => { const viewer = viewerRef.current; if (!viewer) return; if (cape) void viewer.loadCape(cape); else viewer.resetCape(); }, [cape]);
  useEffect(() => { const viewer = viewerRef.current; if (viewer) { viewer.autoRotate = auto; viewer.autoRotateSpeed = 1.2; } }, [auto]);

  const turn = (by: number) => { const viewer = viewerRef.current; if (viewer) viewer.playerWrapper.rotation.y += by; };
  const reset = () => { const viewer = viewerRef.current; if (!viewer) return; setAuto(false); viewer.controls.reset(); viewer.playerWrapper.rotation.y = REST_YAW; };

  return <>
    <div className="cos-stage" ref={wrapRef}>
      <div className="cs-dots" aria-hidden="true" />
      <canvas ref={canvasRef} aria-label="3D-Vorschau deines Skins. Mit der Maus ziehen zum Drehen, Mausrad zum Zoomen." />
      <span className="mono cos-hint"><ArrowCounterClockwise size={11} weight="bold" />Ziehen zum Drehen</span>
      <span className="mono cos-angle">{auto ? '360° · Auto' : `${angle}°`}</span>
    </div>
    <div className="cos-controls">
      <button className="cos-round" aria-label="Nach links drehen" onClick={() => turn(-Math.PI / 4)}><ArrowCounterClockwise size={14} /></button>
      <button className={`cos-auto ${auto ? 'on' : ''}`} aria-pressed={auto} onClick={() => setAuto(v => !v)}>{auto ? <><Pause size={13} weight="fill" />Drehung stoppen</> : <><Play size={13} weight="fill" />Automatisch drehen</>}</button>
      <button className="cos-round" aria-label="Nach rechts drehen" onClick={() => turn(Math.PI / 4)}><ArrowClockwise size={14} /></button>
      <button className="cos-round" aria-label="Ansicht zurücksetzen" onClick={reset}><Crosshair size={14} /></button>
    </div>
  </>;
}

/** Garderobe › Cosmetics: categories, the 3D preview and the cosmetics (coming with the next update). */
export function CosmeticsView({ state, season }: { state: State; season: Season | null }) {
  const [cat, setCat] = useState('all');
  const owned = new Set(season?.inventory.cosmetics ?? []);
  const shown = COS.filter(c => cat === 'all' || c.cat === cat);
  const current = CATS.find(c => c.id === cat) ?? CATS[0];
  const name = state.account?.name || 'Steve';

  return <div className="cos-layout">
    <nav className="cos-cats glass" aria-label="Kategorien">
      {CATS.map(c => <button key={c.id} className={c.id === cat ? 'active' : ''} aria-pressed={c.id === cat} onClick={() => setCat(c.id)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={c.d} /></svg>
        {c.label}<small className="mono">{c.id === 'all' ? COS.length : COS.filter(x => x.cat === c.id).length}</small>
      </button>)}
    </nav>

    <section className="cos-preview glass" aria-label="3D-Vorschau">
      <div className="cos-preview-head">
        <span><b>{name}</b><small className="mono">Skin · {state.cape ? 'mit Cape' : 'ohne Cape'}</small></span>
        <span className="mono cos-slots"><i />0 angelegt</span>
      </div>
      <Preview3D skin={state.account?.skin || null} cape={state.cape ?? null} />
      <p className="cos-note">Cosmetics anlegen kommt mit dem nächsten Update. Bis dahin siehst du hier deinen Skin.</p>
    </section>

    <div className="cos-list">
      <div className="cos-list-head">
        <span><b>{current.title}</b><small className="mono">{shown.length} Einträge</small></span>
        <span className="mono cos-soon-pill">Coming soon</span>
      </div>
      <div className="cos-grid-scroll">
        <div className="cos-grid">{shown.map(item => {
          const r = RARITY[item.r];
          const have = owned.has(item.id);
          return <article key={item.id} className="cos-card">
            <div className="cos-card-art" style={{ background: `radial-gradient(closest-side, ${r.soft}, rgba(0,0,0,0)), #121316` }}>
              <span className="cos-card-line" style={{ background: r.col }} />
              <span className="cos-card-icon" style={{ background: r.soft, color: r.col, boxShadow: `inset 0 0 0 1px ${r.edge}` }}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={iconOf(item.cat)} /></svg>
              </span>
              <span className="mono cos-card-rar" style={{ color: r.col }}>{r.label}</span>
              {have && <span className="mono cos-card-owned">Im Besitz</span>}
            </div>
            <div className="cos-card-copy"><b>{item.name}</b><small className="mono">{item.kind}</small></div>
            <button className="cos-card-btn" disabled>Bald verfügbar</button>
          </article>;
        })}</div>
      </div>
    </div>
  </div>;
}
