import { useEffect, useRef } from 'react';
import type { PlayerObject, SkinViewer } from 'skinview3d';
import type { Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import { makeReveal } from './skinReveal';
import { applyClip, nextCalmIdle, resetParts, rollIdle, SPECIAL_IDLE, type Clip } from './skinEmotes';

const REST_YAW = -0.38;            // calm three-quarter view instead of endless spinning
const MODEL_HALF_WIDTH = 12;       // arms plus some room when the body turns
const FIT_HALF_HEIGHT = 16.5;      // what skinview3d fits vertically at zoom 1
const BASE_ZOOM = .8;
const TAG_ABOVE_HEAD = 3.4;         // gap between the top of the head and the middle of the name tag
const SCENE_SHIFT = -3.6;          // centres feet-to-name-tag in view
const MAX_MODEL_PX = 760;          // on huge windows the model stops growing
const FADE = .35;                  // seconds an animation takes to blend in and out
const MIN_LOADING_MS = 450;        // the placeholder shows at least this long, like in NoRisk
type Playing = { clip: Clip; start: number };
const smooth = (x: number) => { const v = clamp(x, 0, 1); return v * v * (3 - 2 * v); };
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const nameTagFont = '48px "MinecraftTen", "SmallCaps", sans-serif';
type Three = typeof import('three');
// Like the vanilla name tag: white text on a quarter-black box with one font pixel of padding (48px / 8 = 6).
// skinview3d paints it; its texture goes on two planes back to back, so the name reads the right way from behind too.
function makeTag(NameTag: typeof import('skinview3d').NameTagObject, three: Three, viewer: SkinViewer, name: string, old: Group | null): Group {
  if (old) disposeTag(old);
  const painter = new NameTag(name, { font: nameTagFont, textStyle: '#ffffff', backgroundStyle: 'rgba(0,0,0,0.25)', margin: [6, 6, 6, 6], height: 3 });
  // Drawn over the head instead of being hidden behind it when the head turns.
  const material = new three.MeshBasicMaterial({ transparent: true, alphaTest: 1e-5, depthTest: false });
  const geometry = new three.PlaneGeometry(1, 1);
  const tag = new three.Group();
  for (const turn of [0, Math.PI]) {
    const plane = new three.Mesh(geometry, material);
    plane.rotation.y = turn; plane.renderOrder = 10;
    tag.add(plane);
  }
  // Painted again once the Minecraft font has loaded, with a new texture and size.
  const apply = () => {
    if (material.map !== painter.material.map) material.map?.dispose();
    material.map = painter.material.map; material.needsUpdate = true;
    for (const plane of tag.children) plane.scale.set(painter.scale.x, painter.scale.y, 1);
  };
  apply();
  void painter.painted.then(() => { if (tag.parent) apply(); painter.material.dispose(); });
  viewer.playerObject.add(tag);
  placeTag(tag, viewer.playerObject);
  return tag;
}

function disposeTag(tag: Group) {
  tag.removeFromParent();
  const plane = tag.children[0] as Mesh<PlaneGeometry, MeshBasicMaterial> | undefined;
  plane?.material.map?.dispose(); plane?.material.dispose(); plane?.geometry.dispose();
}

/**
 * The name tag is part of the figure: it sits above the head, turns with the figure and the head,
 * bobs with the breathing and follows the head through the animations. Positions are in player space.
 */
function placeTag(tag: Group, player: PlayerObject) {
  const head = player.skin.head;
  // The head pivot is the neck, eight pixels below the top of the head.
  tag.position.set(head.position.x, player.skin.position.y + head.position.y + 8 * head.scale.y + TAG_ABOVE_HEAD, head.position.z);
  tag.rotation.y = head.rotation.y;
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Player model in the middle of the launcher: idles calmly, looks toward the cursor,
 * can be turned by dragging and eases back to its pose. Fits any window size.
 * With the skin animation on, the skin loads in behind a shimmering placeholder like in NoRisk and then keeps
 * playing the NoRisk idle animations; off keeps it calm.
 */
export function SkinStage({ skin, name, paused = false, animated = false, cape = null }: { skin: string | null; name: string; paused?: boolean; animated?: boolean; cape?: string | null }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<SkinViewer | null>(null);
  const pausedRef = useRef(paused);
  const animatedRef = useRef(animated);
  animatedRef.current = animated;
  // Latest props for the async scene setup, which may finish after they changed.
  const latest = useRef({ skin, name, cape });
  latest.current = { skin, name, cape };
  const nameTagClass = useRef<typeof import('skinview3d').NameTagObject | null>(null);
  const tagRef = useRef<Group | null>(null);
  const threeRef = useRef<Three | null>(null);
  const loadInRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    let disposed = false, observer: ResizeObserver | undefined;
    const cleanups: (() => void)[] = [];

    void Promise.all([import('skinview3d'), import('three')]).then(([{ SkinViewer, FunctionAnimation, NameTagObject }, three]) => {
      if (disposed) return;
      nameTagClass.current = NameTagObject;
      threeRef.current = three;
      const viewer = new SkinViewer({ canvas, width: wrap.clientWidth || 300, height: wrap.clientHeight || 400, skin: latest.current.skin || './default-skin.png', zoom: BASE_ZOOM, fov: 38 });
      viewerRef.current = viewer;
      viewer.background = null;
      viewer.controls.enableRotate = false;
      viewer.controls.enableZoom = false;
      viewer.controls.enablePan = false;
      viewer.globalLight.intensity = 2.6;
      viewer.cameraLight.intensity = .6;
      viewer.playerWrapper.position.y = SCENE_SHIFT;
      tagRef.current = makeTag(NameTagObject, three, viewer, latest.current.name, null);
      if (latest.current.cape) void viewer.loadCape(latest.current.cape);
      viewer.renderPaused = pausedRef.current;

      // Pointer state lives outside React; the render loop reads it every frame.
      const look = { x: 0, y: 0 }, head = { x: 0, y: 0 };
      const drag = { active: false, startX: 0, startYaw: REST_YAW, yaw: REST_YAW };
      let yaw = REST_YAW;
      const still = reducedMotion();
      // Animation schedule, in seconds of animation time. amount fades everything out when switched off.
      let clock = 0, playing: Playing | null = null, amount = 0;
      let ready = !animatedRef.current, loadToken = 0;
      const reveal = makeReveal(viewer, three, () => tagRef.current);
      cleanups.push(() => reveal.dispose());

      // Placeholder while the skin loads, then the skin shows, the placeholder fades out and the animations start.
      const loadIn = () => {
        const token = ++loadToken;
        ready = false; playing = null;
        reveal.start();
        void Promise.all([viewer.loadSkin(latest.current.skin || './default-skin.png'), wait(MIN_LOADING_MS)])
          .catch(() => { /* A broken skin URL keeps the previous texture. */ })
          .then(() => {
            if (disposed || token !== loadToken) return;
            reveal.finish(still); ready = true;
          });
      };
      loadInRef.current = loadIn;
      if (animatedRef.current) loadIn();

      // Next one when the last has finished: a calm idle or, now and then, the special one.
      const next = (): Playing => ({ clip: rollIdle() === 'special' ? SPECIAL_IDLE : nextCalmIdle(), start: clock });

      viewer.animation = new FunctionAnimation((player, progress, delta) => {
        resetParts(player);
        const k = still ? 1 : 1 - Math.exp(-delta * 7);
        head.x += (look.x - head.x) * k;
        head.y += (look.y - head.y) * k;
        // The body follows the cursor a little; while dragging it follows the hand directly.
        yaw = drag.active ? drag.yaw : yaw + (REST_YAW + head.x * .32 - yaw) * (still ? 1 : 1 - Math.exp(-delta * 4));
        player.rotation.y = yaw;
        player.skin.head.rotation.y = head.x * .55;
        player.skin.head.rotation.x = head.y * .32;
        clock += delta;
        // The placeholder stands still in its rest pose; only dragging turns it.
        if (reveal.loading) { player.skin.head.rotation.set(0, 0, 0); player.rotation.y = yaw; }
        // Last in every frame: the name tag follows the head, the placeholder follows both.
        const finishFrame = () => { if (tagRef.current) placeTag(tagRef.current, player); reveal.update(delta); };
        if (still || reveal.loading) return finishFrame();
        const t = progress * 1.6;
        player.skin.leftArm.rotation.z = Math.cos(t) * .03 + Math.PI * .02;
        player.skin.rightArm.rotation.z = Math.cos(t + Math.PI) * .03 - Math.PI * .02;
        player.skin.leftArm.rotation.x = Math.sin(t * .5) * .04;
        player.skin.rightArm.rotation.x = -Math.sin(t * .5) * .04;
        player.position.y = Math.sin(t) * .12;   // breathing
        player.cape.rotation.x = .2 + Math.sin(t * .8) * .05;   // the cape sways a little
        player.skin.leftLeg.rotation.x = 0;
        player.skin.rightLeg.rotation.x = 0;
        player.skin.head.rotation.z = 0;

        const on = animatedRef.current;
        amount += ((on && ready ? 1 : 0) - amount) * (1 - Math.exp(-delta * 8));
        if (!on && amount < .01) playing = null;
        if (on && ready && !playing && !drag.active) playing = next();
        if (playing) {
          const local = clock - playing.start, length = playing.clip.length;
          if (local >= length) playing = null;
          else applyClip(player, playing.clip, local, smooth(local / FADE) * smooth((length - local) / FADE) * amount);
        }
        finishFrame();
      });

      const onMove = (event: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        const cx = rect.left + rect.width / 2, cy = rect.top + rect.height * .3;  // roughly the head
        look.x = clamp((event.clientX - cx) / (window.innerWidth / 2), -1, 1);
        look.y = clamp((event.clientY - cy) / (window.innerHeight / 2), -1, 1);
        if (drag.active) drag.yaw = drag.startYaw + (event.clientX - drag.startX) * .012;
      };
      const onLeave = (event: MouseEvent) => { if (!event.relatedTarget) { look.x = 0; look.y = 0; } };
      const onDown = (event: PointerEvent) => {
        drag.active = true; drag.startX = event.clientX; drag.startYaw = yaw; drag.yaw = yaw;
        canvas.setPointerCapture(event.pointerId); canvas.classList.add('is-dragging');
      };
      const onUp = (event: PointerEvent) => {
        if (!drag.active) return;
        drag.active = false; canvas.classList.remove('is-dragging');
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      };
      const onKey = (event: KeyboardEvent) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { drag.active = false; yaw += event.key === 'ArrowLeft' ? -.4 : .4; }
      };
      const onVisibility = () => { viewer.renderPaused = pausedRef.current || document.hidden; };
      window.addEventListener('pointermove', onMove);
      document.addEventListener('mouseout', onLeave);
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);
      canvas.addEventListener('keydown', onKey);
      document.addEventListener('visibilitychange', onVisibility);
      cleanups.push(() => {
        window.removeEventListener('pointermove', onMove);
        document.removeEventListener('mouseout', onLeave);
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onUp);
        canvas.removeEventListener('keydown', onKey);
        document.removeEventListener('visibilitychange', onVisibility);
      });

      // Fit the whole player: by height normally, narrower zoom when the stage gets tall and thin.
      const fit = () => {
        const w = Math.max(1, Math.round(wrap.clientWidth)), h = Math.max(1, Math.round(wrap.clientHeight));
        viewer.width = w; viewer.height = h;
        const neededAspect = MODEL_HALF_WIDTH / FIT_HALF_HEIGHT;
        viewer.zoom = BASE_ZOOM * Math.min(1, (w / h) / neededAspect) * Math.min(1, MAX_MODEL_PX / h);
      };
      fit();
      observer = new ResizeObserver(fit);
      observer.observe(wrap);
    });

    return () => { disposed = true; observer?.disconnect(); cleanups.forEach(fn => fn()); viewerRef.current?.dispose(); viewerRef.current = null; loadInRef.current = null; if (tagRef.current) disposeTag(tagRef.current); tagRef.current = null; };
    // The scene is built once; skin and name updates below reuse it without flicker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // With the animation on, a new skin loads in behind the silhouette again.
  useEffect(() => {
    if (animatedRef.current && loadInRef.current) loadInRef.current();
    else void viewerRef.current?.loadSkin(skin || './default-skin.png');
  }, [skin]);
  // Switching the skin animation on loads the skin in, like the toggle in NoRisk.
  const wasAnimated = useRef(animated);
  useEffect(() => {
    if (animated && !wasAnimated.current) loadInRef.current?.();
    wasAnimated.current = animated;
  }, [animated]);
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (cape) void viewer.loadCape(cape); else viewer.resetCape();
  }, [cape]);
  useEffect(() => {
    const viewer = viewerRef.current, NameTag = nameTagClass.current, three = threeRef.current;
    if (viewer && NameTag && three) tagRef.current = makeTag(NameTag, three, viewer, name, tagRef.current);
  }, [name]);
  useEffect(() => {
    pausedRef.current = paused;
    if (viewerRef.current) viewerRef.current.renderPaused = paused || document.hidden;
  }, [paused]);

  return <div className="skin-stage" ref={wrapRef}>
    <canvas ref={canvasRef} tabIndex={0} aria-label={`3D-Figur von ${name}. Ziehen oder Pfeiltasten zum Drehen.`} />
    <div className="skin-shadow" />
  </div>;
}
