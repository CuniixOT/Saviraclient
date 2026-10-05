import { CheckCircle, Circle, GithubLogo, ShieldCheck } from '@phosphor-icons/react';
import { Logo, PageHeader } from './ui';

const shipped = [
  'Microsoft-Anmeldung mit verschlüsselt gespeichertem Token',
  'Vanilla und Fabric in getrennten Profilen',
  'Zehn HUD-Module mit Größenanpassung und Ingame-Editor',
  'Akzentfarben und Panorama-Hintergrund',
  'RAM-Zuweisung, Java-Auswahl und Vollbildstart'
];
const planned = ['Automatische Updates', 'Cosmetics und Capes', 'Freundesliste', 'Weitere Minecraft-Versionen für den Savira-Mod'];

export function AboutPage({ version }: { version: string }) {
  return <div className="page page-enter about">
    <PageHeader kicker={`version ${version} · early access`} title="über savira" />
    <section className="about-hero glass">
      <Logo />
      <p>Ein unabhängiger Minecraft-Launcher mit eigenem Fabric-PvP-HUD. Keine Kampfvorteile, nur Anzeigen, die dir beim Spielen helfen.</p>
    </section>
    <div className="about-columns">
      <section className="panel glass">
        <header className="panel-head"><CheckCircle size={20} /><div><h2>Enthalten</h2><p>Was in {version} schon funktioniert.</p></div></header>
        <ul className="checklist">{shipped.map(text => <li key={text}><CheckCircle size={18} weight="fill" />{text}</li>)}</ul>
      </section>
      <section className="panel glass">
        <header className="panel-head"><Circle size={20} /><div><h2>Geplant</h2><p>Noch nicht in dieser Version.</p></div></header>
        <ul className="checklist muted">{planned.map(text => <li key={text}><Circle size={18} />{text}</li>)}</ul>
      </section>
    </div>
    <p className="legal"><ShieldCheck size={15} />Optisch inspiriert vom NoRisk Client. Eigenständige Umsetzung ohne NoRisk-Quellcode oder -Assets. Savira ist nicht mit NoRiskClient, Mojang oder Microsoft verbunden. <GithubLogo size={15} /> Lizenz: MIT</p>
  </div>;
}
