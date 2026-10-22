import { CaretDown, Check } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export type SelectOption<T extends string> = { value: T; label: string; icon?: ReactNode; hint?: string };

/** Dropdown in the launcher's look instead of the native one, with keyboard support. */
export function Select<T extends string>({ value, options, onChange, label, icon, className = '', width }: { value: T; options: SelectOption<T>[]; onChange: (value: T) => void; label: string; icon?: ReactNode; className?: string; width?: number }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find(option => option.value === value);

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.findIndex(option => option.value === value)));
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open, options, value]);
  useEffect(() => { if (open) ref.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [open, active]);

  function onKey(event: React.KeyboardEvent) {
    if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); return; }
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      if (!open) return setOpen(true);
      setActive(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!open) return setOpen(true);
      onChange(options[active].value); setOpen(false);
    }
  }

  return <div className={`select ${open ? 'is-open' : ''} ${className}`} ref={ref} style={width ? { width } : undefined} onKeyDown={onKey}>
    <button type="button" className="select-button" aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${current?.label ?? ''}`} onClick={() => setOpen(next => !next)}>
      {icon ?? current?.icon}<span>{current?.label ?? label}</span><CaretDown size={12} weight="bold" />
    </button>
    {open && <div className="select-menu" role="listbox" aria-label={label}>
      {options.map((option, index) => <button type="button" key={option.value} role="option" data-index={index} aria-selected={option.value === value} className={`${option.value === value ? 'is-selected' : ''} ${index === active ? 'is-active' : ''}`} onMouseEnter={() => setActive(index)} onClick={() => { onChange(option.value); setOpen(false); }}>
        {option.icon}<span>{option.label}{option.hint && <small>{option.hint}</small>}</span>{option.value === value && <Check size={13} weight="bold" />}
      </button>)}
    </div>}
  </div>;
}
