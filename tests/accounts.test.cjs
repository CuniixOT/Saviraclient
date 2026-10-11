const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createAccountStore, MAX_ACCOUNTS } = require('../electron/accounts.cjs');

const fakeCrypto = { encrypt: text => Buffer.from(`enc:${text}`), decrypt: bytes => { const text = bytes.toString(); if (!text.startsWith('enc:')) throw new Error('bad'); return text.slice(4); } };
const uuid = n => n.toString(16).padStart(32, '0');
const temp = () => fs.mkdtemp(path.join(os.tmpdir(), 'savira-accounts-'));

test('adds, switches and removes accounts and keeps them encrypted', async () => {
  const dir = await temp();
  const store = createAccountStore({ dir, ...fakeCrypto });
  await store.load();
  await store.upsert({ uuid: uuid(1), name: 'HawaiiCunix', token: 't1' });
  await store.upsert({ uuid: uuid(2), name: 'Zweitkonto', token: 't2' });
  assert.equal(store.active().name, 'Zweitkonto');
  await store.setActive(uuid(1));
  assert.equal(store.active().token, 't1');
  // Re-login with the same account refreshes it instead of duplicating it.
  await store.upsert({ uuid: uuid(1), name: 'HawaiiCunix', token: 't1b' });
  assert.deepEqual(store.list().map(a => a.name), ['HawaiiCunix', 'Zweitkonto']);
  const raw = await fs.readFile(store.file, 'utf8');
  assert.match(raw, /^enc:/);

  const reloaded = createAccountStore({ dir, ...fakeCrypto });
  await reloaded.load();
  assert.equal(reloaded.active().token, 't1b');
  const next = await reloaded.remove(uuid(1));
  assert.equal(next.name, 'Zweitkonto');
  assert.equal(await reloaded.remove(uuid(2)), null);
  assert.equal(reloaded.active(), null);
});

test('rejects unknown or path-like ids and invalid accounts', async () => {
  const store = createAccountStore({ dir: await temp(), ...fakeCrypto });
  await store.load();
  await assert.rejects(store.remove('../../settings'));
  await assert.rejects(store.setActive('nope'));
  await assert.rejects(store.upsert({ uuid: 'x', name: 'Steve', token: 't' }));
  await assert.rejects(store.upsert({ uuid: uuid(3), name: 'bad name!', token: 't' }));
  const dashed = await store.upsert({ uuid: '00000000-0000-0000-0000-00000000000A', name: 'Steve', token: 't' });
  assert.equal(dashed.uuid, uuid(10));
});

test('limits the number of accounts and survives a broken file', async () => {
  const dir = await temp();
  const store = createAccountStore({ dir, ...fakeCrypto });
  await store.load();
  for (let i = 1; i <= MAX_ACCOUNTS; i++) await store.upsert({ uuid: uuid(i), name: `Spieler${i}`, token: 't' });
  await assert.rejects(store.upsert({ uuid: uuid(99), name: 'Zuviel', token: 't' }));
  await fs.writeFile(store.file, 'kaputt');
  const broken = createAccountStore({ dir, ...fakeCrypto });
  assert.deepEqual(await broken.load(), { active: null, list: [] });
});
