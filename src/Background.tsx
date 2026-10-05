import { memo, useEffect, useRef } from 'react';
import type { BackgroundMode } from './api';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Rising pixel squares in the accent color, loosely modelled on enchanting-table particles.
const Particles = memo(function Particles() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    let frame = 0, width = 0, height = 0;
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5ccf95';
    const dots = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), size: 2 + Math.floor(Math.random() * 3) * 2, speed: .00012 + Math.random() * .00035, drift: Math.random() * Math.PI * 2, alpha: .15 + Math.random() * .45 }));
    const resize = () => {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      width = canvas.clientWidth; height = canvas.clientHeight;
      canvas.width = width * ratio; canvas.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const draw = (time: number) => {
      context.clearRect(0, 0, width, height);
      context.fillStyle = accent;
      for (const dot of dots) {
        dot.y -= dot.speed * 16;
        if (dot.y < -.02) { dot.y = 1.02; dot.x = Math.random(); }
        const x = Math.round((dot.x + Math.sin(time / 2400 + dot.drift) * .008) * width);
        context.globalAlpha = dot.alpha * Math.min(1, dot.y * 3);
        context.fillRect(x, Math.round(dot.y * height), dot.size, dot.size);
      }
      frame = requestAnimationFrame(draw);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const visibility = () => { cancelAnimationFrame(frame); if (!document.hidden && !reducedMotion()) frame = requestAnimationFrame(draw); };
    document.addEventListener('visibilitychange', visibility);
    if (reducedMotion()) { draw(0); cancelAnimationFrame(frame); } else frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  return <canvas ref={ref} className="bg-particles" />;
});

export const Background = memo(function Background({ mode, panorama, accent }: { mode: BackgroundMode; panorama: string[] | null; accent: string }) {
  return <div className="backdrop" aria-hidden="true">
    {mode === 'panorama' && (panorama
      // Two copies of the four side faces make the strip loop without a visible jump.
      ? <div className="bg-panorama"><div className="bg-panorama-track">{[...panorama, ...panorama].map((src, index) => <img key={index} src={src} alt="" />)}</div></div>
      : <img className="bg-landscape" src="./landscape.svg" alt="" />)}
    {mode === 'particles' && <Particles key={accent} />}
    <div className="bg-shade" />
    <div className="bg-grain" />
  </div>;
});
