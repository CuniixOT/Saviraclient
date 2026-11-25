import { CaretRight, Check, Lightning } from '@phosphor-icons/react';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { CaseDef, CaseItem, CaseWin, Rarity } from './api';
import { CoinIcon } from './Coins';
import { ItemArt, isCape, RARITY, type SeasonState } from './season';
import chestImage from './assets/rewards/chest.png';
import clickSound from './assets/sounds/click.mp3';
import winSound from './assets/sounds/win.mp3';

// A few players in turn, so fast clicks can overlap instead of cutting each other off.
let clickPool: HTMLAudioElement[] | null = null;
let clickNext = 0;
// The win jingle, quieter than the clicks so it does not blast.
let winAudio: HTMLAudioElement | null = null;
function playWin() {
  winAudio ??= Object.assign(new Audio(winSound), { volume: 0.3, preload: 'auto' });
  winAudio.currentTime = 0;
  winAudio.play().catch(() => { /* Sound is optional. */ });
}
function playClick() {
  clickPool ??= Array.from({ length: 6 }, () => { const audio = new Audio(clickSound); audio.volume = 0.5; audio.preload = 'auto'; return audio; });
  const audio = clickPool[clickNext++ % clickPool.length];
  audio.currentTime = 0;
  audio.play().catch(() => { /* Sound is optional. */ });
}

const de = (value: number) => value.toLocaleString('de-DE');
const pct = (value: number) => `${value.toLocaleString('de-DE', { maximumFractionDigits: 2 })} %`;
// Colour and tint of each case; the chest art is recoloured with a hue filter.
const LOOK: Record<string, { col: string; glow: string; glow2: string; ray: string; hue: string }> = {
  savira: { col: '#f2a93b', glow: 'rgba(242,169,59,0.22)', glow2: 'rgba(242,169,59,0.45)', ray: 'rgba(242,169,59,0.16)', hue: '' },
  legend: { col: '#b48cff', glow: 'rgba(180,140,255,0.22)', glow2: 'rgba(180,140,255,0.45)', ray: 'rgba(180,140,255,0.16)', hue: 'hue-rotate(220deg) saturate(1.2)' },
  starter: { col: '#5fd38a', glow: 'rgba(95,211,138,0.18)', glow2: 'rgba(95,211,138,0.4)', ray: 'rgba(95,211,138,0.14)', hue: 'hue-rotate(60deg)' },
};
const ORDER: Rarity[] = ['L', 'E', 'R', 'U', 'C'];
const CARD = 160; // card width 150 + gap 10
const WIN_AT = 50;
const REEL = 58;

/** Picks a filler card for the reel by the case's odds. Only for show; the main process draws the win. */
function filler(def: CaseDef): CaseItem {
  let roll = Math.random() * 100;
  for (const rarity of ORDER) {
    if (roll < def.odds[rarity]) { const pool = def.items.filter(item => item.rarity === rarity); return pool[Math.floor(Math.random() * pool.length)]; }
    roll -= def.odds[rarity];
  }
  return def.items[def.items.length - 1];
}

function ItemCard({ item, chance, dim = false }: { item: Pick<CaseItem, 'rarity' | 'icon' | 'name' | 'kind'>; chance?: string; dim?: boolean }) {
  const r = RARITY[item.rarity];
  return <div className="cs-card" style={{ '--col': r.col, '--soft': r.soft, '--edge': r.edge, opacity: dim ? .35 : 1 } as CSSProperties}>
    <span className="cs-card-top" />
    <span className="cs-card-head"><i /><span className="mono">{r.label}</span></span>
    <span className="cs-card-art"><ItemArt icon={item.icon} size={60} tint={r.col} soft={r.soft} /></span>
    <span className="cs-card-copy"><b>{item.name}</b><span><small>{item.kind}</small>{chance && <em className="mono">{chance}</em>}</span></span>
  </div>;
}

type Spin = { reel: CaseItem[]; x: number; moving: boolean; dur: number; result: CaseWin; won: boolean };

/** Kisten: pick a case, buy more with coins, open one with the spinning reel. */
export function CasesPage({ season: { season, setSeason, buyCase, openCase }, onError }: { season: SeasonState; onError: (message: string) => void }) {
  const [caseId, setCaseId] = useState('savira');
  const [amount, setAmount] = useState(1);
  const [fast, setFast] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [spin, setSpin] = useState<Spin | null>(null);
  const [busy, setBusy] = useState(false);
  const viewRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  // Width of the reel window, to stop the winning card under the marker.
  const [view, setView] = useState(1268);
  useLayoutEffect(() => { if (spin && viewRef.current) setView(viewRef.current.clientWidth); }, [spin]);
  // A click each time a card passes the marker: it follows the reel's real position, so the clicks
  // come fast at first and slow down with the reel until it stops.
  const reelRef = useRef<HTMLDivElement>(null);
  const moving = Boolean(spin?.moving && !spin.won);
  useEffect(() => {
    if (!moving) return;
    let frame = 0, last = -1, lastAt = 0;
    const step = () => {
      const reel = reelRef.current, viewport = viewRef.current;
      if (reel && viewport) {
        const x = new DOMMatrixReadOnly(getComputedStyle(reel).transform).m41;
        const card = Math.floor((viewport.clientWidth / 2 - x) / CARD);
        const now = performance.now();
        if (last >= 0 && card !== last && now - lastAt > 35) { playClick(); lastAt = now; }
        last = card;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [moving]);

  if (!season) return <div className="empty glass"><h2>Kisten</h2><p>Kisten gibt es im Desktop-Launcher.</p></div>;
  const def = season.cases.find(c => c.id === caseId) ?? season.cases[0];
  const look = LOOK[def.id] ?? LOOK.savira;
  const price = def.price * amount;
  const keys = season.inventory.keys;
  const canOpen = def.owned > 0 || keys > 0;

  async function buy() {
    if (busy || spin) return;
    if (season!.coins < price) { setMsg({ text: 'Nicht genug Coins.', ok: false }); return; }
    setBusy(true);
    try { await buyCase(def.id, amount); setMsg({ text: `+${amount} ${def.name} gekauft`, ok: true }); }
    catch (e) { setMsg({ text: e instanceof Error ? e.message : 'Kauf fehlgeschlagen.', ok: false }); }
    finally { setBusy(false); }
  }
  async function open(repeat = false) {
    if (busy || (spin && !repeat)) return;
    if (!canOpen) { setMsg({ text: 'Keine Kiste übrig. Kauf zuerst eine.', ok: false }); return; }
    setBusy(true); setMsg(null);
    try {
      const result = await openCase(def.id);
      const reel = Array.from({ length: REEL }, () => filler(def));
      reel[WIN_AT] = { ...result.item, chance: 0 };
      const dur = fast ? 1.1 : 6;
      setSpin({ reel, x: 0, moving: false, dur, result, won: false });
      const jitter = Math.floor(Math.random() * 110) - 55;
      timers.current.push(window.setTimeout(() => setSpin(s => s && { ...s, x: -(WIN_AT * CARD + 75 - (viewRef.current?.clientWidth ?? view) / 2 + jitter), moving: true }), 60));
      timers.current.push(window.setTimeout(() => { setSpin(s => s && { ...s, won: true }); setSeason(result.view); playWin(); }, dur * 1000 + 450));
    } catch (e) { onError(e instanceof Error ? e.message : 'Die Kiste ließ sich nicht öffnen.'); }
    finally { setBusy(false); }
  }
  const collect = () => setSpin(null);
  const again = () => { setSpin(null); window.setTimeout(() => { void open(true); }, 40); };
  const win = spin?.won ? spin.result : null;
  const winR = win ? RARITY[win.item.rarity] : null;

  return <div className="cs-page page-enter">
    <div className="cs-glow" aria-hidden="true" />
    <div className="cs-title">
      <div><span className="mono">Shop · Kisten</span><h1>Kisten</h1></div>
      <div className="cs-tabs" role="tablist" aria-label="Kisten">
        {season.cases.map(c => <button key={c.id} role="tab" aria-selected={c.id === def.id} className={c.id === def.id ? 'active' : ''} disabled={Boolean(spin)} onClick={() => { setCaseId(c.id); setMsg(null); }}>
          <i style={{ background: (LOOK[c.id] ?? LOOK.savira).col }} />{c.name}{c.owned > 0 && <small className="mono">{c.owned}</small>}
        </button>)}
      </div>
    </div>

    <section className="cs-stage" style={{ '--glow': look.glow } as CSSProperties}>
      <div className="cs-dots" aria-hidden="true" />
      {!spin ? <div className="cs-case">
        <div className="cs-case-copy">
          <span className="mono cs-tag" style={{ color: look.col }}><i style={{ background: look.col }} />{def.tag}</span>
          <b>{def.name}</b>
          <p>{def.desc}</p>
          <small className="mono">{def.items.length} mögliche Gewinne · Chancen siehst du unten</small>
        </div>
        <div className="cs-case-art">
          <div className="cs-rays" aria-hidden="true" style={{ background: `repeating-conic-gradient(${look.ray} 0deg 8deg, rgba(0,0,0,0) 8deg 24deg)` }} />
          <div className="cs-pulse" aria-hidden="true" style={{ background: `radial-gradient(closest-side, ${look.glow2}, rgba(0,0,0,0))` }} />
          <img className="cs-chest bob" src={chestImage} alt={def.name} draggable={false} style={{ filter: `drop-shadow(0 20px 30px rgba(0,0,0,0.6)) ${look.hue}` }} />
          <span className="mono cs-owned"><span><Check size={10} weight="bold" /></span>Du hast: <b>{def.owned}</b>{keys > 0 && <> · Schlüssel: <b>{keys}</b></>}</span>
        </div>
        <div className="cs-buy">
          <span className="cs-buy-head"><b>Kisten kaufen</b><small>Wähle die Anzahl der zu kaufenden Kisten.</small></span>
          <div className="cs-amounts">{season.buyAmounts.map(n => <button key={n} className={`mono ${n === amount ? 'active' : ''}`} aria-pressed={n === amount} onClick={() => setAmount(n)}>×{n}</button>)}</div>
          <div className="cs-actions">
            <button className="cs-buy-btn" disabled={busy} onClick={buy}>Kaufen · <span>{de(price)}</span><CoinIcon size={14} /></button>
            <button className={`cs-open-btn ${canOpen ? 'on' : ''}`} aria-disabled={!canOpen} disabled={busy} onClick={() => open()}
              style={canOpen ? { background: look.col, boxShadow: `0 10px 30px ${look.glow2}` } : undefined}>
              {def.owned === 0 && keys > 0 ? 'Mit Schlüssel öffnen' : 'Kiste öffnen'}<CaretRight size={13} weight="bold" />
            </button>
          </div>
          <button className="cs-fast" role="switch" aria-checked={fast} onClick={() => setFast(v => !v)}>
            <span><Lightning size={13} weight="bold" />Schnellöffnung</span>
            <span className="cs-switch" style={{ background: fast ? look.col : undefined }}><i className={fast ? 'on' : ''} /></span>
          </button>
          <span className={`mono cs-msg ${msg?.ok ? 'ok' : ''}`} role="status">{msg?.text}</span>
        </div>
      </div> : <div className="cs-reel-wrap">
        <div className="cs-reel-view" ref={viewRef}>
          <div className="cs-reel" ref={reelRef} style={{ transform: `translateX(${spin.x}px)`, transition: spin.moving ? `transform ${spin.dur}s cubic-bezier(0.08, 0.6, 0.12, 1)` : 'none' }}>
            {spin.reel.map((item, i) => <div key={i} className="cs-reel-slot"><ItemCard item={item} dim={spin.won && i !== WIN_AT} /></div>)}
          </div>
        </div>
        <i className="cs-marker" aria-hidden="true" /><i className="cs-marker-top" aria-hidden="true" /><i className="cs-marker-bottom" aria-hidden="true" />
        <span className="mono cs-reel-label">{def.name} · wird geöffnet …</span>
      </div>}
    </section>

    <section className="cs-contents">
      <div className="cs-contents-head">
        <b>Inhalt der Kiste</b>
        <span className="cs-legend">{ORDER.map(r => <span key={r} className="mono"><i style={{ background: RARITY[r].col }} />{RARITY[r].label} <em style={{ color: RARITY[r].col }}>{pct(def.odds[r])}</em></span>)}</span>
      </div>
      <div className="cs-grid-scroll">
        <div className="cs-grid">{def.items.map(item => <ItemCard key={item.id} item={item} chance={pct(item.chance)} />)}</div>
      </div>
    </section>

    {win && winR && <div className="cs-win-backdrop">
      <div className="cs-win" role="dialog" aria-modal="true" aria-label="Gewinn" style={{ background: `radial-gradient(400px 260px at 50% 30%, ${winR.soft}, rgba(18,19,23,0.98) 70%)`, boxShadow: `inset 0 0 0 1.5px ${winR.edge}, 0 40px 120px rgba(0,0,0,0.7)` }}>
        <span className="mono cs-win-kicker">Du hast gewonnen</span>
        <div className="cs-win-art">
          <div className="cs-rays" aria-hidden="true" style={{ width: 260, height: 260, background: `repeating-conic-gradient(${winR.ray} 0deg 8deg, rgba(0,0,0,0) 8deg 22deg)` }} />
          <span className="bob"><ItemArt icon={win.item.icon} size={isCape(win.item.icon) ? 114 : 120} tint={winR.col} soft={winR.soft} /></span>
        </div>
        <span className="mono cs-win-rar" style={{ background: winR.soft, color: winR.col }}>{winR.label}</span>
        <b className="cs-win-name">{win.item.name}</b>
        <span className="cs-win-text">{win.duplicate ? `Schon in deinem Inventar · dafür +${de(win.refund)} Coins` : `${win.item.kind} · wurde in dein Inventar gelegt`}</span>
        <div className="cs-win-actions">
          <button className="cs-again" disabled={!(season.cases.find(c => c.id === def.id)?.owned || season.inventory.keys)} onClick={again}>Nochmal öffnen</button>
          <button className="cs-collect" autoFocus onClick={collect}>Einsammeln</button>
        </div>
      </div>
    </div>}
  </div>;
}
