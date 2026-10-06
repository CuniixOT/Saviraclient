// Launcher log file (userData/logs/launcher.log) with simple size-based rotation.
// Tokens never belong in a log: everything passes through redact() first.
const fs = require('node:fs');
const path = require('node:path');

const MAX_BYTES = 2 * 1048576, KEEP = 10;
let dir = null, stream = null, written = 0;

const redact = text => String(text)
  .replace(/(?:eyJ|M\.R3)[\w.\-]{12,}/g, '[redacted]')
  .replace(/("?(?:access_?token|refresh_?token|accessToken|mcToken|xuid)"?\s*[:=]\s*"?)[^"\s,}]+/gi, '$1[redacted]');

function rotate() {
  stream?.end(); stream = null;
  for (let i = KEEP - 1; i >= 1; i--) {
    const from = path.join(dir, i === 1 ? 'launcher.log' : `launcher.log.${i - 1}`), to = path.join(dir, `launcher.log.${i}`);
    try { fs.renameSync(from, to); } catch { /* Gap in the series. */ }
  }
}
function open() {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'launcher.log');
  try { written = fs.statSync(file).size; } catch { written = 0; }
  if (written > MAX_BYTES) { rotate(); written = 0; }
  stream = fs.createWriteStream(file, { flags: 'a' });
}

function init(logDir) { dir = logDir; open(); write('INFO', 'Launcher gestartet'); }

function write(level, message, detail) {
  if (!dir) return;
  const line = `[${new Date().toISOString()}] [${level}] ${redact(message)}${detail ? ` | ${redact(detail instanceof Error ? detail.message : detail)}` : ''}\n`;
  if (!stream) open();
  stream.write(line);
  written += Buffer.byteLength(line);
  if (written > MAX_BYTES) { rotate(); open(); }
}

module.exports = {
  init, redact, logDir: () => dir,
  info: (m, d) => write('INFO', m, d), warn: (m, d) => write('WARN', m, d), error: (m, d) => write('ERROR', m, d)
};
