// Savira's own auto-updater. electron-updater only supports NSIS, so the launcher reads a small
// signed manifest (latest.json), downloads the new setup exe and starts it with --update.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash, createPublicKey, verify } = require('node:crypto');
const { spawn } = require('node:child_process');

const MAX_SIZE = 600 * 1048576;
const PORTABLE_ENV = ['PORTABLE_EXECUTABLE_DIR', 'PORTABLE_EXECUTABLE_FILE', 'PORTABLE_EXECUTABLE_APP_FILENAME'];

function parseVersion(value) {
  const match = typeof value === 'string' && /^(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/.exec(value);
  return match ? match.slice(1).map(Number) : null;
}
function isNewer(candidate, current) {
  const a = parseVersion(candidate), b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

// Exactly the fields the signature covers; notes are display-only and unsigned.
const signedPayload = m => `savira-update-v1\n${m.version}\n${m.file}\n${m.sha512}\n${m.size}`;

function validateManifest(manifest, publicKeyPem) {
  if (!manifest || typeof manifest !== 'object') throw new Error('Update-Informationen sind ungültig.');
  const { version, file, sha512, size, signature } = manifest;
  if (!parseVersion(version)) throw new Error('Update-Version ist ungültig.');
  if (typeof file !== 'string' || !/^[\w.-]{1,120}\.exe$/.test(file)) throw new Error('Update-Dateiname ist ungültig.');
  if (typeof sha512 !== 'string' || !/^[a-f0-9]{128}$/.test(sha512)) throw new Error('Update-Prüfsumme fehlt.');
  if (!Number.isSafeInteger(size) || size < 1024 || size > MAX_SIZE) throw new Error('Update-Größe ist ungültig.');
  if (typeof signature !== 'string' || !signature) throw new Error('Update ist nicht signiert.');
  if (!publicKeyPem) throw new Error('Kein Update-Schlüssel hinterlegt.');
  const key = createPublicKey(publicKeyPem);
  if (!verify(null, Buffer.from(signedPayload(manifest)), key, Buffer.from(signature, 'base64'))) throw new Error('Signatur des Updates ist ungültig. Das Update wurde verworfen.');
  const notes = Array.isArray(manifest.notes) ? manifest.notes.filter(n => typeof n === 'string').slice(0, 12).map(n => n.slice(0, 200)) : [];
  const date = typeof manifest.date === 'string' && !Number.isNaN(Date.parse(manifest.date)) ? manifest.date : null;
  return { version, file, sha512, size, signature, notes, date };
}

// https only; plain http is accepted for loopback test servers when the feed was overridden.
function checkUrl(value, allowLoopback) {
  const url = new URL(value);
  if (url.protocol === 'https:') return url;
  if (allowLoopback && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)) return url;
  throw new Error('Update-Server muss HTTPS verwenden.');
}

function createUpdater({ app, currentVersion, feed, publicKey, allowLoopback = false, isInstalled, isBusy, onStatus }) {
  let status = { state: 'idle', version: null, notes: [], date: null, size: 0, progress: 0, error: '', checkedAt: null };
  let manifest = null, downloaded = null, controller = null;
  const publish = next => { status = { ...status, ...next }; onStatus(status); };
  const userAgent = `Savira/${currentVersion} (Updater)`;

  function unavailableReason() {
    if (!feed) return 'Kein Update-Server eingerichtet.';
    if (!publicKey) return 'Kein Update-Schlüssel hinterlegt.';
    if (!isInstalled()) return 'Updates gibt es nur in der installierten Version.';
    return '';
  }

  async function check({ quiet = false } = {}) {
    if (['checking', 'downloading'].includes(status.state)) return status;
    const reason = unavailableReason();
    if (reason) { publish({ state: 'disabled', error: reason }); return status; }
    if (!quiet || status.state !== 'available') publish({ state: 'checking', error: '' });
    try {
      const feedUrl = checkUrl(feed, allowLoopback);
      const response = await fetch(feedUrl, { signal: AbortSignal.timeout(20000), cache: 'no-store', headers: { 'User-Agent': userAgent, Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Update-Server antwortet nicht (${response.status}).`);
      const text = await response.text();
      if (text.length > 64 * 1024) throw new Error('Update-Informationen sind zu groß.');
      const next = validateManifest(JSON.parse(text), publicKey);
      if (!isNewer(next.version, currentVersion)) { manifest = null; publish({ state: 'none', version: null, notes: [], checkedAt: new Date().toISOString() }); return status; }
      manifest = { ...next, url: checkUrl(new URL(next.file, response.url || feedUrl).href, allowLoopback).href };
      if (downloaded && downloaded.version !== manifest.version) downloaded = null;
      publish({ state: downloaded ? 'ready' : 'available', version: manifest.version, notes: manifest.notes, date: manifest.date, size: manifest.size, progress: downloaded ? 100 : 0, checkedAt: new Date().toISOString() });
    } catch (error) {
      publish({ state: quiet ? 'idle' : 'error', error: error instanceof SyntaxError ? 'Update-Informationen sind beschädigt.' : error.message });
    }
    return status;
  }

  async function download() {
    if (!manifest) throw new Error('Kein Update verfügbar.');
    if (downloaded?.version === manifest.version) return status;
    if (status.state === 'downloading') return status;
    const dir = path.join(os.tmpdir(), 'savira-update');
    const target = path.join(dir, manifest.file), partial = `${target}.part`;
    controller = new AbortController();
    publish({ state: 'downloading', progress: 0, error: '' });
    let handle;
    try {
      await fs.mkdir(dir, { recursive: true });
      const response = await fetch(manifest.url, { signal: controller.signal, headers: { 'User-Agent': userAgent } });
      if (!response.ok || !response.body) throw new Error(`Download fehlgeschlagen (${response.status}).`);
      checkUrl(response.url || manifest.url, allowLoopback);
      handle = await fs.open(partial, 'w');
      const hash = createHash('sha512'), reader = response.body.getReader();
      let received = 0, lastSent = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        if (received > manifest.size) throw new Error('Download ist größer als angekündigt.');
        hash.update(value);
        await handle.write(value);
        if (Date.now() - lastSent > 120) { lastSent = Date.now(); publish({ progress: Math.round(received / manifest.size * 100) }); }
      }
      await handle.close(); handle = null;
      if (received !== manifest.size) throw new Error('Download unvollständig. Bitte erneut versuchen.');
      if (hash.digest('hex') !== manifest.sha512) throw new Error('Prüfsumme stimmt nicht. Das Update wurde verworfen.');
      await fs.rename(partial, target);
      downloaded = { version: manifest.version, file: target };
      publish({ state: 'ready', progress: 100 });
    } catch (error) {
      await handle?.close().catch(() => {});
      await fs.rm(partial, { force: true }).catch(() => {});
      publish({ state: 'available', progress: 0, error: controller.signal.aborted ? '' : error.message });
      if (!controller.signal.aborted) throw error;
    } finally { controller = null; }
    return status;
  }

  function cancel() { controller?.abort(); }

  async function install() {
    if (isBusy()) throw new Error('Minecraft läuft noch. Das Update startet nach dem Beenden des Spiels.');
    if (!downloaded) await download();
    if (!downloaded) throw new Error('Das Update konnte nicht geladen werden.');
    const env = { ...process.env };
    for (const key of PORTABLE_ENV) delete env[key];
    // The setup waits for this launcher to exit before it replaces the files.
    spawn(downloaded.file, ['--update'], { cwd: os.tmpdir(), detached: true, stdio: 'ignore', env }).unref();
    publish({ state: 'installing' });
    setTimeout(() => app.quit(), 300);
    return status;
  }

  return { check, download, cancel, install, status: () => status };
}

module.exports = { createUpdater, validateManifest, isNewer, parseVersion, signedPayload, checkUrl };
