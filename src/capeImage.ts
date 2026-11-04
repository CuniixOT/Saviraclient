// Turns cape pictures from anywhere into what Savira stores: a 2:1 PNG of 64x32 or a larger power of two.
// Recognised by their aspect ratio: Minecraft capes (2:1, any size), LabyMod capes (only the 22x17 cape
// part of the texture) and OptiFine capes (46x22). Any other picture goes onto both sides of the cape.
const WIDTHS = [64, 128, 256, 512, 1024];
const PICTURE_WIDTH = 512;
type Layout = { kind: 'minecraft' | 'labymod' | 'optifine' | 'picture'; cols: number; rows: number };
const LAYOUTS: Layout[] = [
  { kind: 'minecraft', cols: 64, rows: 32 },
  { kind: 'labymod', cols: 22, rows: 17 },
  { kind: 'optifine', cols: 46, rows: 22 },
];
const NOTES: Record<Layout['kind'], string> = {
  minecraft: 'Auf eine Minecraft-Capegröße umgerechnet.',
  labymod: 'LabyMod-Cape erkannt und ins Minecraft-Format übertragen.',
  optifine: 'OptiFine-Cape erkannt und ins Minecraft-Format übertragen.',
  picture: 'Kein Cape-Format erkannt: Das Bild liegt jetzt auf Vorder- und Rückseite.',
};

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Das Bild konnte nicht gelesen werden.'));
  image.src = src;
});
const layoutOf = (width: number, height: number) => LAYOUTS.find(layout => Math.abs(width / height - layout.cols / layout.rows) / (layout.cols / layout.rows) < .025) ?? null;
/** Smallest stored width that keeps the picture's detail, at most 1024. */
const targetWidth = (pixelsPerCell: number) => WIDTHS.find(width => width / 64 >= pixelsPerCell - .01) ?? WIDTHS[WIDTHS.length - 1];

function canvasFor(width: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = width / 2;
  return { canvas, ctx: canvas.getContext('2d')! };
}
// Pixel art stays sharp when it grows; large pictures are shrunk smoothly.
function draw(ctx: CanvasRenderingContext2D, image: HTMLImageElement, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) {
  ctx.imageSmoothingEnabled = dw < sw;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
}

/** A cape PNG Savira accepts, plus what was done to the picture (null when it already fitted). */
export async function normalizeCape(src: string): Promise<{ png: string; note: string | null }> {
  const image = await loadImage(src);
  const { naturalWidth: w, naturalHeight: h } = image;
  if (!w || !h) throw new Error('Das Bild ist leer.');
  const layout = layoutOf(w, h);
  if (layout?.kind === 'minecraft' && WIDTHS.includes(w) && h * 2 === w && src.startsWith('data:image/png')) return { png: src, note: null };

  if (layout) {
    // The picture covers the first cols x rows cells of the 64x32 grid; the rest stays transparent.
    const { canvas, ctx } = canvasFor(targetWidth(w / layout.cols));
    const cell = canvas.width / 64;
    draw(ctx, image, 0, 0, w, h, 0, 0, layout.cols * cell, layout.rows * cell);
    return { png: canvas.toDataURL('image/png'), note: NOTES[layout.kind] };
  }

  // Any other picture: cropped to 10:16 onto the outer and inner side, edges in its average colour.
  const { canvas, ctx } = canvasFor(PICTURE_WIDTH);
  const cell = canvas.width / 64;
  const crop = w / h > 10 / 16 ? { sw: h * 10 / 16, sh: h } : { sw: w, sh: w * 16 / 10 };
  const sx = (w - crop.sw) / 2, sy = (h - crop.sh) / 2;
  draw(ctx, image, 0, 0, w, h, 0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = `rgb(${r} ${g} ${b})`;
  ctx.fillRect(0, 0, 22 * cell, 17 * cell);
  for (const x of [1, 12]) draw(ctx, image, sx, sy, crop.sw, crop.sh, x * cell, cell, 10 * cell, 16 * cell);
  return { png: canvas.toDataURL('image/png'), note: NOTES.picture };
}
