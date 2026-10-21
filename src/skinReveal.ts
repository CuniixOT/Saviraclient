import type { SkinViewer } from 'skinview3d';
import type { Mesh, Object3D } from 'three';

type Three = typeof import('three');
const PARTS = ['head', 'body', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg'] as const;
const FADE_SECONDS = .4;           // the placeholder fades out over the real skin, as in NoRisk

const accentColor = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5ccf95';

// Dark accent with a bright stripe running diagonally across the screen, bottom left to top right.
const shimmerShader = `
  uniform float time;
  uniform vec2 resolution;
  uniform vec3 accent;
  uniform float opacity;
  void main() {
    vec2 screen = gl_FragCoord.xy / resolution;
    float along = (screen.x + screen.y) / 2.0;
    float stripe = fract(time * 1.2) * 2.0 - .5;
    float glow = smoothstep(.22, 0.0, abs(along - stripe));
    gl_FragColor = vec4(mix(accent * .18, accent, glow), opacity);
  }`;

/**
 * Loading placeholder like the skeleton of the NoRisk launcher: while the skin loads the figure is a
 * flat shape in the accent colour with a light stripe running over it, plus an empty name tag; the
 * real skin stays hidden. Once loaded, the skin shows at once and the placeholder fades out above it.
 */
export function makeReveal(viewer: SkinViewer, three: Three, tagAnchor: () => Object3D | null) {
  const player = viewer.playerObject;
  const material = new three.ShaderMaterial({
    uniforms: { time: { value: 0 }, resolution: { value: new three.Vector2(1, 1) }, accent: { value: new three.Color() }, opacity: { value: 1 } },
    vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: shimmerShader,
    side: three.DoubleSide, transparent: true, depthTest: false, depthWrite: false,
  });

  // Copies of the inner meshes wear the placeholder; the real meshes are only hidden.
  const sources: Mesh[] = PARTS.map(part => player.skin[part].innerLayer as Mesh);
  const copies = sources.map(source => {
    const copy = new three.Mesh(source.geometry, material);
    copy.renderOrder = 998;
    source.parent!.add(copy);
    return copy;
  });
  const tag = new three.Mesh(new three.PlaneGeometry(1, 1), material);
  tag.renderOrder = 999;
  player.add(tag);
  const real = (): Object3D[] => {
    const anchor = tagAnchor();
    return [...PARTS.flatMap(part => [player.skin[part].innerLayer, player.skin[part].outerLayer] as Object3D[]), player.cape.cape, ...(anchor ? [anchor] : [])];
  };

  let phase: 'off' | 'loading' | 'fading' = 'off', time = 0, fadeStart = 0;
  const showPlaceholder = (on: boolean) => { for (const copy of [...copies, tag]) copy.visible = on; };
  const showReal = (on: boolean) => { for (const object of real()) object.visible = on; };
  showPlaceholder(false);

  return {
    /** True while the placeholder stands in for the skin; the figure then keeps its rest pose. */
    get loading() { return phase === 'loading'; },
    start() {
      material.uniforms.accent.value.set(accentColor());
      material.uniforms.opacity.value = 1;
      phase = 'loading';
      showPlaceholder(true); showReal(false);
    },
    /** The skin has loaded: it shows at once, the placeholder fades out above it. */
    finish(instant: boolean) {
      if (phase === 'off') return;
      showReal(true);
      if (instant) { phase = 'off'; showPlaceholder(false); return; }
      phase = 'fading'; fadeStart = time;
    },
    update(delta: number) {
      if (phase === 'off') return;
      time += delta;
      material.uniforms.time.value = time;
      viewer.renderer.getDrawingBufferSize(material.uniforms.resolution.value);
      copies.forEach((copy, i) => { copy.position.copy(sources[i].position); copy.scale.copy(sources[i].scale); });
      const anchor = tagAnchor();
      // Covers the name tag exactly: same place, turn and size as its text plane.
      if (anchor) { tag.position.copy(anchor.position); tag.rotation.y = anchor.rotation.y; if (anchor.children[0]) tag.scale.copy(anchor.children[0].scale); }
      // A name tag made while loading (account switch) must stay hidden too.
      if (phase === 'loading') { showReal(false); return; }
      material.uniforms.opacity.value = Math.max(0, 1 - (time - fadeStart) / FADE_SECONDS);
      if (material.uniforms.opacity.value === 0) { phase = 'off'; showPlaceholder(false); }
    },
    dispose() {
      for (const copy of [...copies, tag]) copy.removeFromParent();
      tag.geometry.dispose(); material.dispose();
    },
  };
}
