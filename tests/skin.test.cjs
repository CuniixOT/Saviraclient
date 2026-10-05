const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSkinUrl, validSkinPng } = require('../electron/skin.cjs');

test('upgrades legacy Mojang texture URLs to HTTPS', () => {
  assert.equal(normalizeSkinUrl('http://textures.minecraft.net/texture/abc123').href, 'https://textures.minecraft.net/texture/abc123');
  assert.equal(normalizeSkinUrl('https://textures.minecraft.net/texture/abc123').href, 'https://textures.minecraft.net/texture/abc123');
});

test('rejects non-Mojang and misleading skin URLs', () => {
  for (const url of ['https://example.com/texture/a', 'https://textures.minecraft.net.evil.test/texture/a', 'file:///skin.png', 'https://textures.minecraft.net/profile/a']) {
    assert.throws(() => normalizeSkinUrl(url));
  }
});

test('accepts bounded PNG data only', () => {
  const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.alloc(16)]);
  assert.equal(validSkinPng(png), true);
  assert.equal(validSkinPng(Buffer.from('not png')), false);
  assert.equal(validSkinPng(Buffer.alloc(2_000_001)), false);
});
