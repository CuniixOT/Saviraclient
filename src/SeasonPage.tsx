import { CaretLeft, CaretRight, Check, Clock, Crown, Gift, Lock } from '@phosphor-icons/react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { Quest, SeasonReward } from './api';
import { ItemArt, isCape, RARITY, resetIn, type SeasonState } from './season';

const de = (value: number) => value.toLocaleString('de-DE');
const VISIBLE = 6;
type Picked = { level: number; premium: boolean };
const questPaths = {
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  play: 'M7 4v16l13-8z',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3.5 3 14.5 0 18',
  calendar: 'M4 6h16v14H4zM4 10h16M9 3v4M15 3v4',
};

function QuestChip({ quest, onClaim }: { quest: Quest; onClaim: (id: string) => void }) {
  const claimable = quest.done && !quest.claimed;
  return <div className={`sp-quest ${claimable ? 'claimable' : ''} ${quest.done ? 'done' : ''}`}>
    <span className="sp-quest-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={questPaths[quest.icon] || questPaths.clock} /></svg></span>
    <span className="sp-quest-copy">
      <span><b>{quest.title}</b><small className="mono">{quest.cur}/{quest.max}</small></span>
      <i><em style={{ width: `${(quest.cur / quest.max) * 100}%` }} /></i>
    </span>
    {claimable ? <button className="sp-quest-claim mono" onClick={() => onClaim(quest.id)}>+{quest.xp} XP</button>
      : quest.claimed ? <span className="sp-quest-ok" aria-label="Abgeholt"><Check size={13} weight="bold" /></span>
      : <span className="sp-quest-xp mono">+{quest.xp} XP</span>}
  </div>;
}

function RewardCard({ reward, premium, xpNeed, selected, onPick }: { reward: SeasonReward; premium: boolean; xpNeed: string; selected: boolean; onPick: () => void }) {
  const locked = !reward.claimed && !reward.ready;
  return <button className={`sp-reward ${premium ? 'premium' : 'free'} ${reward.ready ? 'ready' : ''} ${selected ? 'selected' : ''} ${locked && !reward.reached ? 'far' : ''}`} onClick={onPick} aria-pressed={selected}
    aria-label={`${reward.qty} ${reward.name}, ${premium ? 'Premium' : 'Free'}`}>
    <span className="mono sp-reward-xp">{xpNeed} XP</span>
    <span className="sp-reward-art"><ItemArt icon={reward.icon} size={52} /></span>
    <span className="sp-reward-name"><b>{reward.qty}</b><small>{reward.name}</small></span>
    {reward.claimed && <span className="sp-reward-done"><Check size={10} weight="bold" /></span>}
    {locked && <Lock className="sp-reward-lock" size={11} weight="bold" />}
    {reward.ready && <span className="sp-reward-ready mono">Bereit</span>}
  </button>;
}

/**
 * Season Pass v3: title with total XP, the daily and weekly quests, the two-lane reward track
 * (six levels at a time) and on the right the preview of the selected reward.
 */
export function SeasonPage({ season: { season, claimQuest, claimTier, claimAll } }: { season: SeasonState }) {
  const [tab, setTab] = useState<'daily' | 'weekly'>('daily');
  const [offset, setOffset] = useState<number | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [, tick] = useState(0);
  // The boost and reset timers count down while the page is open.
  useEffect(() => { const timer = setInterval(() => tick(n => n + 1), 30_000); return () => clearInterval(timer); }, []);

  const first = useMemo(() => {
    if (!season) return null;
    const ready = season.tiers.find(t => t.free.ready);
    return { level: ready?.level ?? Math.min(season.maxLevel, season.level + 1), premium: false };
  }, [season]);
  if (!season) return <div className="empty glass"><h2>Season Pass</h2><p>Der Season Pass ist im Desktop-Launcher verfügbar.</p></div>;

  const { level, levelXp, xpPerLevel, tiers } = season;
  const maxed = level >= season.maxLevel;
  const maxOffset = Math.max(0, tiers.length - VISIBLE);
  const off = Math.min(maxOffset, Math.max(0, offset ?? level - 2));
  const sel = picked ?? first!;
  const selTier = tiers.find(t => t.level === sel.level) ?? tiers[0];
  const selReward = sel.premium ? selTier.premium : selTier.free;
  const rar = RARITY[selReward.rarity];
  const ready = tiers.filter(t => t.free.ready).length;
  const quests = tab === 'daily' ? season.daily : season.weekly;
  const boostLeft = Math.max(0, Math.round((season.inventory.boostUntil - Date.now()) / 60000));
  const highlights = [tiers[9], tiers[11]].filter(Boolean).map((tier, i) => ({ tier, premium: i === 1, reward: i === 1 ? tier.premium : tier.free }));
  const lockText = (reward: SeasonReward, at: number, premium: boolean) => !reward.reached ? `Ab Level ${at}` : premium ? 'Premium-Pass nötig' : '';

  return <div className="sp-page page-enter">
    <div className="sp-glow" aria-hidden="true" />
    <div className="sp-outline" aria-hidden="true">SEASON PASS</div>

    <div className="sp-main">
      <div className="sp-title">
        <div>
          <h1>SAVIRA <span>SEASON PASS</span></h1>
          <p>Erledige Aufgaben, sammle XP und schalte Belohnungen frei.</p>
        </div>
        <div className="sp-title-side">
          <span className="sp-total"><small className="mono">Gesamt</small><b><em>{de(season.xp)}</em> XP</b></span>
          <button className="sp-premium" disabled title="Der Premium-Pass kommt mit dem Savira-Shop"><Crown size={14} weight="bold" />Premium · Bald</button>
        </div>
      </div>

      <section className="sp-quests glass" aria-label="Aufgaben">
        <div className="sp-quests-head">
          <div className="sp-tabs" role="tablist" aria-label="Aufgaben">
            {([['daily', 'Täglich', season.daily.length], ['weekly', 'Wöchentlich', season.weekly.length]] as const).map(([id, label, count]) =>
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label} <small className="mono">{count}</small></button>)}
          </div>
          {boostLeft > 0 && <span className="sp-boost mono">XP-Boost aktiv · noch {boostLeft >= 60 ? `${Math.floor(boostLeft / 60)} Std. ${boostLeft % 60} Min.` : `${boostLeft} Min.`}</span>}
          <span className="sp-reset mono"><Clock size={10} weight="bold" />{resetIn(tab === 'daily' ? season.dailyResetAt : season.weeklyResetAt)}</span>
        </div>
        <div className="sp-quest-grid">{quests.map(quest => <QuestChip key={quest.id} quest={quest} onClaim={claimQuest} />)}</div>
      </section>

      <section className="sp-track" aria-label="Belohnungen">
        <div className="sp-track-head">
          <span><b>{season.season.name}</b><small className="mono">Level {level} · {maxed ? 'Max.' : `${de(levelXp)} / ${de(xpPerLevel)} XP`}</small></span>
          <small className="mono">Endet in {season.season.endsInDays} Tagen</small>
        </div>
        <div className="sp-track-row">
          <div className="sp-lanes" aria-hidden="true"><span className="mono free">Free</span><span className="mono premium">Premium</span></div>
          <button className="sp-arrow" aria-label="Vorherige Level" disabled={off === 0} onClick={() => setOffset(off - 1)}><CaretLeft size={13} weight="bold" /></button>
          <div className="sp-cols">
            {tiers.slice(off, off + VISIBLE).map(tier => {
              const fill = tier.level <= level ? 100 : tier.level === level + 1 ? (levelXp / xpPerLevel) * 100 : 0;
              const xpNeed = de(tier.level * xpPerLevel);
              return <div className="sp-col" key={tier.level}>
                <RewardCard reward={tier.free} premium={false} xpNeed={xpNeed} selected={!sel.premium && sel.level === tier.level} onPick={() => setPicked({ level: tier.level, premium: false })} />
                <div className={`sp-level ${tier.level <= level ? 'reached' : ''}`}><i style={{ width: `${fill}%` }} /><span className="mono">{tier.level === 1 ? '1 · Level' : tier.level}</span></div>
                <RewardCard reward={tier.premium} premium xpNeed={xpNeed} selected={sel.premium && sel.level === tier.level} onPick={() => setPicked({ level: tier.level, premium: true })} />
              </div>;
            })}
          </div>
          <button className="sp-arrow" aria-label="Nächste Level" disabled={off >= maxOffset} onClick={() => setOffset(off + 1)}><CaretRight size={13} weight="bold" /></button>
        </div>
        <div className="sp-claim-row">
          <button className={`sp-claim-all ${ready ? 'on' : ''}`} disabled={!ready} onClick={claimAll}><Gift size={16} weight="bold" />{ready ? `Belohnungen abholen (${ready})` : 'Alles abgeholt'}</button>
          <span>Premium-Belohnungen brauchen den Premium-Pass. Er kommt mit dem Savira-Shop.</span>
        </div>
      </section>
    </div>

    <aside className="sp-preview glass" aria-label="Belohnungs-Vorschau">
      <div className="sp-level-card">
        <div className="sp-ring" style={{ '--deg': `${(maxed ? 1 : levelXp / xpPerLevel) * 360}deg` } as CSSProperties}><span>{level}</span></div>
        <span><b>Level {level} · {season.season.name}</b><small className="mono">{maxed ? 'Höchstes Level erreicht' : `Noch ${de(xpPerLevel - levelXp)} XP bis Level ${level + 1}`}</small></span>
      </div>

      <div className="sp-stage" style={{ '--glow': rar.edge.replace(/[\d.]+\)$/, '0.32)') } as CSSProperties}>
        <div className="sp-dots" aria-hidden="true" />
        <div className="sp-ring-dash" aria-hidden="true" style={{ borderColor: rar.edge }} />
        <span className="mono sp-rarity" style={{ background: rar.soft, color: rar.col }}>{rar.label}</span>
        <span className="mono sp-where">Level {selTier.level} · {sel.premium ? 'Premium' : 'Free'}</span>
        <ItemArt key={`${sel.level}-${sel.premium}`} className="sway" icon={selReward.icon} size={isCape(selReward.icon) ? 112 : 120} />
      </div>

      <div className="sp-sel-copy"><b>{selReward.qty} {selReward.name}</b><p>{selReward.desc}</p></div>
      {selReward.ready && !sel.premium && <button className="sp-sel-claim" onClick={() => claimTier(selTier.level)}>Jetzt abholen</button>}
      {selReward.claimed && <span className="sp-sel-state done"><Check size={13} weight="bold" />Abgeholt</span>}
      {!selReward.claimed && !selReward.ready && <span className="sp-sel-state"><Lock size={13} weight="bold" />{lockText(selReward, selTier.level, sel.premium)}</span>}

      <div className="sp-spacer" />
      <div className="sp-highlights">
        <small className="mono">Nächste Highlights</small>
        {highlights.map(({ tier, premium, reward }) => <button key={`${tier.level}-${premium}`} className="sp-highlight" onClick={() => { setPicked({ level: tier.level, premium }); setOffset(maxOffset); }}>
          <span className="sp-highlight-art"><ItemArt icon={reward.icon} size={isCape(reward.icon) ? 30 : 22} /></span>
          <span><b>{reward.name}</b><small className="mono">Level {tier.level} · {premium ? 'Premium' : 'Free'}</small></span>
          <em className="mono">{tier.level > level ? `noch ${tier.level - level}` : reward.claimed ? 'Abgeholt' : premium ? 'Premium' : 'Bereit'}</em>
        </button>)}
      </div>
    </aside>
  </div>;
}
