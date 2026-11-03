import type { SkinViewer } from 'skinview3d';
import type { SkinVariant } from './api';

// A browser allows few WebGL canvases at once, so the cards show pictures: one hidden viewer renders
// them in turn and is released when none is waiting.
const cache = new Map<string, Promise<string>>();
let viewer: Promise<SkinViewer> | null = null, waiting = 0, queue: Promise<unknown> = Promise.resolve();

const openViewer = () => viewer ??= import('skinview3d').then(({ SkinViewer }) => {
  const created = new SkinViewer({ canvas: document.createElement('canvas'), width: 240, height: 300, pixelRatio: 2, zoom: 1, fov: 38, renderPaused: true, preserveDrawingBuffer: true });
  created.background = null;
  created.globalLight.intensity = 2.6;
  created.cameraLight.intensity = .6;
  // Turned a little, looking at the viewer, in mid-step with one arm thrown up.
  const { playerObject: player } = created, { skin } = player;
  player.rotation.y = .3;
  skin.head.rotation.set(.04, -.14, -.06);
  skin.rightArm.rotation.set(.1, 0, -2.35);
  skin.leftArm.rotation.set(.35, 0, .16);
  skin.rightLeg.rotation.set(-.45, 0, -.16);
  skin.leftLeg.rotation.set(.45, 0, .16);
  return created;
});

function render(png: string, variant: SkinVariant) {
  waiting++;
  const picture = queue.then(async () => {
    const shared = await openViewer();
    await shared.loadSkin(png, { model: variant === 'slim' ? 'slim' : 'default' });
    shared.render();
    return shared.canvas.toDataURL('image/png');
  }).finally(() => {
    if (--waiting) return;
    void viewer?.then(shared => shared.dispose());
    viewer = null;
  });
  queue = picture.catch(() => {});
  return picture;
}

/** The skin in its card pose as a PNG data URL. */
export function skinPose(png: string, variant: SkinVariant) {
  const key = `${variant}:${png}`;
  let picture = cache.get(key);
  if (!picture) {
    picture = render(png, variant);
    picture.catch(() => cache.delete(key));   // Tried again the next time the card shows.
    cache.set(key, picture);
  }
  return picture;
}
