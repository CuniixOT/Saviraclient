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

// Pixel snowflakes swaying down; the nearest ones carry a hint of the accent.
const snow: Effect = accent => {
  let flakes: { x: number; y: number; z: number; sway: number }[] = [];
  return {
    resize: (w, h) => { flakes = Array.from({ length: Math.round(w * h / 5200) }, () => ({ x: Math.random() * w, y: Math.random() * h, z: Math.ceil(Math.random() * 3), sway: rand(0, 6.28) })); },
    draw: (ctx, w, h, t, dt) => {
      for (const f of flakes) {
        f.y += (14 + f.z * 16) * dt;
        if (f.y > h + 4) { f.y = -4; f.x = Math.random() * w; }
        const x = Math.round(f.x + Math.sin(t * .8 + f.sway) * (6 + f.z * 4)), size = f.z + 1;
        ctx.fillStyle = f.z === 3 ? rgba(shade(accent, 1.35), .75) : `rgba(235,242,248,${.25 + f.z * .18})`;
        ctx.fillRect(x, Math.round(f.y), size, size);
      }
    }
  };
};

// Slanted rain with small splashes along the bottom edge.
const rain: Effect = accent => {
  let drops: { x: number; y: number; speed: number; length: number }[] = [];
  const splashes: { x: number; life: number }[] = [];
  return {
    resize: (w, h) => { drops = Array.from({ length: Math.round(w / 9) }, () => ({ x: Math.random() * (w + 200), y: Math.random() * h, speed: rand(520, 820), length: rand(10, 24) })); },
    draw: (ctx, w, h, t, dt) => {
      ctx.lineWidth = 1.5;
      for (const d of drops) {
        d.y += d.speed * dt; d.x -= d.speed * .22 * dt;
        if (d.y > h) { if (Math.random() < .35) splashes.push({ x: d.x, life: 1 }); d.y = rand(-60, -10); d.x = Math.random() * (w + 200); }
        ctx.strokeStyle = rgba(accent, .18 + d.length / 80);
        ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.length * .22, d.y - d.length); ctx.stroke();
      }
      for (let i = splashes.length - 1; i >= 0; i--) {
        const s = splashes[i]; s.life -= dt * 3;
        if (s.life <= 0) { splashes.splice(i, 1); continue; }
        const spread = (1 - s.life) * 7;
        ctx.fillStyle = rgba(accent, s.life * .5);
        ctx.fillRect(s.x - spread, h - 3 - spread * .4, 2, 2); ctx.fillRect(s.x + spread, h - 3 - spread * .4, 2, 2);
      }
    }
  };
};

// Soft glowing fireflies wandering on smooth paths and pulsing.
const fireflies: Effect = accent => {
  let flies: { x: number; y: number; a: number; speed: number; phase: number; size: number }[] = [];
  return {
    resize: (w, h) => { flies = Array.from({ length: Math.max(24, Math.round(w * h / 26000)) }, () => ({ x: Math.random() * w, y: rand(h * .2, h), a: rand(0, 6.28), speed: rand(10, 26), phase: rand(0, 6.28), size: rand(1.5, 3.2) })); },
    draw: (ctx, w, h, t, dt) => {
      ctx.globalCompositeOperation = 'lighter';
      for (const f of flies) {
        f.a += Math.sin(t * .7 + f.phase) * dt * 1.6;
        f.x = (f.x + Math.cos(f.a) * f.speed * dt + w) % w;
        f.y = (f.y + Math.sin(f.a) * f.speed * dt + h) % h;
        // Still frames (thumbnails) use a fixed t; keep every fly at least faintly visible.
        const pulse = .15 + .85 * Math.max(0, Math.sin(t * 1.4 + f.phase)) ** 2;
        const glow = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.size * 7);
        glow.addColorStop(0, rgba(shade(accent, 1.3), .55 * pulse + .05));
        glow.addColorStop(1, rgba(accent, 0));
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.size * 7, 0, 6.29); ctx.fill();
        ctx.fillStyle = `rgba(255,255,240,${.3 + pulse * .65})`;
        ctx.fillRect(Math.round(f.x - 1), Math.round(f.y - 1), 2, 2);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  };
};

// A honeycomb of hexagons, like the Savira mark, lit by slow sweeping waves.
const hexgrid: Effect = accent => {
  const r = 26, hw = Math.sqrt(3) * r;
  let cells: { x: number; y: number; seed: number }[] = [];
  return {
    resize: (w, h) => {
      cells = [];
      for (let row = -1; row * r * 1.5 < h + r * 2; row++) for (let col = -1; col * hw < w + hw; col++) cells.push({ x: col * hw + (row % 2 ? hw / 2 : 0), y: row * r * 1.5, seed: Math.random() });
    },
    draw: (ctx, w, h, t) => {
      ctx.lineWidth = 1.2;
      for (const c of cells) {
        const wave = Math.max(0, Math.sin(c.x * .006 + c.y * .004 - t * .9)) ** 6;
        const spark = Math.max(0, Math.sin(t * .5 + c.seed * 40)) ** 30;
        const light = Math.min(1, wave * .8 + spark);
        ctx.beginPath();
        for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i - Math.PI / 2, px = c.x + Math.cos(a) * (r - 3), py = c.y + Math.sin(a) * (r - 3); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
        ctx.closePath();
        ctx.strokeStyle = rgba(accent, .07 + light * .55);
        ctx.stroke();
        if (light > .05) { ctx.fillStyle = rgba(accent, light * .12); ctx.fill(); }
      }
    }
  };
};

// Drifting points joined by lines when close, like a constellation map.
const network: Effect = accent => {
  let nodes: { x: number; y: number; vx: number; vy: number }[] = [];
  return {
    resize: (w, h) => { nodes = Array.from({ length: Math.min(90, Math.max(12, Math.round(w * h / 16000))) }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: rand(-14, 14), vy: rand(-14, 14) })); },
    draw: (ctx, w, h, t, dt) => {
      const reach = Math.min(150, Math.max(60, w / 8));
      for (const n of nodes) {
        n.x += n.vx * dt; n.y += n.vy * dt;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
      }
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > reach) continue;
        ctx.strokeStyle = rgba(accent, (1 - d / reach) * .35);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.fillStyle = rgba(shade(accent, 1.2), .85);
      for (const n of nodes) ctx.fillRect(Math.round(n.x) - 1.5, Math.round(n.y) - 1.5, 3, 3);
    }
  };
};

// Warm sparks rising from below and flickering out, like a Nether campfire.
const embers: Effect = accent => {
  const warm = [255, 140, 60], gold = [255, 200, 90];
  let sparks: { x: number; y: number; vy: number; life: number; max: number; size: number; tint: number }[] = [];
  const spawn = (w: number, h: number, anywhere = false) => ({ x: Math.random() * w, y: anywhere ? Math.random() * h : h + 6, vy: rand(30, 90), life: anywhere ? rand(0, 3) : 0, max: rand(3, 7), size: Math.random() < .2 ? 3 : 2, tint: Math.random() });
  return {
    resize: (w, h) => { sparks = Array.from({ length: Math.round(w / 12) }, () => spawn(w, h, true)); },
    draw: (ctx, w, h, t, dt) => {
      const floor = ctx.createLinearGradient(0, h, 0, h * .6);
      floor.addColorStop(0, rgba(warm, .14)); floor.addColorStop(1, rgba(warm, 0));
      ctx.fillStyle = floor; ctx.fillRect(0, h * .6, w, h * .4);
      sparks.forEach((s, i) => {
        s.life += dt; s.y -= s.vy * dt; s.x += Math.sin(t * 2 + i) * 12 * dt;
        if (s.life > s.max || s.y < -6) { sparks[i] = spawn(w, h); return; }
        const fade = 1 - s.life / s.max, flicker = .6 + Math.sin(t * 18 + i * 7) * .4;
        ctx.fillStyle = rgba(s.tint < .55 ? warm : s.tint < .8 ? gold : accent, fade * flicker);
        ctx.fillRect(Math.round(s.x), Math.round(s.y), s.size, s.size);
      });
    }
  };
};

const effects: Partial<Record<BackgroundMode, Effect>> = { particles, stars, glyphs, waves, blocks, snow, rain, fireflies, hexgrid, network, embers };

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
