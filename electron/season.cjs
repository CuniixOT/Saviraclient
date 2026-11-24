const fs = require('node:fs/promises');
const path = require('node:path');

// Season Pass and quests, kept locally until the Savira server exists. Progress comes from what the
// launcher itself sees: time in game, game starts and servers joined through the launcher.
// Quest XP levels the pass up; each level has a free reward (coins for now) and a premium one.
const SEASON = { id: 1, name: 'Season 1', start: '2026-11-01', end: '2027-01-31' };
const XP_PER_LEVEL = 1000;
const LEVELS = 12;
// Free lane: coins, paid out into the local balance. Premium lane: shown, not yet available.
const REWARDS = [
  [['coins', '100 Coins', 100], ['banner', 'Banner']],
  [['coins', '150 Coins', 150], ['emote', 'Emote: Winken']],
  [['coins', '150 Coins', 150], ['frame', 'Profilrahmen']],
  [['coins', '200 Coins', 200], ['kill', 'Kill-Effekt']],
  [['coins', '200 Coins', 200], ['wings', 'Flügel']],
  [['coins', '250 Coins', 250], ['frame', 'Goldrahmen']],
  [['coins', '250 Coins', 250], ['particles', 'Partikel-Spur']],
  [['coins', '300 Coins', 300], ['title', 'Titel']],
  [['coins', '300 Coins', 300], ['hat', 'Hut']],
  [['coins', '400 Coins', 400], ['cape', 'Animiertes Cape']],
  [['coins', '400 Coins', 400], ['banner', 'Season-Banner']],
  [['coins', '500 Coins', 500], ['wings', 'Flügel II']],
];
// kind: what counts. minutes: time in game; starts: game starts; servers: server joins through the
// launcher; distinct: different servers; days: different days played.
const DAILY = [
  { id: 'play30', title: '30 Minuten spielen', icon: 'clock', kind: 'minutes', max: 30, xp: 150 },
  { id: 'start1', title: 'Minecraft starten', icon: 'play', kind: 'starts', max: 1, xp: 100 },
  { id: 'join1', title: 'Einem Server beitreten', icon: 'globe', kind: 'servers', max: 1, xp: 200 },
];
const WEEKLY = [
  { id: 'play300', title: '5 Stunden spielen', icon: 'clock', kind: 'minutes', max: 300, xp: 400 },
  { id: 'distinct3', title: 'Auf 3 verschiedenen Servern spielen', icon: 'globe', kind: 'distinct', max: 3, xp: 300 },
  { id: 'days3', title: 'An 3 Tagen spielen', icon: 'calendar', kind: 'days', max: 3, xp: 300 },
];

const pad = n => String(n).padStart(2, '0');
const dayKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
// Weeks start on Monday, local time.
function weekKey(date) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7));
  return dayKey(monday);
}
const nextDay = date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
const nextWeek = date => { const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7)); return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7); };
const empty = () => ({ minutes: 0, starts: 0, servers: 0, distinct: [], days: [] });

function createSeason({ file, now = () => new Date() }) {
  let data = { season: SEASON.id, xp: 0, coins: 0, claimedTiers: [], day: null, week: null, daily: empty(), weekly: empty(), claimed: [] };
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
  const questView = (defs, bucket, prefix) => defs.map(q => {
    const cur = Math.min(q.max, progressOf(bucket, q.kind)), key = `${prefix}:${q.id}`;
    return { id: key, title: q.title, icon: q.icon, cur, max: q.max, xp: q.xp, done: cur >= q.max, claimed: data.claimed.includes(key) };
  });
  const level = () => Math.min(LEVELS, Math.floor(data.xp / XP_PER_LEVEL));
  function view() {
    roll();
    const lvl = level(), today = now();
    const tiers = REWARDS.map(([free, premium], i) => {
      const at = i + 1;
      return { level: at, free: { kind: free[0], name: free[1], claimed: data.claimedTiers.includes(at), ready: at <= lvl && !data.claimedTiers.includes(at) }, premium: { kind: premium[0], name: premium[1] } };
    });
    return {
      season: { ...SEASON, endsInDays: Math.max(0, Math.ceil((new Date(`${SEASON.end}T23:59:59`) - today) / 86400000)) },
      xp: data.xp, level: lvl, maxLevel: LEVELS, xpPerLevel: XP_PER_LEVEL, levelXp: lvl >= LEVELS ? XP_PER_LEVEL : data.xp % XP_PER_LEVEL,
      coins: data.coins, tiers,
      daily: questView(DAILY, data.daily, 'd'), weekly: questView(WEEKLY, data.weekly, 'w'),
      dailyResetAt: nextDay(today).getTime(), weeklyResetAt: nextWeek(today).getTime(),
    };
  }
  const record = mutate => async (...args) => {
    roll();
    for (const bucket of [data.daily, data.weekly]) mutate(bucket, ...args);
    await persist();
  };
  return {
    async load() {
      try {
        const raw = JSON.parse(await fs.readFile(file, 'utf8'));
        if (raw?.season === SEASON.id) {
          const bucket = b => ({ minutes: Number(b?.minutes) || 0, starts: Number(b?.starts) || 0, servers: Number(b?.servers) || 0, distinct: Array.isArray(b?.distinct) ? b.distinct.filter(s => typeof s === 'string').slice(0, 50) : [], days: Array.isArray(b?.days) ? b.days.filter(s => typeof s === 'string').slice(0, 8) : [] });
          data = { season: SEASON.id, xp: Math.max(0, Number(raw.xp) || 0), coins: Math.max(0, Number(raw.coins) || 0), claimedTiers: (raw.claimedTiers || []).filter(Number.isInteger), day: raw.day ?? null, week: raw.week ?? null, daily: bucket(raw.daily), weekly: bucket(raw.weekly), claimed: (raw.claimed || []).filter(k => typeof k === 'string') };
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
      data.claimed.push(id); data.xp += quest.xp;
      await persist();
      return { view: view(), xp: quest.xp };
    },
    async claimTier(at) {
      const tier = view().tiers.find(t => t.level === at);
      if (!tier) throw new Error('Unbekannte Stufe.');
      if (!tier.free.ready) throw new Error(tier.free.claimed ? 'Diese Belohnung ist schon abgeholt.' : 'Diese Stufe ist noch nicht erreicht.');
      data.claimedTiers.push(at);
      const reward = REWARDS[at - 1][0];
      if (reward[0] === 'coins') data.coins += reward[2];
      await persist();
      return { view: view(), reward: reward[1] };
    },
  };
}

module.exports = { createSeason, SEASON, XP_PER_LEVEL, DAILY, WEEKLY };
