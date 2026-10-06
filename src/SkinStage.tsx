import { useEffect, useRef } from 'react';
import type { SkinViewer } from 'skinview3d';

const REST_YAW = -0.38;            // calm three-quarter view instead of endless spinning
const MODEL_HALF_WIDTH = 12;       // arms plus some room when the body turns
const FIT_HALF_HEIGHT = 16.5;      // what skinview3d fits vertically at zoom 1
const BASE_ZOOM = .8;
const TAG_Y = 22;                  // just above the head; skinview3d default (25) leaves the frame
const SCENE_SHIFT = -3.6;          // centres feet-to-name-tag in view
const MAX_MODEL_PX = 760;          // on huge windows the model stops growing
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
 */
export function SkinStage({ skin, name, paused = false }: { skin: string | null; name: string; paused?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<SkinViewer | null>(null);
  const pausedRef = useRef(paused);
  // Latest props for the async scene setup, which may finish after they changed.
  const latest = useRef({ skin, name });
  latest.current = { skin, name };
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
      viewer.renderPaused = pausedRef.current;

      // Pointer state lives outside React; the render loop reads it every frame.
      const look = { x: 0, y: 0 }, head = { x: 0, y: 0 };
      const drag = { active: false, startX: 0, startYaw: REST_YAW, yaw: REST_YAW };
      let yaw = REST_YAW;
      const still = reducedMotion();

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
