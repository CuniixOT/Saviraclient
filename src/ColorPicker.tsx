import { Check, Eyedropper, X } from '@phosphor-icons/react';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';

type Hsv = { h: number; s: number; v: number };
const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map(n => Math.round(n).toString(16).padStart(2, '0')).join('')}`;
const parseHex = (hex: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim()); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
function hsvToRgb({ h, s, v }: Hsv) {
  const f = (n: number) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}
function rgbToHsv(r: number, g: number, b: number): Hsv {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  const h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max === 0 ? 0 : d / max, v: max };
}
// Chromium's EyeDropper API; not in TypeScript's DOM lib yet.
type EyeDropperCtor = new () => { open(): Promise<{ sRGBHex: string }> };
const EyeDropperApi = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;

type Props = { value: string; onPreview: (hex: string) => void; onApply: (hex: string) => void; onCancel: () => void };

export function ColorPicker({ value, onPreview, onApply, onCancel }: Props) {
  const [hsv, setHsv] = useState<Hsv>(() => { const rgb = parseHex(value) ?? [92, 207, 149]; return rgbToHsv(rgb[0], rgb[1], rgb[2]); });
  const rgb = hsvToRgb(hsv).map(Math.round);
  const hex = toHex(rgb[0], rgb[1], rgb[2]);
  const [hexDraft, setHexDraft] = useState(hex);
  const field = useRef<HTMLDivElement>(null), hueBar = useRef<HTMLDivElement>(null);

  useEffect(() => { onPreview(hex); setHexDraft(hex); }, [hex]);
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // Drag helpers: capture the pointer so dragging keeps working outside the element.
  const dragOn = (ref: RefObject<HTMLDivElement | null>, apply: (x: number, y: number) => void) => (event: PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    el.setPointerCapture(event.pointerId);
    const update = (e: { clientX: number; clientY: number }) => { const r = el.getBoundingClientRect(); apply(clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height)); };
    update(event);
    const move = (e: globalThis.PointerEvent) => update(e);
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  const fieldKeys = (event: KeyboardEvent) => {
    const step = event.shiftKey ? .1 : .02;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[event.key];
    if (!delta) return; event.preventDefault();
    setHsv(c => ({ ...c, s: clamp(c.s + delta[0]), v: clamp(c.v + delta[1]) }));
  };
  const hueKeys = (event: KeyboardEvent) => {
    const step = event.shiftKey ? 15 : 3;
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return; event.preventDefault();
    setHsv(c => ({ ...c, h: (c.h + (event.key === 'ArrowDown' ? step : -step) + 360) % 360 }));
  };
  const setRgb = (index: number, raw: string) => {
    const n = Math.round(clamp(Number(raw) || 0, 0, 255)), next = [...rgb]; next[index] = n;
    setHsv(c => { const v = rgbToHsv(next[0], next[1], next[2]); return v.s === 0 || v.v === 0 ? { ...v, h: c.h } : v; });
  };
  const commitHex = () => { const parsed = parseHex(hexDraft); if (parsed) setHsv(rgbToHsv(parsed[0], parsed[1], parsed[2])); else setHexDraft(hex); };
  const pick = async () => { try { const result = await new EyeDropperApi!().open(); const parsed = parseHex(result.sRGBHex); if (parsed) setHsv(rgbToHsv(parsed[0], parsed[1], parsed[2])); } catch { /* Picker dismissed. */ } };
  const hueColor = toHex(...(hsvToRgb({ h: hsv.h, s: 1, v: 1 }) as [number, number, number]));

  // Portal to <body>: glass panels use backdrop-filter, which would trap a fixed overlay inside them.
  return createPortal(<div className="modal-backdrop" onMouseDown={onCancel}>
    <section className="modal glass color-modal" role="dialog" aria-modal="true" aria-labelledby="color-title" onMouseDown={e => e.stopPropagation()} style={{ '--pick': hex } as CSSProperties}>
      <header className="color-head">
        <h2 id="color-title" className="pixel">farbwähler</h2>
        <button className="btn btn-icon" aria-label="Schließen" onClick={onCancel}><X size={16} /></button>
      </header>

      <div className="color-body">
        <div ref={field} className="sv-field" style={{ background: hueColor }} tabIndex={0} role="slider" aria-label="Sättigung und Helligkeit" aria-valuetext={`Sättigung ${Math.round(hsv.s * 100)} %, Helligkeit ${Math.round(hsv.v * 100)} %`}
          onPointerDown={dragOn(field, (x, y) => setHsv(c => ({ ...c, s: x, v: 1 - y })))} onKeyDown={fieldKeys} autoFocus>
          <i className="sv-white" /><i className="sv-black" />
          <span className="sv-handle" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
        </div>
        <div ref={hueBar} className="hue-bar" tabIndex={0} role="slider" aria-label="Farbton" aria-valuemin={0} aria-valuemax={360} aria-valuenow={Math.round(hsv.h)}
          onPointerDown={dragOn(hueBar, (_x, y) => setHsv(c => ({ ...c, h: y * 359.9 })))} onKeyDown={hueKeys}>
          <span className="hue-handle" style={{ top: `${hsv.h / 360 * 100}%` }} />
        </div>
      </div>

      <div className="color-inputs">
        <label className="color-input hex"><span>Hex</span><input className="input" value={hexDraft} maxLength={7} spellCheck={false} onChange={e => setHexDraft(e.target.value)} onBlur={commitHex} onKeyDown={e => { if (e.key === 'Enter') commitHex(); }} /></label>
        {(['R', 'G', 'B'] as const).map((label, i) => <label key={label} className="color-input"><span>{label}</span><input className="input" type="number" min={0} max={255} value={rgb[i]} onChange={e => setRgb(i, e.target.value)} /></label>)}
        {EyeDropperApi && <button className="btn btn-icon color-dropper" title="Farbe vom Bildschirm aufnehmen" aria-label="Farbe vom Bildschirm aufnehmen" onClick={pick}><Eyedropper size={18} /></button>}
      </div>

      <footer className="color-foot">
        <span className="color-preview" />
        <span className="color-current"><small className="pixel">ausgewählte farbe</small><strong>{hex.toUpperCase()}</strong></span>
        <button className="btn" onClick={onCancel}>Abbrechen</button>
        <button className="btn btn-accent pixel" onClick={() => onApply(hex)}><Check size={16} weight="bold" />anwenden</button>
      </footer>
    </section>
  </div>, document.body);
}
