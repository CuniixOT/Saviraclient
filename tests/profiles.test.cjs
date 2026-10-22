const test = require('node:test');
const assert = require('node:assert/strict');
const { zipSync, strToU8 } = require('fflate');
const { defaults, validateSettings, validateProfile, maxMemory } = require('../electron/settings.cjs');
const { readPack, safeRelative } = require('../electron/modpacks.cjs');
const { compareVersions, neoforgePrefix, modernForge } = require('../electron/loaders.cjs');
const { libraryKey, mavenPath } = require('../electron/minecraft.cjs');

const base = { id: 'test-profile', name: 'Test', version: '1.21.1', loader: 'vanilla' };
const sha512 = 'a'.repeat(128);
const pack = (index, extra = {}) => Buffer.from(zipSync({ 'modrinth.index.json': strToU8(JSON.stringify(index)), ...extra }));
const index = (changes = {}) => ({ formatVersion: 1, game: 'minecraft', name: 'Pack', dependencies: { minecraft: '1.21.1', 'fabric-loader': '0.16.14' }, files: [], ...changes });

test('profiles from before 0.2.4 become Fabric with Savira or Vanilla', () => {
  const old = validateSettings({ ...defaults, profiles: [{ id: 'old-savira', name: 'Alt', version: '1.21.1', loader: 'savira' }, { id: 'old-vanilla', name: 'Alt 2', version: '1.8.9', loader: 'vanilla' }], selectedProfileId: 'old-savira' });
  assert.deepEqual(old.profiles.map(p => [p.loader, p.loaderVersion, p.savira, p.memory]), [['fabric', '0.16.14', true, defaults.memory * 1024], ['vanilla', null, false, defaults.memory * 1024]]);
});

test('accepts every loader, snapshots and profile extras', () => {
  for (const loader of ['fabric', 'forge', 'neoforge', 'quilt']) assert.equal(validateProfile({ ...base, loader, loaderVersion: '1.2.3' }).loader, loader);
  assert.equal(validateProfile({ ...base, version: '26.4-snapshot-5' }).version, '26.4-snapshot-5');
  const full = validateProfile({ ...base, memory: 6144, group: ' Modpacks ', icon: 'data:image/png;base64,iVBORw0KGgo=', lastPlayed: 5 });
  assert.deepEqual([full.memory, full.group, full.lastPlayed], [6144, 'Modpacks', 5]);
});

test('rejects broken profiles', () => {
  for (const profile of [
    { ...base, loader: 'liteloader' },
    { ...base, loader: 'forge' },                                  // loader without version
    { ...base, loader: 'fabric', loaderVersion: '../x' },
    { ...base, version: '../../evil' },
    { ...base, version: 'a/b' },
    { ...base, savira: true },                                     // Savira needs Fabric
    { ...base, loader: 'fabric', loaderVersion: '0.16.14', version: '1.20.1', savira: true },
    { ...base, memory: 512 },
    { ...base, memory: (maxMemory + 1) * 1024 },
    { ...base, group: 'x'.repeat(25) },
    { ...base, icon: 'https://example.com/a.png' },
    { ...base, icon: 'data:text/html;base64,PGgxPg==' },
    { ...base, icon: `data:image/png;base64,${'A'.repeat(300001)}` },
  ]) assert.throws(() => validateProfile(profile), JSON.stringify(profile).slice(0, 80));
});

test('reads a Modrinth pack with loader, mods and overrides', () => {
  const result = readPack(pack(index({ files: [
    { path: 'mods/sodium.jar', hashes: { sha512, sha1: 'b'.repeat(40) }, downloads: ['https://cdn.modrinth.com/data/x/sodium.jar'], env: { client: 'required' } },
    { path: 'mods/server-only.jar', hashes: { sha512 }, downloads: ['https://cdn.modrinth.com/data/y/s.jar'], env: { client: 'unsupported' } },
  ] }), { 'overrides/config/a.txt': strToU8('a'), 'client-overrides/options.txt': strToU8('b') }));
  assert.equal(result.loader, 'fabric');
  assert.equal(result.loaderVersion, '0.16.14');
  assert.deepEqual(result.files.map(f => f.path), ['mods/sodium.jar']);
  assert.deepEqual(result.overrides.map(f => f.path), ['config/a.txt', 'options.txt']);
});

test('refuses unsafe or foreign packs', () => {
  const file = changes => index({ files: [{ path: 'mods/a.jar', hashes: { sha512 }, downloads: ['https://cdn.modrinth.com/a.jar'], ...changes }] });
  for (const bad of [
    file({ path: '../../outside.jar' }),
    file({ path: 'C:/Windows/evil.dll' }),
    file({ path: '/etc/passwd' }),
    file({ downloads: ['https://evil.example.com/a.jar'] }),
    file({ downloads: ['http://cdn.modrinth.com/a.jar'] }),
    file({ hashes: { sha1: 'b'.repeat(40) } }),
    index({ dependencies: {} }),
    index({ game: 'terraria' }),
  ]) assert.throws(() => readPack(pack(bad)));
  assert.throws(() => readPack(Buffer.from(zipSync({ 'manifest.json': strToU8('{}') }))), /CurseForge/);
  assert.throws(() => readPack(Buffer.from('no zip')), /Zip/);
  // An override trying to leave the profile folder is skipped, not written.
  assert.deepEqual(readPack(pack(index(), { 'overrides/../../evil.txt': strToU8('x') })).overrides, []);
  assert.equal(safeRelative('config\\x.json'), 'config/x.json');
});

test('loader version helpers', () => {
  assert.ok(compareVersions('0.24.0', '0.20.0-beta.9') > 0);
  assert.ok(compareVersions('0.20.0', '0.20.0-beta.9') > 0);
  assert.ok(compareVersions('0.20.0-beta.10', '0.20.0-beta.9') > 0);
  assert.deepEqual(neoforgePrefix('1.21.1'), ['21.1.']);
  assert.deepEqual(neoforgePrefix('1.21'), ['21.0.']);
  assert.deepEqual(neoforgePrefix('26.1'), ['26.1.', '26.1.0.']);
  assert.deepEqual([modernForge('1.8.9'), modernForge('1.12.2'), modernForge('1.13.2'), modernForge('26.1')], [false, false, true, true]);
  assert.equal(mavenPath('net.minecraft:client:1.21.1-2024:srg@txt'), 'net/minecraft/client/1.21.1-2024/client-1.21.1-2024-srg.txt');
  assert.equal(libraryKey('org.ow2.asm:asm:9.7'), libraryKey('org.ow2.asm:asm:9.8'));
  assert.notEqual(libraryKey('org.lwjgl:lwjgl:3.3.3'), libraryKey('org.lwjgl:lwjgl:3.3.3:natives-windows'));
});

const content = require('../electron/content.cjs');
test('reads level.dat and servers.dat (NBT)', () => {
  const str = text => { const b = Buffer.from(text); const l = Buffer.alloc(2); l.writeUInt16BE(b.length); return Buffer.concat([l, b]); };
  const tag = (type, name, payload) => Buffer.concat([Buffer.from([type]), str(name), payload]);
  const int = v => { const b = Buffer.alloc(4); b.writeInt32BE(v); return b; };
  const nbt = tag(10, '', Buffer.concat([tag(10, 'Data', Buffer.concat([tag(8, 'LevelName', str('Welt')), tag(3, 'GameType', int(1)), Buffer.from([0])])), Buffer.from([0])]));
  assert.deepEqual(content.readNbt(nbt), { Data: { LevelName: 'Welt', GameType: 1 } });
  assert.throws(() => content.readNbt(nbt.subarray(0, 12)));
  assert.throws(() => content.readNbt(Buffer.from([9, 0, 0, 1, 0x7f, 0xff, 0xff, 0xff])));
});

test('content paths stay inside their folder', () => {
  for (const bad of ['../x.jar', '..', 'a/b.jar', 'a\b.jar', 'C:x.jar', '', 'x'.repeat(200)]) assert.throws(() => content.entryPath('C:/game', 'mods', bad), bad);
  assert.throws(() => content.entryPath('C:/game', 'saves', 'x.jar'));
  assert.ok(content.entryPath('C:/game', 'mods', 'sodium.jar.disabled').endsWith('sodium.jar.disabled'));
  assert.throws(() => content.screenshotPath('C:/game', '../evil.png'));
  assert.throws(() => content.screenshotPath('C:/game', 'a.exe'));
});

test('search refuses malformed filters', async () => {
  for (const bad of [{ kind: 'plugins' }, { kind: 'mods', query: 'x'.repeat(101) }, { kind: 'mods', versions: ['1.21"]'] }, { kind: 'mods', categories: ['A B'] }, { kind: 'mods', environment: 'both' }, { kind: 'mods', sort: 'random' }, { kind: 'mods', offset: -1 }]) {
    await assert.rejects(content.search(bad), JSON.stringify(bad));
  }
});
