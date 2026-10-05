import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const size = 256;
// Same pixel "S" as the launcher logo (src/ui.tsx), on a 16-unit grid.
const polygon = [[2, 1], [14, 1], [14, 4], [5, 4], [5, 6], [14, 6], [14, 15], [2, 15], [2, 12], [11, 12], [11, 9], [2, 9]];
function inside(x, y) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
const accent = [92, 207, 149], accentDark = [57, 128, 92], tile = [18, 22, 27], tileTop = [30, 36, 43];
const unit = 10, originX = 128 - 8 * unit, originY = 128 - 8 * unit - 3;
const glyph = (x, y) => inside((x - originX) / unit, (y - originY) / unit);
const data = Buffer.alloc((size * 4 + 1) * size);
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    // Rounded tile with a lighter top edge, like the launcher's raised buttons.
    const r = 44, dx = Math.max(0, r + 8 - x, x - (size - 9 - r)), dy = Math.max(0, r + 8 - y, y - (size - 9 - r));
    const inTile = dx * dx + dy * dy <= r * r;
    let color = y < 22 ? tileTop : tile;
    if (glyph(x + .5, y + .5)) color = accent;
    else if (glyph(x + .5, y + .5 - 7)) color = accentDark;
    for (let c = 0; c < 3; c++) data[offset + c] = color[c];
    data[offset + 3] = inTile ? 255 : 0;
  }
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(name, bytes) {
  const type = Buffer.from(name), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length); crc.writeUInt32BE(crc32(Buffer.concat([type, bytes])));
  return Buffer.concat([length, type, bytes, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(data)), chunk('IEND', Buffer.alloc(0))]);
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4); header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12); header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
await mkdir(path.join(root, 'build'), { recursive: true });
await writeFile(path.join(root, 'public/icon.png'), png);
await writeFile(path.join(root, 'build/icon.ico'), Buffer.concat([header, png]));


const skinSize = 64;
const skin = Buffer.alloc((skinSize * 4 + 1) * skinSize);
function skinRect(x, y, w, h, color) {
  for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) {
    const offset = py * (skinSize * 4 + 1) + 1 + px * 4;
    skin[offset] = color[0]; skin[offset + 1] = color[1]; skin[offset + 2] = color[2]; skin[offset + 3] = 255;
  }
}
const face = [201, 156, 119], faceShade = [171, 123, 91], hair = [45, 54, 48], shirt = [80, 133, 103], shirtShade = [52, 94, 71], trousers = [35, 46, 40], boot = [23, 29, 26];
// Base layer UVs for a valid classic 64x64 Minecraft skin.
for (const rect of [[8,0,8,8],[16,0,8,8],[0,8,32,8]]) skinRect(...rect, face);
skinRect(0,8,8,8,faceShade); skinRect(16,8,16,8,hair); skinRect(8,8,8,3,hair); skinRect(9,12,2,2,[225,238,229]); skinRect(13,12,2,2,[225,238,229]); skinRect(10,13,1,1,[47,76,62]); skinRect(14,13,1,1,[47,76,62]);
for (const rect of [[20,16,8,4],[28,16,8,4],[16,20,24,12]]) skinRect(...rect, shirt);
skinRect(16,20,4,12,shirtShade); skinRect(28,20,12,12,shirtShade); skinRect(20,25,8,3,[164,219,187]);
for (const x of [40,44,48,52,56,60]) skinRect(x,20,4,12,x === 44 || x === 52 ? shirt : shirtShade);
skinRect(44,28,4,4,face); skinRect(52,28,4,4,face);
for (const x of [0,4,8,12]) skinRect(x,20,4,12,x === 4 || x === 12 ? trousers : boot);
for (const x of [16,20,24,28]) skinRect(x,52,4,12,x === 20 || x === 28 ? trousers : boot);
for (const rect of [[4,16,4,4],[12,16,4,4],[44,16,4,4],[52,16,4,4],[20,48,4,4],[28,48,4,4],[36,48,4,4],[44,48,4,4]]) skinRect(...rect, trousers);
for (const x of [32,36,40,44,48,52]) skinRect(x,52,4,12,x === 36 || x === 44 ? shirt : shirtShade);
skinRect(36,60,4,4,face); skinRect(44,60,4,4,face);
const skinHeader = Buffer.alloc(13); skinHeader.writeUInt32BE(skinSize, 0); skinHeader.writeUInt32BE(skinSize, 4); skinHeader[8] = 8; skinHeader[9] = 6;
const skinPng = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', skinHeader), chunk('IDAT', deflateSync(skin)), chunk('IEND', Buffer.alloc(0))]);
await writeFile(path.join(root, 'public/default-skin.png'), skinPng);
console.log('Savira-App-Icon und Standard-Skin erstellt.');
