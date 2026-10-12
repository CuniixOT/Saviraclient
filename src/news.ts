import type { NewsArtKind } from './NewsArt';

// News for the launcher's start page; the in-game main menu shows the same entries
// with pictures rendered from the same art (npm run news-art).
export type NewsItem = { kicker: string; date: string; title: string; body: string; art: NewsArtKind };
export const news: NewsItem[] = [
  { kicker: 'Garderobe', date: '12. Okt', title: 'Skins und Capes im Launcher.', body: 'Skins verwalten, Vanilla-Capes wechseln und eigene Capes im Spiel tragen.', art: 'wardrobe' },
  { kicker: 'Savira', date: '12. Okt', title: 'Neues Logo, neues Gesicht.', body: 'Im Launcher, im Spiel, auf dem Desktop und in Discord.', art: 'brand' },
  { kicker: 'Launcher', date: '11. Okt', title: 'Mehrere Konten und Discord.', body: 'Konten per Klick wechseln, dazu Discord-Präsenz und eigener Eckenradius.', art: 'accounts' },
  { kicker: 'Mod-Menü', date: '07. Okt', title: 'Jedes HUD-Element nach deinem Stil.', body: 'Hintergrund, Farben und Text für jede Anzeige direkt im Spiel einstellen.', art: 'modmenu' }
];
