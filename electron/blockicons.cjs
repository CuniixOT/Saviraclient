const fs = require('node:fs/promises');
const path = require('node:path');
const { unzipSync } = require('fflate');
const { MANIFEST, request, verifiedFile } = require('./minecraft.cjs');

/*
 * Block textures as profile icons. Nothing from Mojang is bundled: they come out of the Minecraft
 * client jar the launcher already has, or the newest one downloaded from Mojang once, and are cached.
 */
const BLOCKS = [
  'diamond_block', 'gold_block', 'iron_block', 'emerald_block', 'netherite_block', 'redstone_block', 'lapis_block', 'coal_block',
  'copper_block', 'amethyst_block', 'raw_gold_block', 'raw_iron_block', 'quartz_block_side', 'diamond_ore', 'emerald_ore', 'gold_ore',
  'iron_ore', 'coal_ore', 'redstone_ore', 'lapis_ore', 'deepslate_diamond_ore', 'ancient_debris_side', 'bricks', 'bookshelf',
  'crafting_table_front', 'tnt_side', 'obsidian', 'crying_obsidian', 'glowstone', 'honeycomb_block', 'nether_wart_block', 'sponge',
  'oak_planks', 'spruce_planks', 'dark_oak_planks', 'cherry_planks', 'crimson_planks', 'warped_planks', 'oak_log', 'birch_log',
  'stone', 'cobblestone', 'mossy_cobblestone', 'andesite', 'granite', 'diorite', 'deepslate', 'dirt',
  'grass_block_side', 'sand', 'gravel', 'clay', 'snow', 'ice', 'packed_ice', 'blue_ice',
  'pumpkin_side', 'jack_o_lantern', 'melon_side', 'hay_block_side', 'slime_block', 'honey_block_side', 'target_side', 'shroomlight',
  'mushroom_stem', 'red_mushroom_block', 'dark_prismarine', 'purpur_block', 'end_stone', 'end_stone_bricks', 'nether_bricks', 'red_nether_bricks',
  'netherrack', 'soul_sand', 'blackstone', 'gilded_blackstone', 'warped_wart_block', 'terracotta', 'white_concrete', 'black_concrete',
  'red_wool', 'blue_wool', 'lime_wool', 'ochre_froglight_side', 'verdant_froglight_side', 'pearlescent_froglight_side', 'chiseled_copper', 'oxidized_copper',
  'furnace_front', 'jukebox_side', 'note_block', 'lodestone_side', 'chiseled_stone_bricks', 'stone_bricks', 'mud_bricks', 'packed_mud',
  'tuff_bricks', 'calcite', 'dripstone_block', 'moss_block', 'bamboo_block', 'glass', 'beacon', 'sculk_catalyst_side'
];
const CACHE_VERSION = 1;

// Only single 16×16 frames; animated textures are taller strips.
function is16(png) {
  return png.length > 24 && png.readUInt32BE(0) === 0x89504e47 && png.readUInt32BE(16) === 16 && png.readUInt32BE(20) === 16;
}

// A release client jar some profile has downloaded already, newest first.
async function localClientJar(root) {
  const found = [];
  let instances = [];
  try { instances = await fs.readdir(path.join(root, 'instances')); } catch { return null; }
  for (const instance of instances) {
    const versions = path.join(root, 'instances', instance, 'versions');
    let ids = [];
    try { ids = await fs.readdir(versions); } catch { continue; }
    for (const id of ids) {
      if (!/^\d+\.\d+(\.\d+)?$/.test(id)) continue;
      const jar = path.join(versions, id, `${id}.jar`);
      try { found.push({ jar, time: (await fs.stat(jar)).mtimeMs }); } catch { /* Not downloaded. */ }
    }
  }
  return found.sort((a, b) => b.time - a.time)[0]?.jar || null;
}

async function downloadClientJar(root) {
  const manifest = JSON.parse((await request(MANIFEST)).toString());
  const entry = manifest.versions.find(version => version.id === manifest.latest.release);
  const dir = path.join(root, 'cache', 'icon-client');
  const version = JSON.parse((await verifiedFile(entry.url, path.join(dir, `${entry.id}.json`), entry.sha1)).toString());
  const jar = path.join(dir, `${entry.id}.jar`);
  await verifiedFile(version.downloads.client.url, jar, version.downloads.client.sha1);
  return jar;
}

/** [{ id, png }] with png as a data URL. */
async function blockIcons(root) {
  const cacheFile = path.join(root, 'cache', 'block-icons.json');
  try {
    const cached = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
    if (cached.version === CACHE_VERSION && Array.isArray(cached.icons) && cached.icons.length) return cached.icons;
  } catch { /* Not cached yet. */ }
  const jar = await localClientJar(root) || await downloadClientJar(root);
  const wanted = new Map(BLOCKS.map(name => [`assets/minecraft/textures/block/${name}.png`, name]));
  const entries = unzipSync(new Uint8Array(await fs.readFile(jar)), { filter: file => wanted.has(file.name) });
  const icons = BLOCKS.flatMap(name => {
    const png = entries[`assets/minecraft/textures/block/${name}.png`];
    return png && is16(Buffer.from(png)) ? [{ id: name, png: `data:image/png;base64,${Buffer.from(png).toString('base64')}` }] : [];
  });
  if (!icons.length) throw new Error('In der Minecraft-Datei wurden keine Block-Texturen gefunden.');
  await fs.mkdir(path.dirname(cacheFile), { recursive: true });
  await fs.writeFile(cacheFile, JSON.stringify({ version: CACHE_VERSION, icons }));
  return icons;
}

module.exports = { blockIcons, BLOCKS };
