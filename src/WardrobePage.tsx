import { useState } from 'react';
import type { Accounts, Season, State } from './api';
import { SkinsPage } from './SkinsPage';
import { CapesPage } from './CapesPage';
import { CosmeticsView } from './CosmeticsView';

type Props = { state: State; locked: boolean; onNotice: (message: string) => void; onError: (message: string) => void; onApplied: (accounts: Accounts) => void; onCapeChange: () => void; season: Season | null };

/** "Garderobe": skins, capes and cosmetics in one place, switched by the tabs at the top. */
export function WardrobePage({ state, locked, onNotice, onError, onApplied, onCapeChange, season }: Props) {
  const [tab, setTab] = useState<'skins' | 'capes' | 'cosmetics'>('skins');
  return <div className="wardrobe">
    <div className="segmented wardrobe-tabs" role="tablist" aria-label="Garderobe">
      <button role="tab" aria-selected={tab === 'skins'} className={tab === 'skins' ? 'active' : ''} onClick={() => setTab('skins')}>Skins</button>
      <button role="tab" aria-selected={tab === 'capes'} className={tab === 'capes' ? 'active' : ''} onClick={() => setTab('capes')}>Capes</button>
      <button role="tab" aria-selected={tab === 'cosmetics'} className={tab === 'cosmetics' ? 'active' : ''} onClick={() => setTab('cosmetics')}>Cosmetics</button>
    </div>
    {tab === 'cosmetics' ? <CosmeticsView state={state} season={season} /> : tab === 'skins'
      ? <SkinsPage hasAccount={Boolean(state.account)} locked={locked} onNotice={onNotice} onError={onError} onApplied={onApplied} />
      : <CapesPage hasAccount={Boolean(state.account)} skin={state.account?.skin || null} locked={locked} onNotice={onNotice} onError={onError} onCapeChange={onCapeChange} />}
  </div>;
}
