# Savira Client

Ein eigenständiger Minecraft-Java-Launcher mit einem eigenen Fabric-PvP-HUD. Erste Version: **0.1.0 / Early Access**, für **Windows x64, Minecraft 1.21.1 und Java 21**.

## Starten

Nach einem vollständigen Build lässt sich der Launcher direkt öffnen:

```powershell
npm start
```

Für die Entwicklung mit automatisch aktualisierter Oberfläche:

```powershell
npm install
npm run build:mod
npm run dev
```

Voraussetzungen: Node.js 22+, ein **JDK 21** zum Bauen des Mods und eine Minecraft-Java-Lizenz im Microsoft-Konto. Das Build-Skript lädt Gradle 8.12.1 automatisch und prüft dessen SHA-256-Hash. Zum Spielen genügt Java 21; die Java-Laufzeit wird in dieser Version nicht automatisch installiert. Download: https://adoptium.net/temurin/releases/?version=21

1. Savira öffnen und **Anmelden & spielen** auswählen.
2. Im Microsoft-Fenster mit dem Konto anmelden, das Minecraft Java besitzt.
3. Spielprofil auswählen: **Savira · Fabric** oder **Vanilla**.
4. Unter **Module & HUD** die gewünschten Anzeigen aktivieren.
5. **Spielen** drücken. Beim ersten Start werden Spiel, Bibliotheken, Assets und Fabric API heruntergeladen.

Im Spiel öffnet **rechte Umschalttaste** das Savira-HUD-Menü. Die Taste ist auch unter Minecraft → Steuerung → Savira Client änderbar. **C halten** zoomt heran (nur wenn das Zoom-Modul aktiv ist; Taste ebenfalls änderbar).

### Neues Ingame-Menü / HUD Studio

- **Module entdecken:** durchsuchbarer Modulbrowser mit Minecraft-Item-Icons, Kategorien (Alle, PvP, Performance, Welt, Gameplay), Raster-/Listenansicht und Aktiv-Schaltern. Zehn Module: FPS, CPS, Keystrokes, Ping, Koordinaten (mit Richtung und Biom), Rüstung, Effekte, Sprint-Status, Zoom und Arbeitsspeicher.
- **HUD anordnen:** aktive Anzeigen mit der Maus verschieben; Eckgriff oder Mausrad ändern die Größe eines einzelnen Moduls (50–200 % zusätzlich zur globalen HUD-Skalierung).
- **Raster:** schaltet Einrasten und Mittellinien ein/aus. Pfeiltasten verschieben die ausgewählte Anzeige pixelgenau, mit Umschalt in Zehnerschritten.
- **Layout resetten:** setzt Positionen und individuelle Größen zurück. ESC führt aus Modulbrowser/Editor zur Savira-Startansicht und von dort ins Spiel.
- Positionen werden relativ zur verfügbaren Bildschirmfläche gespeichert, damit die HUD-Anzeigen bei geänderter Auflösung erreichbar bleiben. Die Spielwelt läuft während der Menübedienung weiter.

Das Mod-Menü folgt dem Launcher-Look: Kategorie-Leiste links, Modulkarten mit Item-Icon und Schalter, 3D-Buttons und die im Launcher gewählte Akzentfarbe (wird beim Start in `savira.json` als `accent` geschrieben).

## Enthalten

- Eigene deutschsprachige Desktop-Oberfläche mit gezeichneter Vektorlandschaft und Savira-Branding.
- Microsoft-/Xbox-/Minecraft-Anmeldung über MSMC. Keine Offline-Account-Funktion im Launcher.
- Der aktive Minecraft-Skin wird ausschließlich von Mojangs `textures.minecraft.net` geladen, als PNG geprüft, lokal zwischengespeichert und als drehbares 3D-Modell auf der Startseite angezeigt. Ohne Account nutzt Savira eine lokale Standardfigur.
- Oberfläche im Stil moderner PvP-Clients: Pixel-Schrift (Pixelify Sans, OFL) für Überschriften und Buttons, Geist (OFL) für Fließtext, Glas-Panels, schmale Icon-Navigation, 3D-Skin mit Nametag und großer Spielen-Button mit Fortschrittsanzeige.
- Darstellung unter Einstellungen: fünf Akzentfarben und drei Hintergründe (Panorama, Partikel, Schlicht). Das Panorama stammt aus den bereits heruntergeladenen Minecraft-Assets einer Instanz; vor dem ersten Spielstart zeigt Savira die eigene Vektorlandschaft.
- Refresh-Token verschlüsselt mit Electron `safeStorage` (Windows DPAPI); keine Tokens im Renderer.
- Eigener Minecraft-Installer auf Basis offizieller Mojang-Manifeste, SHA-1-Prüfung, begrenzte Download-Parallelität und Wiederholungsversuche.
- Fabric Loader 0.16.14; Fabric API wird für Minecraft 1.21.1 von Modrinth bezogen und SHA-512-geprüft.
- Separates Savira- und Vanilla-Spielverzeichnis.
- Echter Fabric-Client-Mod: FPS, linke/rechte CPS, Keystrokes, Ping, Koordinaten mit Richtung und Biom, Rüstungshaltbarkeit, Effektliste mit Dauer, Sprint-Status, Halte-Zoom und RAM-Anzeige.
- HUD-Skalierung, Vollbild, RAM-Auswahl, Java-Auswahl und Spielordner-Öffnen.
- Gespeicherte Einstellungen und Status für Installation, Spielstart und Spielende.

Der Client ist ein HUD-Mod; er verändert keine Kampfmechanik. Eine eigene FPS-Optimierungs-Engine oder zusätzliche Performance-Mods sind nicht enthalten.

## Windows-Installer

```powershell
npm run dist
```

Ergebnis: `release/Savira-Setup-0.1.0.exe`. Der Installer ist komplett eigen und nutzt dieselbe Oberfläche wie der Client (Pixel-Schrift, Glas-Panels, 3D-Skin, Akzent-Buttons). Technisch ist die Setup-Datei ein electron-builder-„portable“-Paket: Sie entpackt Savira kurz in den Temp-Ordner und startet es im Installationsmodus (`electron/setup.cjs`, `src/Setup.tsx`).

- Installiert ohne Administratorrechte nach `%LOCALAPPDATA%\Programs\Savira` (änderbar). Savira legt immer einen eigenen Unterordner `Savira` an und markiert ihn mit `.savira-install`; nur so markierte Ordner werden bei der Deinstallation gelöscht.
- Optional Desktop-Verknüpfung und Startmenü-Eintrag, Registrierung unter „Apps & Features“ (HKCU).
- Erneutes Ausführen erkennt eine vorhandene Installation und aktualisiert sie. Einstellungen und Spielordner unter `%APPDATA%\Savira` bleiben erhalten.
- Deinstallation über „Apps & Features“ oder `Savira.exe --uninstall`, ebenfalls im Client-Design. Eigene Daten werden nur gelöscht, wenn man das ausdrücklich einschaltet.
- `npm run dev:setup` zeigt den Installer im Entwicklungsmodus (dafür `SAVIRA_SETUP_SOURCE=release/win-unpacked` setzen). `npm run dev:web` mit `?mode=setup` zeigt eine Browser-Vorschau mit simuliertem Fortschritt.

Der Build ist nicht code-signiert; Windows SmartScreen kann beim ersten Start warnen.

Weitere Artefakte:

- `release/win-unpacked/Savira.exe`: entpackte Desktop-App.
- `client-mod/build/libs/savira-client-0.1.0.jar`: Fabric-Mod für eine vorhandene Minecraft-1.21.1-/Fabric-Installation; Fabric API erforderlich.
- `client-mod/build/libs/savira-client-0.1.0-sources.jar`: Mod-Quellcode.

## Automatische Updates

Savira bringt einen eigenen Updater mit (`electron/updater.cjs`), weil `electron-updater` nur NSIS-Installer unterstützt. Der Launcher sucht beim Start und alle sechs Stunden nach einer neuen Version (abschaltbar unter Einstellungen → Updates). Gibt es eine, erscheint oben rechts „update x.y.z“. Ein Klick lädt die neue Setup-Datei, prüft sie und startet sie mit `--update`: Das Setup ersetzt die Installation ohne Rückfragen, übernimmt die Verknüpfungen und öffnet danach den neuen Launcher. Während Minecraft läuft, ist das Update gesperrt.

**Sicherheit:** Jedes Update wird mit einem Ed25519-Schlüssel signiert. Der Launcher kennt nur den öffentlichen Schlüssel (`package.json` → `saviraUpdate.publicKey`) und verwirft Updates mit falscher Signatur, falscher Größe oder falscher SHA-512-Prüfsumme. Wer den Update-Server übernimmt, kann deshalb keine fremde Setup-Datei unterschieben. Updates kommen nur über HTTPS.

**Einmalig einrichten:**

1. `npm run release:keygen` erzeugt den privaten Schlüssel unter `%USERPROFILE%\.savira-release\update-private.pem` (außerhalb des Projekts, nie ins Repository) und trägt den öffentlichen in `package.json` ein. Den privaten Schlüssel sicher aufbewahren: Ohne ihn lassen sich für bestehende Installationen keine Updates mehr veröffentlichen.
2. Das Projekt in ein **öffentliches** GitHub-Repository pushen (aus privaten Repositories können Spieler die Dateien nicht ohne Anmeldung laden).
3. Im Repository unter Settings → Secrets and variables → Actions → „New repository secret“ das Secret `SAVIRA_UPDATE_KEY` anlegen und den kompletten Inhalt von `update-private.pem` einfügen.

Der Workflow `.github/workflows/release.yml` trägt die Update-Adresse beim Bauen selbst ein. Für lokale Builds kann sie zusätzlich unter `saviraUpdate.github` stehen (oder `saviraUpdate.feed` für eigenen Webspace).

Quellcode privat halten: Das Projekt in ein privates Repository pushen und ein zweites, öffentliches Repository nur für Releases anlegen (mit mindestens einer Datei, z. B. README). Im privaten Repository die Variable `RELEASE_REPO` (z. B. `deinname/savira-releases`) und das Secret `RELEASE_TOKEN` setzen: ein Fine-grained Token mit „Contents: Read and write“ nur für das Release-Repository.

**Ein Update veröffentlichen (automatisch):**

1. `release-notes.md` anpassen.
2. `npm version patch` (0.1.0 → 0.1.1) oder `npm version minor` (→ 0.2.0) ausführen.
3. `git push` – fertig.

Bei jedem Push auf `main`, der `package.json` ändert, prüft GitHub Actions, ob es die Version schon als Release gibt. Wenn nicht, baut es auf Windows Mod und Launcher, führt die Unit-Tests aus, signiert das Update und veröffentlicht `Savira-Setup-x.y.z.exe` und `latest.json` als Release. Das dauert etwa 10–15 Minuten; den Fortschritt zeigt der Tab „Actions“. Unter Actions → Release → „Run workflow“ lässt sich ein Lauf auch von Hand starten.

Manuell geht es weiterhin: `npm run release` baut lokal, danach beide Dateien aus `release/` in ein GitHub-Release hochladen (kein Entwurf, keine Vorabversion).

`npm run test:update` spielt den kompletten Ablauf lokal durch: Testserver, signiertes Manifest, Download, Installation und Neustart in einer Sandbox.

## Befehle

```powershell
npm run dev          # Electron + Vite, Entwicklung
npm run dev:web      # Nur Browser-Vorschau; Anmeldung/Spielstart benötigen Electron
npm run build        # TypeScript-Prüfung, Icons und Produktions-Frontend
npm run build:mod    # Fabric-Mod bauen
npm start            # Gebautes Frontend in Electron öffnen
npm test             # Installer- und Konfigurations-Tests
npm run test:desktop # Electron-Smoke-Test mit isoliertem Testprofil; vorher npm run build
npm run test:game    # Echten Minecraft-Demostart testen; lädt Spielressourcen nach .tools
npm run test:package # Gebaute App öffnen, echtes Setup in einer Sandbox installieren und wieder deinstallieren
npm run dist         # Mod, Oberfläche und eigenen Windows-Installer bauen
npm run dev:setup    # Installer im Entwicklungsmodus öffnen
npm run test:update  # Kompletten Auto-Update-Ablauf lokal testen
npm run release:keygen # Einmalig: Signaturschlüssel für Updates erzeugen
npm run release      # Version bauen und signierte latest.json schreiben
```

## Daten und Einstellungen

Savira speichert seine Daten unter `%APPDATA%\Savira`:

- `settings.json`: Launcher-Einstellungen.
- `account.bin`: verschlüsselter Microsoft-Refresh-Token. Abmelden löscht diese Datei.
- `instances/savira`: Minecraft mit Fabric und Savira-Mod.
- `instances/vanilla`: Vanilla-Minecraft.
- `instances/savira/config/savira.json`: Mod-Einstellungen.
- `instances/<profil>/logs/latest.log`: Minecraft-Log bei Startproblemen.

Der Launcher überträgt seine HUD-Einstellungen vor jedem Savira-Start in die Mod-Konfiguration. Im Spiel vorgenommene Änderungen werden im Mod gespeichert, aber nicht zurück in den Launcher synchronisiert. Solange Minecraft läuft oder installiert wird, sperrt der Launcher Einstellungsänderungen und einen zweiten Start.

Die Ingame-Layoutdaten (`layout`, `snap`) werden dabei erhalten. Nur die zehn Modulschalter und die globale Skalierung werden durch die Launcher-Einstellungen gesetzt.

Der erste Start benötigt Internet und kann mehrere Minuten dauern. Bereits heruntergeladene Dateien werden anhand ihrer Prüfsummen wiederverwendet. Diese Version benötigt auch bei späteren Starts Internet zur Anmeldung und Metadatenprüfung.

## Projektstruktur

- `src/`: React-/TypeScript-Oberfläche, Tailwind und eigenes Styling.
- `electron/main.cjs`: Anmeldung, Betriebssystemfunktionen und IPC.
- `electron/preload.cjs`: schmale isolierte Desktop-Bridge.
- `electron/minecraft.cjs`: Mojang-Installer und Java-Prozessstart.
- `electron/settings.cjs`: serverseitige Einstellungsvalidierung.
- `client-mod/`: Fabric-/Java-Projekt, HUD, Konfiguration und Mouse-Mixin.
- `electron/setup.cjs`: eigener Installer und Deinstaller.
- `electron/updater.cjs`: signierte Auto-Updates.
- `.github/workflows/release.yml`: baut und veröffentlicht Releases automatisch.
- `scripts/`: Mod-Build, Icon-Generator, Desktop- und Paket-Tests.
- `tests/`: Tests für Metadatenverarbeitung und Einstellungsvalidierung.

## Entwicklungsstand

Eine erste eigenständige Implementierung, kein vollständiger NoRisk-Nachbau. Nicht enthalten: Cosmetics-/Cape-Dienst, Freundeslisten, Voicechat, eigener Serverdienst, mehrere Minecraft-Versionen und automatische Java-Installation.

Microsoft-Login und eine vollständige Spielsession müssen mit einem berechtigten Microsoft-Konto auf dem Zielrechner überprüft werden. Die lokalen automatisierten Tests führen keine echte Microsoft-Anmeldung aus.

Lokal geprüft: TypeScript-/Frontend-Build, Fabric-JAR-Build, acht Unit-Tests, Electron-Navigation und Persistenz sowie echter Minecraft-/Fabric-/Savira-Start im offiziellen Demo-Modus. Bei diesem kontolosen Demotest sind Meldungen zu nicht authentifizierten Realms-/Profildiensten erwartbar. Der normale Launcher fordert ein berechtigtes Microsoft-Konto an.

Der Menü-Runtimetest läuft mit einer zusätzlichen, nicht ausgelieferten Fabric-Testmod:

```powershell
node scripts/build-mod.mjs --menu
node scripts/test-game.mjs --menu
```

Er öffnet die tatsächlichen Minecraft-Menüs und prüft Schalter, Suche, Listenansicht, Drag-and-drop, Skalierung, Speicherung und ESC-Navigation. Screenshots liegen unter `.tools/demo-runtime/screenshots/savira-menu-*.png`.

## Referenzen und Lizenzen

Das Funktionskonzept wurde anhand von https://github.com/NoRiskClient/noriskclient-launcher und https://github.com/NoRiskClient betrachtet. Savira enthält keine kopierten NoRisk-Quellcodedateien oder NoRisk-Assets. Die GPL-Lizenz des NoRisk-Launchers ist zu beachten, falls später Code daraus übernommen wird.

Der eigenständig erstellte Savira-Code und die lokalen Vektorgrafiken stehen unter MIT (`LICENSE`). Abhängigkeiten behalten ihre jeweiligen Lizenzen, darunter Electron (MIT), React (MIT), MSMC (MIT), Fabric Loader (Apache-2.0), Fabric API (Apache-2.0) und Phosphor Icons (MIT). Minecraft-Dateien bleiben Eigentum von Mojang/Microsoft und werden nicht mit dem Installer verteilt. Savira ist nicht mit NoRiskClient, Mojang oder Microsoft verbunden.
