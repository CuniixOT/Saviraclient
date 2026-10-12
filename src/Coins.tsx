import { Storefront, X } from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState } from 'react';

/** A gold Savira coin: rim and face as SVG, the Savira logo pressed into it via its mask. */
export function CoinIcon({ size = 18 }: { size?: number }) {
  const id = `coin-${useId().replace(/:/g, '')}`;
  return <span className="coin-icon" style={{ width: size, height: size }} aria-hidden="true">
    <svg width={size} height={size} viewBox="0 0 32 32">
      <defs>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe08a" /><stop offset="1" stopColor="#c98a1b" /></linearGradient>
        <linearGradient id={`${id}-face`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffd25e" /><stop offset="1" stopColor="#e9a227" /></linearGradient>
      </defs>
      <circle cx="16" cy="17" r="14" fill="#9a6410" />
      <circle cx="16" cy="16" r="14" fill={`url(#${id}-rim)`} />
      <circle cx="16" cy="16" r="11" fill={`url(#${id}-face)`} stroke="#b77a14" strokeWidth="1" />
      <path d="M8 11a10 10 0 0 1 6-5" fill="none" stroke="#fff6d6" strokeWidth="1.6" strokeLinecap="round" opacity=".8" />
    </svg>
    <i className="coin-mark coin-mark-light" /><i className="coin-mark" />
  </span>;
}

const format = (value: number) => new Intl.NumberFormat('de-DE').format(value);

/**
 * Savira Coins next to the account chip. The shop and the balance come with the Savira server;
 * until then the balance is 0 and the card explains what coins will be for.
 */
export function CoinsChip({ balance = 0 }: { balance?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close); window.addEventListener('keydown', close);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', close); };
  }, [open]);

  return <div className="coins" ref={ref}>
    <button className="coins-chip" aria-haspopup="dialog" aria-expanded={open} aria-label={`Savira Coins: ${format(balance)}`} onClick={() => setOpen(value => !value)}>
      <CoinIcon size={20} /><strong>{format(balance)}</strong>
    </button>
    {open && <section className="coins-menu glass" role="dialog" aria-label="Savira Coins">
      <header className="account-menu-head"><span className="pixel">savira coins</span><button className="btn btn-icon" aria-label="Schließen" onClick={() => setOpen(false)}><X size={14} /></button></header>
      <div className="coins-balance"><CoinIcon size={40} /><div><strong>{format(balance)}</strong><small>Dein Guthaben</small></div></div>
      <p className="coins-text">Mit Savira Coins kaufst du bald <b>Cosmetics</b> wie Capes, Emotes und Effekte im Savira-Shop.</p>
      <button className="btn w-full pixel" disabled><Storefront size={16} />shop · kommt bald</button>
    </section>}
  </div>;
}
