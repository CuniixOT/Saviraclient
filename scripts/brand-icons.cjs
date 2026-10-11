// Builds every logo and icon file from the two sources in branding/.
// Runs inside Electron for its image scaler: `npm run icons`.
//   branding/icon-source.png  logo on dark background → app, installer, desktop and Discord icon
//   branding/logo-source.png  transparent logo        → white mask, tinted with the accent colour
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

app.whenReady().then(() => {
  try {
    const icon = load('icon-source.png');
    const logo = trimSquare(load('logo-source.png'));
    const transparentCorner = load('logo-source.png').toBitmap()[3] === 0;
    if (!transparentCorner) throw new Error('branding/logo-source.png braucht einen transparenten Hintergrund.');
    const mask = whiteMask(logo);

    fs.writeFileSync(out('build', 'icon.ico'), ico(icon, [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]));
    fs.writeFileSync(out('public', 'icon.png'), scaled(icon, 512).toPNG());
    fs.writeFileSync(out('src', 'assets', 'logo-mask.png'), scaled(mask, 256).toPNG());
    fs.writeFileSync(out('client-mod', 'src', 'main', 'resources', 'assets', 'savira', 'icon.png'), scaled(icon, 128).toPNG());
    fs.writeFileSync(out('client-mod', 'src', 'main', 'resources', 'assets', 'savira', 'textures', 'gui', 'logo.png'), scaled(mask, 128).toPNG());
    console.log('Savira-Icons erstellt: build/icon.ico, public/icon.png, src/assets/logo-mask.png und die Mod-Texturen.');
    app.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    app.exit(1);
  }
});
