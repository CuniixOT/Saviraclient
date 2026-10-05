import { ArrowLeft, ArrowRight, Check, Cube, MagnifyingGlass, Package, Play, Plus, Trash, X } from '@phosphor-icons/react';
import { PageHeader } from './ui';
import { useDeferredValue, useState, type CSSProperties } from 'react';
import type { GameProfile, Settings } from './api';

const versions = ['1.21.10', '1.21.9', '1.21.8', '1.21.4', '1.21.1', '1.20.4', '1.19.4', '1.8.9'];
type Filter = 'all' | 'savira' | 'vanilla';

type Props = {
  settings: Settings;
  locked: boolean;
  onSave: (settings: Settings, message: string) => Promise<void>;
  onUse: (profileId: string) => Promise<void>;
};

export function ProfilesPage({ settings, locked, onSave, onUse }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState(0);
  const [version, setVersion] = useState('1.21.1');
  const [loader, setLoader] = useState<GameProfile['loader']>('savira');
  const [name, setName] = useState('Savira 1.21.1');

  const visible = settings.profiles.filter(profile => (filter === 'all' || profile.loader === filter)
    && `${profile.name} ${profile.version} ${profile.loader}`.toLowerCase().includes(deferredQuery));

  function openCreator() {
    setVersion('1.21.1'); setLoader('savira'); setName('Savira 1.21.1'); setStep(0); setCreating(true);
  }
  function chooseVersion(next: string) {
    const nextLoader = next === '1.21.1' ? loader : 'vanilla';
    setVersion(next); setLoader(nextLoader); setName(`${nextLoader === 'savira' ? 'Savira' : 'Vanilla'} ${next}`);
  }
  function chooseLoader(next: GameProfile['loader']) {
    setLoader(next); setName(`${next === 'savira' ? 'Savira' : 'Vanilla'} ${version}`);
  }
  async function createProfile() {
    const id = `profile-${Date.now().toString(36)}`;
    const profile = { id, name: name.trim(), version, loader };
    await onSave({ ...settings, profiles: [...settings.profiles, profile], selectedProfileId: id }, `Profil „${profile.name}“ erstellt.`);
    setCreating(false);
  }
  async function removeProfile(profile: GameProfile) {
    if (settings.profiles.length === 1) return;
    const profiles = settings.profiles.filter(item => item.id !== profile.id);
    const selectedProfileId = settings.selectedProfileId === profile.id ? profiles[0].id : settings.selectedProfileId;
    await onSave({ ...settings, profiles, selectedProfileId }, `Profil „${profile.name}“ gelöscht.`);
  }

  return <div className="page page-enter">
    <PageHeader kicker="instanzen" title="profile">
      <button className="btn btn-accent pixel" disabled={locked || settings.profiles.length >= 30} onClick={openCreator}><Plus size={16} weight="bold" />neues profil</button>
    </PageHeader>

    <div className="toolbar">
      <div className="segmented" role="tablist" aria-label="Profile filtern">
        {([['all', 'Alle'], ['savira', 'Savira'], ['vanilla', 'Vanilla']] as const).map(([id, label]) => <button role="tab" aria-selected={filter === id} className={filter === id ? 'active' : ''} key={id} onClick={() => setFilter(id)}>{label}</button>)}
      </div>
      <label className="search glass"><MagnifyingGlass size={17} /><input aria-label="Profile suchen" value={query} onChange={event => setQuery(event.target.value)} placeholder="Profile suchen" /></label>
      <span className="count">{settings.profiles.length} / 30</span>
    </div>

    <div className="profile-grid">{visible.map((profile, index) => {
      const selected = profile.id === settings.selectedProfileId;
      return <article className={`profile-card glass ${selected ? 'is-selected' : ''}`} key={profile.id} style={{ '--i': index } as CSSProperties}>
        <div className={`profile-art ${profile.loader}`}>{profile.loader === 'savira' ? <Package size={28} weight="fill" /> : <Cube size={28} weight="fill" />}<span className="pixel">{profile.version}</span></div>
        <div className="profile-copy">
          <h2>{profile.name}{selected && <span className="tag"><Check size={10} weight="bold" />aktiv</span>}</h2>
          <p>{profile.loader === 'savira' ? 'Fabric · Savira Client' : 'Vanilla'} · eigener Spielordner</p>
        </div>
        <div className="profile-actions">
          <button className="btn btn-accent pixel" disabled={locked} onClick={() => onUse(profile.id)}><Play size={15} weight="fill" />{selected ? 'spielen' : 'starten'}</button>
          <button className="btn btn-icon" aria-label={`${profile.name} löschen`} title="Profil löschen" disabled={locked || settings.profiles.length === 1} onClick={() => removeProfile(profile)}><Trash size={17} /></button>
        </div>
      </article>;
    })}
    {visible.length === 0 && <div className="empty glass"><Package size={34} weight="thin" /><h2 className="pixel">nichts gefunden</h2><p>Keine Profile passen zu „{query}“. Ändere die Suche oder lege ein neues Profil an.</p><button className="btn" onClick={() => { setQuery(''); setFilter('all'); }}>Filter zurücksetzen</button></div>}
    </div>

    {creating && <div className="modal-backdrop" onMouseDown={() => setCreating(false)}>
      <section className="modal glass" role="dialog" aria-modal="true" aria-labelledby="profile-dialog-title" onMouseDown={event => event.stopPropagation()}>
        <header className="modal-head"><div><p className="kicker pixel">schritt {step + 1} / 2</p><h2 id="profile-dialog-title" className="pixel">{step === 0 ? 'version wählen' : 'profil einrichten'}</h2></div><button className="btn btn-icon" aria-label="Dialog schließen" onClick={() => setCreating(false)}><X size={18} /></button></header>
        {step === 0 ? <>
          <div className="version-grid">{versions.map(item => <button className={version === item ? 'active' : ''} key={item} onClick={() => chooseVersion(item)}><strong className="pixel">{item}</strong><small>{item === '1.21.1' ? 'Savira verfügbar' : 'Release'}</small>{version === item && <Check size={14} weight="bold" />}</button>)}</div>
          <footer className="modal-foot"><span>Minecraft {version}</span><button className="btn btn-accent pixel" onClick={() => setStep(1)}>weiter <ArrowRight size={15} /></button></footer>
        </> : <>
          <div className="form">
            <label className="field"><span>Profilname</span><input className="input" aria-label="Profilname" maxLength={40} value={name} onChange={event => setName(event.target.value)} />{!name.trim() && <small className="field-error">Bitte einen Namen eingeben.</small>}</label>
            <div className="field"><span>Loader</span><div className="loader-grid">
              <button className={loader === 'vanilla' ? 'active' : ''} onClick={() => chooseLoader('vanilla')}><Cube size={22} weight="fill" /><strong>Vanilla</strong><small>Ohne Mods</small></button>
              <button className={loader === 'savira' ? 'active' : ''} disabled={version !== '1.21.1'} onClick={() => chooseLoader('savira')}><Package size={22} weight="fill" /><strong>Savira</strong><small>Fabric + HUD</small></button>
            </div>{version !== '1.21.1' && <small className="field-help">Der Savira-Mod gibt es aktuell nur für 1.21.1. Dieses Profil startet Vanilla.</small>}</div>
            <dl className="summary"><div><dt>Minecraft</dt><dd>{version}</dd></div><div><dt>RAM</dt><dd>{settings.memory} GB</dd></div><div><dt>Ordner</dt><dd>getrennt</dd></div></dl>
          </div>
          <footer className="modal-foot"><button className="btn" onClick={() => setStep(0)}><ArrowLeft size={15} />Zurück</button><button className="btn btn-accent pixel" disabled={!name.trim()} onClick={createProfile}><Check size={15} weight="bold" />erstellen</button></footer>
        </>}
      </section>
    </div>}
  </div>;
}
