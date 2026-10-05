import { useEffect, useRef, type ReactNode } from 'react';
import type { Accent } from './api';

export const accents: Record<Accent, { label: string; hex: string }> = {
  mint: { label: 'Mint', hex: '#5ccf95' },
  blue: { label: 'Ozean', hex: '#4f8dff' },
  rose: { label: 'Rubin', hex: '#e5566b' },
  amber: { label: 'Bernstein', hex: '#e8a33d' },
  violet: { label: 'Amethyst', hex: '#8f72f2' }
};

export function Logo({ wordmark = true }: { wordmark?: boolean }) {
  return <span className="logo">
    <svg viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges"><path d="M2 1h12v3H5v2h9v9H2v-3h9V9H2z" fill="currentColor" /></svg>
    {wordmark && <span className="pixel">savira</span>}
  </span>;
}

export function Toggle({ value, onChange, label, disabled = false }: { value: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return <button type="button" className={`toggle ${value ? 'on' : ''}`} role="switch" aria-checked={value} aria-label={label} onClick={onChange} disabled={disabled}><span /></button>;
}

// Draws the 8x8 face plus hat layer from a Minecraft skin, like the head in the player list.
export function SkinHead({ skin, size = 32 }: { skin: string | null; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      const context = ref.current?.getContext('2d');
      if (!context) return;
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, 8, 8);
      context.drawImage(image, 8, 8, 8, 8, 0, 0, 8, 8);
      context.drawImage(image, 40, 8, 8, 8, 0, 0, 8, 8);
    };
    image.src = skin || './default-skin.png';
  }, [skin]);
  return <canvas ref={ref} className="skin-head" width={8} height={8} style={{ width: size, height: size }} aria-hidden="true" />;
}

export function PageHeader({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return <header className="page-head">
    <div><p className="kicker pixel">{kicker}</p><h1 className="pixel">{title}</h1></div>
    {children && <div className="page-head-side">{children}</div>}
  </header>;
}
