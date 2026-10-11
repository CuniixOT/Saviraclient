import { deflateSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// App icons come from branding/ via scripts/brand-icons.cjs (npm run icons); this only draws the default skin.
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
console.log('Savira-Standard-Skin erstellt.');
