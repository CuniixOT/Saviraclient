const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function normalizeSkinUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.hostname !== 'textures.minecraft.net' || !url.pathname.startsWith('/texture/')) {
    throw new Error('Unbekannte Skin-Quelle.');
  }
  url.protocol = 'https:';
  return url;
}

function validSkinPng(bytes) {
  return Buffer.isBuffer(bytes) && bytes.length >= 24 && bytes.length <= 2_000_000 && bytes.subarray(0, 8).equals(PNG_SIGNATURE);
}

module.exports = { normalizeSkinUrl, validSkinPng };
