const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseLevel } = require('../electron/gamesession.cjs');
const { list, read, assertAllowed } = require('../electron/logfiles.cjs');
const { redact } = require('../electron/logger.cjs');

test('detects Minecraft log levels', () => {
  assert.equal(parseLevel('[12:00:01] [Render thread/INFO]: Setting user: Steve'), 'INFO');
  assert.equal(parseLevel('[12:00:01] [main/WARN]: Missing sound'), 'WARN');
  assert.equal(parseLevel('[12:00:01] [Worker-Main-2/ERROR]: Failed to load'), 'ERROR');
  assert.equal(parseLevel('[12:00:01] [main/FATAL]: Crash'), 'ERROR');
  assert.equal(parseLevel('[12:00:01] [main/DEBUG]: Detail'), 'DEBUG');
  assert.equal(parseLevel('Exception in thread "main"'), 'ERROR');
  assert.equal(parseLevel('plain output'), 'INFO');
});
test('redacts tokens before logging', () => {
  assert.equal(redact('token eyJhbGciOiJIUzI1NiJ9.payload.sig end'), 'token [redacted] end');
  assert.equal(redact('"accessToken":"abc123secret"'), '"accessToken":"[redacted]"');
});
test('lists, reads and guards log files', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'savira-logs-'));
  const logs = path.join(userData, 'instances', 'savira-1-21-1', 'logs');
  const crashes = path.join(userData, 'instances', 'savira-1-21-1', 'crash-reports');
  fs.mkdirSync(logs, { recursive: true }); fs.mkdirSync(crashes, { recursive: true });
  fs.writeFileSync(path.join(logs, 'latest.log'), 'hello');
  fs.writeFileSync(path.join(logs, 'notes.exe'), 'x');
  fs.writeFileSync(path.join(crashes, 'crash-2026-10-06-client.txt'), 'boom');
  fs.writeFileSync(path.join(userData, 'settings.json'), '{}');
  const mc = await list(userData, 'minecraft');
  assert.deepEqual(mc.map(f => f.name), ['latest.log']);
  assert.equal(mc[0].instance, 'savira-1-21-1');
  assert.equal((await list(userData, 'crash'))[0].name, 'crash-2026-10-06-client.txt');
  assert.equal(await read(userData, path.join(logs, 'latest.log')), 'hello');
  for (const bad of [path.join(userData, 'settings.json'), path.join(logs, '..', '..', '..', 'settings.json'), 'latest.log', path.join(logs, 'sub', 'x.log')]) await assert.rejects(assertAllowed(userData, bad));
  await assert.rejects(list(userData, '../etc'));
});
