// Log and crash-report files for the Debug tab. Only files below the known log folders are
// listed, opened or read; every path from the renderer is checked against those roots.
const fs = require('node:fs/promises');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');

const MAX_READ = 4 * 1048576;

async function roots(userData, kind) {
  if (kind === 'launcher') return [path.join(userData, 'logs')];
  const sub = kind === 'crash' ? 'crash-reports' : 'logs';
  const instances = path.join(userData, 'instances');
  try { return (await fs.readdir(instances, { withFileTypes: true })).filter(e => e.isDirectory()).map(e => path.join(instances, e.name, sub)); }
  catch { return []; }
}

async function list(userData, kind) {
  if (!['launcher', 'minecraft', 'crash'].includes(kind)) throw new Error('Unbekannte Log-Art.');
  const files = [];
  for (const dir of await roots(userData, kind)) {
    let entries = [];
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isFile() || !/\.(log|txt)(\.\d+)?(\.gz)?$|^launcher\.log(\.\d+)?$/.test(entry.name)) continue;
      const file = path.join(dir, entry.name), info = await fs.stat(file);
      // Instance folder name tells which profile a Minecraft log belongs to.
      files.push({ name: entry.name, path: file, size: info.size, modified: info.mtimeMs, instance: kind === 'launcher' ? null : path.basename(path.dirname(dir)) });
    }
  }
  return files.sort((a, b) => b.modified - a.modified).slice(0, 200);
}

async function assertAllowed(userData, file) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) throw new Error('Ungültiger Dateipfad.');
  const target = path.resolve(file);
  for (const kind of ['launcher', 'minecraft', 'crash']) {
    for (const root of await roots(userData, kind)) {
      const relative = path.relative(root, target);
      if (relative && !relative.startsWith('..') && !path.isAbsolute(relative) && !relative.includes(path.sep)) return target;
    }
  }
  throw new Error('Diese Datei liegt nicht in einem Savira-Logordner.');
}

async function read(userData, file) {
  const target = await assertAllowed(userData, file);
  const info = await fs.stat(target);
  if (info.size > MAX_READ * (target.endsWith('.gz') ? .25 : 1)) throw new Error('Die Datei ist zu groß zum Kopieren. Öffne sie stattdessen.');
  const bytes = await fs.readFile(target);
  return (target.endsWith('.gz') ? gunzipSync(bytes, { maxOutputLength: MAX_READ }) : bytes).toString('utf8');
}

module.exports = { list, read, assertAllowed };
