// Writes the news pictures for the in-game main menu from the launcher's (src/assets/news/<art>.*):
// cropped to 16:9 and scaled to 640x360 PNG, which Minecraft can load. Run with `npm run menu-art`.
const { app, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pictures = path.join(root, 'src', 'assets', 'news');
const target = path.join(root, 'client-mod', 'src', 'main', 'resources', 'assets', 'savira', 'textures', 'gui', 'news');
const W = 640, H = 360;

app.whenReady().then(() => {
  try {
    const files = fs.readdirSync(pictures).filter(name => /\.(png|jpe?g)$/i.test(name));
    if (!files.length) throw new Error(`Keine News-Bilder in ${pictures}.`);
    fs.mkdirSync(target, { recursive: true });
    for (const name of files) {
      const image = nativeImage.createFromPath(path.join(pictures, name));
      const { width, height } = image.getSize();
      // Cover: the largest 16:9 area in the middle of the picture.
      const cw = Math.min(width, Math.round(height * W / H)), ch = Math.min(height, Math.round(width * H / W));
      const cropped = image.crop({ x: Math.round((width - cw) / 2), y: Math.round((height - ch) / 2), width: cw, height: ch });
      const file = path.join(target, `${path.parse(name).name}.png`);
      fs.writeFileSync(file, cropped.resize({ width: W, height: H, quality: 'best' }).toPNG());
      // Smooth filtering: these are pictures, not pixel art.
      fs.writeFileSync(file + '.mcmeta', JSON.stringify({ texture: { blur: true } }, null, 2) + '\n');
    }
    console.log(`News-Bilder erstellt: ${files.join(', ')}`);
    app.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    app.exit(1);
  }
});
