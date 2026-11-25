const test = require('node:test');
const assert = require('node:assert/strict');
const { createNewsFeed, blocks, releaseItems } = require('../electron/newsfeed.cjs');

test('patch note HTML with open tags becomes headings, text and items', () => {
  assert.deepEqual(blocks('<p>Hallo &#38 willkommen<p>Viel Spaß!<h1>Changes</h1><ul><li>Eins<li>Zwei</ul>'), [
    { kind: 'text', text: 'Hallo & willkommen' }, { kind: 'text', text: 'Viel Spaß!' }, { kind: 'heading', text: 'Changes' }, { kind: 'item', text: 'Eins' }, { kind: 'item', text: 'Zwei' }]);
  assert.deepEqual(releaseItems(['## Neu', '', '- Erstens', '- **Zweitens**', 'Text'].join('\n')), ['Erstens', 'Zweitens']);
});

test('feeds are merged, spin-offs dropped, unsafe links and paths refused', async () => {
  const data = {
    'https://launchercontent.mojang.com/v2/news.json': { entries: [
      { id: 'a', title: 'Java News', category: 'Minecraft: Java Edition', date: '2026-11-20', text: 'x', newsPageImage: { url: '/v2/images/a.png' }, readMoreLink: 'https://www.minecraft.net/a' },
      { id: 'b', title: 'Dungeons', category: 'Minecraft Dungeons', date: '2026-11-21', text: 'y' },
      { id: 'c', title: 'Evil', category: 'Minecraft', date: '2026-11-19', text: 'z', readMoreLink: 'javascript:alert(1)' }] },
    'https://launchercontent.mojang.com/v2/javaPatchNotes.json': { entries: [{ id: 'p', title: 'Minecraft 1.0', date: '2026-11-22T10:00:00Z', shortText: 's', contentPath: 'javaPatchNotes/p.json' }] },
  };
  const feed = createNewsFeed({ log: {}, fetchImpl: async url => data[url] ? new Response(JSON.stringify(data[url])) : new Response('', { status: 404 }) });
  const all = await feed.all();
  assert.deepEqual(all.items.map(i => i.title), ['Minecraft 1.0', 'Java News', 'Evil']);
  assert.equal(all.items[1].image, 'https://launchercontent.mojang.com/v2/images/a.png');
  assert.equal(all.items[2].link, null);
  assert.deepEqual(all.sources, { savira: false, minecraft: true, mojang: true });
  await assert.rejects(feed.patch('../../etc/passwd'), /Unbekannte/);
});
