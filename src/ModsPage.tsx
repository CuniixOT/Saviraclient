import { Flask, Keyboard, Lightning, MagnifyingGlass, Memory, Monitor, Mountains, PersonSimpleRun, ShieldCheck, SquaresFour, Sword } from '@phosphor-icons/react';
import { useDeferredValue, useState, type CSSProperties } from 'react';
import type { Hud, Settings } from './api';
import { PageHeader, Toggle } from './ui';

type ModuleKey = keyof Omit<Hud, 'scale'>;
const categories = ['Alle', 'Aktiv', 'PvP', 'Performance', 'Welt', 'Gameplay'] as const;
const modules: { key: ModuleKey; title: string; description: string; tag: string; icon: typeof Monitor }[] = [
  { key: 'fps', title: 'FPS', description: 'Deine Bildrate, immer im Blick.', tag: 'Performance', icon: Monitor },
  { key: 'cps', title: 'CPS', description: 'Linke und rechte Klicks pro Sekunde.', tag: 'PvP', icon: Sword },
  { key: 'keystrokes', title: 'Keystrokes', description: 'WASD, Maustasten und Leertaste live.', tag: 'PvP', icon: Keyboard },
  { key: 'ping', title: 'Ping', description: 'Deine Verbindung zum aktuellen Server.', tag: 'Performance', icon: Lightning },
  { key: 'coordinates', title: 'Koordinaten', description: 'X, Y, Z plus Richtung und Biom.', tag: 'Welt', icon: Mountains },
  { key: 'armor', title: 'Rüstung', description: 'Verbleibende Haltbarkeit deiner Rüstung.', tag: 'PvP', icon: ShieldCheck },
  { key: 'potions', title: 'Effekte', description: 'Aktive Effekte mit Restdauer.', tag: 'PvP', icon: Flask },
  { key: 'sprint', title: 'Sprint', description: 'Sprinten, Schleichen oder Laufen.', tag: 'Gameplay', icon: PersonSimpleRun },
  { key: 'zoom', title: 'Zoom', description: 'C halten zum Heranzoomen.', tag: 'Gameplay', icon: MagnifyingGlass },
  { key: 'ram', title: 'Arbeitsspeicher', description: 'Genutzter und maximaler RAM.', tag: 'Performance', icon: Memory }
];

type Props = { settings: Settings; locked: boolean; onSave: (settings: Settings, message?: string) => void };

export function ModsPage({ settings, locked, onSave }: Props) {
  const [category, setCategory] = useState<(typeof categories)[number]>('Alle');
  const [query, setQuery] = useState('');
  const needle = useDeferredValue(query.trim().toLowerCase());
  const hud = settings.hud;
  const activeCount = modules.filter(m => hud[m.key]).length;
  const visible = modules.filter(m => (category === 'Alle' || (category === 'Aktiv' ? hud[m.key] : m.tag === category))
    && `${m.title} ${m.description} ${m.tag}`.toLowerCase().includes(needle));
  const setHud = (next: Partial<Hud>, message?: string) => onSave({ ...settings, hud: { ...hud, ...next } }, message);

  return <div className="page page-enter">
    <PageHeader kicker={`${activeCount} von ${modules.length} aktiv`} title="module">
      <label className="select-field">HUD-Größe
        <select className="input" disabled={locked} value={hud.scale} onChange={e => setHud({ scale: Number(e.target.value) }, 'HUD-Größe gespeichert.')}>{[0.75, 1, 1.25, 1.5].map(n => <option key={n} value={n}>{n * 100} %</option>)}</select>
      </label>
    </PageHeader>

    <div className="mods-layout">
      <nav className="mods-nav glass" aria-label="Kategorien">
        {categories.map(item => {
          const count = item === 'Alle' ? modules.length : item === 'Aktiv' ? activeCount : modules.filter(m => m.tag === item).length;
          return <button key={item} className={category === item ? 'active' : ''} aria-current={category === item} onClick={() => setCategory(item)}><span>{item}</span><small>{count}</small></button>;
        })}
        <div className="mods-hint"><Keyboard size={18} /><p>Im Spiel öffnet <kbd>Rechts-Shift</kbd> das Mod-Menü. Dort ziehst du die Anzeigen an ihren Platz.</p></div>
      </nav>

      <section className="mods-main">
        <label className="search glass"><MagnifyingGlass size={17} /><input aria-label="Module suchen" value={query} onChange={e => setQuery(e.target.value)} placeholder="Module suchen" /></label>
        <div className="mod-grid">{visible.map((m, index) => {
          const on = hud[m.key];
          return <article className={`mod-card glass ${on ? 'is-on' : ''}`} key={m.key} style={{ '--i': index } as CSSProperties}>
            <div className="mod-icon"><m.icon size={24} weight={on ? 'fill' : 'regular'} /></div>
            <div className="mod-copy"><h2>{m.title}</h2><p>{m.description}</p></div>
            <footer><span className="tag-plain">{m.tag}</span><Toggle value={on} disabled={locked} label={`${m.title} ${on ? 'deaktivieren' : 'aktivieren'}`} onChange={() => setHud({ [m.key]: !on })} /></footer>
          </article>;
        })}
        {visible.length === 0 && <div className="empty glass"><SquaresFour size={34} weight="thin" /><h2 className="pixel">keine module</h2><p>{category === 'Aktiv' ? 'Noch kein Modul eingeschaltet. Wähle links „Alle“ und aktiviere deine Anzeigen.' : 'Nichts passt zu deiner Suche.'}</p><button className="btn" onClick={() => { setQuery(''); setCategory('Alle'); }}>Alle Module zeigen</button></div>}
        </div>
      </section>
    </div>
  </div>;
}
