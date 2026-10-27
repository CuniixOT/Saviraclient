# Hinweise zu Drittanbieter-Inhalten

Savira selbst steht unter der MIT-Lizenz (`LICENSE`). Die folgenden mitgelieferten Dateien stammen von Dritten und behalten ihre eigene Lizenz.

## Schriften

### Minecraft (`src/assets/fonts/MinecraftTen.woff2`)

- Schrift „Minecraft“ von **Pwnage_Block** (2011), erstellt mit FontStruct
- Lizenz: **Creative Commons Attribution-ShareAlike 3.0** (CC BY-SA 3.0), https://creativecommons.org/licenses/by-sa/3.0/
- Bezogen aus dem NoRisk-Client-Launcher (`public/fonts/minecraft.woff2`), https://github.com/NoRiskClient/noriskclient-launcher
- Unverändert übernommen. Bearbeitete Fassungen dieser Schrift müssen ebenfalls unter CC BY-SA 3.0 stehen.
- Im Savira-Mod liegt sie als `client-mod/src/main/resources/assets/savira/font/minecraft_ten.ttf`: von WOFF2 entpackt (Minecraft liest kein WOFF2) und **bearbeitet**: ergänzt um ä, ö, ü, Ä, Ö, Ü (Grundbuchstabe mit zwei Pixelpunkten) und ß, im Pixelraster der Schrift. Diese bearbeitete Fassung steht ebenfalls unter **CC BY-SA 3.0**; den Quelltext bildet die Schriftdatei selbst. Titel und Beschriftungen im Rechts-Shift-Menü und im Hauptmenü des Spiels.

### Minecraft NRC SmallCaps (`src/assets/fonts/SmallCaps.ttf`)

- Schrift „Minecraft NRC SmallCaps“ aus dem NoRisk-Client-Launcher (`public/fonts/smallcaps.ttf`), https://github.com/NoRiskClient/noriskclient-launcher
- Die Datei selbst enthält keine Lizenzangabe. Sie wird unter der Lizenz des Repositorys weitergegeben, aus dem sie stammt: **GNU General Public License v3.0**, siehe `licenses/GPL-3.0.txt`.
- Unverändert übernommen. Den Quelltext dieser Datei bildet die Schriftdatei selbst.
- Dieselbe Datei liegt unverändert im Savira-Mod (`client-mod/src/main/resources/assets/savira/font/caps.ttf`) und wird im Rechts-Shift-Menü und im Hauptmenü des Spiels für kleine Beschriftungen verwendet.

## Animationen

### NoRisk-Idle-Animationen (`src/assets/emotes/launcheridle.animation.json`, `launcheridle2.animation.json`, `launcheridle3.animation.json`)

- Idle-Animationen der Spielerfigur aus dem NoRisk-Client-Launcher (`public/emotes/`), https://github.com/NoRiskClient/noriskclient-launcher
- Lizenz des Repositorys: **GNU General Public License v3.0**, siehe `licenses/GPL-3.0.txt`.
- Unverändert übernommen. Den Quelltext bilden die JSON-Dateien selbst. Abgespielt werden sie von Saviras eigenem Code in `src/skinEmotes.ts`.

Savira ist nicht mit NoRiskClient, Mojang oder Microsoft verbunden.

### Weitere Schriften

- Geist (`@fontsource-variable/geist`), SIL Open Font License 1.1

### Geist (`client-mod/src/main/resources/assets/savira/font/geist.ttf`)

- Schrift „Geist“ von The Geist Project Authors, https://github.com/vercel/geist-font, bezogen aus https://github.com/google/fonts (`ofl/geist`)
- Lizenz: **SIL Open Font License 1.1**, siehe `licenses/OFL-Geist.txt`
- Unverändert übernommen; Fließtext im Rechts-Shift-Menü, im Hauptmenü und im Emote-Rad des Spiels, wie im Launcher.

### Phosphor Icons (`client-mod/src/main/resources/assets/savira/font/phosphor.ttf`, `phosphor_fill.ttf`)

- Icon-Schriften „Phosphor“ und „Phosphor Fill“ aus `@phosphor-icons/web` 2.1.1, https://github.com/phosphor-icons/web
- Lizenz: **MIT**, Copyright (c) 2020-2021 Phosphor Icons, siehe `licenses/MIT-Phosphor.txt`
- Unverändert übernommen; Icons im Rechts-Shift-Menü, im Hauptmenü und in den Benachrichtigungen.
