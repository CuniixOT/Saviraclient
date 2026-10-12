// Renders the news pictures for the in-game main menu from the launcher's own art (src/NewsArt.tsx).
// Needs a fresh `npm run build`; run with `npm run menu-art`.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const gui = path.join(root, 'client-mod', 'src', 'main', 'resources', 'assets', 'savira', 'textures', 'gui');
const smooth = file => fs.writeFileSync(file + '.mcmeta', JSON.stringify({ texture: { blur: true } }, null, 2) + '\n');

async function settle(win) {
  return win.webContents.executeJavaScript(`(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(img => img.decode().catch(() => {})));
    await new Promise(resolve => setTimeout(resolve, 600));
  })()`);
}

app.whenReady().then(async () => {
  try {
    const dist = path.join(root, 'dist', 'index.html');
    const news = new BrowserWindow({ width: 600, height: 184 * 6, show: false, useContentSize: true, webPreferences: { offscreen: true } });
    await news.loadFile(dist, { query: { mode: 'newsart' } });
    await settle(news);
    const items = await news.webContents.executeJavaScript(`[...document.querySelectorAll('[data-art]')].map(el => { const r = el.getBoundingClientRect(); return { art: el.dataset.art, x: r.x, y: r.y, width: r.width, height: r.height }; })`);
    if (!items.length) throw new Error('Keine News-Bilder gefunden. Erst `npm run build` ausführen.');
    fs.mkdirSync(path.join(gui, 'news'), { recursive: true });
    for (const item of items) {
      const image = await news.webContents.capturePage({ x: Math.round(item.x), y: Math.round(item.y), width: Math.round(item.width), height: Math.round(item.height) });
      const file = path.join(gui, 'news', `${item.art}.png`);
      fs.writeFileSync(file, image.resize({ width: 600, height: 184, quality: 'best' }).toPNG());
      smooth(file);
    }

    news.destroy();
    console.log(`News-Bilder erstellt: ${items.map(item => item.art).join(', ')}`);
    app.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    app.exit(1);
  }
});
