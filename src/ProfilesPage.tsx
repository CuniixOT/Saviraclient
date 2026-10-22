import { Check, Copy, Cube, Export, FolderOpen, GearSix, Lightning, MagnifyingGlass, Package, Play, Plus, Trash } from '@phosphor-icons/react';
import { PageHeader } from './ui';
import { useDeferredValue, useState, type CSSProperties } from 'react';
import { profilesApi, unwrap, type GameProfile, type Settings } from './api';
import { loaderLabel, playedAgo, ProfileIcon } from './profileUi';
import { ProfileWizard } from './ProfileWizard';
import { ProfileDetail, type ProfileAction } from './ProfileDetail';
import { DeleteDialog, DuplicateDialog, ExportDialog, Menu, PackVersionsDialog } from './ProfileDialogs';

type Props = {
  settings: Settings;
  maxMemory: number;
  locked: boolean;
  onSave: (settings: Settings, message: string) => Promise<void>;
  onUse: (profileId: string) => Promise<void>;
  /** Start from the profile page, optionally into a world or onto a server; stays on the page. */
  onPlay: (profileId: string, target?: { world: string } | { server: string }) => void;
  /** Settings changed by the launcher itself, e.g. after a modpack import. */
  onSettings: (settings: Settings, message: string) => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};
type Dialog = { kind: 'wizard'; editing: GameProfile | null } | { kind: 'duplicate' | 'export' | 'versions' | 'delete'; profile: GameProfile };

export function ProfilesPage({ settings, maxMemory, locked, onSave, onUse, onPlay, onSettings, onNotice, onError }: Props) {
  // Tabs: all, the Savira profiles and one per group.
  const groups = [...new Set(settings.profiles.map(profile => profile.group).filter(Boolean))].sort();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const activeFilter = filter === 'all' || filter === 'savira' || groups.includes(filter) ? filter : 'all';
  const opened = settings.profiles.find(profile => profile.id === openId) || null;

  const visible = settings.profiles.filter(profile => (activeFilter === 'all' || (activeFilter === 'savira' ? profile.savira : profile.group === activeFilter))
    && `${profile.name} ${profile.version} ${profile.loader} ${profile.group}`.toLowerCase().includes(deferredQuery));

  async function saveProfile(profile: GameProfile, notice?: string) {
    const exists = settings.profiles.some(item => item.id === profile.id);
    const profiles = exists ? settings.profiles.map(item => item.id === profile.id ? profile : item) : [...settings.profiles, profile];
    await onSave({ ...settings, profiles, selectedProfileId: exists ? settings.selectedProfileId : profile.id }, notice || (exists ? `Profil „${profile.name}“ gespeichert.` : `Profil „${profile.name}“ erstellt.`));
  }
  async function importPack() {
    const next = await unwrap(profilesApi.importPack());
    if (!next) return;
    const profile = next.profiles.find(item => item.id === next.selectedProfileId);
    onSettings(next, `Modpack „${profile?.name}“ ist bereit.`);
    setDialog(null);
  }
  async function removeProfile(profile: GameProfile) {
    if (settings.profiles.length === 1) return onError('Das letzte Profil kann nicht gelöscht werden.');
    const profiles = settings.profiles.filter(item => item.id !== profile.id);
    const selectedProfileId = settings.selectedProfileId === profile.id ? profiles[0].id : settings.selectedProfileId;
    if (openId === profile.id) setOpenId(null);
    await onSave({ ...settings, profiles, selectedProfileId }, `Profil „${profile.name}“ gelöscht. Sein Spielordner bleibt erhalten.`);
  }
  const openFolder = (profile: GameProfile) => unwrap(profilesApi.openFolder(profile.id)).catch(e => onError(e instanceof Error ? e.message : 'Ordner konnte nicht geöffnet werden.'));
  function act(action: ProfileAction, profile: GameProfile) {
    if (action === 'edit') setDialog({ kind: 'wizard', editing: profile });
    else if (action === 'folder') void openFolder(profile);
    else setDialog({ kind: action, profile });
  }
  const menuFor = (profile: GameProfile) => [
    { label: 'Profil bearbeiten', icon: <GearSix size={15} />, onClick: () => act('edit', profile), disabled: locked },
    { label: 'Duplizieren', icon: <Copy size={15} />, onClick: () => act('duplicate', profile), disabled: locked },
    { label: 'Exportieren', icon: <Export size={15} />, onClick: () => act('export', profile) },
    { label: 'Ordner öffnen', icon: <FolderOpen size={15} />, onClick: () => act('folder', profile) },
    { label: 'Modpack-Versionen', icon: <Package size={15} />, onClick: () => act('versions', profile), disabled: !profile.pack || locked, hint: profile.pack ? undefined : 'Nur für Profile aus einem Modrinth-Modpack' },
    { label: 'Löschen', icon: <Trash size={15} />, onClick: () => act('delete', profile), danger: true, disabled: locked || settings.profiles.length === 1 },
  ];

  const dialogs = <>
    {dialog?.kind === 'wizard' && <ProfileWizard settings={settings} maxMemory={maxMemory} editing={dialog.editing} onClose={() => setDialog(null)} onSave={async profile => { await saveProfile(profile); setDialog(null); }} onImport={importPack} />}
    {dialog?.kind === 'duplicate' && <DuplicateDialog profile={dialog.profile} onClose={() => setDialog(null)} onDone={(next, name) => { setDialog(null); onSettings(next, `„${name}“ wurde angelegt.`); }} />}
    {dialog?.kind === 'export' && <ExportDialog profile={dialog.profile} onClose={() => setDialog(null)} onDone={text => { setDialog(null); onNotice(text); }} />}
    {dialog?.kind === 'versions' && <PackVersionsDialog profile={dialog.profile} onClose={() => setDialog(null)} onDone={(next, version) => { setDialog(null); onSettings(next, `Modpack-Version ${version} ist installiert.`); }} />}
    {dialog?.kind === 'delete' && <DeleteDialog profile={dialog.profile} onClose={() => setDialog(null)} onConfirm={() => void removeProfile(dialog.profile)} />}
  </>;

  if (opened) return <>
    <ProfileDetail key={opened.id} profile={opened} locked={locked} onBack={() => setOpenId(null)} onAction={action => act(action, opened)} onPlay={target => onPlay(opened.id, target)}
      onSaveProfile={(profile, notice) => saveProfile(profile, notice)} onNotice={onNotice} onError={onError} />
    {dialogs}
  </>;

  return <div className="page page-enter">
    <PageHeader kicker="instanzen" title="Profile">
      <button className="btn btn-accent pixel" disabled={locked || settings.profiles.length >= 30} onClick={() => setDialog({ kind: 'wizard', editing: null })}><Plus size={16} weight="bold" />erstellen</button>
    </PageHeader>

    <div className="toolbar">
      <div className="segmented" role="tablist" aria-label="Profile filtern">
        {[['all', 'Alle'], ['savira', 'Savira'], ...groups.map(group => [group, group])].map(([id, label]) => <button role="tab" aria-selected={activeFilter === id} className={activeFilter === id ? 'active' : ''} key={id} onClick={() => setFilter(id)}>{label}</button>)}
      </div>
      <label className="search glass"><MagnifyingGlass size={17} /><input aria-label="Profile suchen" value={query} onChange={event => setQuery(event.target.value)} placeholder="Profile durchsuchen …" /></label>
      <span className="count">{settings.profiles.length} / 30</span>
    </div>

    <div className="profile-list">{visible.map((profile, index) => {
      const selected = profile.id === settings.selectedProfileId;
      // The whole row opens the profile; its buttons do their own thing.
      return <article className={`profile-row glass ${selected ? 'is-selected' : ''}`} key={profile.id} style={{ '--i': index } as CSSProperties} onClick={event => { if (!(event.target as HTMLElement).closest('button, .menu')) setOpenId(profile.id); }}>
        <ProfileIcon profile={profile} size={56} />
        <div className="profile-copy">
          <h2><button className="profile-open" onClick={() => setOpenId(profile.id)}>{profile.name}</button>{selected && <span className="tag"><Check size={10} weight="bold" />aktiv</span>}</h2>
          <p><span><Cube size={13} weight="fill" />{profile.version}</span><i /><span><Package size={13} weight="fill" />{loaderLabel(profile)}</span><i /><span>{playedAgo(profile.lastPlayed)}</span>{profile.group && <><i /><span>{profile.group}</span></>}</p>
        </div>
        <div className="profile-actions">
          <button className="btn pixel" disabled={locked} onClick={() => onUse(profile.id)}><Play size={15} weight="fill" />spielen</button>
          <button className="btn pixel" onClick={() => setOpenId(profile.id)}><Lightning size={15} weight="fill" />mods</button>
          <div className="menu-anchor"><button className="btn btn-icon" aria-label={`Optionen für ${profile.name}`} aria-expanded={menu === profile.id} onClick={() => setMenu(current => current === profile.id ? null : profile.id)}><GearSix size={17} /></button>
            {menu === profile.id && <Menu items={menuFor(profile)} onClose={() => setMenu(null)} />}</div>
        </div>
      </article>;
    })}
    {visible.length === 0 && <div className="empty glass"><Package size={34} weight="thin" /><h2 className="pixel">Nichts gefunden</h2><p>Keine Profile passen zu deiner Suche. Ändere sie oder lege ein neues Profil an.</p><button className="btn" onClick={() => { setQuery(''); setFilter('all'); }}>Filter zurücksetzen</button></div>}
    </div>
    {dialogs}
  </div>;
}
