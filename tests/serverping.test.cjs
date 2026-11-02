const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { ping, versionLabel } = require('../electron/serverping.cjs');

const varint = value => { const out = []; do { let b = value & 0x7f; value >>>= 7; if (value) b |= 0x80; out.push(b); } while (value); return Buffer.from(out); };
const packet = (id, body) => { const data = Buffer.concat([varint(id), body]); return Buffer.concat([varint(data.length), data]); };
const noSrv = async () => { throw new Error('none'); };

// A server speaking the status protocol. answer decides what happens on each connection.
function server(answer) {
  return new Promise(resolve => {
    let connections = 0;
    const instance = net.createServer(socket => { socket.on('error', () => {}); answer(socket, ++connections); });
    instance.listen(0, '127.0.0.1', () => resolve({ port: instance.address().port, close: () => instance.close() }));
  });
}
const statusPacket = json => { const text = Buffer.from(JSON.stringify(json)); return packet(0, Buffer.concat([varint(text.length), text])); };
const status = { players: { online: 1234, max: 5000 }, version: { name: 'Velocity 1.7.2-26.3' }, favicon: 'data:image/png;base64,AAAA\n' };

test('ping reads players, version and answers the round trip', async () => {
  const s = await server(socket => {
    let pings = 0;
    socket.on('data', chunk => { if (pings++ === 0) socket.write(statusPacket(status)); if (chunk.includes(1) && pings > 1) socket.write(packet(1, Buffer.alloc(8))); });
  });
  const result = await ping(`127.0.0.1:${s.port}`, { lookupSrv: noSrv });
  s.close();
  assert.equal(result.online, 1234);
  assert.equal(result.max, 5000);
  assert.equal(result.version, '1.7.2–26.3');
  assert.equal(result.icon, 'data:image/png;base64,AAAA');
  assert.ok(result.ms >= 0);
});

test('a status split over several chunks is still read', async () => {
  const s = await server(socket => {
    socket.once('data', () => {
      const whole = statusPacket(status);
      socket.write(whole.subarray(0, 4));
      setTimeout(() => { socket.write(whole.subarray(4)); socket.end(); }, 20);
    });
  });
  const result = await ping(`127.0.0.1:${s.port}`, { lookupSrv: noSrv });
  s.close();
  assert.equal(result.online, 1234);
});

test('a server dropping the first ping gets a second try', async () => {
  const s = await server((socket, connection) => {
    if (connection === 1) return socket.destroy();
    socket.once('data', () => { socket.write(statusPacket(status)); socket.end(); });
  });
  const result = await ping(`127.0.0.1:${s.port}`, { lookupSrv: noSrv });
  s.close();
  assert.equal(result.online, 1234);
});

test('an SRV record is followed', async () => {
  const s = await server(socket => socket.once('data', () => { socket.write(statusPacket(status)); socket.end(); }));
  const result = await ping('play.example.test', { lookupSrv: async name => { assert.equal(name, '_minecraft._tcp.play.example.test'); return [{ name: '127.0.0.1', port: s.port }]; } });
  s.close();
  assert.equal(result.online, 1234);
});

test('a dead server fails, a bad address is refused', async () => {
  const s = await server(socket => socket.destroy());
  await assert.rejects(ping(`127.0.0.1:${s.port}`, { lookupSrv: noSrv }));
  s.close();
  for (const bad of ['', 'evil host', 'a/b', 'host:99999', null]) await assert.rejects(ping(bad, { lookupSrv: noSrv }), /Ungültige/);
});

test('an icon that is no PNG data URL is dropped', async () => {
  const s = await server(socket => socket.once('data', () => { socket.write(statusPacket({ ...status, favicon: 'https://evil.test/x.png' })); socket.end(); }));
  const result = await ping(`127.0.0.1:${s.port}`, { lookupSrv: noSrv });
  s.close();
  assert.equal(result.icon, null);
});

test('versionLabel keeps only the versions', () => {
  assert.equal(versionLabel('1.21.11+'), '1.21.11+');
  assert.equal(versionLabel('XeBungee 1.7.10 - 1.8.9, 1.21.4+'), '1.7.10–1.21.4+');
  assert.equal(versionLabel('CubeCraft'), null);
  assert.equal(versionLabel('§7596§8/§71337'), null);
  assert.equal(versionLabel(undefined), null);
});
