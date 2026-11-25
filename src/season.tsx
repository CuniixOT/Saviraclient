import { Calendar, Check, Clock, GlobeHemisphereWest, Lock, Play } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
import { seasonApi, unwrap, type CaseWin, type Quest, type Rarity, type Season, type SeasonTier } from './api';
import coin from './assets/rewards/coin.png';
import gem from './assets/rewards/gem.png';
import chest from './assets/rewards/chest.png';
import xp from './assets/rewards/xp.png';
import key from './assets/rewards/key.png';
import capeCross from './assets/rewards/cape-cross.png';
import capeSeason from './assets/rewards/cape-season.png';
import capeAnimated from './assets/rewards/cape-animated.png';

type Toast = { strong: string; text: string; tone: 'lime' | 'amber' };

/** Season Pass, inventory and cases, kept in sync with the launcher's main process. */
export function useSeason(onError: (message: string) => void) {
  const [season, setSeason] = useState<Season | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  useEffect(() => {
    unwrap(seasonApi.state()).then(setSeason).catch(() => { /* Browser preview: no season. */ });
    return seasonApi.onChange(setSeason);
  }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 2600); return () => clearTimeout(timer); }, [toast]);
  const claimQuest = useCallback((id: string) => {
    unwrap(seasonApi.claimQuest(id)).then(({ view, xp }) => { setSeason(view); setToast({ strong: `+${xp} XP`, text: ' für deinen Season Pass erhalten', tone: 'lime' }); }).catch(e => onError(e.message));
  }, [onError]);
  const claimTier = useCallback((level: number) => {
    unwrap(seasonApi.claimTier(level)).then(({ view, reward }) => { setSeason(view); setToast({ strong: reward, text: ' wurde in dein Inventar gelegt', tone: 'amber' }); }).catch(e => onError(e.message));
  }, [onError]);
  const claimAll = useCallback(() => {
    unwrap(seasonApi.claimAll()).then(({ view, count }) => { setSeason(view); setToast({ strong: count === 1 ? '1 Belohnung' : `${count} Belohnungen`, text: ' wurden in dein Inventar gelegt', tone: 'amber' }); }).catch(e => onError(e.message));
  }, [onError]);
  const buyCase = useCallback(async (id: string, amount: number) => {
    const { view } = await unwrap(seasonApi.buyCase(id, amount));
    setSeason(view);
  }, []);
  /** Opens a case; the caller shows the reel and applies the view once it stops. */
  const openCase = useCallback((id: string): Promise<CaseWin> => unwrap(seasonApi.openCase(id)), []);
  return { season, setSeason, claimQuest, claimTier, claimAll, buyCase, openCase, toast };
}
export type SeasonState = ReturnType<typeof useSeason>;

export const claimableQuests = (season: Season | null) => season ? [...season.daily, ...season.weekly].filter(q => q.done && !q.claimed).length : 0;
export const readyTiers = (season: Season | null) => season ? season.tiers.filter(t => t.free.ready).length : 0;
export const ownedCases = (season: Season | null) => season ? season.cases.reduce((sum, c) => sum + c.owned, 0) : 0;

const de = (value: number) => value.toLocaleString('de-DE');
/** "Reset in 6 Std. 12 Min." / "Reset in 3 Tagen" */
export function resetIn(at: number) {
  const minutes = Math.max(0, Math.round((at - Date.now()) / 60000));
  if (minutes >= 48 * 60) return `Reset in ${Math.round(minutes / 1440)} Tagen`;
  return `Reset in ${Math.floor(minutes / 60)} Std. ${minutes % 60} Min.`;
}

/** Colours per rarity: [label, colour, soft fill, edge, rays]. */
export const RARITY: Record<Rarity, { label: string; col: string; soft: string; edge: string; ray: string }> = {
  L: { label: 'Legendär', col: '#f2a93b', soft: 'rgba(242,169,59,0.18)', edge: 'rgba(242,169,59,0.55)', ray: 'rgba(242,169,59,0.28)' },
  E: { label: 'Episch', col: '#b48cff', soft: 'rgba(180,140,255,0.18)', edge: 'rgba(180,140,255,0.5)', ray: 'rgba(180,140,255,0.26)' },
  R: { label: 'Selten', col: '#6fb8ff', soft: 'rgba(111,184,255,0.16)', edge: 'rgba(111,184,255,0.45)', ray: 'rgba(111,184,255,0.24)' },
  U: { label: 'Ungewöhnlich', col: '#5fd38a', soft: 'rgba(95,211,138,0.14)', edge: 'rgba(95,211,138,0.4)', ray: 'rgba(95,211,138,0.22)' },
  C: { label: 'Gewöhnlich', col: '#a9acb3', soft: 'rgba(255,255,255,0.07)', edge: 'rgba(255,255,255,0.14)', ray: 'rgba(255,255,255,0.12)' },
};

const IMAGES: Record<string, string> = { coin, gem, chest, xp, key, 'cape-cross': capeCross, 'cape-season': capeSeason, 'cape-animated': capeAnimated };
const PATHS: Record<string, string> = {
  wings: 'M12 12C9 7 5 5 2 6c1 4 4 7 10 7 6 0 9-3 10-7-3-1-7 1-10 6z',
  particles: 'M5 12h.01M12 5h.01M19 12h.01M12 19h.01M8 8h.01M16 8h.01M8 16h.01M16 16h.01',
  emote: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01',
};
export const isCape = (icon: string) => icon.startsWith('cape');

/**
 * The picture of a reward or case item: pixel art for currencies, items and capes, a line icon on
 * a tinted tile for the cosmetics without art yet. size is the width of a square item.
 */
export function ItemArt({ icon, size = 52, tint = '#f2a93b', soft = 'rgba(242,169,59,0.14)', className }: { icon: string; size?: number; tint?: string; soft?: string; className?: string }) {
  const src = IMAGES[icon];
  if (src) {
    const cape = isCape(icon);
    return <img className={`item-art ${className || ''}`} src={src} alt="" draggable={false} style={{ width: cape ? Math.round(size * 0.66) : size, height: cape ? Math.round(size * 1.08) : size }} />;
  }
  const box = Math.round(size * 1.08);
  return <span className={`item-tile ${className || ''}`} style={{ width: box, height: box, borderRadius: Math.round(box * 0.28), background: soft, color: tint }}>
    <svg width={Math.round(box * 0.54)} height={Math.round(box * 0.54)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[icon] || PATHS.particles} /></svg>
  </span>;
}

/** Small reward picture for compact lists (start page). */
export function RewardIcon({ kind, size = 16 }: { kind: string; size?: number }) {
  return <ItemArt icon={kind} size={size + 4} />;
}

const questIcons = { clock: Clock, play: Play, globe: GlobeHemisphereWest, calendar: Calendar };

export function QuestRow({ quest, onClaim }: { quest: Quest; onClaim: (id: string) => void }) {
  const Icon = questIcons[quest.icon] ?? Clock;
  const claimable = quest.done && !quest.claimed;
  return <div className={`quest ${claimable ? 'claimable' : ''} ${quest.done ? 'done' : ''}`}>
    <span className="quest-icon"><Icon size={15} weight="bold" /></span>
    <span className="quest-copy">
      <b>{quest.title}</b>
      <span className="quest-bar"><i><em style={{ width: `${(quest.cur / quest.max) * 100}%` }} /></i><small className="mono">{quest.cur}/{quest.max}</small></span>
    </span>
    {claimable ? <button className="quest-claim mono" onClick={() => onClaim(quest.id)}>+{quest.xp} XP</button>
      : quest.claimed ? <span className="quest-claimed mono"><Check size={11} weight="bold" />Abgeholt</span>
      : <span className="quest-xp mono">+{quest.xp} XP</span>}
  </div>;
}

export function XpBar({ season, big = false }: { season: Season; big?: boolean }) {
  const max = season.level >= season.maxLevel;
  return <div className={`xp-bar ${big ? 'big' : ''}`}>
    <span><i style={{ width: `${(season.levelXp / season.xpPerLevel) * 100}%` }} /></span>
    {!big && <p className="mono"><b>{de(season.levelXp)} / {de(season.xpPerLevel)} XP</b><em>{max ? 'Max. Level' : `Level ${season.level + 1}`}</em></p>}
  </div>;
}

/** The five tiers around the current level, for the compact panel on the start page. */
export function TierStrip({ season }: { season: Season }) {
  const from = Math.max(0, Math.min(season.tiers.length - 5, season.level - 2));
  return <div className="tier-strip">{season.tiers.slice(from, from + 5).map((tier: SeasonTier) => {
    const state = tier.free.claimed ? 'done' : tier.free.ready ? 'ready' : 'locked';
    return <div key={tier.level} className={`tier-mini ${state} ${tier.level === season.level ? 'current' : ''}`}>
      <small className="mono">Lvl {tier.level}</small>
      <span><RewardIcon kind={tier.free.kind} /></span>
      <em>{tier.free.qty} {tier.free.name}</em>
      {state === 'done' ? <Check className="tier-flag ok" size={10} weight="bold" /> : state === 'locked' ? <Lock className="tier-flag" size={10} weight="bold" /> : null}
    </div>;
  })}</div>;
}

export function SeasonToast({ toast }: { toast: SeasonState['toast'] }) {
  if (!toast) return null;
  return <div className="season-toast mono" role="status"><b className={toast.tone}>{toast.strong}</b>{toast.text}</div>;
}
