const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createSkinMc, parseSkins, parseTags, parseNext, isListUrl } = require('../electron/skinmc.cjs');

const A = '08b9fc16-4768-48e1-be60-8d23da5222fd', B = '095b9d41-21be-4e1e-9ea9-fe1dc9a0ae32';
const card = (id, author) => `<a href="https://skinmc.net/skins/${id}"
  class="card elevated-card border-0 text-decoration-none"><img src="https://skinmc.net/api/v1/renders/skins/${id}/full"></a>
  <div class="d-flex flex-column account-info w-100">${author ? `<span class="rounded-0 text-truncate small btn-sm fw-medium"
  >
  ${author}
  </span>` : ''}</div>`;
const tag = (id, name, count) => `<a href="https://skinmc.net/skins/tagged/${id}" class="btn">
  <img src="x" alt="${name}"><span class="small mt-1 text-nowrap">${name}</span>
  <span class="opacity-50 font-size-12">${count}</span></a>`;
const page = `${tag('girl', 'Girl', 565)}${tag('cat-ears', 'Cat ears', 12)}${card(A, 'Marlow&amp;Co')}${card(B, null)}${card(A, 'Doppelt')}
  <a class="page-link" href="https://skinmc.net/skins?cursor=abc&amp;page=2" rel="next">›</a>`;

test('reads skins, tags and the next page from a list page', () => {
  assert.deepEqual(parseSkins(page), [{ id: A, author: 'Marlow&Co' }, { id: B, author: null }]);
  assert.deepEqual(parseTags(page), [{ id: 'girl', name: 'Girl', count: 565 }, { id: 'cat-ears', name: 'Cat ears', count: 12 }]);
  assert.equal(parseNext(page), 'https://skinmc.net/skins?cursor=abc&page=2');
  assert.equal(parseNext('<a href="https://evil.test/skins" rel="next">'), null);
});

test('only SkinMC skin lists count as pages', () => {
  assert.equal(isListUrl('https://skinmc.net/skins/tagged/girl?page=3'), true);
  for (const bad of ['https://skinmc.net.evil.test/skins', 'http://skinmc.net/skins', 'https://skinmc.net/api/v1/x', 'https://user@skinmc.net/skins', 'nonsense']) assert.equal(isListUrl(bad), false);
});

test('browse and texture check their input and the downloaded skin', async () => {
  const skin = await fs.readFile(path.join(__dirname, '..', 'public', 'default-skin.png'));
  const asked = [];
  const fetchImpl = async url => {
    asked.push(url);
    return url.endsWith('/skin') ? new Response(skin) : new Response(page);
  };
  const skinMc = createSkinMc({ fetchImpl });
  const first = await skinMc.browse({});
  assert.equal(first.skins.length, 2);
  assert.equal(first.tags.length, 2);
  await skinMc.browse({});
  assert.equal(asked.length, 1, 'a page is cached for a while');
  await skinMc.browse({ tag: 'girl' });
  assert.equal(asked[1], 'https://skinmc.net/skins/tagged/girl');
  await assert.rejects(skinMc.browse({ tag: '../admin' }), /Tag/);
  await assert.rejects(skinMc.browse({ next: 'https://evil.test/skins' }), /Seite/);
  assert.match(await skinMc.texture(A), /^data:image\/png;base64,/);
  await assert.rejects(skinMc.texture('../../x'), /Skin/);
  const broken = createSkinMc({ fetchImpl: async () => new Response('<html>') });
  await assert.rejects(broken.texture(B), /PNG/);
});
