const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createSeason } = require('../electron/season.cjs');

const at = text => () => new Date(text);

test('quests count play time, starts and servers, and pay XP once', async () => {
  const file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'savira-season-')), 'season.json');
  const season = createSeason({ file, now: at('2026-11-24T12:00:00') });
  await season.load();
  await season.recordStart('Play.Hypixel.net');
  await season.recordPlay(31);
  let view = season.view();
  assert.deepEqual(view.daily.map(q => [q.id, q.cur, q.done]), [['d:play30', 30, true], ['d:start1', 1, true], ['d:join1', 1, true]]);
  assert.equal(view.weekly.find(q => q.id === 'w:distinct3').cur, 1);
  await assert.rejects(season.claimQuest('w:play300'), /noch nicht/);
  const { xp } = await season.claimQuest('d:join1');
  assert.equal(xp, 200);
  await assert.rejects(season.claimQuest('d:join1'), /schon/);
  view = season.view();
  assert.equal(view.xp, 200);
  assert.equal(view.daily.find(q => q.id === 'd:join1').claimed, true);

  // Reloaded the next day: XP stays, daily quests start over, the week keeps counting.
  const tomorrow = createSeason({ file, now: at('2026-11-25T09:00:00') });
  view = await tomorrow.load();
  assert.equal(view.xp, 200);
  assert.equal(view.daily.find(q => q.id === 'd:join1').cur, 0);
  assert.equal(view.daily.find(q => q.id === 'd:join1').claimed, false);
  assert.equal(view.weekly.find(q => q.id === 'w:play300').cur, 31);
});

test('levels unlock rewards that land in the inventory once', async () => {
  const file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'savira-season-')), 'season.json');
  await fs.writeFile(file, JSON.stringify({ season: 1, xp: 700, coins: 0, claimedTiers: [1] }));
  const season = createSeason({ file, now: at('2026-11-24T12:00:00') });
  const view = await season.load();
  assert.equal(view.level, 2);
  assert.equal(view.levelXp, 100);
  assert.deepEqual(view.tiers.slice(0, 3).map(t => [t.free.claimed, t.free.ready]), [[true, false], [false, true], [false, false]]);
  assert.equal(view.tiers[0].premium.ready, false);
  // Level 2 is an XP boost: quests pay double for two hours.
  const { view: after, reward } = await season.claimTier(2);
  assert.equal(reward, '×2 XP-Boost');
  assert.equal(after.inventory.boostUntil, new Date('2026-11-24T14:00:00').getTime());
  await assert.rejects(season.claimTier(2), /schon/);
  await assert.rejects(season.claimTier(3), /noch nicht/);
  await assert.rejects(season.claimAll(), /nichts/);
  await season.recordStart(null);
  const { xp } = await season.claimQuest('d:start1');
  assert.equal(xp, 200);
});

test('cases are bought with coins and opened into the inventory', async () => {
  const file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'savira-season-')), 'season.json');
  await fs.writeFile(file, JSON.stringify({ season: 1, xp: 0, coins: 1000, inventory: { cases: { savira: 0 }, keys: 1 } }));
  // random 0 always rolls the first legendary: the Season-Cape.
  const season = createSeason({ file, now: at('2026-11-24T12:00:00'), random: () => 0 });
  let view = await season.load();
  assert.equal(view.cases.find(c => c.id === 'savira').owned, 0);
  await assert.rejects(season.buyCase('savira', 2), /Ungültig/);
  await assert.rejects(season.buyCase('legend', 1), /Nicht genug/);
  ({ view } = await season.buyCase('savira', 1));
  assert.equal(view.coins, 250);
  let win = await season.openCase('savira');
  assert.equal(win.item.name, 'Season-Cape');
  assert.equal(win.duplicate, false);
  assert.deepEqual(win.view.inventory.cosmetics, ['cape-season']);
  // No case left: the key opens the next one, the same cape again pays coins instead.
  win = await season.openCase('savira');
  assert.equal(win.used, 'key');
  assert.equal(win.duplicate, true);
  assert.equal(win.view.coins, 650);
  await assert.rejects(season.openCase('savira'), /Keine Kiste/);
  const chances = view.cases[0].items.reduce((sum, item) => sum + item.chance, 0);
  assert.ok(Math.abs(chances - 100) < 1e-9);
});

test('new players get one starter case', async () => {
  const file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'savira-season-')), 'season.json');
  const view = await createSeason({ file, now: at('2026-11-24T12:00:00') }).load();
  assert.equal(view.cases.find(c => c.id === 'starter').owned, 1);
});
