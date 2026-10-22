import { ArrowLeft, ArrowRight, Check, CheckCircle, FileArrowUp, Flask, ImageSquare, Link, MagnifyingGlass, SquaresFour, Star, UploadSimple, X } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { profilesApi, saviraAvailable, saviraVersions, unwrap, type BlockIcon, type GameProfile, type Loader, type LoaderVersion, type MinecraftVersion, type Settings } from './api';
import { loaderNames, ProfileIcon } from './profileUi';

type Step = 'start' | 'version' | 'loader' | 'details';
type Builds = LoaderVersion[] | 'loading' | 'error';
const LOADERS: Loader[] = ['vanilla', 'fabric', 'forge', 'neoforge', 'quilt'];
const LOADER_HINT: Record<Loader, string> = { vanilla: 'Ohne Mods', fabric: 'Leicht und schnell', forge: 'Der Klassiker', neoforge: 'Moderner Forge-Nachfolger', quilt: 'Fabric-kompatibel' };
const recommendedMemory = (loader: Loader, max: number) => Math.min(max, loader === 'vanilla' ? 4096 : 6144);
const message = (error: unknown) => error instanceof Error ? error.message : 'Das hat nicht geklappt.';

type Props = {
  settings: Settings;
  /** GB, from the launcher state. */
  maxMemory: number;
  /** An existing profile to edit (name, group, RAM, icon); null creates a new one. */
  editing: GameProfile | null;
  onClose: () => void;
  onSave: (profile: GameProfile) => Promise<void>;
  onImport: () => Promise<void>;
};

/** New profile like in the NoRisk launcher: version, loader with its build, then name, group, RAM and icon. */
export function ProfileWizard({ settings, maxMemory, editing, onClose, onSave, onImport }: Props) {
  const maxMb = maxMemory * 1024;
  const [step, setStep] = useState<Step>(editing ? 'details' : 'start');
  const [versions, setVersions] = useState<MinecraftVersion[] | null>(null);
  const [channel, setChannel] = useState<'release' | 'snapshot'>('release');
  const [query, setQuery] = useState('');
  const [version, setVersion] = useState(editing?.version ?? '');
  const [loader, setLoader] = useState<Loader>(editing?.loader ?? 'vanilla');
  const [builds, setBuilds] = useState<Partial<Record<Loader, Builds>>>({});
  const [loaderVersion, setLoaderVersion] = useState<string | null>(editing?.loaderVersion ?? null);
  const [name, setName] = useState(editing?.name ?? '');
  const [ownName, setOwnName] = useState(Boolean(editing));
  const [group, setGroup] = useState(editing?.group ?? '');
  const [memory, setMemory] = useState(editing?.memory ?? recommendedMemory('vanilla', maxMb));
  const [ownMemory, setOwnMemory] = useState(Boolean(editing));
  const [icon, setIcon] = useState<string | null>(editing?.icon ?? null);
  const [savira, setSavira] = useState(editing?.savira ?? true);
  const [picking, setPicking] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const groups = useMemo(() => [...new Set(settings.profiles.map(profile => profile.group).filter(Boolean))].sort(), [settings.profiles]);
  const canSavira = saviraAvailable(version, loader);

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !picking) onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose, picking]);

  // Versions once the version step opens; the newest release is preselected.
  useEffect(() => {
    if (step !== 'version' || versions) return;
    unwrap(profilesApi.minecraftVersions()).then(list => {
      setVersions(list);
      setVersion(current => current || list.find(item => item.type === 'release')?.id || '');
    }, e => setError(message(e)));
  }, [step, versions]);

  // Builds of every loader for the chosen version, so unavailable loaders can be greyed out.
  useEffect(() => {
    if (step !== 'loader' || !version) return;
    let alive = true;
    for (const item of LOADERS.filter(item => item !== 'vanilla') as Exclude<Loader, 'vanilla'>[]) {
      setBuilds(current => ({ ...current, [item]: 'loading' }));
      profilesApi.loaderVersions(item, version).then(result => { if (alive) setBuilds(current => ({ ...current, [item]: result.ok ? result.data : 'error' })); });
    }
    return () => { alive = false; };
  }, [step, version]);

  // Default build: the recommended one, otherwise the newest.
  const list = builds[loader];
  useEffect(() => {
    if (loader === 'vanilla' || !Array.isArray(list)) return;
    setLoaderVersion(current => current && list.some(item => item.version === current) ? current : (list.find(item => item.stable) || list[0])?.version ?? null);
  }, [loader, list]);

  // Name and RAM follow the choices until the player sets their own.
  useEffect(() => { if (!ownName) setName(`${savira && canSavira ? 'Savira' : loaderNames[loader]} ${version}`.trim()); }, [ownName, savira, canSavira, loader, version]);
  useEffect(() => { if (!ownMemory) setMemory(recommendedMemory(loader, maxMb)); }, [ownMemory, loader, maxMb]);

  const shown = (versions || []).filter(item => item.type === channel && item.id.toLowerCase().includes(query.trim().toLowerCase()));
  const ready = name.trim().length > 0 && (loader === 'vanilla' || Boolean(loaderVersion));

  async function save() {
    setWorking(true); setError('');
    try {
      await onSave({
        id: editing?.id ?? `profile-${Date.now().toString(36)}`, name: name.trim(), version, loader,
        loaderVersion: loader === 'vanilla' ? null : loaderVersion, savira: savira && canSavira,
        memory, group: group.trim(), icon, lastPlayed: editing?.lastPlayed ?? null, playTime: editing?.playTime ?? 0, pack: editing?.pack ?? null
      });
    } catch (e) { setError(message(e)); setWorking(false); }
  }
  async function importPack() {
    setWorking(true); setError('');
    try { await onImport(); } catch (e) { setError(message(e)); setWorking(false); }
  }

  const titles: Record<Step, string> = { start: 'Neues Profil', version: 'Profildetails', loader: 'Spielversion', details: editing ? 'Profil bearbeiten' : 'Loader-Version' };
  const recommended = recommendedMemory(loader, maxMb);

  // On the body: the page's entry animation would otherwise anchor the fixed backdrop to the page.
  return createPortal(<div className="modal-backdrop" onMouseDown={onClose}>
    <section className={`modal glass wizard is-${step}`} role="dialog" aria-modal="true" aria-labelledby="wizard-title" onMouseDown={event => event.stopPropagation()}>
      <header className="wizard-head"><h2 id="wizard-title" className="pixel">{titles[step]}</h2><button className="btn btn-icon" aria-label="Dialog schließen" onClick={onClose}><X size={16} /></button></header>
      <div className="wizard-body">
        {error && <p className="wizard-error" role="alert">{error}</p>}

        {step === 'start' && <div className="wizard-start">
          <button className="start-main" onClick={() => setStep('version')}>
            <span className="start-icon"><SquaresFour size={24} weight="fill" /></span>
            <span><strong className="pixel">Eigenes Profil</strong><small>Minecraft-Version und Loader selbst wählen</small></span>
            <ArrowRight size={18} />
          </button>
          <p className="wizard-or"><span>oder etwas mitbringen</span></p>
          <button className="start-option" disabled={working} onClick={importPack}>
            <FileArrowUp size={20} />
            <span><strong>{working ? 'Modpack wird importiert …' : 'Aus einer Datei'}</strong><small>Ein Modrinth-Modpack (.mrpack oder .zip) von deinem PC</small></span>
          </button>
        </div>}

        {step === 'version' && <>
          <div className="wizard-filter">
            <label className="search glass"><MagnifyingGlass size={16} /><input aria-label="Versionen suchen" placeholder="Versionen suchen …" value={query} onChange={event => setQuery(event.target.value)} /></label>
            <div className="segmented" role="tablist" aria-label="Versionstyp">
              <button role="tab" aria-selected={channel === 'release'} className={channel === 'release' ? 'active' : ''} onClick={() => setChannel('release')}><Star size={13} weight="fill" />Release</button>
              <button role="tab" aria-selected={channel === 'snapshot'} className={channel === 'snapshot' ? 'active' : ''} onClick={() => setChannel('snapshot')}><Flask size={13} weight="fill" />Snapshot</button>
            </div>
          </div>
          {!versions && !error && <p className="wizard-loading">Versionen werden von Mojang geladen …</p>}
          <div className="version-list" role="listbox" aria-label="Minecraft-Version">
            {shown.map(item => <button key={item.id} role="option" aria-selected={version === item.id} className={version === item.id ? 'active' : ''} onClick={() => setVersion(item.id)} onDoubleClick={() => setStep('loader')}>
              <strong className="pixel">{item.id}</strong><small>{item.type === 'release' ? 'Release' : 'Snapshot'}</small>
              {saviraVersions.includes(item.id) && <Star className="savira-star" size={14} weight="fill" aria-label="Savira-Funktionen verfügbar" />}
            </button>)}
            {versions && !shown.length && <p className="wizard-loading">Keine Version passt zu „{query}“.</p>}
          </div>
          <p className="wizard-legend"><Star size={12} weight="fill" /> Mit Savira-Client-Funktionen</p>
        </>}

        {step === 'loader' && <>
          <div className="loader-tiles" role="radiogroup" aria-label="Loader">
            {LOADERS.map(item => {
              const state = item === 'vanilla' ? [] : builds[item];
              const unavailable = item !== 'vanilla' && (state === 'error' || (Array.isArray(state) && !state.length));
              return <button key={item} role="radio" aria-checked={loader === item} disabled={unavailable} className={`loader-tile ${item} ${loader === item ? 'active' : ''}`} onClick={() => setLoader(item)}>
                <strong className="pixel">{loaderNames[item]}</strong>
                <small>{unavailable ? `Nicht für ${version}` : state === 'loading' ? 'lädt …' : LOADER_HINT[item]}</small>
                {item === 'fabric' && saviraVersions.includes(version) && <Star className="savira-star" size={15} weight="fill" aria-label="Savira-Funktionen verfügbar" />}
              </button>;
            })}
          </div>
          {loader !== 'vanilla' && <label className="field"><span>{loaderNames[loader]}-Version</span>
            <select className="input" value={loaderVersion ?? ''} disabled={!Array.isArray(list)} onChange={event => setLoaderVersion(event.target.value)}>
              {Array.isArray(list) ? list.map(item => <option key={item.version} value={item.version}>{item.version}{item.stable ? ' (stabil)' : ''}</option>) : <option>lädt …</option>}
            </select>
          </label>}
        </>}

        {step === 'details' && <div className="wizard-details">
          <div className="details-row">
            <button className="icon-button" aria-label="Icon auswählen" title="Icon auswählen" onClick={() => setPicking(true)}><ProfileIcon profile={{ icon, loader, savira: savira && canSavira }} size={60} /><span><ImageSquare size={14} /></span></button>
            <label className="field"><span>Profilname</span><input className="input" maxLength={40} value={name} onChange={event => { setName(event.target.value); setOwnName(true); }} />{!name.trim() && <small className="field-error">Bitte einen Namen eingeben.</small>}</label>
            <label className="field"><span>Gruppe (optional)</span><input className="input" maxLength={24} list="profile-groups" placeholder="z. B. Modpacks" value={group} onChange={event => setGroup(event.target.value)} /><datalist id="profile-groups">{groups.map(item => <option key={item} value={item} />)}</datalist></label>
          </div>
          <div className="memory">
            <p className="memory-hint">Empfohlen: {recommended} MB</p>
            <p className="memory-value pixel">{memory} MB ({(memory / 1024).toFixed(1)} GB)</p>
            <input type="range" className="range" style={{ '--fill': `${(memory - 1024) / Math.max(1, maxMb - 1024) * 100}%` } as CSSProperties} aria-label="Arbeitsspeicher in MB" min={1024} max={maxMb} step={256} value={memory} onChange={event => { setMemory(Number(event.target.value)); setOwnMemory(true); }} />
            <div className="memory-scale"><span>1 GB</span><button type="button" onClick={() => { setMemory(recommended); setOwnMemory(true); }} style={{ left: `${(recommended - 1024) / Math.max(1, maxMb - 1024) * 100}%` }}>{recommended} MB <Star size={11} weight="fill" /></button><span>{maxMb} MB</span></div>
          </div>
          {canSavira && <label className="check">
            <input type="checkbox" checked={savira} onChange={event => setSavira(event.target.checked)} /><span className="check-box"><Check size={13} weight="bold" /></span>
            <span><strong className="pixel">Savira-Client-Funktionen nutzen</strong><small>HUD, Mod-Menü, eigene Capes und Icons im Spiel</small></span>
          </label>}
          <dl className="summary"><div><dt>Minecraft</dt><dd>{version}</dd></div><div><dt>Loader</dt><dd>{loader === 'vanilla' ? 'Vanilla' : `${loaderNames[loader]} ${loaderVersion ?? ''}`}</dd></div><div><dt>Ordner</dt><dd>eigener</dd></div></dl>
        </div>}
      </div>

      {step !== 'start' && <footer className="wizard-foot">
        {step === 'version' || (step === 'details' && editing) ? <span /> : <button className="btn pixel" onClick={() => setStep(step === 'details' ? 'loader' : 'version')}><ArrowLeft size={14} />zurück</button>}
        {step === 'version' && <div className="wizard-foot-actions"><button className="btn pixel" onClick={() => setStep('start')}><ArrowLeft size={14} />zurück</button><button className="btn btn-accent pixel" disabled={!version} onClick={() => setStep('loader')}>weiter <ArrowRight size={14} /></button></div>}
        {step === 'loader' && <button className="btn btn-accent pixel" disabled={loader !== 'vanilla' && !loaderVersion} onClick={() => setStep('details')}>weiter <ArrowRight size={14} /></button>}
        {step === 'details' && <button className="btn btn-accent pixel" disabled={!ready || working} onClick={save}><CheckCircle size={15} weight="fill" />{editing ? 'speichern' : 'profil erstellen'}</button>}
      </footer>}
    </section>
    {picking && <IconPicker current={icon} onClose={() => setPicking(false)} onPick={next => { setIcon(next); setPicking(false); }} />}
  </div>, document.body);
}

// Own pictures become a 64×64 PNG; small pixel art is scaled up crisply, photos smoothly.
function squareIcon(source: string) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const size = 64, canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) return reject(new Error('Das Bild konnte nicht verarbeitet werden.'));
      context.imageSmoothingEnabled = Math.max(image.width, image.height) > size;
      const side = Math.min(image.width, image.height);
      context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, size, size);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => reject(new Error('Das Bild konnte nicht gelesen werden.'));
    image.src = source;
  });
}

function IconPicker({ current, onPick, onClose }: { current: string | null; onPick: (icon: string | null) => void; onClose: () => void }) {
  const [blocks, setBlocks] = useState<BlockIcon[] | null>(null);
  const [error, setError] = useState('');
  const [url, setUrl] = useState('');
  const [urlOpen, setUrlOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const urlRef = useRef<HTMLInputElement>(null);

  useEffect(() => { unwrap(profilesApi.blockIcons()).then(setBlocks, e => { setBlocks([]); setError(message(e)); }); }, []);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', close, true);
    return () => window.removeEventListener('keydown', close, true);
  }, [onClose]);
  useEffect(() => { if (urlOpen) urlRef.current?.focus(); }, [urlOpen]);

  async function custom(load: () => Promise<string | null>) {
    setLoading(true); setError('');
    try { const raw = await load(); if (raw) onPick(await squareIcon(raw)); } catch (e) { setError(message(e)); } finally { setLoading(false); }
  }

  return <div className="modal-backdrop icon-backdrop" onMouseDown={event => { event.stopPropagation(); onClose(); }}>
    <section className="modal glass icon-picker" role="dialog" aria-modal="true" aria-labelledby="icon-title" onMouseDown={event => event.stopPropagation()}>
      <header className="wizard-head"><h2 id="icon-title" className="pixel"><ImageSquare size={18} weight="fill" />Symbol auswählen</h2><button className="btn btn-icon" aria-label="Schließen" onClick={onClose}><X size={16} /></button></header>
      <div className="wizard-body">
        {error && <p className="wizard-error" role="alert">{error}</p>}
        <h3 className="icon-section pixel">blöcke</h3>
        {!blocks && <p className="wizard-loading">Block-Texturen werden aus Minecraft geladen …</p>}
        <div className="icon-grid">{blocks?.map(block => <button key={block.id} className={current === block.png ? 'active' : ''} title={block.id.replaceAll('_', ' ')} aria-label={block.id.replaceAll('_', ' ')} onClick={() => onPick(block.png)}><img src={block.png} alt="" draggable={false} /></button>)}</div>
        <h3 className="icon-section pixel">eigene</h3>
        <div className="icon-own">
          <button className="icon-add" disabled={loading} onClick={() => custom(() => unwrap(profilesApi.iconFromFile()))}><UploadSimple size={18} />hochladen</button>
          <button className="icon-add" disabled={loading} onClick={() => setUrlOpen(open => !open)}><Link size={18} />url hinzufügen</button>
          {current && <button className="icon-add" disabled={loading} onClick={() => onPick(null)}><X size={18} />entfernen</button>}
        </div>
        {urlOpen && <form className="icon-url" onSubmit={event => { event.preventDefault(); if (url.trim()) void custom(() => unwrap(profilesApi.iconFromUrl(url.trim()))); }}>
          <input ref={urlRef} className="input" type="url" placeholder="https://…/bild.png" value={url} onChange={event => setUrl(event.target.value)} aria-label="Bild-Adresse" />
          <button className="btn btn-accent pixel" disabled={loading || !url.trim()}>{loading ? 'lädt …' : 'übernehmen'}</button>
        </form>}
      </div>
    </section>
  </div>;
}
