// The servers in the launcher's Server tab. To add a partner, add an entry here. The icon comes live
// from the server's ping. Banner, first found: a picture named like its id in src/assets/servers
// (png, jpg or webp), `banner` (loaded from the server's site), `logo` on `colors`, or the name on
// `colors`; a picture that fails to load falls through to the next. Links must be https.
export type ServerCategory = 'Minigames' | 'Crystal PvP' | 'PvP' | 'Practice' | 'Bedwars' | 'Skyblock' | 'Citybuild' | 'Survival' | 'RPG';
export type ServerRegion = 'Europa' | 'Nordamerika';
export type ServerLinkKind = 'website' | 'store' | 'discord';
export type ServerEntry = {
  id: string; name: string; address: string; description: string;
  /** Shown until the server tells its version in the ping. */
  version: string;
  region: ServerRegion; categories: ServerCategory[];
  colors: [string, string];
  banner?: string; logo?: string;
  links: { kind: ServerLinkKind; url: string }[];
};

export const serverCategories: ServerCategory[] = ['Minigames', 'Crystal PvP', 'PvP', 'Practice', 'Bedwars', 'Skyblock', 'Citybuild', 'Survival', 'RPG'];
export const serverRegions: ServerRegion[] = ['Europa', 'Nordamerika'];

export const servers: ServerEntry[] = [
  { id: 'hypixel', name: 'Hypixel', address: 'mc.hypixel.net', description: 'Das größte Minigames-Netzwerk: Bedwars, Skyblock, SkyWars und vieles mehr.', version: '1.8–1.21', region: 'Nordamerika', categories: ['Minigames', 'Bedwars', 'Skyblock', 'PvP'], colors: ['#c8791b', '#5a2d0c'], logo: 'https://hypixel.net/styles/hypixel-v2/images/hypixel-512px.png',
    links: [{ kind: 'website', url: 'https://hypixel.net' }, { kind: 'store', url: 'https://store.hypixel.net' }, { kind: 'discord', url: 'https://discord.gg/hypixel' }] },
  { id: 'gommehd', name: 'GommeHD', address: 'gommehd.net', description: 'Das bekannte deutsche Netzwerk mit Bedwars, SkyWars und vielen weiteren Minigames.', version: '1.8–1.21', region: 'Europa', categories: ['Minigames', 'Bedwars', 'PvP'], colors: ['#c4453f', '#4f1416'], banner: 'https://img.gommehd.net/1920x1080,jpeg/8ed187faef154cf9b3f481e8aa1154d7.png',
    links: [{ kind: 'website', url: 'https://www.gommehd.net' }, { kind: 'store', url: 'https://shop.gommehd.net' }, { kind: 'discord', url: 'https://discord.gg/gommehd' }] },
  { id: 'cytooxien', name: 'Cytooxien', address: 'cytooxien.de', description: 'Deutsches Netzwerk mit Citybuild, Skyblock und Minigames.', version: '1.21', region: 'Europa', categories: ['Citybuild', 'Skyblock', 'Minigames'], colors: ['#1c7ccb', '#0c2c52'], banner: 'https://strapi.cytooxien.de/uploads/cytooxien_hub_render_7d766f7d4c.jpg',
    links: [{ kind: 'website', url: 'https://www.cytooxien.net' }, { kind: 'store', url: 'https://shop.cytooxien.net' }, { kind: 'discord', url: 'https://discord.gg/cytooxien' }] },
  { id: 'pvpland', name: 'PvP Land', address: 'pvp.land', description: 'Crystal PvP, Duelle und Ranglisten für alle, die kämpfen wollen.', version: '1.21', region: 'Nordamerika', categories: ['Crystal PvP', 'Practice', 'PvP'], colors: ['#d1387f', '#3f0f3d'], banner: 'https://pvp.land/og-image.jpg',
    links: [{ kind: 'website', url: 'https://pvp.land' }, { kind: 'store', url: 'https://store.pvp.land' }] },
  { id: 'minemen', name: 'Minemen Club', address: 'eu.minemen.club', description: 'Practice-Server für Duelle und Turniere, von 1.7 bis zu den neuen Versionen.', version: '1.7–1.21', region: 'Europa', categories: ['Practice', 'PvP'], colors: ['#7f56d9', '#23164f'],
    links: [{ kind: 'website', url: 'https://minemen.club' }, { kind: 'store', url: 'https://store.minemen.club' }, { kind: 'discord', url: 'https://discord.gg/minemen' }] },
  { id: 'hoplite', name: 'Hoplite', address: 'hoplite.gg', description: 'Battle Royale und Duelle mit eigenem Kit-System.', version: '1.21', region: 'Nordamerika', categories: ['PvP', 'Practice'], colors: ['#d9a521', '#4d3505'],
    links: [{ kind: 'website', url: 'https://www.hoplite.gg' }, { kind: 'store', url: 'https://store.hoplite.gg' }, { kind: 'discord', url: 'https://discord.gg/hoplite' }] },
  { id: 'cubecraft', name: 'CubeCraft', address: 'play.cubecraft.net', description: 'Minigames für alle: EggWars, SkyWars, Bedwars und Skyblock.', version: '1.21', region: 'Europa', categories: ['Minigames', 'Bedwars', 'Skyblock'], colors: ['#2fa7c9', '#0d3c52'],    links: [{ kind: 'website', url: 'https://www.cubecraft.net' }, { kind: 'store', url: 'https://store.cubecraft.net' }, { kind: 'discord', url: 'https://discord.gg/cubecraft' }] },
  { id: 'griefergames', name: 'GrieferGames', address: 'griefergames.net', description: 'Der große deutsche Citybuild-Server mit eigener Wirtschaft.', version: '1.21', region: 'Europa', categories: ['Citybuild', 'Survival'], colors: ['#4a9d3f', '#143a14'],
    links: [{ kind: 'website', url: 'https://griefergames.de' }, { kind: 'store', url: 'https://store.griefergames.net' }] },
  { id: 'wynncraft', name: 'Wynncraft', address: 'wynncraft.com', description: 'Das Minecraft-MMORPG: riesige Welt, Klassen, Quests und Dungeons.', version: '1.21', region: 'Nordamerika', categories: ['RPG'], colors: ['#3da35d', '#123f33'], logo: 'https://cdn.wynncraft.com/nextgen/themes/classic/assets/wynncraft_icon.png',
    links: [{ kind: 'website', url: 'https://wynncraft.com' }, { kind: 'store', url: 'https://store.wynncraft.com' }, { kind: 'discord', url: 'https://discord.gg/wynncraft' }] },
  { id: 'mccisland', name: 'MCC Island', address: 'play.mccisland.net', description: 'Die Minigames der MC Championship, jederzeit spielbar.', version: '1.21', region: 'Nordamerika', categories: ['Minigames'], colors: ['#e0569b', '#5b1f6e'],
    links: [{ kind: 'website', url: 'https://mcchampionship.com/island' }] },
  { id: 'minehut', name: 'Minehut', address: 'minehut.com', description: 'Tausende Community-Server an einem Ort, von Survival bis Minigames.', version: '1.21', region: 'Nordamerika', categories: ['Survival', 'Minigames'], colors: ['#3e7be0', '#132a63'], banner: 'https://www.minehut.com/og-image.png',
    links: [{ kind: 'website', url: 'https://www.minehut.com' }, { kind: 'discord', url: 'https://discord.gg/minehut' }] },
  { id: 'mineplex', name: 'Mineplex', address: 'mineplex.com', description: 'Der Minigames-Klassiker ist zurück.', version: '1.8–1.21', region: 'Nordamerika', categories: ['Minigames'], colors: ['#e8912d', '#6b2f08'], logo: 'https://mineplex.com/data/mineplex_images/mineplex_logo_updated.png',
    links: [{ kind: 'website', url: 'https://mineplex.com' }, { kind: 'discord', url: 'https://discord.gg/mineplex' }] }
];

/** The ad at the top of the Server tab. */
export const serverAd = { name: 'Avoro', tagline: 'Eigenen Server mieten', url: 'https://avoro.eu' };
