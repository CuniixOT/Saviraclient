// The skin gallery of skinmc.net for the "Alle Skins" tab. SkinMC has no public list API, so the
// pages are read like a browser shows them (robots.txt allows it); the texture comes from its render API.
const { assertSkin } = require('./skins.cjs');

const ORIGIN = 'https://skinmc.net';
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TAG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PAGE_TTL = 5 * 60_000;
const MAX_TEXTURES = 400;

const decode = text => text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

/** Skin cards of a list page: id and uploader (null for anonymous ones). */
function parseSkins(html) {
  const marker = /<a href="https:\/\/skinmc\.net\/skins\/([0-9a-f-]{36})"\s*class="card elevated-card/g;
  const starts = [...html.matchAll(marker)];
  const seen = new Set(), skins = [];
  starts.forEach((match, i) => {
    const id = match[1];
    if (!ID.test(id) || seen.has(id)) return;
    seen.add(id);
    const card = html.slice(match.index, starts[i + 1]?.index ?? match.index + 6000);
    const author = /account-info[\s\S]*?<span class="rounded-0[^"]*"\s*>\s*([^<]{1,40}?)\s*<\/span>/.exec(card)?.[1];
    skins.push({ id, author: author ? decode(author) : null });
  });
  return skins;
}

/** Tags offered on the list page, most used first. */
function parseTags(html) {
  const tags = [], seen = new Set();
  for (const match of html.matchAll(/href="https:\/\/skinmc\.net\/skins\/tagged\/([a-z0-9-]+)"[^>]*>(?:(?!<\/a>)[\s\S]){0,900}?<span class="small[^"]*">\s*([^<]{1,40}?)\s*<\/span>\s*<span class="opacity-50[^"]*">\s*(\d+)\s*<\/span>/g)) {
    if (!TAG.test(match[1]) || seen.has(match[1])) continue;
    seen.add(match[1]);
    tags.push({ id: match[1], name: decode(match[2]), count: Number(match[3]) });
  }
  return tags;
}

/** The link of the next page, only when it stays on SkinMC's skin lists. */
function parseNext(html) {
  const href = /<a[^>]*rel="next"[^>]*href="([^"]+)"|<a[^>]*href="([^"]+)"[^>]*rel="next"/.exec(html);
  const url = href ? decode(href[1] || href[2]) : null;
  return url && isListUrl(url) ? url : null;
}

function isListUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === ORIGIN && /^\/skins(\/tagged\/[a-z0-9-]+)?$/.test(url.pathname) && !url.username && !url.password;
  } catch { return false; }
}

function createSkinMc({ fetchImpl = fetch, now = Date.now } = {}) {
  const pages = new Map(), textures = new Map();
  async function get(url, accept) {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(20000), redirect: 'error', headers: { 'User-Agent': 'Savira-Launcher (+https://github.com/CuniixOT/Saviraclient)', Accept: accept } });
    if (!response.ok) throw new Error(`SkinMC ist gerade nicht erreichbar (${response.status}).`);
    return response;
  }
  async function page(url) {
    const cached = pages.get(url);
    if (cached && now() - cached.at < PAGE_TTL) return cached.html;
    const html = await (await get(url, 'text/html')).text();
    pages.set(url, { at: now(), html });
    if (pages.size > 60) pages.delete(pages.keys().next().value);
    return html;
  }
  return {
    /** One list page: newest skins or those with a tag; `next` continues where the last page ended. */
    async browse({ tag = null, next = null } = {}) {
      if (tag !== null && (typeof tag !== 'string' || !TAG.test(tag) || tag.length > 40)) throw new Error('Unbekannter Tag.');
      if (next !== null && (typeof next !== 'string' || !isListUrl(next))) throw new Error('Ungültige Seite.');
      const html = await page(next || (tag ? `${ORIGIN}/skins/tagged/${tag}` : `${ORIGIN}/skins`));
      return { skins: parseSkins(html), next: parseNext(html), tags: next || tag ? null : parseTags(html) };
    },
    /** The skin texture as a PNG data URL. */
    async texture(id) {
      if (typeof id !== 'string' || !ID.test(id)) throw new Error('Unbekannter Skin.');
      if (!textures.has(id)) {
        const response = await get(`${ORIGIN}/api/v1/renders/skins/${id}/skin`, 'image/png');
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > 200_000) throw new Error('Die Datei ist zu groß.');
        textures.set(id, `data:image/png;base64,${assertSkin(bytes).toString('base64')}`);
        if (textures.size > MAX_TEXTURES) textures.delete(textures.keys().next().value);
      }
      return textures.get(id);
    }
  };
}

module.exports = { createSkinMc, parseSkins, parseTags, parseNext, isListUrl };
