const { test } = require('node:test');
const assert = require('node:assert/strict');
const { defaults, maxMemory, validateSettings } = require('../electron/settings.cjs');

test('defaults are valid on this machine', () => assert.deepEqual(validateSettings(defaults), defaults));
test('rejects malformed settings from renderer', () => {
  const badProfile = { ...defaults.profiles[0], id: '../outside' };
  const incompatible = { ...defaults.profiles[0], id: 'savira-old', version: '1.8.9' };
  for (const input of [null, {}, { ...defaults, profiles: [badProfile] }, { ...defaults, profiles: [incompatible], selectedProfileId: incompatible.id }, { ...defaults, selectedProfileId: 'missing' }, { ...defaults, profiles: [...defaults.profiles, defaults.profiles[0]] }, { ...defaults, memory: maxMemory + 1 }, { ...defaults, memory: 2.5 }, { ...defaults, memory: NaN }, { ...defaults, javaPath: '' }, { ...defaults, fullscreen: 'yes' }, { ...defaults, hud: { ...defaults.hud, fps: 'true' } }, { ...defaults, hud: { ...defaults.hud, zoom: 'yes' } }, { ...defaults, hud: { ...defaults.hud, scale: Infinity } }, { ...defaults, accent: 'neon' }, { ...defaults, accent: 'toString' }, { ...defaults, background: 'video' }, { ...defaults, autoUpdate: 'yes' }]) {
    assert.throws(() => validateSettings(input));
  }
});
test('discards unknown properties and normalizes executable path', () => {
  const result = validateSettings({ ...defaults, arbitraryPath: 'C:/', javaPath: ' java ', hud: { ...defaults.hud, arbitrary: true } });
  assert.equal(result.javaPath, 'java');
  assert.equal(result.arbitraryPath, undefined);
  assert.equal(result.hud.arbitrary, undefined);
});
test('migrates the persisted two-profile setting', () => {
  const legacy = { memory: defaults.memory, javaPath: 'java', profile: 'vanilla', fullscreen: false, hud: defaults.hud };
  const result = validateSettings(legacy);
  assert.equal(result.selectedProfileId, 'vanilla-1-21-1');
  assert.equal(result.profiles.length, 2);
  assert.equal(result.profiles[1].loader, 'vanilla');
});
test('fills appearance defaults for settings saved before 0.2', () => {
  const { accent, background, autoUpdate, ...older } = defaults;
  const result = validateSettings(older);
  assert.equal(result.accent, 'mint');
  assert.equal(result.background, 'panorama');
  assert.equal(result.autoUpdate, true);
});
test('accepts every launcher background effect', () => {
  for (const background of ['panorama', 'particles', 'plain', 'grid', 'aurora', 'stars', 'glyphs', 'waves', 'blocks']) assert.equal(validateSettings({ ...defaults, background }).background, background);
});
test('accepts preset and custom accents, rejects anything else', () => {
  assert.equal(validateSettings({ ...defaults, accent: 'teal' }).accent, 'teal');
  assert.equal(validateSettings({ ...defaults, accent: '#AbCdEf' }).accent, '#abcdef');
  for (const accent of ['#12345', '#1234567', 'red;', 'url(x)', '#ggg000', 42]) assert.throws(() => validateSettings({ ...defaults, accent }));
});
test('validates launcher behaviour switches', () => {
  const result = validateSettings({ ...defaults, hideOnLaunch: true, logsOnLaunch: true, animations: false });
  assert.deepEqual([result.hideOnLaunch, result.logsOnLaunch, result.animations], [true, true, false]);
  for (const key of ['hideOnLaunch', 'logsOnLaunch', 'animations']) assert.throws(() => validateSettings({ ...defaults, [key]: 'yes' }));
});
