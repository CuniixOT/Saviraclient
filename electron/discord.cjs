const net = require('node:net');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// Minimal Discord Rich Presence over the local IPC pipe the Discord app opens
// (discord-ipc-0 … 9). Frames are: int32 opcode, int32 length, JSON body.
const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 };
const defaultPipe = i => process.platform === 'win32'
  ? `\\\\?\\pipe\\discord-ipc-${i}`
  : path.join(process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || '/tmp', `discord-ipc-${i}`);

function encode(op, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  const head = Buffer.alloc(8);
  head.writeInt32LE(op, 0);
  head.writeInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

/** Splits complete frames off the buffer; returns them plus the unread rest. */
function decode(buffer) {
  const frames = [];
  while (buffer.length >= 8) {
    const length = buffer.readInt32LE(4);
    if (length < 0 || length > 1_000_000) throw new Error('Ungültiger Discord-Frame.');
    if (buffer.length < 8 + length) break;
    const op = buffer.readInt32LE(0);
    let data = null;
    try { data = JSON.parse(buffer.subarray(8, 8 + length).toString('utf8')); } catch { /* Ignore broken frames. */ }
    frames.push({ op, data });
    buffer = buffer.subarray(8 + length);
  }
  return { frames, rest: buffer };
}

function createPresence({ clientId, pipe = defaultPipe, retryMs = 15000, pid = process.pid, log = () => {} }) {
  let socket = null, ready = false, enabled = false, activity = null, timer = null, connecting = false;
  const valid = /^\d{17,20}$/.test(clientId || '');

  const send = (op, payload) => { if (socket && !socket.destroyed) socket.write(encode(op, payload)); };
  const sendActivity = () => ready && send(OP.FRAME, { cmd: 'SET_ACTIVITY', args: { pid, activity }, nonce: randomUUID() });
  const schedule = () => {
    if (!enabled || timer) return;
    timer = setTimeout(() => { timer = null; connect(); }, retryMs);
    timer.unref?.();
  };
  function drop() {
    ready = false;
    if (socket) { socket.removeAllListeners(); socket.on('error', () => {}); socket.destroy(); socket = null; }
  }
  function attach(next) {
    let buffer = Buffer.alloc(0);
    socket = next;
    socket.on('data', chunk => {
      try {
        const { frames, rest } = decode(Buffer.concat([buffer, chunk]));
        buffer = rest;
        for (const frame of frames) {
          if (frame.op === OP.PING) send(OP.PONG, frame.data);
          else if (frame.op === OP.CLOSE) { log(`Discord hat die Verbindung beendet: ${frame.data?.message || 'ohne Grund'}`); drop(); schedule(); }
          else if (frame.op === OP.FRAME && frame.data?.evt === 'READY') { ready = true; log('Discord-Präsenz verbunden'); sendActivity(); }
          else if (frame.op === OP.FRAME && frame.data?.evt === 'ERROR') log(`Discord-Fehler: ${frame.data.data?.message || 'unbekannt'}`);
        }
      } catch { drop(); schedule(); }
    });
    socket.on('error', () => {});
    socket.on('close', () => { if (socket === next) { drop(); schedule(); } });
    send(OP.HANDSHAKE, { v: 1, client_id: clientId });
  }
  // Discord may sit on any of the ten pipes; try them in order.
  function connect(index = 0) {
    if (!enabled || socket || connecting) return;
    if (index > 9) { schedule(); return; }
    connecting = true;
    const attempt = net.createConnection(pipe(index));
    attempt.once('connect', () => { connecting = false; attempt.removeAllListeners('error'); if (enabled) attach(attempt); else attempt.destroy(); });
    attempt.once('error', () => { connecting = false; attempt.destroy(); connect(index + 1); });
  }

  return {
    available: valid,
    get connected() { return ready; },
    setEnabled(next) {
      enabled = Boolean(next) && valid;
      if (enabled) { connect(); return; }
      // Discord removes the presence by itself once the pipe closes.
      clearTimeout(timer); timer = null;
      drop();
    },
    /** Replaces the shown activity; null clears it. Sent as soon as Discord is connected. */
    set(next) {
      const changed = JSON.stringify(next) !== JSON.stringify(activity);
      activity = next;
      if (changed) sendActivity();
    },
    destroy() { enabled = false; clearTimeout(timer); timer = null; drop(); }
  };
}

module.exports = { createPresence, encode, decode, OP };
