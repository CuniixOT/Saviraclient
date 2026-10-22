import { siCurseforge, siModrinth } from 'simple-icons';

// Logos from Simple Icons (CC0); the marks belong to Modrinth and CurseForge and only name the source.
export function SourceLogo({ source, size = 14 }: { source: 'modrinth' | 'curseforge'; size?: number }) {
  const icon = source === 'modrinth' ? siModrinth : siCurseforge;
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="currentColor"><path d={icon.path} /></svg>;
}

/** Modrinth or CurseForge; CurseForge needs its own API key that Savira does not have. */
export function SourceToggle() {
  return <div className="source-toggle" role="group" aria-label="Quelle">
    <button type="button" className="active" aria-pressed="true"><SourceLogo source="modrinth" />Modrinth</button>
    <button type="button" disabled title="CurseForge gibt seine Schnittstelle nur mit einem eigenen API-Schlüssel frei, den Savira nicht hat."><SourceLogo source="curseforge" />CurseForge</button>
  </div>;
}
