import { Check, Crown, Lock } from '@phosphor-icons/react';
import type { CSSProperties } from 'react';
import { QuestRow, resetIn, RewardIcon, type SeasonState } from './season';

const de = (value: number) => value.toLocaleString('de-DE');

/**
 * Season Pass: level ring, the reward track (free lane with coins, premium lane shown but not yet
 * for sale) and the daily and weekly quests that give the XP.
 */
export function SeasonPage({ season: { season, claimQuest, claimTier } }: { season: SeasonState }) {
  if (!season) return <div className="empty glass"><h2>Season Pass</h2><p>Der Season Pass ist im Desktop-Launcher verfügbar.</p></div>;
  const maxed = season.level >= season.maxLevel;
  const share = season.levelXp / season.xpPerLevel;
  return <div className="season-page page-enter">
    <section className="season-hero">
      <div className="season-dots" aria-hidden="true" />
      <div className="level-ring" style={{ '--deg': `${share * 360}deg` } as CSSProperties}>
        <span><small className="mono">Level</small><b>{season.level}</b></span>
      </div>
      <div className="season-hero-copy">
        <span className="mono season-live"><i />{season.season.name} · endet in {season.season.endsInDays} Tagen</span>
        <h1>Season Pass</h1>
        <div className="season-hero-bar"><span><i style={{ width: `${share * 100}%` }} /></span><small className="mono">{de(season.levelXp)} / {de(season.xpPerLevel)} XP</small></div>
        <p>{maxed ? 'Höchstes Level erreicht. Stark.' : `Noch ${de(season.xpPerLevel - season.levelXp)} XP bis Level ${season.level + 1} · Quests geben XP`}</p>
      </div>
      <div className="season-premium">
        <button className="premium-button" disabled title="Premium kommt mit dem Savira-Shop"><Crown size={15} weight="bold" />Premium freischalten</button>
        <small className="mono">Kommt mit dem Savira-Shop</small>
      </div>
    </section>

    <section className="season-track">
      <header>
        <h2>Belohnungen</h2>
        <span className="mono legend"><span><i className="dot-done" />Abgeholt</span><span><i className="dot-ready" />Bereit</span><span><i className="dot-locked" />Gesperrt</span></span>
      </header>
      <div className="track-wrap">
        <div className="lane-labels">
          <span><b>Free</b><small className="mono">Für alle</small></span>
          <span className="premium"><b>Premium</b><small className="mono">Bald</small></span>
        </div>
        <div className="track">
          {season.tiers.map(tier => {
            const reached = tier.level <= season.level;
            const free = tier.free.claimed ? 'done' : tier.free.ready ? 'ready' : 'locked';
            return <div className="tier-col" key={tier.level}>
              <div className="tier-level"><b className={reached ? 'reached' : ''}>{tier.level}</b><i className={tier.level < season.level ? 'reached' : ''} /></div>
              <div className={`tier-card ${free}`}>
                <span className="tier-icon"><RewardIcon kind={tier.free.kind} size={18} /></span>
                <em>{tier.free.name}</em>
                {free === 'done' && <span className="tier-done"><Check size={10} weight="bold" /></span>}
                {free === 'locked' && <Lock className="tier-lock" size={11} weight="bold" />}
                {free === 'ready' && <button className="tier-claim" onClick={() => claimTier(tier.level)}>Abholen</button>}
              </div>
              <div className="tier-card premium locked">
                <span className="tier-icon"><RewardIcon kind={tier.premium.kind} size={18} /></span>
                <em>{tier.premium.name}</em>
                <Lock className="tier-lock" size={11} weight="bold" />
              </div>
            </div>;
          })}
        </div>
      </div>
    </section>

    <section className="season-quests">
      <div className="quest-card glass">
        <header><h2>Daily Quests</h2><small className="mono">{resetIn(season.dailyResetAt)}</small></header>
        {season.daily.map(quest => <QuestRow key={quest.id} quest={quest} onClaim={claimQuest} />)}
      </div>
      <div className="quest-card glass">
        <header><h2>Weekly Quests</h2><small className="mono">{resetIn(season.weeklyResetAt)}</small></header>
        {season.weekly.map(quest => <QuestRow key={quest.id} quest={quest} onClaim={claimQuest} />)}
      </div>
    </section>
  </div>;
}
