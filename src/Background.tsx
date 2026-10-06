import { memo, useEffect, useRef } from 'react';
import type { BackgroundMode } from './api';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = ([r, g, b]: number[], a: number) => `rgba(${r},${g},${b},${a})`;
const shade = ([r, g, b]: number[], f: number) => [r * f, g * f, b * f].map(v => Math.min(255, Math.round(v)));
const rand = (min: number, max: number) => min + Math.random() * (max - min);

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number, dt: number) => void;
type Effect = (accent: number[]) => { resize?: (w: number, h: number) => void; draw: Draw };

// Rising pixel squares, loosely modelled on enchanting-table particles.
const particles: Effect = accent => {
  const dots = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), size: 2 + Math.floor(Math.random() * 3) * 2, speed: rand(.04, .12), drift: rand(0, 6.28), alpha: rand(.15, .6) }));
  return { draw: (ctx, w, h, t, dt) => {
    for (const d of dots) {
      d.y -= d.speed * dt;
      if (d.y < -.02) { d.y = 1.02; d.x = Math.random(); }
      ctx.fillStyle = rgba(accent, d.alpha * Math.min(1, d.y * 3));
      ctx.fillRect(Math.round((d.x + Math.sin(t / 2.4 + d.drift) * .008) * w), Math.round(d.y * h), d.size, d.size);
    }
  } };
};

// Three depth layers drifting sideways, twinkling, with an occasional shooting star.
const stars: Effect = accent => {
  let list: { x: number; y: number; z: number; phase: number }[] = [];
  let shooting: { x: number; y: number; life: number } | null = null, nextShot = 3;
  return {
    resize: (w, h) => { list = Array.from({ length: Math.round(w * h / 2400) }, () => ({ x: Math.random() * w, y: Math.random() * h, z: Math.ceil(Math.random() * 3), phase: rand(0, 6.28) })); },
    draw: (ctx, w, h, t, dt) => {
      for (const s of list) {
        s.x -= s.z * 4 * dt; if (s.x < 0) s.x += w;
        const twinkle = .55 + Math.sin(t * (1 + s.z * .6) + s.phase) * .45;
        ctx.fillStyle = s.z === 3 ? rgba(accent, twinkle) : `rgba(235,240,245,${(.45 + s.z * .2) * twinkle})`;
        const size = s.z === 3 ? 3 : s.z === 2 ? 2 : 1;
        ctx.fillRect(Math.round(s.x), Math.round(s.y), size, size);
      }
      nextShot -= dt;
      if (!shooting && nextShot < 0) { shooting = { x: rand(w * .3, w), y: rand(0, h * .35), life: 1 }; nextShot = rand(5, 11); }
      if (shooting) {
        shooting.x -= 520 * dt; shooting.y += 200 * dt; shooting.life -= dt * 1.1;
        const gradient = ctx.createLinearGradient(shooting.x, shooting.y, shooting.x + 130, shooting.y - 50);
        gradient.addColorStop(0, rgba(accent, Math.max(0, shooting.life)));
        gradient.addColorStop(1, rgba(accent, 0));
        ctx.strokeStyle = gradient; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(shooting.x, shooting.y); ctx.lineTo(shooting.x + 130, shooting.y - 50); ctx.stroke();
        if (shooting.life <= 0) shooting = null;
      }
    }
  };
};

// Falling runes in the style of the enchanting table's glyph alphabet.
const RUNES = 'ᔑʖᓵ↸ᒷ⎓⊣⍑╎⋮ꖌꖎᒲリ𝙹!¡ᑑ∷ᓭℸ⚍⍊∴∷⨅'.match(/./gu)!;
const glyphs: Effect = accent => {
  const size = 18;
  let drops: { y: number; speed: number; trail: string[] }[] = [];
  const rune = () => RUNES[Math.floor(Math.random() * RUNES.length)];
  return {
    resize: (w, h) => { drops = Array.from({ length: Math.ceil(w / size) }, () => ({ y: rand(-h, h), speed: rand(30, 90), trail: Array.from({ length: 14 }, rune) })); },
    draw: (ctx, w, h, t, dt) => {
      ctx.font = `${size - 4}px "Segoe UI Symbol", "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      drops.forEach((d, column) => {
        d.y += d.speed * dt;
        if (d.y - d.trail.length * size > h) { d.y = rand(-200, 0); d.speed = rand(30, 90); }
        if (Math.random() < dt * 3) d.trail[Math.floor(Math.random() * d.trail.length)] = rune();
        d.trail.forEach((char, i) => {
          const y = d.y - i * size;
          if (y < -size || y > h + size) return;
          ctx.fillStyle = i === 0 ? 'rgba(245,255,250,1)' : rgba(accent, .9 * (1 - i / d.trail.length));
          ctx.fillText(char, column * size + size / 2, y);
        });
      });
    }
  };
};

// Layered sine lines flowing across the lower half.
const waves: Effect = accent => ({ draw: (ctx, w, h, t) => {
  for (let layer = 0; layer < 6; layer++) {
    const base = h * (.52 + layer * .07), amp = 18 + layer * 7, freq = .0035 - layer * .00025, speed = .5 + layer * .18;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const y = base + Math.sin(x * freq + t * speed + layer) * amp + Math.sin(x * freq * 2.3 - t * speed * .7) * amp * .35;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = rgba(accent, .22 + layer * .11); ctx.lineWidth = 2 + layer * .4;
    ctx.shadowColor = rgba(accent, .6); ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
} });

// Floating isometric pixel cubes; bigger ones are closer, faster and brighter.
const blocks: Effect = accent => {
  const top = shade(accent, 1.15), left = shade(accent, .78), right = shade(accent, .52);
  let cubes: { x: number; y: number; s: number; speed: number; bob: number }[] = [];
  return {
    resize: (w, h) => {
      cubes = Array.from({ length: Math.max(14, Math.round(w / 55)) }, () => { const s = Math.round(rand(6, 24)); return { x: Math.random() * w, y: Math.random() * h, s, speed: s * 1.4, bob: rand(0, 6.28) }; }).sort((a, b) => a.s - b.s);
    },
    draw: (ctx, w, h, t, dt) => {
      for (const c of cubes) {
        c.y -= c.speed * dt;
        if (c.y < -c.s * 3) { c.y = h + c.s * 2; c.x = Math.random() * w; }
        const x = Math.round(c.x + Math.sin(t * .6 + c.bob) * 6), y = Math.round(c.y), s = c.s, alpha = .18 + (s / 24) * .5;
        const face = (color: number[], points: number[][]) => { ctx.fillStyle = rgba(color, alpha); ctx.beginPath(); points.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath(); ctx.fill(); };
        face(top, [[x, y - s / 2], [x + s, y], [x, y + s / 2], [x - s, y]]);
        face(left, [[x - s, y], [x, y + s / 2], [x, y + s * 1.5], [x - s, y + s]]);
        face(right, [[x + s, y], [x, y + s / 2], [x, y + s * 1.5], [x + s, y + s]]);
      }
    }
  };
};

const effects: Partial<Record<BackgroundMode, Effect>> = { particles, stars, glyphs, waves, blocks };

const CanvasEffect = memo(function CanvasEffect({ effect, accent, paused }: { effect: Effect; accent: string; paused: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current, ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const instance = effect(rgb(accent));
    let frame = 0, w = 0, h = 0, last = 0, t = 0;
    const still = () => paused || reducedMotion();
    const render = (now: number) => {
      // Clamp dt so a tab switch does not teleport everything.
      const dt = last ? Math.min(.05, (now - last) / 1000) : .016; last = now; t += dt;
      ctx.clearRect(0, 0, w, h);
      instance.draw(ctx, w, h, t, dt);
      if (!still() && !document.hidden) frame = requestAnimationFrame(render);
    };
    const resize = () => {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.max(1, w * ratio); canvas.height = Math.max(1, h * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      instance.resize?.(w, h);
      if (still()) { t = 4; render(performance.now()); }
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const visibility = () => { cancelAnimationFrame(frame); last = 0; if (!document.hidden && !still()) frame = requestAnimationFrame(render); };
    document.addEventListener('visibilitychange', visibility);
    if (!still()) frame = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener('visibilitychange', visibility); };
  }, [effect, accent, paused]);
  return <canvas ref={ref} className="bg-canvas" />;
});

type Props = { mode: BackgroundMode; panorama: string[] | null; accent: string; paused?: boolean };

export const Background = memo(function Background({ mode, panorama, accent, paused = false }: Props) {
  const effect = effects[mode];
  return <div className={`backdrop backdrop-${mode} ${paused ? 'is-paused' : ''}`} aria-hidden="true">
    {mode === 'panorama' && (panorama
      // Two copies of the four side faces make the strip loop without a visible jump.
      ? <div className="bg-panorama"><div className="bg-panorama-track">{[...panorama, ...panorama].map((src, index) => <img key={index} src={src} alt="" />)}</div></div>
      : <img className="bg-landscape" src="./landscape.svg" alt="" />)}
    {mode === 'grid' && <div className="bg-grid"><div className="bg-grid-sun" /><div className="bg-grid-floor" /></div>}
    {mode === 'aurora' && <div className="bg-aurora"><span /><span /><span /></div>}
    {effect && <CanvasEffect effect={effect} accent={accent} paused={paused} />}
    <div className="bg-shade" />
    <div className="bg-grain" />
  </div>;
});

/** A still frame of a canvas effect for the settings thumbnails; CSS effects use their own thumbs. */
export function BackgroundPreview({ mode, accent }: { mode: BackgroundMode; accent: string }) {
  const effect = effects[mode];
  return effect ? <CanvasEffect effect={effect} accent={accent} paused /> : null;
}
