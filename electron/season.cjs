const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

// Season Pass, quests, inventory and cases, kept locally until the Savira server exists. Progress
// comes from what the launcher itself sees: time in game, game starts and servers joined through
// the launcher. Quest XP levels the pass up; each level has a free reward and a premium one.
const SEASON = { id: 1, name: 'Season 1', start: '2026-11-01', end: '2027-01-31' };
const XP_PER_LEVEL = 300;
const LEVELS = 12;

// Rewards and case items share one catalog of icons. grant: what lands in the inventory.
const RARITY = { coin: 'C', xp: 'C', key: 'R', chest: 'R', gem: 'E', particles: 'E', emote: 'R', 'cape-cross': 'L', 'cape-season': 'L', 'cape-animated': 'L', wings: 'L' };
const DESC = {
  coin: 'Savira-Coins für Kisten und bald für den Shop.',
  xp: 'Doppelte Quest-XP, eine Stunde pro Boost. Startet sofort.',
  key: 'Öffnet eine Kiste, auch ohne gekaufte Kiste.',
  chest: 'Eine Savira Case mit zufälliger Kosmetik oder Coins.',
  gem: 'Seltene Währung für besondere Items.',
  particles: 'Leuchtende Spur hinter deinem Charakter.',
  emote: 'Ein Emote für deinen Charakter.',
  'cape-cross': 'Ein Cape für deine Garderobe.',
  'cape-season': 'Das exklusive Cape dieser Season.',
  'cape-animated': 'Animierte Variante des Season-Capes.',
  wings: 'Kosmetische Flügel auf deinem Rücken.',
};
// [icon, qty label, name, grant]
const r = (icon, qty, name, grant) => ({ icon, qty, name, grant });
const REWARDS = [
  [r('coin', '×100', 'Coins', { coins: 100 }), r('gem', '×10', 'Edelsteine')],
  [r('xp', '×2', 'XP-Boost', { boost: 2 }), r('coin', '×200', 'Coins')],
  [r('key', '×1', 'Schlüssel', { keys: 1 }), r('chest', '×1', 'Kiste')],
  [r('coin', '×150', 'Coins', { coins: 150 }), r('key', '×2', 'Schlüssel')],
  [r('cape-cross', '×1', 'Cape', { cosmetic: 'cape-cross' }), r('wings', '×1', 'Flügel')],
  [r('gem', '×5', 'Edelsteine', { gems: 5 }), r('coin', '×400', 'Coins')],
  [r('chest', '×1', 'Kiste', { cases: { savira: 1 } }), r('particles', '×1', 'Partikel-Spur')],
  [r('coin', '×250', 'Coins', { coins: 250 }), r('gem', '×20', 'Edelsteine')],
  [r('xp', '×3', 'XP-Boost', { boost: 3 }), r('chest', '×3', 'Kisten')],
  [r('cape-season', '×1', 'Season-Cape', { cosmetic: 'cape-season' }), r('cape-animated', '×1', 'Anim. Cape')],
  [r('gem', '×10', 'Edelsteine', { gems: 10 }), r('coin', '×600', 'Coins')],
  [r('chest', '×2', 'Kisten', { cases: { savira: 2 } }), r('wings', '×1', 'Flügel II')],
];

// Case contents. Rarity L(egendär), E(pisch), R (selten), U(ngewöhnlich), C (gewöhnlich).
const ITEMS = [
  ['L', 'cape-season', 'Season-Cape', 'Cape', { cosmetic: 'cape-season' }],
  ['L', 'wings', 'Flügel', 'Kosmetik', { cosmetic: 'wings' }],
  ['E', 'cape-animated', 'Animiertes Cape', 'Cape', { cosmetic: 'cape-animated' }],
  ['E', 'particles', 'Partikel-Spur', 'Kosmetik', { cosmetic: 'particles' }],
  ['E', 'gem', '20× Edelsteine', 'Währung', { gems: 20 }],
  ['R', 'cape-cross', 'Cape „Kreuz“', 'Cape', { cosmetic: 'cape-cross' }],
  ['R', 'coin', '1.000 Coins', 'Währung', { coins: 1000 }],
  ['R', 'emote', 'Emote „Jubeln“', 'Emote', { cosmetic: 'emote-cheer' }],
  ['U', 'coin', '500 Coins', 'Währung', { coins: 500 }],
  ['U', 'gem', '5× Edelsteine', 'Währung', { gems: 5 }],
  ['U', 'key', '3× Schlüssel', 'Item', { keys: 3 }],
  ['C', 'coin', '100 Coins', 'Währung', { coins: 100 }],
  ['C', 'xp', 'XP-Boost', 'Booster', { boost: 1 }],
  ['C', 'key', '1× Schlüssel', 'Item', { keys: 1 }],
].map(([rarity, icon, name, kind, grant], i) => ({ id: `i${i}`, rarity, icon, name, kind, grant }));
const ORDER = ['L', 'E', 'R', 'U', 'C'];
const CASES = {
  savira: { name: 'Savira Case', tag: 'Season 1 · Standard', desc: 'Capes, Flügel, Partikel und jede Menge Coins. Die Season-Kiste mit allem, was dein Look braucht.', price: 750, odds: { L: 1, E: 4, R: 15, U: 30, C: 50 } },
  legend: { name: 'Legend Case', tag: 'Limitiert', desc: 'Höhere Chancen auf Epische und Legendäre Gewinne. Nur für kurze Zeit erhältlich.', price: 1500, odds: { L: 4, E: 12, R: 24, U: 30, C: 30 } },
  starter: { name: 'Starter Case', tag: 'Für neue Spieler', desc: 'Der perfekte Einstieg: Coins, Schlüssel und erste Kosmetik.', price: 250, odds: { L: 0.5, E: 2.5, R: 12, U: 35, C: 50 } },
};
// A cosmetic you already own pays out coins instead.
const REFUND = { L: 400, E: 200, R: 100, U: 50, C: 25 };
const BUY_AMOUNTS = [1, 3, 5, 10];

// kind: what counts. minutes: time in game; starts: game starts; servers: server joins through the
// launcher; distinct: different servers; days: different days played.
const DAILY = [
  { id: 'play30', title: '30 Minuten spielen', icon: 'clock', kind: 'minutes', max: 30, xp: 150 },
  { id: 'start1', title: 'Minecraft starten', icon: 'play', kind: 'starts', max: 1, xp: 100 },
  { id: 'join1', title: 'Einem Server beitreten', icon: 'globe', kind: 'servers', max: 1, xp: 200 },
];
const WEEKLY = [
  { id: 'play300', title: '5 Stunden spielen', icon: 'clock', kind: 'minutes', max: 300, xp: 400 },
  { id: 'distinct3', title: 'Auf 3 Servern spielen', icon: 'globe', kind: 'distinct', max: 3, xp: 300 },
  { id: 'days3', title: 'An 3 Tagen spielen', icon: 'calendar', kind: 'days', max: 3, xp: 300 },
];

const pad = n => String(n).padStart(2, '0');
const dayKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
// Weeks start on Monday, local time.
const monday = date => new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7));
const weekKey = date => dayKey(monday(date));
const nextDay = date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
const nextWeek = date => { const m = monday(date); return new Date(m.getFullYear(), m.getMonth(), m.getDate() + 7); };
const empty = () => ({ minutes: 0, starts: 0, servers: 0, distinct: [], days: [] });
const count = value => Math.max(0, Math.floor(Number(value) || 0));
// New players get one Starter Case to try the case opening.
const freshInventory = () => ({ gems: 0, keys: 0, boostUntil: 0, cases: { savira: 0, legend: 0, starter: 1 }, cosmetics: [] });

function createSeason({ file, now = () => new Date(), random = () => crypto.randomInt(0, 1_000_000) / 1_000_000 }) {
  let data = { season: SEASON.id, xp: 0, coins: 0, claimedTiers: [], day: null, week: null, daily: empty(), weekly: empty(), claimed: [], inventory: freshInventory() };
  async function persist() {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file + '.tmp', JSON.stringify(data, null, 2));
    await fs.rename(file + '.tmp', file);
  }
  // A new day or week starts its quests from zero; claimed quests of the old period are forgotten.
  function roll() {
    const today = now(), day = dayKey(today), week = weekKey(today);
    if (data.day !== day) { data.day = day; data.daily = empty(); data.claimed = data.claimed.filter(key => key.startsWith('w:')); }
    if (data.week !== week) { data.week = week; data.weekly = empty(); data.claimed = data.claimed.filter(key => key.startsWith('d:')); }
  }
  const progressOf = (bucket, kind) => kind === 'distinct' || kind === 'days' ? bucket[kind].length : Math.floor(bucket[kind]);
  const boosted = () => data.inventory.boostUntil > now().getTime();
  const questView = (defs, bucket, prefix) => defs.map(q => {
    const cur = Math.min(q.max, progressOf(bucket, q.kind)), key = `${prefix}:${q.id}`;
    return { id: key, title: q.title, icon: q.icon, cur, max: q.max, xp: boosted() ? q.xp * 2 : q.xp, done: cur >= q.max, claimed: data.claimed.includes(key) };
  });
  const level = () => Math.min(LEVELS, Math.floor(data.xp / XP_PER_LEVEL));
  const reward = (item, at, premium, lvl) => ({ icon: item.icon, kind: item.icon, qty: item.qty, name: item.name, rarity: RARITY[item.icon], desc: DESC[item.icon], reached: at <= lvl });

  function grant(what) {
    const inv = data.inventory;
    if (what.coins) data.coins += what.coins;
    if (what.gems) inv.gems += what.gems;
    if (what.keys) inv.keys += what.keys;
    if (what.boost) inv.boostUntil = Math.max(inv.boostUntil, now().getTime()) + what.boost * 3600_000;
    for (const [id, n] of Object.entries(what.cases || {})) inv.cases[id] = (inv.cases[id] || 0) + n;
    if (what.cosmetic) {
      if (inv.cosmetics.includes(what.cosmetic)) return false;
      inv.cosmetics.push(what.cosmetic);
    }
    return true;
  }

  function caseView(id) {
    const def = CASES[id];
    const items = ITEMS.map(item => {
      const sameRarity = ITEMS.filter(other => other.rarity === item.rarity).length;
      return { id: item.id, rarity: item.rarity, icon: item.icon, name: item.name, kind: item.kind, chance: def.odds[item.rarity] / sameRarity };
    });
    return { id, name: def.name, tag: def.tag, desc: def.desc, price: def.price, owned: data.inventory.cases[id] || 0, odds: def.odds, items };
  }

  function view() {
    roll();
    const lvl = level(), today = now(), inv = data.inventory;
    const tiers = REWARDS.map(([free, premium], i) => {
      const at = i + 1, claimed = data.claimedTiers.includes(at);
      return { level: at, free: { ...reward(free, at, false, lvl), claimed, ready: at <= lvl && !claimed }, premium: { ...reward(premium, at, true, lvl), claimed: false, ready: false } };
    });
    return {
      season: { ...SEASON, endsInDays: Math.max(0, Math.ceil((new Date(`${SEASON.end}T23:59:59`) - today) / 86400000)) },
      xp: data.xp, level: lvl, maxLevel: LEVELS, xpPerLevel: XP_PER_LEVEL, levelXp: lvl >= LEVELS ? XP_PER_LEVEL : data.xp % XP_PER_LEVEL,
      coins: data.coins, premium: false, tiers,
      daily: questView(DAILY, data.daily, 'd'), weekly: questView(WEEKLY, data.weekly, 'w'),
      dailyResetAt: nextDay(today).getTime(), weeklyResetAt: nextWeek(today).getTime(),
      inventory: { gems: inv.gems, keys: inv.keys, boostUntil: boosted() ? inv.boostUntil : 0, cosmetics: [...inv.cosmetics] },
      cases: Object.keys(CASES).map(caseView), buyAmounts: BUY_AMOUNTS,
    };
  }
  const record = mutate => async (...args) => {
    roll();
    for (const bucket of [data.daily, data.weekly]) mutate(bucket, ...args);
    await persist();
  };
  function claimFree(at) {
    data.claimedTiers.push(at);
    grant(REWARDS[at - 1][0].grant);
    const item = REWARDS[at - 1][0];
    return `${item.qty} ${item.name}`;
  }
  // Rolls a rarity by the case's odds, then one item of that rarity.
  function pick(def) {
    let roll = random() * 100;
    for (const rarity of ORDER) {
      if (roll < def.odds[rarity]) { const pool = ITEMS.filter(item => item.rarity === rarity); return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]; }
      roll -= def.odds[rarity];
    }
    return ITEMS[ITEMS.length - 1];
  }

  return {
    async load() {
      try {
        const raw = JSON.parse(await fs.readFile(file, 'utf8'));
        if (raw?.season === SEASON.id) {
          const bucket = b => ({ minutes: Number(b?.minutes) || 0, starts: count(b?.starts), servers: count(b?.servers), distinct: Array.isArray(b?.distinct) ? b.distinct.filter(s => typeof s === 'string').slice(0, 50) : [], days: Array.isArray(b?.days) ? b.days.filter(s => typeof s === 'string').slice(0, 8) : [] });
          const inv = raw.inventory || {}, fresh = freshInventory();
          data = {
            season: SEASON.id, xp: count(raw.xp), coins: count(raw.coins), claimedTiers: (raw.claimedTiers || []).filter(Number.isInteger), day: raw.day ?? null, week: raw.week ?? null, daily: bucket(raw.daily), weekly: bucket(raw.weekly), claimed: (raw.claimed || []).filter(k => typeof k === 'string'),
            inventory: raw.inventory ? {
              gems: count(inv.gems), keys: count(inv.keys), boostUntil: Number(inv.boostUntil) || 0,
              cases: Object.fromEntries(Object.keys(CASES).map(id => [id, count(inv.cases?.[id])])),
              cosmetics: Array.isArray(inv.cosmetics) ? inv.cosmetics.filter(c => typeof c === 'string') : [],
            } : fresh,
          };
        }
      } catch { /* First start or a new season. */ }
      return view();
    },
    view,
    /** A game was started; minutes come later with recordPlay. */
    recordStart: record((bucket, server) => {
      bucket.starts += 1;
      const day = dayKey(now());
      if (!bucket.days.includes(day)) bucket.days.push(day);
      if (server) {
        bucket.servers += 1;
        const host = String(server).toLowerCase();
        if (!bucket.distinct.includes(host)) bucket.distinct.push(host);
      }
    }),
    /** Minutes spent in game, added when the game closes. */
    recordPlay: record((bucket, minutes) => { bucket.minutes += Math.max(0, Math.min(24 * 60, Number(minutes) || 0)); }),
    async claimQuest(id) {
      const current = view(), quest = [...current.daily, ...current.weekly].find(q => q.id === id);
      if (!quest) throw new Error('Unbekannte Quest.');
      if (!quest.done) throw new Error('Diese Quest ist noch nicht geschafft.');
      if (quest.claimed) throw new Error('Diese Quest ist schon abgeholt.');
      // quest.xp already counts an active XP boost.
      data.claimed.push(id); data.xp += quest.xp;
      await persist();
      return { view: view(), xp: quest.xp };
    },
    async claimTier(at) {
      const tier = view().tiers.find(t => t.level === at);
      if (!tier) throw new Error('Unbekannte Stufe.');
      if (!tier.free.ready) throw new Error(tier.free.claimed ? 'Diese Belohnung ist schon abgeholt.' : 'Diese Stufe ist noch nicht erreicht.');
      const name = claimFree(at);
      await persist();
      return { view: view(), reward: name };
    },
    /** Every free reward that is ready. */
    async claimAll() {
      const ready = view().tiers.filter(t => t.free.ready);
      if (!ready.length) throw new Error('Gerade gibt es nichts abzuholen.');
      const names = ready.map(t => claimFree(t.level));
      await persist();
      return { view: view(), count: names.length, rewards: names };
    },
    async buyCase(id, amount) {
      const def = CASES[id];
      if (!def) throw new Error('Unbekannte Kiste.');
      if (!BUY_AMOUNTS.includes(amount)) throw new Error('Ungültige Anzahl.');
      const price = def.price * amount;
      if (data.coins < price) throw new Error('Nicht genug Coins.');
      data.coins -= price;
      data.inventory.cases[id] = (data.inventory.cases[id] || 0) + amount;
      await persist();
      return { view: view(), bought: amount };
    },
    /** Opens one case (or uses a key if none is left). The item is in the inventory right away. */
    async openCase(id) {
      const def = CASES[id];
      if (!def) throw new Error('Unbekannte Kiste.');
      const inv = data.inventory;
      let used;
      if ((inv.cases[id] || 0) > 0) { inv.cases[id] -= 1; used = 'case'; }
      else if (inv.keys > 0) { inv.keys -= 1; used = 'key'; }
      else throw new Error('Keine Kiste übrig. Kauf zuerst eine.');
      const item = pick(def);
      const fresh = grant(item.grant);
      const refund = fresh ? 0 : REFUND[item.rarity];
      data.coins += refund;
      await persist();
      return { view: view(), item: { id: item.id, rarity: item.rarity, icon: item.icon, name: item.name, kind: item.kind }, duplicate: !fresh, refund, used };
    },
  };
}

module.exports = { createSeason, SEASON, XP_PER_LEVEL, DAILY, WEEKLY, CASES, ITEMS };
