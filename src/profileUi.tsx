import { Cube, Package } from '@phosphor-icons/react';
import type { GameProfile, Loader } from './api';

export const loaderNames: Record<Loader, string> = { vanilla: 'Vanilla', fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge', quilt: 'Quilt' };

/** "Fabric 0.19.5 · Savira", "Vanilla" … */
export function loaderLabel(profile: GameProfile) {
  const base = profile.loader === 'vanilla' ? 'Vanilla' : `${loaderNames[profile.loader]} ${profile.loaderVersion}`;
  return profile.savira ? `${base} · Savira` : base;
}

/** The profile's picture; without one an icon in the colour of its loader. */
export function ProfileIcon({ profile, size = 44 }: { profile: Pick<GameProfile, 'icon' | 'loader' | 'savira'>; size?: number }) {
  if (profile.icon) return <img className="profile-icon" src={profile.icon} alt="" width={size} height={size} draggable={false} />;
  const kind = profile.savira ? 'savira' : profile.loader;
  return <span className={`profile-icon is-empty ${kind}`} style={{ width: size, height: size }}>
    {profile.loader === 'vanilla' ? <Cube size={size * .46} weight="fill" /> : <Package size={size * .46} weight="fill" />}
  </span>;
}

export function playedAgo(time: number | null) {
  if (!time) return 'Nie gespielt';
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return `vor ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `vor ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 31) return days === 1 ? 'gestern' : `vor ${days} Tagen`;
  const months = Math.round(days / 30);
  return months < 12 ? `vor ${months} Mon.` : `vor ${Math.round(months / 12)} J.`;
}
