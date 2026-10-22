import { ArrowLeft, ArrowSquareOut, CalendarBlank, CaretDown, CaretUp, Check, Code, Desktop, DownloadSimple, Heart, Info, Link, Monitor, Package, Users, Wrench } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { profilesApi, unwrap, type ProjectInfo, type ProjectVersion } from './api';
import { Markdown } from './Markdown';
import { Select } from './Select';
import { SourceLogo } from './SourceLogo';

const compact = new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 1 });
const full = new Intl.NumberFormat('de-DE');
const date = (value: string) => new Date(value).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
const message = (error: unknown) => error instanceof Error ? error.message : 'Das hat nicht geklappt.';
const SIDE: Record<string, string> = { required: 'Benötigt', optional: 'Optional', unsupported: 'Nicht unterstützt', unknown: 'Unbekannt' };
const TYPE_LABEL: Record<string, string> = { mod: 'Mod', resourcepack: 'Ressourcenpaket', shader: 'Shader', datapack: 'Datenpaket', modpack: 'Modpack' };
const PAGE = 40;

type Props = {
  projectId: string;
  /** Default filters, e.g. the profile's Minecraft version and loader. */
  filter?: { gameVersion?: string; loader?: string };
  installed?: boolean;
  onBack: () => void;
  /** Installs the newest fitting version, or the one picked from the list. */
  onInstall: (project: ProjectInfo, versionId?: string) => Promise<void> | void;
};

/** A Modrinth project like on modrinth.com: description, compatibility, team, links and all versions. */
export function ProjectView({ projectId, filter, installed = false, onBack, onInstall }: Props) {
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [error, setError] = useState('');
  const [showVersions, setShowVersions] = useState(false);
  const [working, setWorking] = useState<string | null>(null);

  useEffect(() => { setProject(null); setShowVersions(false); unwrap(profilesApi.project(projectId)).then(setProject, e => setError(message(e))); }, [projectId]);

  async function install(versionId?: string) {
    if (!project) return;
    setWorking(versionId || 'newest'); setError('');
    try { await onInstall(project, versionId); } catch (e) { setError(message(e)); } finally { setWorking(null); }
  }

  return <div className="project">
    <button className="project-back" onClick={onBack}><ArrowLeft size={14} />zurück</button>
    {error && <p className="wizard-error" role="alert">{error}</p>}
    {!project && !error && <p className="wizard-loading">Projekt wird von Modrinth geladen …</p>}
    {project && <>
      <header className="project-head glass">
        {project.icon ? <img src={project.icon} alt="" /> : <span className="result-icon-empty" />}
        <div className="project-title">
          <h2 className="pixel">{project.title}</h2>
          {project.team[0] && <p className="project-by">von {project.team.find(member => /owner/i.test(member.role))?.name || project.team[0].name}</p>}
          <p className="project-summary">{project.description}</p>
          <div className="result-tags"><span className="source-tag"><SourceLogo source="modrinth" size={11} />Modrinth</span><span>{TYPE_LABEL[project.type] || project.type}</span>{project.categories.slice(0, 6).map(item => <span key={item}>{item.replaceAll('-', ' ')}</span>)}</div>
        </div>
        <div className="project-side">
          <p><span title={`${full.format(project.downloads)} Downloads`}><DownloadSimple size={14} />{compact.format(project.downloads)}</span><span title={`${full.format(project.followers)} Follower`}><Heart size={14} />{compact.format(project.followers)}</span></p>
          <div className="split-button">
            <button className="btn btn-accent pixel" disabled={installed || Boolean(working)} onClick={() => install()}>{installed ? <><Check size={14} weight="bold" />installiert</> : working === 'newest' ? 'lädt …' : <><DownloadSimple size={14} />install</>}</button>
            <button className="btn btn-accent btn-icon" aria-label={showVersions ? 'Beschreibung zeigen' : 'Alle Versionen zeigen'} title={showVersions ? 'Beschreibung' : 'Alle Versionen'} aria-expanded={showVersions} onClick={() => setShowVersions(open => !open)}>{showVersions ? <CaretUp size={14} weight="bold" /> : <CaretDown size={14} weight="bold" />}</button>
          </div>
        </div>
      </header>

      {showVersions ? <VersionList project={project} filter={filter} working={working} onInstall={install} /> : <div className="project-body">
        <section className="project-description glass"><h3 className="pixel"><Info size={15} />beschreibung</h3>{project.body ? <Markdown source={project.body} /> : <p className="wizard-loading">Keine Beschreibung.</p>}
          {project.gallery.length > 0 && <div className="project-gallery">{project.gallery.map(item => <img key={item.url} src={item.url} alt={item.title} loading="lazy" referrerPolicy="no-referrer" />)}</div>}
        </section>
        <aside className="project-cards">
          <section className="glass"><h3 className="pixel"><Check size={14} weight="bold" />kompatibilität</h3>
            <small>Minecraft: Java Edition</small>
            <div className="chip-cloud">{project.gameVersions.slice(0, 12).map(item => <span key={item}>{item}</span>)}{project.gameVersions.length > 12 && <em>+{project.gameVersions.length - 12} mehr</em>}</div>
            {project.loaders.length > 0 && <><small>Plattformen</small><div className="chip-cloud">{project.loaders.map(item => <span key={item} className="is-loader">{item}</span>)}</div></>}
            {project.type !== 'resourcepack' && project.type !== 'shader' && <><small>Unterstützte Umgebungen</small>
              <dl className="env"><div><dt><Desktop size={13} />Client</dt><dd className={`is-${project.client}`}>{SIDE[project.client] || project.client}</dd></div><div><dt><Monitor size={13} />Server</dt><dd className={`is-${project.server}`}>{SIDE[project.server] || project.server}</dd></div></dl></>}
          </section>
          {project.team.length > 0 && <section className="glass"><h3 className="pixel"><Users size={14} />team ({project.team.length})</h3>
            <ul className="team">{project.team.map(member => <li key={member.name}>{member.avatar ? <img src={member.avatar} alt="" referrerPolicy="no-referrer" /> : <span />}<div><strong>{member.name}</strong><small>{member.role}</small></div></li>)}</ul>
          </section>}
          <section className="glass"><h3 className="pixel"><Link size={14} />links</h3>
            <div className="project-links">
              <button onClick={() => void profilesApi.openProject(project.type, project.slug)}><SourceLogo source="modrinth" size={13} /><span>Auf Modrinth</span><ArrowSquareOut size={12} /></button>
              {project.links.map(item => <button key={item.url} onClick={() => void profilesApi.openLink(item.url)}>{item.label === 'Quellcode' ? <Code size={13} /> : item.label === 'Fehlerverfolgung' ? <Wrench size={13} /> : <Link size={13} />}<span>{item.label}</span><ArrowSquareOut size={12} /></button>)}
            </div>
          </section>
          <section className="glass"><h3 className="pixel"><Info size={14} />details</h3>
            <dl className="details">
              {project.license && <div><dt>Lizenz</dt><dd>{project.license}</dd></div>}
              <div><dt>Erstellt</dt><dd>{date(project.published)}</dd></div>
              <div><dt>Aktualisiert</dt><dd>{date(project.updated)}</dd></div>
              <div><dt>Projekt-ID</dt><dd className="mono">{project.id}</dd></div>
              <div><dt>Typ</dt><dd>{TYPE_LABEL[project.type] || project.type}</dd></div>
            </dl>
          </section>
        </aside>
      </div>}
    </>}
  </div>;
}

function VersionList({ project, filter, working, onInstall }: { project: ProjectInfo; filter?: { gameVersion?: string; loader?: string }; working: string | null; onInstall: (versionId: string) => void }) {
  const [versions, setVersions] = useState<ProjectVersion[] | null>(null);
  const [error, setError] = useState('');
  const [type, setType] = useState<'all' | 'release' | 'beta' | 'alpha'>('all');
  const [game, setGame] = useState(filter?.gameVersion && project.gameVersions.includes(filter.gameVersion) ? filter.gameVersion : 'all');
  const [loader, setLoader] = useState(filter?.loader && project.loaders.includes(filter.loader) ? filter.loader : 'all');
  const [shown, setShown] = useState(PAGE);
  useEffect(() => { unwrap(profilesApi.versions(project.id)).then(setVersions, e => setError(message(e))); }, [project.id]);
  useEffect(() => setShown(PAGE), [type, game, loader]);
  const games = useMemo(() => [...new Set((versions || []).flatMap(version => version.gameVersions))], [versions]);
  const matching = (versions || []).filter(version => (type === 'all' || version.type === type) && (game === 'all' || version.gameVersions.includes(game)) && (loader === 'all' || version.loaders.includes(loader)));
  return <section className="versions glass">
    <div className="versions-filter">
      <Select label="Typ" value={type} onChange={setType} options={[{ value: 'all', label: 'Alle Typen' }, { value: 'release', label: 'Release' }, { value: 'beta', label: 'Beta' }, { value: 'alpha', label: 'Alpha' }]} />
      <Select label="Spielversion" value={game} onChange={setGame} options={[{ value: 'all', label: 'Alle Spielversionen' }, ...games.map(item => ({ value: item, label: item }))]} />
      {project.loaders.length > 1 && <Select label="Loader" value={loader} onChange={setLoader} options={[{ value: 'all', label: 'Alle Loader' }, ...project.loaders.map(item => ({ value: item, label: item }))]} />}
      <span className="count">{versions ? `${matching.length} Versionen` : ''}</span>
    </div>
    {error && <p className="wizard-error" role="alert">{error}</p>}
    {!versions && !error && <p className="wizard-loading">Versionen werden geladen …</p>}
    <div className="version-rows">{matching.slice(0, shown).map(version => <article key={version.id}>
      <div><strong>{version.name}</strong><small>{version.number}</small>
        <p className="result-tags"><span className={`is-${version.type}`}>{version.type === 'release' ? 'Release' : version.type === 'beta' ? 'Beta' : 'Alpha'}</span>{version.gameVersions.slice(0, 4).map(item => <span key={item}>{item}</span>)}{version.gameVersions.length > 4 && <span>+{version.gameVersions.length - 4}</span>}{version.loaders.map(item => <span key={item}>{item}</span>)}</p>
      </div>
      <div className="version-side"><small><span><DownloadSimple size={12} />{full.format(version.downloads)}</span><span><CalendarBlank size={12} />{new Date(version.date).toLocaleDateString('de-DE')}</span></small>
        <button className="btn pixel" disabled={Boolean(working)} onClick={() => onInstall(version.id)}>{working === version.id ? 'lädt …' : <><Package size={13} />installieren</>}</button></div>
    </article>)}</div>
    {matching.length > shown && <button className="btn pixel more" onClick={() => setShown(count => count + PAGE)}>mehr laden ({matching.length - shown} weitere)</button>}
    {versions && !matching.length && <p className="wizard-loading">Keine Version passt zu den Filtern.</p>}
  </section>;
}
