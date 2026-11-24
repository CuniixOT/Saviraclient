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

test('levels unlock coin rewards that can be claimed once', async () => {
  const file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'savira-season-')), 'season.json');
  await fs.writeFile(file, JSON.stringify({ season: 1, xp: 2350, coins: 0, claimedTiers: [1] }));
  const season = createSeason({ file, now: at('2026-11-24T12:00:00') });
  const view = await season.load();
  assert.equal(view.level, 2);
  assert.equal(view.levelXp, 350);
  assert.deepEqual(view.tiers.slice(0, 3).map(t => [t.free.claimed, t.free.ready]), [[true, false], [false, true], [false, false]]);
  const { view: after, reward } = await season.claimTier(2);
  assert.equal(reward, '150 Coins');
  assert.equal(after.coins, 150);
  await assert.rejects(season.claimTier(2), /schon/);
  await assert.rejects(season.claimTier(3), /noch nicht/);
});
