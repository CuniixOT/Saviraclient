import type { PlayerObject } from 'skinview3d';
// Idle animations of the NoRisk launcher, unchanged (GPL-3.0, see THIRD_PARTY_NOTICES.md).
import launcherIdle from './assets/emotes/launcheridle.animation.json';
import launcherIdle2 from './assets/emotes/launcheridle2.animation.json';
import launcherIdle3 from './assets/emotes/launcheridle3.animation.json';

/*
 * Player for Blockbench animations in the Bedrock format (what Emotecraft and NoRisk use) on the
 * skinview3d model. Blockbench looks at the player from behind (it faces -Z), skinview3d from the
 * front (+Z), so X and Z flip; rotations are degrees in Z-Y-X order, positions are pixels.
 */
type Vec = [number, number, number];
type Key = { time: number; pre: Vec; post: Vec };
type Channel = 'rotation' | 'position' | 'scale';
type Part = 'head' | 'body' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg';
export type Clip = { length: number; tracks: Partial<Record<Part, Partial<Record<Channel, Key[]>>>> };

const BONES: Record<string, Part> = { bipedHead: 'head', bipedBody: 'body', bipedRightArm: 'rightArm', bipedLeftArm: 'leftArm', bipedRightLeg: 'rightLeg', bipedLeftLeg: 'leftLeg' };
const PARTS = Object.values(BONES);
// Where skinview3d puts each part when it stands still.
const REST: Record<Part, Vec> = { head: [0, 0, 0], body: [0, -6, 0], rightArm: [-5, -2, 0], leftArm: [5, -2, 0], rightLeg: [-1.9, -12, -0.1], leftLeg: [1.9, -12, -0.1] };
const CAPE_REST: Vec = [0, 8, -2];
const NECK_TO_CAPE: Vec = [0, 0, -2];
const rad = Math.PI / 180;

// A keyframe is [x, y, z], { vector }, or { pre, post } with either of those inside.
type RawVec = Vec | { vector: Vec };
type RawKey = RawVec | { pre?: RawVec; post?: RawVec };
type AnimationFile = { animations: Record<string, { animation_length: number; bones: Record<string, Partial<Record<Channel, Record<string, RawKey> | RawVec>>> }> };
const vec = (raw: RawVec): Vec => Array.isArray(raw) ? raw : raw.vector;

function parse(file: AnimationFile): Clip {
  const animation = Object.values(file.animations)[0];
  const tracks: Clip['tracks'] = {};
  for (const [bone, channels] of Object.entries(animation.bones)) {
    const part = BONES[bone];
    if (!part) continue;
    tracks[part] = {};
    for (const [channel, raw] of Object.entries(channels) as [Channel, Record<string, RawKey> | RawVec][]) {
      const frames = Array.isArray(raw) || 'vector' in raw ? { 0: raw as RawVec } : raw;
      tracks[part][channel] = Object.entries(frames).map(([time, key]) => {
        if (Array.isArray(key) || 'vector' in key) return { time: Number(time), pre: vec(key), post: vec(key) };
        const post = vec(key.post ?? key.pre!);
        return { time: Number(time), pre: key.pre ? vec(key.pre) : post, post };
      }).sort((a, b) => a.time - b.time);
    }
  }
  return { length: animation.animation_length, tracks };
}

// Uniform Catmull-Rom, the same curve Blockbench draws between two keyframes.
function catmull(p0: number, p1: number, p2: number, p3: number, t: number) {
  const v0 = (p2 - p0) / 2, v1 = (p3 - p1) / 2, t2 = t * t;
  return (2 * p1 - 2 * p2 + v0 + v1) * t2 * t + (-3 * p1 + 3 * p2 - 2 * v0 - v1) * t2 + v0 * t + p1;
}

function sample(keys: Key[], time: number): Vec {
  if (time <= keys[0].time) return keys[0].post;
  const i = keys.findIndex((key, index) => index === keys.length - 1 || keys[index + 1].time > time);
  if (i === keys.length - 1) return keys[i].post;
  const a = keys[i], b = keys[i + 1];
  const p0 = keys[i - 1]?.post ?? a.post, p3 = keys[i + 2]?.pre ?? b.pre;
  const t = (time - a.time) / (b.time - a.time);
  return [0, 1, 2].map(axis => catmull(p0[axis], a.post[axis], b.pre[axis], p3[axis], t)) as Vec;
}

// Turns a point like three.js does for Euler order 'ZYX': X first, then Y, then Z.
function turn([x, y, z]: Vec, r: { x: number; y: number; z: number }): Vec {
  [y, z] = [y * Math.cos(r.x) - z * Math.sin(r.x), y * Math.sin(r.x) + z * Math.cos(r.x)];
  [x, z] = [x * Math.cos(r.y) + z * Math.sin(r.y), -x * Math.sin(r.y) + z * Math.cos(r.y)];
  [x, y] = [x * Math.cos(r.z) - y * Math.sin(r.z), x * Math.sin(r.z) + y * Math.cos(r.z)];
  return [x, y, z];
}

/** Puts every part back where skinview3d has it, before the idle pose of the next frame. */
export function resetParts(player: PlayerObject) {
  for (const part of PARTS) {
    const object = player.skin[part];
    object.position.set(...REST[part]);
    object.scale.set(1, 1, 1);
    object.rotation.set(0, 0, 0, 'XYZ');
  }
  player.cape.position.set(...CAPE_REST);
  player.cape.rotation.z = 0;
}

/** Adds the clip at `time` seconds on top of the current pose; weight 0…1 fades it in and out. */
export function applyClip(player: PlayerObject, clip: Clip, time: number, weight: number) {
  for (const part of PARTS) {
    const object = player.skin[part], track = clip.tracks[part];
    object.rotation.order = 'ZYX';
    if (track?.rotation) {
      const [x, y, z] = sample(track.rotation, time);
      object.rotation.x += x * rad * weight;
      object.rotation.y -= y * rad * weight;
      object.rotation.z -= z * rad * weight;
    }
    if (track?.position) {
      const [x, y, z] = sample(track.position, time);
      object.position.x += x * weight;
      object.position.y += y * weight;
      object.position.z -= z * weight;
    }
    if (track?.scale) {
      const [x, y, z] = sample(track.scale, time);
      object.scale.set(1 + (x - 1) * weight, 1 + (y - 1) * weight, 1 + (z - 1) * weight);
    }
  }
  // Minecraft turns the body around the neck, skinview3d around the middle of the torso.
  const body = player.skin.body;
  const moved: Vec = [body.position.x - REST.body[0], body.position.y - REST.body[1], body.position.z - REST.body[2]];
  const centre = turn([0, REST.body[1] * body.scale.y, 0], body.rotation);
  body.position.set(moved[0] + centre[0], moved[1] + centre[1], moved[2] + centre[2]);
  // The cape hangs from the shoulders, so it follows the body.
  const cape = turn(NECK_TO_CAPE, body.rotation);
  player.cape.position.set(moved[0] + cape[0], CAPE_REST[1] + moved[1] + cape[1], moved[2] + cape[2]);
  player.cape.rotation.x += body.rotation.x;
  player.cape.rotation.z = -body.rotation.z;
}

// Pose of the still render without skin animation, the same angles as in the NoRisk launcher (Bedrock degrees).
const still = (x: number, y: number, z: number): Key[] => [{ time: 0, pre: [x, y, z], post: [x, y, z] }];
export const STILL_POSE: Clip = { length: 0, tracks: {
  head: { rotation: still(0, -10, 0) },
  rightArm: { rotation: still(0, 0, 5) },
  leftArm: { rotation: still(0, 0, -5) },
  rightLeg: { rotation: still(-7.5, 20, 0) },
  leftLeg: { rotation: still(0, -10, 0) },
} };

export const CALM_IDLES = [parse(launcherIdle as unknown as AnimationFile), parse(launcherIdle2 as unknown as AnimationFile)];
export const SPECIAL_IDLE = parse(launcherIdle3 as unknown as AnimationFile);

// Odds of the NoRisk launcher. Its 20 % for one of the player's own emotes fall back to a calm idle,
// as they do in NoRisk when there is none; Savira has no own emotes.
const ODDS = { calm: 70 + 20, special: 10 };
export type IdleKind = keyof typeof ODDS;
export function rollIdle(): IdleKind {
  let r = Math.random() * (ODDS.calm + ODDS.special);
  for (const kind of ['calm', 'special'] as const) { r -= ODDS[kind]; if (r < 0) return kind; }
  return 'calm';
}

const LAST_IDLE_KEY = 'savira-last-idle';
/** The calm idle that did not play last, so the two take turns, also across launcher starts. */
export function nextCalmIdle(): Clip {
  let last = -1;
  try { last = Number(localStorage.getItem(LAST_IDLE_KEY) ?? -1); } catch { /* Storage may be blocked. */ }
  const pick = last === 0 ? 1 : last === 1 ? 0 : Math.floor(Math.random() * CALM_IDLES.length);
  try { localStorage.setItem(LAST_IDLE_KEY, String(pick)); } catch { /* Only a preference. */ }
  return CALM_IDLES[pick];
}
