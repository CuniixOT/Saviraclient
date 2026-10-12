import { useId } from 'react';
import logo from './assets/logo.png';
import logoMask from './assets/logo-mask.png';

// Header art for the news cards: small scenes drawn in the launcher's own style,
// coloured with the accent so they match whatever the player picked.
export type NewsArtKind = 'wardrobe' | 'brand' | 'accounts' | 'modmenu';

const W = 300, H = 92;

function Backdrop({ id }: { id: string }) {
  return <>
    <defs>
      <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#10151a" />
        <stop offset="1" stopColor="#0a0d10" />
      </linearGradient>
      <radialGradient id={`${id}-glow`} cx=".5" cy=".55" r=".55">
        <stop offset="0" stopColor="var(--accent)" stopOpacity=".32" />
        <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
      </radialGradient>
      <pattern id={`${id}-grid`} width="12" height="12" patternUnits="userSpaceOnUse">
        <path d="M12 0H0V12" fill="none" stroke="#fff" strokeOpacity=".04" />
      </pattern>
    </defs>
    <rect width={W} height={H} fill={`url(#${id}-bg)`} />
    <rect width={W} height={H} fill={`url(#${id}-grid)`} />
    <rect width={W} height={H} fill={`url(#${id}-glow)`} />
  </>;
}

/** The Savira logo in its own colours, with a soft shadow made from its mask. */
function Mark({ id, x, y, size }: { id: string; x: number; y: number; size: number }) {
  return <>
    <mask id={`${id}-mark`} maskUnits="userSpaceOnUse" x={x} y={y} width={size} height={size}>
      <image href={logoMask} x={x} y={y} width={size} height={size} />
    </mask>
    <g transform={`translate(0 ${size * .06})`}><rect x={x} y={y} width={size} height={size} fill="#000" opacity=".35" mask={`url(#${id}-mark)`} /></g>
    <image href={logo} x={x} y={y} width={size} height={size} />
  </>;
}

function Brand({ id }: { id: string }) {
  return <>
    {/* Hexagon rings echo the new mark. */}
    {[58, 44, 30].map((r, i) => <polygon key={r} points={hexagon(150, 48, r)} fill="none" stroke="var(--accent)" strokeOpacity={.08 + i * .07} strokeWidth="1.5" />)}
    <Mark id={id} x={128} y={25} size={46} />
    {/* Desktop icon on the left, taskbar on the right: where the new icon shows up. */}
    <g transform="translate(26 22)">
      <rect width="40" height="40" rx="7" fill="#0c1013" stroke="#ffffff" strokeOpacity=".12" />
      <Mark id={`${id}-small`} x={7} y={7} size={26} />
      <rect x="2" y="47" width="36" height="4" rx="2" fill="#fff" opacity=".18" />
    </g>
    <g transform="translate(206 60)">
      <rect width="80" height="18" rx="5" fill="#0c1013" stroke="#ffffff" strokeOpacity=".1" />
      <rect x="6" y="4" width="10" height="10" rx="2" fill="#fff" opacity=".12" />
      <rect x="21" y="4" width="10" height="10" rx="2" fill="#fff" opacity=".12" />
      <rect x="35" y="2" width="14" height="14" rx="3" fill="var(--accent)" opacity=".18" />
      <Mark id={`${id}-task`} x={37} y={4} size={10} />
      <rect x="38" y="15" width="8" height="1.5" rx=".75" fill="var(--accent)" />
      <rect x="54" y="4" width="10" height="10" rx="2" fill="#fff" opacity=".12" />
    </g>
    <Sparkle x={222} y={22} /><Sparkle x={92} y={70} small />
  </>;
}

// 8x8 pixel faces like the player heads in the account menu.
const faces = [
  { skin: '#c99c77', hair: '#2d3630', eye: '#e1eee5', shirt: '#508567' },
  { skin: '#e0b48f', hair: '#7a4a24', eye: '#4f8dff', shirt: '#3d4f8a' },
  { skin: '#a7714f', hair: '#14171a', eye: '#ffffff', shirt: '#8f3d4b' }
];
function Head({ x, y, size, face }: { x: number; y: number; size: number; face: typeof faces[number] }) {
  const p = size / 8;
  return <g transform={`translate(${x} ${y})`} shapeRendering="crispEdges">
    <rect width={size} height={size} fill={face.skin} />
    <rect width={size} height={p * 2} fill={face.hair} />
    <rect width={p} height={p * 3} fill={face.hair} />
    <rect x={size - p} width={p} height={p * 3} fill={face.hair} />
    <rect x={p} y={p * 4} width={p * 2} height={p} fill={face.eye} />
    <rect x={p * 5} y={p * 4} width={p * 2} height={p} fill={face.eye} />
    <rect x={p * 2} y={p * 4} width={p} height={p} fill="#1d2a24" />
    <rect x={p * 5} y={p * 4} width={p} height={p} fill="#1d2a24" />
    <rect x={p * 3} y={p * 6} width={p * 2} height={p} fill="#000" opacity=".25" />
  </g>;
}

function Accounts({ id }: { id: string }) {
  return <>
    {/* Account switcher: three saved accounts, the middle one active. */}
    <g transform="translate(18 14)">
      {faces.map((face, i) => {
        const active = i === 1, y = i * 22;
        return <g key={i} transform={`translate(0 ${y})`}>
          <rect width="128" height="19" rx="5" fill={active ? 'var(--accent)' : '#ffffff'} fillOpacity={active ? .16 : .04} stroke={active ? 'var(--accent)' : '#ffffff'} strokeOpacity={active ? .6 : .08} />
          <Head x={4} y={3} size={13} face={face} />
          <rect x="23" y="5" width={[46, 52, 38][i]} height="4" rx="2" fill="#fff" opacity={active ? .85 : .45} />
          <rect x="23" y="11.5" width={[30, 18, 34][i]} height="3" rx="1.5" fill={active ? 'var(--accent)' : '#fff'} opacity={active ? .9 : .2} />
          {active && <path d="M112 9.5l3 3 5.5-6" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
        </g>;
      })}
    </g>
    {/* Discord profile card showing the presence. */}
    <g transform="translate(160 16)">
      <rect width="124" height="60" rx="8" fill="#16191d" stroke="#ffffff" strokeOpacity=".08" />
      <rect width="124" height="16" rx="8" fill="#5865f2" opacity=".85" />
      <rect y="8" width="124" height="8" fill="#5865f2" opacity=".85" />
      <circle cx="18" cy="17" r="9" fill="#16191d" />
      <g transform="translate(11 10)"><Head x={0} y={0} size={14} face={faces[1]} /></g>
      <circle cx="25" cy="24" r="3.4" fill="#23a55a" stroke="#16191d" strokeWidth="1.5" />
      <rect x="32" y="20" width="44" height="4" rx="2" fill="#fff" opacity=".8" />
      <g transform="translate(9 31)">
        <rect width="106" height="22" rx="5" fill="#0f1114" />
        <rect x="4" y="4" width="14" height="14" rx="3" fill="#0b0f12" />
        <Mark id={`${id}-presence`} x={5} y={5} size={12} />
        <rect x="22" y="5" width="46" height="3.5" rx="1.75" fill="#fff" opacity=".75" />
        <rect x="22" y="11.5" width="64" height="3" rx="1.5" fill="#fff" opacity=".3" />
        <rect x="22" y="16.5" width="28" height="2.5" rx="1.25" fill="#23a55a" opacity=".8" />
      </g>
    </g>
    <Sparkle x={150} y={12} small />
  </>;
}

function ModMenu({ id }: { id: string }) {
  const cards = [[true, 0], [true, 1], [false, 2], [true, 3]] as const;
  return <>
    {/* The in-game mod menu: sidebar, search, module cards with switches. */}
    <g transform="translate(40 10)">
      <rect width="220" height="72" rx="7" fill="#0c0f12" stroke="#ffffff" strokeOpacity=".1" />
      <rect x="5" y="5" width="26" height="62" rx="5" fill="#ffffff" fillOpacity=".03" />
      <Mark id={`${id}-menu`} x={11} y={9} size={14} />
      {[30, 42, 54].map(y => <rect key={y} x="12" y={y} width="12" height="7" rx="2" fill="#fff" opacity=".14" />)}
      <rect x="37" y="7" width="26" height="8" rx="3" fill="var(--accent)" opacity=".22" />
      <rect x="66" y="7" width="34" height="8" rx="3" fill="#fff" opacity=".07" />
      <rect x="160" y="7" width="54" height="8" rx="3" fill="#000" stroke="#ffffff" strokeOpacity=".12" />
      <circle cx="166" cy="11" r="2" fill="none" stroke="#fff" strokeOpacity=".4" />
      {cards.map(([on, i]) => {
        const x = 37 + (i % 2) * 89, y = 20 + Math.floor(i / 2) * 25;
        return <g key={i} transform={`translate(${x} ${y})`}>
          <rect width="84" height="21" rx="4" fill={on ? 'var(--accent)' : '#ffffff'} fillOpacity={on ? .07 : .03} stroke={on ? 'var(--accent)' : '#ffffff'} strokeOpacity={on ? .35 : .08} />
          <rect x="5" y="5" width="11" height="11" rx="2" fill="#fff" opacity=".12" />
          <rect x="21" y="6" width={[30, 24, 36, 28][i]} height="3.5" rx="1.75" fill="#fff" opacity={on ? .75 : .35} />
          <rect x="21" y="12" width="40" height="2.5" rx="1.25" fill="#fff" opacity=".2" />
          <rect x="65" y="6" width="14" height="8" rx="4" fill={on ? 'var(--accent)' : '#ffffff'} opacity={on ? 1 : .15} />
          <circle cx={on ? 75 : 69} cy="10" r="2.6" fill="#fff" />
        </g>;
      })}
    </g>
    {/* A settings popover for one module: background styles. */}
    <g transform="translate(206 44)">
      <rect width="80" height="40" rx="6" fill="#12161a" stroke="var(--accent)" strokeOpacity=".5" />
      <rect x="6" y="6" width="34" height="3.5" rx="1.75" fill="#fff" opacity=".7" />
      <rect x="6" y="14" width="68" height="9" rx="3" fill="#000" stroke="#ffffff" strokeOpacity=".12" />
      <path d="M10 18.5l2-2v4zM70 18.5l-2-2v4z" fill="#fff" opacity=".5" />
      <rect x="27" y="17" width="26" height="3" rx="1.5" fill="#fff" opacity=".6" />
      {['var(--accent)', '#4f8dff', '#e5566b', '#e8a33d', '#ffffff'].map((color, i) => <rect key={color} x={6 + i * 14} y="28" width="10" height="7" rx="2" fill={color} opacity={i === 0 ? 1 : .8} stroke={i === 0 ? '#fff' : 'none'} />)}
    </g>
    <Sparkle x={24} y={24} small /><Sparkle x={278} y={18} />
  </>;
}

function Sparkle({ x, y, small = false }: { x: number; y: number; small?: boolean }) {
  const s = small ? 3 : 4.5;
  return <path d={`M${x} ${y - s}L${x + s * .3} ${y - s * .3}L${x + s} ${y}L${x + s * .3} ${y + s * .3}L${x} ${y + s}L${x - s * .3} ${y + s * .3}L${x - s} ${y}L${x - s * .3} ${y - s * .3}Z`} fill="var(--accent)" opacity=".7" />;
}

function hexagon(cx: number, cy: number, r: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = Math.PI / 3 * i - Math.PI / 2;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

/** Front view of a little player figure, for the wardrobe scene. */
function Figure({ x, y, u, face, cape }: { x: number; y: number; u: number; face: typeof faces[number]; cape?: string }) {
  return <g transform={`translate(${x} ${y})`} shapeRendering="crispEdges">
    {cape && <rect x={u * 1.2} y={u * 8.4} width={u * 5.6} height={u * 13} fill={cape} opacity=".95" />}
    <Head x={u * 2} y={0} size={u * 4} face={face} />
    <rect x={u * 2} y={u * 4} width={u * 4} height={u * 6} fill={face.shirt} />
    <rect x={0} y={u * 4} width={u * 2} height={u * 6} fill={face.shirt} opacity=".8" />
    <rect x={u * 6} y={u * 4} width={u * 2} height={u * 6} fill={face.shirt} opacity=".8" />
    <rect x={0} y={u * 9} width={u * 2} height={u} fill={face.skin} />
    <rect x={u * 6} y={u * 9} width={u * 2} height={u} fill={face.skin} />
    <rect x={u * 2} y={u * 10} width={u * 4} height={u * 6} fill="#26302c" />
    <rect x={u * 4} y={u * 10} width={u * .4} height={u * 6} fill="#000" opacity=".25" />
  </g>;
}

function Wardrobe() {
  // Skin cards on the left, the cape section on the right.
  return <>
    {[0, 1].map(i => <g key={i} transform={`translate(${22 + i * 64} 12)`}>
      <rect width="56" height="68" rx="6" fill={i === 0 ? 'var(--accent)' : '#ffffff'} fillOpacity={i === 0 ? .1 : .04} stroke={i === 0 ? 'var(--accent)' : '#ffffff'} strokeOpacity={i === 0 ? .55 : .1} />
      <Figure x={20} y={8} u={2} face={faces[i === 0 ? 1 : 2]} />
      <rect x="10" y="50" width="36" height="3.5" rx="1.75" fill="#fff" opacity=".7" />
      <rect x="14" y="57" width="28" height="5" rx="2.5" fill={i === 0 ? 'var(--accent)' : '#fff'} opacity={i === 0 ? .9 : .15} />
      {i === 0 && <path d="M44 7l2.5 2.5 4.5-5" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
    </g>)}
    <g transform="translate(160 12)">
      <rect width="124" height="68" rx="7" fill="#0c0f12" stroke="#ffffff" strokeOpacity=".1" />
      {['var(--accent)', '#4f8dff', '#e5566b'].map((color, i) => <g key={i} transform={`translate(${10 + i * 38} 10)`}>
        <rect width="30" height="44" rx="4" fill="#ffffff" fillOpacity=".04" stroke={i === 0 ? 'var(--accent)' : '#ffffff'} strokeOpacity={i === 0 ? .6 : .08} />
        <rect x="8" y="6" width="14" height="22" rx="1.5" fill={color} opacity={i === 0 ? 1 : .8} />
        <rect x="8" y="6" width="14" height="5" fill="#000" opacity=".15" />
        <rect x="6" y="33" width="18" height="3" rx="1.5" fill="#fff" opacity=".45" />
        {i === 0 && <path d="M22 2.5c1.6-1.6 4 .7 2.4 2.4L22 7.2 19.6 4.9c-1.6-1.7.8-4 2.4-2.4z" fill="#ff5d73" />}
      </g>)}
      <rect x="10" y="58" width="58" height="4" rx="2" fill="var(--accent)" opacity=".3" />
    </g>
    <Sparkle x={150} y={18} small /><Sparkle x={288} y={78} />
  </>;
}

export function NewsArt({ kind }: { kind: NewsArtKind }) {
  const id = `news-${useId().replace(/:/g, '')}`;
  return <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" role="presentation" aria-hidden="true">
    <Backdrop id={id} />
    {kind === 'brand' && <Brand id={id} />}
    {kind === 'accounts' && <Accounts id={id} />}
    {kind === 'modmenu' && <ModMenu id={id} />}
    {kind === 'wardrobe' && <Wardrobe />}
  </svg>;
}
