const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, sign } = require('node:crypto');
const { checkUrl, isNewer, signedPayload, validateManifest } = require('../electron/updater.cjs');

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const pem = publicKey.export({ type: 'spki', format: 'pem' });
const signed = (fields, key = privateKey) => ({ ...fields, signature: sign(null, Buffer.from(signedPayload(fields)), key).toString('base64') });
const base = { version: '0.2.0', file: 'Savira-Setup-0.2.0.exe', sha512: 'a'.repeat(128), size: 103_000_000 };

test('compares versions numerically', () => {
  assert.equal(isNewer('0.2.0', '0.1.0'), true);
  assert.equal(isNewer('0.10.0', '0.9.9'), true);
  assert.equal(isNewer('1.0.0', '0.99.99'), true);
  assert.equal(isNewer('0.1.0', '0.1.0'), false);
  assert.equal(isNewer('0.0.9', '0.1.0'), false);
  for (const bad of ['0.2', 'v0.2.0', '0.2.0-beta', '', null, '99999.0.0']) assert.equal(isNewer(bad, '0.1.0'), false);
});
test('accepts a correctly signed manifest', () => {
  const result = validateManifest({ ...signed(base), notes: ['Neue Module', 42], date: '2026-10-05T10:00:00Z' }, pem);
  assert.equal(result.version, '0.2.0');
  assert.deepEqual(result.notes, ['Neue Module']);
});
test('rejects tampered, unsigned or foreign-signed manifests', () => {
  const good = signed(base);
  const foreign = generateKeyPairSync('ed25519').privateKey;
  for (const manifest of [
    { ...good, size: good.size + 1 }, { ...good, sha512: 'b'.repeat(128) }, { ...good, version: '9.9.9' }, { ...good, file: 'Other.exe' },
    { ...base }, { ...good, signature: '' }, signed(base, foreign)
  ]) assert.throws(() => validateManifest(manifest, pem));
  assert.throws(() => validateManifest(good, ''), /Schlüssel/);
});
test('rejects unsafe file names and sizes even when signed', () => {
  for (const fields of [{ ...base, file: '..\\evil.exe' }, { ...base, file: 'setup.bat' }, { ...base, size: 10 }, { ...base, size: 2_000_000_000 }, { ...base, sha512: 'xyz' }]) {
    assert.throws(() => validateManifest(signed(fields), pem));
  }
});
test('requires https except for overridden loopback test feeds', () => {
  assert.equal(checkUrl('https://github.com/a/b/releases/latest/download/latest.json').protocol, 'https:');
  assert.throws(() => checkUrl('http://example.com/latest.json'));
  assert.throws(() => checkUrl('http://127.0.0.1:8080/latest.json'));
  assert.equal(checkUrl('http://127.0.0.1:8080/latest.json', true).hostname, '127.0.0.1');
  assert.throws(() => checkUrl('http://example.com/latest.json', true));
  assert.throws(() => checkUrl('file:///C:/evil.exe', true));
});
