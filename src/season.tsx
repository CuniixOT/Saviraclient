import { Calendar, Check, Clock, GlobeHemisphereWest, Lock, Play } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
import { seasonApi, unwrap, type Quest, type Season, type SeasonTier } from './api';

/** Season Pass state, kept in sync with the launcher's main process. */
export function useSeason(onError: (message: string) => void) {
  const [season, setSeason] = useState<Season | null>(null);
  const [toast, setToast] = useState<{ strong: string; text: string; tone: 'lime' | 'amber' } | null>(null);
  useEffect(() => {
    unwrap(seasonApi.state()).then(setSeason).catch(() => { /* Browser preview: no season. */ });
    return seasonApi.onChange(setSeason);
  }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 2600); return () => clearTimeout(timer); }, [toast]);
  const claimQuest = useCallback((id: string) => {
    unwrap(seasonApi.claimQuest(id)).then(({ view, xp }) => { setSeason(view); setToast({ strong: `+${xp} XP`, text: ' für deinen Season Pass', tone: 'lime' }); }).catch(e => onError(e.message));
  }, [onError]);
  const claimTier = useCallback((level: number) => {
    unwrap(seasonApi.claimTier(level)).then(({ view, reward }) => { setSeason(view); setToast({ strong: reward, text: ' abgeholt', tone: 'amber' }); }).catch(e => onError(e.message));
  }, [onError]);
  return { season, claimQuest, claimTier, toast };
}
export type SeasonState = ReturnType<typeof useSeason>;

export const claimableQuests = (season: Season | null) => season ? [...season.daily, ...season.weekly].filter(q => q.done && !q.claimed).length : 0;
export const readyTiers = (season: Season | null) => season ? season.tiers.filter(t => t.free.ready).length : 0;

const de = (value: number) => value.toLocaleString('de-DE');
/** "Reset in 6 Std. 12 Min." / "Reset in 3 Tagen" */
export function resetIn(at: number) {
  const minutes = Math.max(0, Math.round((at - Date.now()) / 60000));
  if (minutes >= 48 * 60) return `Reset in ${Math.round(minutes / 1440)} Tagen`;
  return `Reset in ${Math.floor(minutes / 60)} Std. ${minutes % 60} Min.`;
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

/** A reward tile; kind picks the icon. */
export function RewardIcon({ kind, size = 16 }: { kind: string; size?: number }) {
  const paths: Record<string, string> = {
    coins: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 9h4.5a1.5 1.5 0 0 1 0 3H10.5a1.5 1.5 0 0 0 0 3H15M12 7v2M12 15v2',
    emote: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01',
    cape: 'M5 4h14l-3 8 3 8H5',
    wings: 'M12 12C9 7 5 5 2 6c1 4 4 7 10 7 6 0 9-3 10-7-3-1-7 1-10 6z',
    frame: 'M4 4h16v16H4zM8 8h8v8H8z',
    banner: 'M6 3h12v18l-6-4-6 4z',
    title: 'M4 7V4h16v3M9 20h6M12 4v16',
    particles: 'M5 12h.01M12 5h.01M19 12h.01M12 19h.01M8 8h.01M16 8h.01M8 16h.01M16 16h.01',
    hat: 'M3 18h18M6 18V9a6 6 0 0 1 12 0v9',
    kill: 'M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3',
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind] || paths.coins} /></svg>;
}

/** The five tiers around the current level, for the compact panel on the start page. */
export function TierStrip({ season }: { season: Season }) {
  const from = Math.max(0, Math.min(season.tiers.length - 5, season.level - 2));
  return <div className="tier-strip">{season.tiers.slice(from, from + 5).map((tier: SeasonTier) => {
    const state = tier.free.claimed ? 'done' : tier.free.ready ? 'ready' : 'locked';
    return <div key={tier.level} className={`tier-mini ${state} ${tier.level === season.level ? 'current' : ''}`}>
      <small className="mono">Lvl {tier.level}</small>
      <span><RewardIcon kind={tier.free.kind} /></span>
      <em>{tier.free.name}</em>
      {state === 'done' ? <Check className="tier-flag ok" size={10} weight="bold" /> : state === 'locked' ? <Lock className="tier-flag" size={10} weight="bold" /> : null}
    </div>;
  })}</div>;
}

export function SeasonToast({ toast }: { toast: SeasonState['toast'] }) {
  if (!toast) return null;
  return <div className="season-toast mono" role="status"><b className={toast.tone}>{toast.strong}</b>{toast.text}</div>;
}
