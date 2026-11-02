// Minecraft server list ping, as the game does it: follows SRV records, reads the status and
// measures the round trip. Nothing is logged in; the server only sees a status request.
const net = require('node:net');
const dns = require('node:dns').promises;

const PROTOCOL = 767; // 1.21.1; servers answer the status for any version.
const ADDRESS = /^[A-Za-z0-9.-]{1,253}(:\d{1,5})?$/;

function varint(value) {
  const out = [];
  do { let byte = value & 0x7f; value >>>= 7; if (value) byte |= 0x80; out.push(byte); } while (value);
  return Buffer.from(out);
}
function readVarint(buffer, offset) {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    if (offset + i >= buffer.length) return null;
    const byte = buffer[offset + i];
    value |= (byte & 0x7f) << (7 * i);
    if (!(byte & 0x80)) return { value, size: i + 1 };
  }
  throw new Error('Ungültige Serverantwort.');
}
const packet = (id, body) => { const data = Buffer.concat([varint(id), body]); return Buffer.concat([varint(data.length), data]); };

/** "Velocity 1.7.2-26.3" -> "1.7.2–26.3", "1.21.11+" stays, text without a version gives null. */
function versionLabel(raw) {
  const text = String(raw || '').replace(/§./g, '');
  const found = text.match(/\d+\.\d+(?:\.\d+)?/g);
  if (!found) return null;
  if (found.length === 1) return found[0] + (/\+/.test(text) ? '+' : '');
  return `${found[0]}–${found[found.length - 1]}${/\+/.test(text) ? '+' : ''}`;
}

// The icon the server sends with its status; only a PNG data URL of sensible size is passed on.
const iconOf = favicon => typeof favicon === 'string' && favicon.length < 200000 && /^data:image\/png;base64,[A-Za-z0-9+/=\s]+$/.test(favicon) ? favicon.replace(/\s/g, '') : null;

function parseAddress(address) {
  if (typeof address !== 'string' || !ADDRESS.test(address)) throw new Error('Ungültige Serveradresse.');
  const [host, port] = address.split(':');
  if (port && (Number(port) < 1 || Number(port) > 65535)) throw new Error('Ungültige Serveradresse.');
  return { host, port: port ? Number(port) : null };
}

async function resolve({ host, port }, lookupSrv) {
  if (port) return { host, port };
  try {
    const [record] = await lookupSrv(`_minecraft._tcp.${host}`);
    if (record) return { host: record.name, port: record.port };
  } catch { /* Most servers have no SRV record. */ }
  return { host, port: 25565 };
}

function query(virtualHost, target, timeout) {
  return new Promise((done, fail) => {
    const socket = net.connect(target.port, target.host);
    let buffer = Buffer.alloc(0), status = null, sentAt = 0, connectedIn = 0, settled = false;
    const started = Date.now();
    const finish = (error, result) => {
      if (settled) return;
      settled = true; clearTimeout(timer); socket.destroy();
      if (error) fail(error); else done(result);
    };
    // A status without an answered ping still counts; the connection time stands in for the latency.
    const report = ms => finish(null, { online: status.players?.online ?? 0, max: status.players?.max ?? 0, ms, version: versionLabel(status.version?.name), icon: iconOf(status.favicon) });
    const timer = setTimeout(() => status ? report(connectedIn) : finish(new Error('Zeitüberschreitung.')), timeout);
    socket.on('error', error => status ? report(connectedIn) : finish(error));
    socket.on('close', () => status ? report(connectedIn) : finish(new Error('Der Server hat die Verbindung geschlossen.')));
    socket.on('connect', () => {
      connectedIn = Date.now() - started;
      const name = Buffer.from(virtualHost), port = Buffer.alloc(2);
      port.writeUInt16BE(target.port);
      socket.write(packet(0, Buffer.concat([varint(PROTOCOL), varint(name.length), name, port, varint(1)])));
      socket.write(packet(0, Buffer.alloc(0)));
    });
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      try {
        for (;;) {
          const length = readVarint(buffer, 0);
          if (!length || buffer.length < length.size + length.value) return;
          const body = buffer.subarray(length.size, length.size + length.value);
          buffer = buffer.subarray(length.size + length.value);
          const id = readVarint(body, 0);
          if (id.value === 0 && !status) {
            const size = readVarint(body, id.size);
            status = JSON.parse(body.subarray(id.size + size.size, id.size + size.size + size.value).toString('utf8'));
            sentAt = Date.now();
            socket.write(packet(1, Buffer.alloc(8)));
          } else if (id.value === 1 && status) return report(Date.now() - sentAt);
        }
      } catch (error) { finish(error); }
    });
  });
}

/** Online players, slots, latency in ms and the version label. Tries twice: some servers drop single pings. */
async function ping(address, { timeout = 5000, lookupSrv = name => dns.resolveSrv(name) } = {}) {
  const parsed = parseAddress(address);
  const target = await resolve(parsed, lookupSrv);
  try { return await query(parsed.host, target, timeout); }
  catch { return query(parsed.host, target, timeout); }
}

module.exports = { ping, versionLabel };
