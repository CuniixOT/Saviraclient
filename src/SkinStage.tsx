import { useEffect, useRef } from 'react';
import type { PlayerObject, SkinViewer } from 'skinview3d';
import type { Emote } from './api';

const REST_YAW = -0.38;            // calm three-quarter view instead of endless spinning
const MODEL_HALF_WIDTH = 12;       // arms plus some room when the body turns
const FIT_HALF_HEIGHT = 16.5;      // what skinview3d fits vertically at zoom 1
const BASE_ZOOM = .8;
const TAG_Y = 22;                  // just above the head; skinview3d default (25) leaves the frame
const SCENE_SHIFT = -3.6;          // centres feet-to-name-tag in view
const MAX_MODEL_PX = 760;          // on huge windows the model stops growing
const EMOTE_FIRST = 1.6, EMOTE_GAP = 8;   // seconds until the first emote and between two
type Move = Exclude<Emote, 'random'>;
const MOVES: Move[] = ['wave', 'cheer', 'dance', 'clap', 'spin', 'think'];
const DURATION: Record<Move, number> = { wave: 2.6, cheer: 2.4, dance: 3.4, clap: 2.4, spin: 1.8, think: 3.2 };
const smooth = (x: number) => { const v = clamp(x, 0, 1); return v * v * (3 - 2 * v); };
/**
 * Blends one emote over the idle pose. local: seconds into the emote, e: 0…1 fade in and out.
 * Arms swing outward with +z on the left and -z on the right; -x raises them forward.
 */
function pose(player: PlayerObject, move: Move, local: number, e: number, duration: number) {
  const { leftArm: la, rightArm: ra, leftLeg: ll, rightLeg: rl, head } = player.skin;
  const mix = (from: number, to: number) => from + (to - from) * e;
  switch (move) {
    case 'wave':
      ra.rotation.z = mix(ra.rotation.z, -2.7 + Math.sin(local * 11) * .38);
      ra.rotation.x = mix(ra.rotation.x, 0);
      head.rotation.z = mix(0, Math.sin(local * 5.5) * .1);
      break;
    case 'cheer':
      la.rotation.z = mix(la.rotation.z, 2.75 + Math.sin(local * 14) * .15);
      ra.rotation.z = mix(ra.rotation.z, -2.75 - Math.sin(local * 14) * .15);
      player.position.y += Math.abs(Math.sin(local * 6.5)) * 1.4 * e;
      head.rotation.x = mix(head.rotation.x, -.25);
      break;
    case 'dance': {
      const beat = Math.sin(local * 8);
      la.rotation.x = mix(la.rotation.x, beat * 1.1);
      ra.rotation.x = mix(ra.rotation.x, -beat * 1.1);
      la.rotation.z = mix(la.rotation.z, .5 + Math.sin(local * 4) * .4);
      ra.rotation.z = mix(ra.rotation.z, -.5 - Math.sin(local * 4) * .4);
      ll.rotation.x = mix(0, beat * .45);
      rl.rotation.x = mix(0, -beat * .45);
      player.rotation.y += Math.sin(local * 4) * .45 * e;
      player.position.y += Math.abs(beat) * .6 * e;
      head.rotation.z = mix(0, Math.sin(local * 8) * .12);
      break;
    }
    case 'clap': {
      const open = .5 + .5 * Math.sin(local * 13);
      la.rotation.x = mix(la.rotation.x, -1.35);
      ra.rotation.x = mix(ra.rotation.x, -1.35);
      la.rotation.z = mix(la.rotation.z, -.22 + open * .5);
      ra.rotation.z = mix(ra.rotation.z, .22 - open * .5);
      break;
    }
    case 'spin': {
      const turn = smooth(local / duration);
      player.rotation.y += turn * Math.PI * 2;
      player.position.y += Math.sin(Math.PI * clamp(local / duration, 0, 1)) * 1.6;
      la.rotation.z = mix(la.rotation.z, .7);
      ra.rotation.z = mix(ra.rotation.z, -.7);
      break;
    }
    case 'think':
      ra.rotation.x = mix(ra.rotation.x, -1.7);
      ra.rotation.z = mix(ra.rotation.z, .42);
      la.rotation.x = mix(la.rotation.x, -.85);
      la.rotation.z = mix(la.rotation.z, -.5);
      head.rotation.x = mix(head.rotation.x, .12);
      head.rotation.z = mix(0, .14 + Math.sin(local * 1.5) * .04);
      break;
  }
}
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const nameTagFont = '48px "MinecraftTen", "SmallCaps", sans-serif';
function makeTag(NameTag: typeof import('skinview3d').NameTagObject, viewer: SkinViewer, name: string) {
  viewer.nameTag = new NameTag(name, { font: nameTagFont, textStyle: '#ffffff', backgroundStyle: 'rgba(0,0,0,0.32)', height: 2.6 });
  if (!viewer.nameTag) return;
  viewer.nameTag.position.y = TAG_Y;
  // Draw over the head instead of being hidden behind it when the head turns.
  viewer.nameTag.material.depthTest = false;
  viewer.nameTag.renderOrder = 10;
}

/**
 * Player model in the middle of the launcher: idles calmly, looks toward the cursor,
 * can be turned by dragging and eases back to its pose. Fits any window size.
 * With an emote set it plays that emote every few seconds; null keeps it calm.
 */
export function SkinStage({ skin, name, paused = false, emote = null, cape = null }: { skin: string | null; name: string; paused?: boolean; emote?: Emote | null; cape?: string | null }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<SkinViewer | null>(null);
  const pausedRef = useRef(paused);
  const emoteRef = useRef(emote);
  emoteRef.current = emote;
  // Latest props for the async scene setup, which may finish after they changed.
  const latest = useRef({ skin, name, cape });
  latest.current = { skin, name, cape };
  const nameTagClass = useRef<typeof import('skinview3d').NameTagObject | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    let disposed = false, observer: ResizeObserver | undefined;
    const cleanups: (() => void)[] = [];

    void import('skinview3d').then(({ SkinViewer, FunctionAnimation, NameTagObject }) => {
      if (disposed) return;
      nameTagClass.current = NameTagObject;
      const viewer = new SkinViewer({ canvas, width: wrap.clientWidth || 300, height: wrap.clientHeight || 400, skin: latest.current.skin || './default-skin.png', zoom: BASE_ZOOM, fov: 38 });
      viewerRef.current = viewer;
      viewer.background = null;
      viewer.controls.enableRotate = false;
      viewer.controls.enableZoom = false;
      viewer.controls.enablePan = false;
      viewer.globalLight.intensity = 2.6;
      viewer.cameraLight.intensity = .6;
      viewer.playerWrapper.position.y = SCENE_SHIFT;
      makeTag(NameTagObject, viewer, latest.current.name);
      if (latest.current.cape) void viewer.loadCape(latest.current.cape);
      viewer.renderPaused = pausedRef.current;

      // Pointer state lives outside React; the render loop reads it every frame.
      const look = { x: 0, y: 0 }, head = { x: 0, y: 0 };
      const drag = { active: false, startX: 0, startYaw: REST_YAW, yaw: REST_YAW };
      let yaw = REST_YAW;
      const still = reducedMotion();
      // Emote schedule, in seconds of animation time.
      let clock = 0, nextAt = EMOTE_FIRST, playing: { move: Move; start: number } | null = null, lastSetting = emoteRef.current;

      viewer.animation = new FunctionAnimation((player, progress, delta) => {
        const k = still ? 1 : 1 - Math.exp(-delta * 7);
        head.x += (look.x - head.x) * k;
        head.y += (look.y - head.y) * k;
        // The body follows the cursor a little; while dragging it follows the hand directly.
        yaw = drag.active ? drag.yaw : yaw + (REST_YAW + head.x * .32 - yaw) * (still ? 1 : 1 - Math.exp(-delta * 4));
        player.rotation.y = yaw;
        player.skin.head.rotation.y = head.x * .55;
        player.skin.head.rotation.x = head.y * .32;
        if (still) return;
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

        clock += delta;
        const setting = emoteRef.current;
        // A newly picked emote shows right away; switching emotes off stops the current one.
        if (setting !== lastSetting) { lastSetting = setting; playing = null; nextAt = clock + .3; }
        if (!setting) return;
        if (!playing && clock >= nextAt && !drag.active) {
          playing = { move: setting === 'random' ? MOVES[Math.floor(Math.random() * MOVES.length)] : setting, start: clock };
        }
        if (playing) {
          const duration = DURATION[playing.move], local = clock - playing.start;
          if (local >= duration) { playing = null; nextAt = clock + EMOTE_GAP; return; }
          pose(player, playing.move, local, smooth(local / .35) * smooth((duration - local) / .35), duration);
        }
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

    return () => { disposed = true; observer?.disconnect(); cleanups.forEach(fn => fn()); viewerRef.current?.dispose(); viewerRef.current = null; };
    // The scene is built once; skin and name updates below reuse it without flicker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void viewerRef.current?.loadSkin(skin || './default-skin.png'); }, [skin]);
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (cape) void viewer.loadCape(cape); else viewer.resetCape();
  }, [cape]);
  useEffect(() => {
    const viewer = viewerRef.current, NameTag = nameTagClass.current;
    if (viewer && NameTag) makeTag(NameTag, viewer, name);
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
