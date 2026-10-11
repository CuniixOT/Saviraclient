const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { createPresence, encode, decode, OP } = require('../electron/discord.cjs');

const pipeName = i => process.platform === 'win32' ? `\\\\?\\pipe\\savira-test-${process.pid}-${i}` : path.join(os.tmpdir(), `savira-test-${process.pid}-${i}`);

test('encodes and decodes split frames', () => {
  const bytes = Buffer.concat([encode(OP.FRAME, { a: 1 }), encode(OP.PING, { b: 2 })]);
  const first = decode(bytes.subarray(0, 12));
  assert.equal(first.frames.length, 0);
  const all = decode(bytes);
  assert.deepEqual(all.frames, [{ op: OP.FRAME, data: { a: 1 } }, { op: OP.PING, data: { b: 2 } }]);
  assert.equal(all.rest.length, 0);
});

test('is unavailable without a valid Discord application id', () => {
  const presence = createPresence({ clientId: '' });
  assert.equal(presence.available, false);
  presence.setEnabled(true);
  assert.equal(presence.connected, false);
});

test('handshakes on the first free pipe and sends the activity', async () => {
  const received = [];
  // Pipe 0 is left free, so the client has to fall through to pipe 1.
  const server = net.createServer(socket => {
    let buffer = Buffer.alloc(0);
    socket.on('data', chunk => {
      const { frames, rest } = decode(Buffer.concat([buffer, chunk]));
      buffer = rest;
      for (const frame of frames) {
        received.push(frame);
        if (frame.op === OP.HANDSHAKE) socket.write(encode(OP.FRAME, { cmd: 'DISPATCH', evt: 'READY', data: {} }));
      }
    });
  });
  await new Promise(resolve => server.listen(pipeName(1), resolve));
  const presence = createPresence({ clientId: '123456789012345678', pipe: pipeName, pid: 42, retryMs: 50 });
  presence.set({ details: 'Im Launcher' });
  presence.setEnabled(true);
  const deadline = Date.now() + 3000;
  while (received.length < 2 && Date.now() < deadline) await new Promise(r => setTimeout(r, 20));
  presence.set({ details: 'Spielt Savira 1.21.1' });
  presence.set({ details: 'Spielt Savira 1.21.1' });
  while (received.length < 3 && Date.now() < deadline) await new Promise(r => setTimeout(r, 20));
  await new Promise(r => setTimeout(r, 100));
  presence.destroy();
  server.close();

  assert.deepEqual(received[0], { op: OP.HANDSHAKE, data: { v: 1, client_id: '123456789012345678' } });
  assert.equal(received[1].data.cmd, 'SET_ACTIVITY');
  assert.deepEqual(received[1].data.args, { pid: 42, activity: { details: 'Im Launcher' } });
  assert.equal(received[2].data.args.activity.details, 'Spielt Savira 1.21.1');
  // An unchanged activity is not sent twice.
  assert.equal(received.length, 3);
});
