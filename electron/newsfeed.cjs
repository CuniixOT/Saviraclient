// Feeds of the "Neuigkeiten" page. Minecraft and Mojang come from the feeds the official launcher
// reads (launchercontent.mojang.com), Savira's posts from news/news.json in the repository (so a
// new post needs no launcher update) and its changelog from the GitHub releases. Each feed is
// cached for a while; one that fails returns nothing and the others still show.
const MOJANG = 'https://launchercontent.mojang.com';
const REPO = 'CuniixOT/Saviraclient';
const SAVIRA_NEWS = `https://raw.githubusercontent.com/${REPO}/main/news/news.json`;
const RELEASES = `https://api.github.com/repos/${REPO}/releases?per_page=12`;
const TTL = 15 * 60_000;
const HTTPS = /^https:\/\//;

const decode = text => String(text || '').replace(/&nbsp;/g, ' ').replace(/&amp;|&#38;?/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—').replace(/&hellip;/g, '…').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const clip = (text, max) => { const s = decode(text).replace(/\s+/g, ' ').trim(); return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s; };
const isoDate = value => { const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };
const mojangImage = url => typeof url === 'string' && url.startsWith('/') ? MOJANG + url : null;

/** HTML of an article or patch note as plain blocks: headings, paragraphs and list items. */
// Read tag by tag: Mojang's patch notes leave <p> and <li> open.
function blocks(html) {
  const out = [];
  let kind = 'text', text = '';
  const flush = () => { const t = decode(text).replace(/\s+/g, ' ').trim(); if (t && out.length < 400) out.push({ kind, text: t.slice(0, 1200) }); text = ''; };
  for (const m of String(html || '').matchAll(/<(\/?)([a-z0-9]+)[^>]*>|([^<]+)/gi)) {
    if (m[3] !== undefined) { text += m[3]; continue; }
    const tag = m[2].toLowerCase(), closing = m[1] === '/';
    if (tag === 'br') { text += ' '; continue; }
    if (/^(h[1-6]|p|li|ul|ol|div|blockquote)$/.test(tag)) {
      flush();
      if (!closing) kind = /^h/.test(tag) ? 'heading' : tag === 'li' ? 'item' : 'text';
      else kind = 'text';
    }
  }
  flush();
  return out;
}

/** Lines of a release body ("- …") as changelog items. */
function releaseItems(body) {
  return String(body || '').split(/\r?\n/).map(line => line.trim()).filter(line => /^[-*] /.test(line)).map(line => line.slice(2).replace(/\*\*/g, '').trim()).filter(Boolean).slice(0, 20);
}

function createNewsFeed({ fetchImpl = fetch, now = Date.now, log = console } = {}) {
  const cache = new Map();
  async function json(url) {
    const hit = cache.get(url);
    if (hit && now() - hit.at < TTL) return hit.data;
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Savira-Launcher (+https://github.com/CuniixOT/Saviraclient)', Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    cache.set(url, { at: now(), data });
    return data;
  }
  const safely = async (label, work) => { try { return await work(); } catch (error) { log.warn?.(`News: ${label} nicht erreichbar`, error?.message || error); return []; } };

  // Minecraft: the articles of minecraft.net in the launcher feed, without the spin-off games.
  const minecraft = () => safely('Minecraft', async () => (await json(`${MOJANG}/v2/news.json`)).entries
    .filter(e => e && typeof e.title === 'string' && /^Minecraft(: Java Edition| for Windows)?$/.test(e.category || ''))
    .slice(0, 30)
    .map(e => ({
      id: `mc:${e.id}`, src: 'minecraft', type: 'news', title: clip(e.title, 140), text: clip(e.text, 320), date: isoDate(e.date),
      author: e.category === 'Minecraft: Java Edition' ? 'Minecraft: Java Edition' : 'Minecraft',
      image: mojangImage(e.newsPageImage?.url) || mojangImage(e.playPageImage?.url),
      link: HTTPS.test(e.readMoreLink || '') ? e.readMoreLink : null, body: blocks(e.articleBody),
    })));
  // Mojang: the Java Edition patch notes (releases, snapshots, pre-releases) Mojang publishes.
  const mojang = () => safely('Mojang', async () => (await json(`${MOJANG}/v2/javaPatchNotes.json`)).entries
    .filter(e => e && typeof e.title === 'string')
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 30)
    .map(e => ({
      id: `mj:${e.id}`, src: 'mojang', type: 'patch', title: clip(e.title, 140), text: clip(e.shortText, 320), date: isoDate(e.date),
      author: 'Mojang Studios', version: typeof e.version === 'string' ? e.version.slice(0, 40) : null,
      image: mojangImage(e.image?.url), link: null, bodyPath: /^javaPatchNotes\/[\w.-]+\.json$/.test(e.contentPath || '') ? e.contentPath : null,
    })));
  // Savira: posts from the repository; images may be https links or paths inside the repository.
  const saviraNews = () => safely('Savira-News', async () => {
    const data = await json(SAVIRA_NEWS);
    return (Array.isArray(data?.posts) ? data.posts : []).slice(0, 30).filter(p => p && typeof p.title === 'string').map((p, i) => ({
      id: `sv:${typeof p.id === 'string' ? p.id.slice(0, 60) : i}`, src: 'client', type: 'news', title: clip(p.title, 140), text: clip(p.text, 320), date: isoDate(p.date),
      author: typeof p.author === 'string' ? clip(p.author, 40) : 'Savira-Team',
      image: typeof p.image === 'string' ? (HTTPS.test(p.image) ? p.image : /^[\w/.-]+\.(png|jpe?g|webp)$/i.test(p.image) && !p.image.includes('..') ? `https://raw.githubusercontent.com/${REPO}/main/news/${p.image}` : null) : null,
      link: typeof p.link === 'string' && HTTPS.test(p.link) ? p.link : null,
      body: (Array.isArray(p.body) ? p.body : []).filter(t => typeof t === 'string').slice(0, 40).map(t => ({ kind: 'text', text: clip(t, 1200) })),
    }));
  });
  // Savira's changelog: the GitHub releases with their notes.
  const changelog = () => safely('Savira-Releases', async () => (await json(RELEASES))
    .filter(r => r && !r.draft && typeof r.tag_name === 'string')
    .map(r => ({ id: `rel:${r.tag_name}`, src: 'client', version: r.tag_name.slice(0, 20), title: clip(r.name || r.tag_name, 80), date: isoDate(r.published_at), items: releaseItems(r.body) })));

  return {
    /** Everything at once: news and patch notes newest first, plus the changelog. */
    async all() {
      const [mc, mj, sv, log] = await Promise.all([minecraft(), mojang(), saviraNews(), changelog()]);
      const items = [...sv, ...mc, ...mj].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      return { items, changelog: log, sources: { savira: sv.length > 0 || log.length > 0, minecraft: mc.length > 0, mojang: mj.length > 0 } };
    },
    /** The full text of a Java patch note. */
    async patch(bodyPath) {
      if (typeof bodyPath !== 'string' || !/^javaPatchNotes\/[\w.-]+\.json$/.test(bodyPath)) throw new Error('Unbekannte Patchnotes.');
      const data = await json(`${MOJANG}/v2/${bodyPath}`);
      return blocks(data?.body);
    },
  };
}

module.exports = { createNewsFeed, blocks, releaseItems };
