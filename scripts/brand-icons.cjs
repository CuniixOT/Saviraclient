// Builds every logo and icon file from branding/logo-source.png (transparent).
// Runs inside Electron for its image scaler: `npm run icons`.
//   → app/installer/desktop icon, window and Discord icon, launcher logo (colour + white mask), mod textures.
const { app, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const out = (...parts) => { const file = path.join(root, ...parts); fs.mkdirSync(path.dirname(file), { recursive: true }); return file; };

function load(name) {
  const image = nativeImage.createFromPath(path.join(root, 'branding', name));
  if (image.isEmpty()) throw new Error(`branding/${name} fehlt oder ist kein Bild.`);
  return image;
}
const scaled = (image, size) => image.resize({ width: size, height: size, quality: 'best' });

/** Same alpha, every pixel white: the launcher and the mod colour it themselves. */
function whiteMask(image) {
  const { width, height } = image.getSize();
  const bitmap = Buffer.from(image.toBitmap());
  for (let i = 0; i < bitmap.length; i += 4) {
    // Bitmaps are premultiplied: white at alpha a is (a, a, a).
    const alpha = bitmap[i + 3];
    bitmap[i] = bitmap[i + 1] = bitmap[i + 2] = alpha;
  }
  return nativeImage.createFromBitmap(bitmap, { width, height });
}

/** Crops transparent borders so the mark sits exactly in its box, then pads it square. */
/** Crops transparent borders tightly (keeps the logo's own aspect ratio). */
function trimTight(image) {
  const { width, height } = image.getSize();
  const bitmap = image.toBitmap();
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (bitmap[(y * width + x) * 4 + 3] > 8) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  }
  if (maxX < 0) throw new Error('Das Logo ist komplett transparent.');
  return image.crop({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 });
}

function trimSquare(image) {
  const { width, height } = image.getSize();
  const bitmap = image.toBitmap();
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (bitmap[(y * width + x) * 4 + 3] > 8) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  }
  if (maxX < 0) throw new Error('Das Logo ist komplett transparent.');
  const side = Math.max(maxX - minX, maxY - minY) + 1;
  const square = Buffer.alloc(side * side * 4);
  const ox = Math.floor((side - (maxX - minX + 1)) / 2), oy = Math.floor((side - (maxY - minY + 1)) / 2);
  for (let y = minY; y <= maxY; y++) {
    bitmap.copy(square, ((y - minY + oy) * side + ox) * 4, (y * width + minX) * 4, (y * width + maxX + 1) * 4);
  }
  return nativeImage.createFromBitmap(square, { width: side, height: side });
}

/** Windows .ico with PNG entries (supported since Vista) in all sizes Explorer asks for. */
function ico(image, sizes) {
  const pngs = sizes.map(size => scaled(image, size).toPNG());
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, i) => {
    const entry = 6 + i * 16;
    header[entry] = size >= 256 ? 0 : size; header[entry + 1] = size >= 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(pngs[i].length, entry + 8); header.writeUInt32LE(offset, entry + 12);
    offset += pngs[i].length;
  });
  return Buffer.concat([header, ...pngs]);
}

/** The trimmed logo centred on a transparent square with a margin, for app and window icons. */
function padded(image, margin) {
  const { width } = image.getSize();
  const side = Math.round(width / (1 - margin * 2));
  const square = Buffer.alloc(side * side * 4);
  const offset = Math.round((side - width) / 2), source = image.toBitmap();
  for (let y = 0; y < width; y++) source.copy(square, ((y + offset) * side + offset) * 4, y * width * 4, (y + 1) * width * 4);
  return nativeImage.createFromBitmap(square, { width: side, height: side });
}

app.whenReady().then(() => {
  try {
    const source = load('logo-source.png');
    if (source.toBitmap()[3] !== 0) throw new Error('branding/logo-source.png braucht einen transparenten Hintergrund.');
    const logo = trimSquare(source);
    // The transparent logo is the app icon too: desktop, taskbar, installer and Discord.
    const icon = padded(logo, .06);
    const mask = whiteMask(logo);
    const gui = ['client-mod', 'src', 'main', 'resources', 'assets', 'savira'];

    fs.writeFileSync(out('build', 'icon.ico'), ico(icon, [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]));
    fs.writeFileSync(out('public', 'icon.png'), scaled(icon, 512).toPNG());
    // The launcher shows the logo next to text, sized by height: tightly cropped, own aspect ratio.
    const tight = trimTight(source), size = tight.getSize();
    fs.writeFileSync(out('src', 'assets', 'logo.png'), tight.resize({ height: 256, width: Math.round(256 * size.width / size.height), quality: 'best' }).toPNG());
    fs.writeFileSync(out('src', 'assets', 'logo-mask.png'), scaled(mask, 256).toPNG());
    fs.writeFileSync(out(...gui, 'icon.png'), scaled(icon, 128).toPNG());
    // In the game: the logo in its own colours, plus a white mask for tinted use (e.g. on accent buttons).
    fs.writeFileSync(out(...gui, 'textures', 'gui', 'logo_color.png'), scaled(logo, 128).toPNG());
    fs.writeFileSync(out(...gui, 'textures', 'gui', 'logo.png'), scaled(mask, 128).toPNG());
    // Name icons for the Icon module: a bitmap font ( default,  beta,  creator), 16px
    // cells, each logo left-aligned so the glyph has no leading gap in front of the name.
    const glyph = tight.resize({ height: 16, width: Math.max(1, Math.round(16 * size.width / size.height)), quality: 'best' });
    const gw = glyph.getSize().width, gbits = glyph.toBitmap(), sheet = Buffer.alloc(48 * 16 * 4);
    const tints = [null, [242, 195, 91], [227, 107, 181]];
    tints.forEach((tint, cell) => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < gw; x++) {
        const src = (y * gw + x) * 4, dst = (y * 48 + cell * 16 + x) * 4, a = gbits[src + 3];
        if (!tint) { gbits.copy(sheet, dst, src, src + 4); continue; }
        // Tinted copies keep the logo's light/dark shading; bitmaps are premultiplied BGRA.
        const light = a ? Math.max(gbits[src], gbits[src + 1], gbits[src + 2]) / a : 0, k = .55 + .45 * light;
        sheet[dst] = Math.round(tint[2] * k * a / 255); sheet[dst + 1] = Math.round(tint[1] * k * a / 255); sheet[dst + 2] = Math.round(tint[0] * k * a / 255); sheet[dst + 3] = a;
      }
    });
    fs.writeFileSync(out(...gui, 'textures', 'font', 'icons.png'), nativeImage.createFromBitmap(sheet, { width: 48, height: 16 }).toPNG());
    fs.writeFileSync(out(...gui, 'font', 'icons.json'), JSON.stringify({ providers: [{ type: 'bitmap', file: 'savira:font/icons.png', ascent: 7, height: 8, chars: [''] }] }, null, 2) + '\n');
    console.log('Savira-Icons erstellt: App-Icon, Fenster-Icon, Launcher-Logo, Maske, Mod-Texturen und Namens-Icons.');
    app.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    app.exit(1);
  }
});
