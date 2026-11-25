# Savira-News

Die Beiträge in `news.json` erscheinen im Launcher unter **News** bei der Quelle **Savira**, ohne Launcher-Update: einfach einen Eintrag oben in `posts` ergänzen und auf `main` pushen (der Launcher fragt höchstens alle 15 Minuten neu).

```json
{ "id": "eindeutig", "date": "2026-11-24", "title": "Titel", "text": "Kurztext für die Karte", "image": "https://… oder bild.jpg (liegt dann in news/)", "link": "https://… (optional)", "body": ["Absatz 1", "Absatz 2"] }
```
