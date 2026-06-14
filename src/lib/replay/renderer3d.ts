import * as THREE from "three";
import type { ReplayRenderer, RenderState } from "./renderer";
import { COLORS_DARK, COLORS_LIGHT } from "./renderer";
import type { RenderQuality } from "./replayRenderer";
import type { Sport } from "../types";
import { fmtPace } from "../format";
import {
  METERS_PER_CYCLE,
  ParticlePool,
  PerfGovernor,
  catchEvents,
  clampDt,
  dampFactor,
  strokeSurge,
  warpStrokePhase,
} from "./motion";

const reducedMotionQuery =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

function prefersReducedMotion(): boolean {
  return reducedMotionQuery?.matches ?? false;
}

function hex(color: string): number {
  return Number.parseInt(color.slice(1), 16);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

interface QualityConfig {
  dprCap: number;
  antialias: boolean;
  /** Plane segments per side (1 = flat, no displacement). */
  groundSegments: number;
  displacement: boolean;
  shadows: boolean;
  /** Number of wake segments trailing each boat (0 = no wake). */
  wake: number;
  /** Buoy lines marking the lane edges (one InstancedMesh, static). */
  buoys: boolean;
  /** Catch spray droplets on the live lane (one InstancedMesh draw). */
  spray: boolean;
  /** Avatar detail level: "low" uses fewer segments, "high" adds muscle definition. */
  avatarDetail: "low" | "high";
}

const QUALITY: Record<RenderQuality, QualityConfig> = {
  low: {
    dprCap: 1,
    antialias: false,
    groundSegments: 1,
    displacement: false,
    shadows: false,
    wake: 0,
    buoys: false,
    spray: false,
    avatarDetail: "low",
  },
  medium: {
    dprCap: 2,
    antialias: true,
    groundSegments: 16,
    displacement: true,
    shadows: false,
    wake: 16,
    buoys: true,
    spray: true,
    avatarDetail: "low",
  },
  high: {
    dprCap: 2,
    antialias: true,
    groundSegments: 28,
    displacement: true,
    shadows: true,
    wake: 28,
    buoys: true,
    spray: true,
    avatarDetail: "high",
  },
  ultra: {
    dprCap: 2,
    antialias: true,
    groundSegments: 40,
    displacement: true,
    shadows: true,
    wake: 36,
    buoys: true,
    spray: true,
    avatarDetail: "high",
  },
};

function makeTextSprite(
  text: string,
  bg: string,
  fg: string,
  fontSize = 22,
): { sprite: THREE.Sprite; texture: THREE.CanvasTexture } {
  const pad = 10;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = `600 ${fontSize}px "Source Code Pro", ui-monospace, monospace`;
  const tw = ctx.measureText(text).width;
  canvas.width = Math.ceil(tw + pad * 2);
  canvas.height = fontSize + pad * 2;
  ctx.font = `600 ${fontSize}px "Source Code Pro", ui-monospace, monospace`;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  const scale = 0.012;
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
  return { sprite, texture };
}

function updateTextSprite(
  sprite: THREE.Sprite,
  texture: THREE.CanvasTexture,
  text: string,
  bg: string,
  fg: string,
  fontSize = 22,
): void {
  const pad = 10;
  const canvas = texture.image as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  ctx.font = `600 ${fontSize}px "Source Code Pro", ui-monospace, monospace`;
  const tw = ctx.measureText(text).width;
  const targetWidth = Math.ceil(tw + pad * 2);
  const targetHeight = fontSize + pad * 2;
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
  ctx.font = `600 ${fontSize}px "Source Code Pro", ui-monospace, monospace`;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  texture.needsUpdate = true;
  const scale = 0.012;
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
}

/**
 * A low-poly athlete + machine for one lane. `group` is placed on the lap
 * circle (and receives bob/roll); `animate(phase, reduceMotion)` drives the
 * sport-specific motion (oar sweep, double-pole, pedalling) from the shared
 * distance-driven stroke phase. Parts that carry `userData.accent` re-theme to
 * the per-lane accent (`--live` / `--ghost`); skin/kit/shafts stay fixed.
 * Local +Z is the direction of travel.
 */
interface Avatar {
  group: THREE.Group;
  animate(phase: number, reduceMotion: boolean): void;
}

/** Per-sport scene + animation tuning. */
interface SportProfile {
  /** Displace the ground plane into rolling water. */
  waves: boolean;
  /** Lean the avatar side-to-side (hull roll on water). */
  roll: boolean;
  /** Vertical bob amplitude (0 = planted). */
  bobAmp: number;
  /** Distance (m) per full animation cycle — drives stroke/pedal cadence. */
  metersPerCycle: number;
  /** Stroke surge amplitude (m): the hull checks at the catch and runs on. */
  surgeAmp: number;
  /** Lateral offset (m) of the catch-spray spawn pair, or null for no spray. */
  sprayOffset: number | null;
  /** Ground opacity (water is translucent; snow/asphalt solid). */
  groundOpacity: number;
  /** Trailing-spray colour, or `null` for sports that leave no wake. */
  trailColor: number | null;
  /** Ground base colour for the active theme. */
  groundColor(theme: "light" | "dark"): number;
  /** Build the lane avatar (athlete + machine). */
  make(accent: number, castShadow: boolean, opacity: number, detail?: "low" | "high"): Avatar;
}

/**
 * Finalize an avatar group: cast shadows from every mesh (so heads, oars, poles,
 * wheels etc. aren't left floating shadowless) and, for the ghost lane, make all
 * materials translucent. Handles both single and multi-material meshes.
 */
function finalizeAvatar(group: THREE.Group, castShadow: boolean, opacity: number): void {
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.castShadow = castShadow;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) {
      if (opacity < 1 && mat instanceof THREE.Material) {
        mat.transparent = true;
        mat.opacity = opacity;
      }
    }
  });
}

// ── Upgraded avatar geometry helpers ─────────────────────────────────────────
// These build more realistic body parts than plain boxes/spheres.

/** Skin and kit colours shared across all sport avatars. */
const SKIN = 0xd8b48a;
const SKIN_SHADOW = 0xc49a6e;
const KIT_DARK = 0x2a2f36;
const SHOE = 0x1a1c1e;

function skinMat(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.7 });
}

function kitMat(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: KIT_DARK, roughness: 0.8 });
}

function shoeMat(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: SHOE, roughness: 0.6 });
}

/**
 * A muscle-shaped upper arm or thigh: a capsule that tapers slightly toward
 * the distal end, giving visible bicep/quadricep shape.
 */
function taperedCapsule(
  proximalRadius: number,
  distalRadius: number,
  length: number,
  material: THREE.Material,
  segments: number,
): THREE.Mesh {
  // Build a lathe profile: two radii connected by a smooth curve
  const pts: THREE.Vector2[] = [];
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Smooth taper with a slight belly at 30%
    const belly = Math.sin(t * Math.PI) * 0.08 * proximalRadius;
    const r = proximalRadius + (distalRadius - proximalRadius) * t + belly;
    pts.push(new THREE.Vector2(r, t * length));
  }
  const geo = new THREE.LatheGeometry(pts, segments);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

/**
 * Build a hand mesh: a palm ellipsoid with four fingers and a thumb.
 */
function makeHand(material: THREE.Material, segs: number): THREE.Group {
  const hand = new THREE.Group();
  // Palm
  const palm = new THREE.Mesh(new THREE.SphereGeometry(1, segs, Math.max(4, segs / 2)), material);
  palm.scale.set(0.04, 0.025, 0.05);
  hand.add(palm);
  // Fingers
  for (let i = 0; i < 4; i++) {
    const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.03, 2, 4), material);
    finger.position.set((i - 1.5) * 0.012, 0, 0.04);
    hand.add(finger);
  }
  // Thumb
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.025, 2, 4), material);
  thumb.position.set(-0.03, 0.005, 0.02);
  thumb.rotation.z = 0.5;
  hand.add(thumb);
  return hand;
}

/**
 * Build a foot with shoe shape: a tapered box with a slight toe box bulge.
 */
function makeFoot(material: THREE.Material, segs: number): THREE.Group {
  const foot = new THREE.Group();
  // Sole + upper
  const sole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.035, 0.16, segs, 1, segs), material);
  sole.position.z = 0.04;
  foot.add(sole);
  // Toe box (slightly wider)
  const toe = new THREE.Mesh(new THREE.SphereGeometry(0.04, segs, Math.max(4, segs / 2)), material);
  toe.scale.set(1, 0.6, 1.2);
  toe.position.set(0, -0.005, 0.12);
  foot.add(toe);
  // Heel
  const heel = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, segs, Math.max(4, segs / 2)),
    material,
  );
  heel.scale.set(1, 0.8, 0.8);
  heel.position.set(0, 0, -0.04);
  foot.add(heel);
  return foot;
}

/**
 * Build an athletic torso: shaped ellipsoid with shoulder caps and chest
 * definition. Returns a group with torso, shoulders, and neck base.
 */
function makeTorso(
  kitMaterial: THREE.Material,
  skinMaterial: THREE.Material,
  accentMaterial: THREE.Material,
  segs: number,
): THREE.Group {
  const torso = new THREE.Group();
  // Main chest/torso body — wider at shoulders, narrower at waist
  const chest = new THREE.Mesh(
    new THREE.SphereGeometry(1, segs, Math.max(6, segs / 2)),
    kitMaterial,
  );
  chest.scale.set(0.2, 0.3, 0.14);
  chest.position.y = 0.55;
  torso.add(chest);
  // Shoulder caps — small spheres at each shoulder for visible deltoids
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, segs, Math.max(4, segs / 2)),
      kitMaterial,
    );
    shoulder.position.set(side * 0.22, 0.72, 0);
    torso.add(shoulder);
  }
  // Upper back plate — subtle back definition
  const back = new THREE.Mesh(
    new THREE.SphereGeometry(1, segs, Math.max(4, segs / 2)),
    kitMaterial,
  );
  back.scale.set(0.18, 0.25, 0.1);
  back.position.set(0, 0.55, -0.06);
  torso.add(back);
  // Jersey accent stripe across the chest
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.01), accentMaterial);
  stripe.position.set(0, 0.6, 0.145);
  stripe.userData.accent = true;
  torso.add(stripe);
  // Neck — visible cylinder connecting torso to head
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.1, segs), skinMaterial);
  neck.position.y = 0.85;
  torso.add(neck);
  return torso;
}

/**
 * Build a head with jaw definition, ears, and hair cap.
 */
function makeHead(
  skinMaterial: THREE.Material,
  hairMaterial: THREE.Material,
  segs: number,
): THREE.Group {
  const head = new THREE.Group();
  // Cranium — slightly elongated sphere
  const cranium = new THREE.Mesh(
    new THREE.SphereGeometry(1, segs, Math.max(6, segs / 2)),
    skinMaterial,
  );
  cranium.scale.set(0.1, 0.12, 0.1);
  cranium.position.y = 0.97;
  head.add(cranium);
  // Jaw — smaller sphere below for chin/jawline definition
  const jaw = new THREE.Mesh(
    new THREE.SphereGeometry(1, segs, Math.max(4, segs / 2)),
    skinMaterial,
  );
  jaw.scale.set(0.08, 0.05, 0.07);
  jaw.position.set(0, 0.9, 0.02);
  head.add(jaw);
  // Ears
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.022, 4, 4), skinMaterial);
    ear.scale.set(0.5, 1, 1);
    ear.position.set(side * 0.1, 0.96, -0.01);
    head.add(ear);
  }
  // Hair cap — sits on top of the cranium
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(1, segs, Math.max(4, segs / 2)),
    hairMaterial,
  );
  hair.scale.set(0.105, 0.055, 0.105);
  hair.position.y = 1.05;
  head.add(hair);
  return head;
}

/**
 * Build hips/bib area: a shaped ellipsoid for the pelvic region.
 */
function makeHips(
  kitMaterial: THREE.Material,
  accentMaterial: THREE.Material,
  segs: number,
): THREE.Group {
  const hips = new THREE.Group();
  const pelvis = new THREE.Mesh(
    new THREE.SphereGeometry(1, segs, Math.max(6, segs / 2)),
    kitMaterial,
  );
  pelvis.scale.set(0.18, 0.1, 0.13);
  pelvis.position.y = 0.38;
  hips.add(pelvis);
  // Accent bib/shorts band
  const bib = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.01), accentMaterial);
  bib.position.set(0, 0.38, 0.135);
  bib.userData.accent = true;
  hips.add(bib);
  return hips;
}

// ── Body part counts for quality gating ──────────────────────────────────────
function avatarSegs(detail: "low" | "high"): number {
  return detail === "high" ? 12 : 8;
}

/**
 * Low-poly single scull: long thin hull (capsule), a seated rower, and two oars
 * with blades. The hull, deck and oar blades carry `userData.accent`; the rower
 * slides + leans and the oars sweep/feather per stroke.
 */
function makeRowerAvatar(
  accent: number,
  castShadow: boolean,
  opacity = 1,
  detail: "low" | "high" = "low",
): Avatar {
  const group = new THREE.Group();
  const accentMat = () =>
    new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5, metalness: 0.1 });
  const segs = avatarSegs(detail);

  // ── Boat (procedural, unchanged) ──────────────────────────────────────
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 3.0, 4, 8), accentMat());
  hull.rotation.x = Math.PI / 2;
  hull.scale.set(0.5, 0.42, 1);
  hull.position.y = 0.16;
  hull.userData.accent = true;
  group.add(hull);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 2.6), accentMat());
  deck.position.y = 0.3;
  deck.userData.accent = true;
  group.add(deck);

  // ── Rower body (upgraded geometry) ────────────────────────────────────
  const rower = new THREE.Group();

  // Hips / pelvic region
  const hips = makeHips(kitMat(), accentMat(), segs);
  rower.add(hips);

  // Torso with shoulders, chest, back, neck, accent stripe
  const torso = makeTorso(kitMat(), skinMat(), accentMat(), segs);
  rower.add(torso);

  // Head with jaw, ears, hair
  const head = makeHead(
    skinMat(),
    new THREE.MeshStandardMaterial({ color: 0x241c18, roughness: 0.8 }),
    segs,
  );
  rower.add(head);

  // Arms: upper arm + forearm + hand, pivoting at shoulder
  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    // Upper arm — tapered capsule for visible bicep
    const upperArm = taperedCapsule(0.038, 0.032, 0.26, skinMat(), segs);
    upperArm.position.set(0, -0.13, 0);
    arm.add(upperArm);
    // Forearm
    const forearm = taperedCapsule(0.03, 0.025, 0.24, skinMat(), segs);
    forearm.position.set(0, -0.38, 0.08);
    arm.add(forearm);
    // Hand
    const hand = makeHand(skinMat(), segs);
    hand.position.set(0, -0.5, 0.16);
    arm.add(hand);
    arm.position.set(side * 0.24, 0.72, 0.05);
    rower.add(arm);
    arms.push(arm);
  }
  rower.position.z = -0.1;
  group.add(rower);

  // ── Oars (procedural, unchanged) ─────────────────────────────────────
  const oars: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const oar = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 2.4, 6),
      new THREE.MeshStandardMaterial({ color: 0xe7eef0, roughness: 0.6 }),
    );
    shaft.rotation.z = Math.PI / 2;
    shaft.position.x = side * 1.2;
    oar.add(shaft);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.26), accentMat());
    blade.position.set(side * 2.4, -0.05, 0);
    blade.userData.accent = true;
    oar.add(blade);
    oar.position.y = 0.24;
    oar.userData.side = side;
    group.add(oar);
    oars.push(oar);
  }

  const animate = (phase: number, reduce: boolean): void => {
    if (reduce) {
      rower.position.z = -0.1;
      rower.rotation.x = -0.1;
      for (const arm of arms) arm.rotation.x = -0.2;
      for (const oar of oars) oar.rotation.set(0, 0, 0);
      return;
    }
    const w = warpStrokePhase(phase);
    const drive = Math.cos(w);
    const recovery = Math.max(0, -Math.sin(w));
    rower.position.z = -0.1 - drive * 0.18;
    rower.rotation.x = -0.1 - drive * 0.22;
    for (const arm of arms) arm.rotation.x = -0.2 + (1 - drive) * 0.27;
    for (const oar of oars) {
      const side = (oar.userData.side as number) ?? 1;
      oar.rotation.y = -side * drive * 0.5;
      oar.rotation.z = side * (recovery * 0.26 - 0.06);
    }
  };

  finalizeAvatar(group, castShadow, opacity);
  return { group, animate };
}

/**
 * Low-poly SkiErg skier: a standing athlete on skis, double-poling. Skis, vest
 * and pole baskets carry `userData.accent`; the upper body crunches forward and
 * both poles swing fore/aft together on each pull.
 */
function makeSkierAvatar(
  accent: number,
  castShadow: boolean,
  opacity = 1,
  detail: "low" | "high" = "low",
): Avatar {
  const group = new THREE.Group();
  const accentMat = () =>
    new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5, metalness: 0.1 });
  const segs = avatarSegs(detail);

  // Skis: two thin planks along travel (+Z).
  for (const side of [-1, 1]) {
    const ski = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 2.4), accentMat());
    ski.position.set(side * 0.18, 0.03, 0.2);
    ski.userData.accent = true;
    group.add(ski);
  }

  // Legs: planted on skis — tapered thigh + shin + foot
  for (const side of [-1, 1]) {
    const thigh = taperedCapsule(0.055, 0.045, 0.35, kitMat(), segs);
    thigh.position.set(side * 0.16, 0.55, 0);
    group.add(thigh);
    const shin = taperedCapsule(0.04, 0.032, 0.35, kitMat(), segs);
    shin.position.set(side * 0.16, 0.22, 0);
    group.add(shin);
    const foot = makeFoot(shoeMat(), segs);
    foot.position.set(side * 0.16, 0.04, 0.04);
    group.add(foot);
  }

  // Upper body pivots from hips for the double-pole crunch
  const upper = new THREE.Group();
  upper.position.y = 0.7;

  // Hips
  const hips = makeHips(kitMat(), accentMat(), segs);
  hips.position.y = -0.32; // relative to upper group
  upper.add(hips);

  // Torso with shoulders, chest, accent stripe
  const torso = makeTorso(kitMat(), skinMat(), accentMat(), segs);
  torso.position.y = -0.32;
  upper.add(torso);

  // Head
  const head = makeHead(
    skinMat(),
    new THREE.MeshStandardMaterial({ color: 0x241c18, roughness: 0.8 }),
    segs,
  );
  head.position.y = -0.32;
  upper.add(head);

  // Arms: pivot at shoulders, swing with poles
  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    const upperArm = taperedCapsule(0.035, 0.028, 0.28, skinMat(), segs);
    upperArm.position.set(0, -0.14, 0);
    arm.add(upperArm);
    const forearm = taperedCapsule(0.028, 0.022, 0.26, skinMat(), segs);
    forearm.position.set(0, -0.38, 0.1);
    arm.add(forearm);
    const hand = makeHand(skinMat(), segs);
    hand.position.set(0, -0.52, 0.18);
    arm.add(hand);
    arm.position.set(side * 0.26, 0.38, 0.05);
    upper.add(arm);
    arms.push(arm);
  }
  group.add(upper);

  // Poles: pivot at the hands, basket near the snow
  const poles: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const pole = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 1.2, 6),
      new THREE.MeshStandardMaterial({ color: 0xe7eef0, roughness: 0.6 }),
    );
    shaft.position.y = -0.6;
    pole.add(shaft);
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 8), accentMat());
    basket.position.y = -1.15;
    basket.userData.accent = true;
    pole.add(basket);
    pole.position.set(side * 0.3, 1.1, 0.1);
    group.add(pole);
    poles.push(pole);
  }

  const animate = (phase: number, reduce: boolean): void => {
    if (reduce) {
      upper.rotation.x = 0.25;
      for (const arm of arms) arm.rotation.x = -0.4;
      for (const p of poles) p.rotation.x = -0.2;
      return;
    }
    const w = warpStrokePhase(phase);
    const swing = Math.cos(w);
    const crunch = Math.max(0, -swing);
    upper.rotation.x = 0.2 + crunch * 0.5;
    for (const arm of arms) arm.rotation.x = -0.25 - swing * 0.35;
    for (const p of poles) p.rotation.x = -swing * 0.9 - 0.1;
  };

  finalizeAvatar(group, castShadow, opacity);
  return { group, animate };
}

/**
 * Low-poly BikeErg cyclist: a rider in an aero tuck on a two-wheeled frame.
 * Frame, wheel spokes and jersey carry `userData.accent`; the wheels roll, the
 * cranks turn and the rider's thighs pedal in opposition.
 */
function makeBikeAvatar(
  accent: number,
  castShadow: boolean,
  opacity = 1,
  detail: "low" | "high" = "low",
): Avatar {
  const group = new THREE.Group();
  const accentMat = () =>
    new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5, metalness: 0.2 });
  const segs = avatarSegs(detail);

  const wheelR = 0.45;
  const wheels: THREE.Group[] = [];
  for (const z of [0.85, -0.85]) {
    const wheel = new THREE.Group();
    const tyre = new THREE.Mesh(
      new THREE.TorusGeometry(wheelR, 0.06, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 0.6 }),
    );
    tyre.rotation.y = Math.PI / 2;
    wheel.add(tyre);
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.04, wheelR * 1.8, 0.04), accentMat());
    spoke.userData.accent = true;
    wheel.add(spoke);
    const spoke2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, wheelR * 1.8, 0.04), accentMat());
    spoke2.rotation.x = Math.PI / 2;
    spoke2.userData.accent = true;
    wheel.add(spoke2);
    wheel.position.set(0, wheelR, z);
    group.add(wheel);
    wheels.push(wheel);
  }

  // Frame: down tube + seat tube
  const downTube = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.6), accentMat());
  downTube.position.set(0, wheelR + 0.15, 0);
  downTube.userData.accent = true;
  const seatTube = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), accentMat());
  seatTube.position.set(0, wheelR + 0.45, -0.4);
  seatTube.userData.accent = true;
  group.add(downTube, seatTube);

  // Cranks
  const cranks = new THREE.Group();
  cranks.position.set(0, wheelR, -0.05);
  for (const dir of [1, -1]) {
    const pedal = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.05, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 0.7 }),
    );
    pedal.position.set(0, dir * 0.18, 0);
    cranks.add(pedal);
  }
  group.add(cranks);

  // Rider: upgraded body in aero tuck
  const rider = new THREE.Group();
  rider.position.set(0, wheelR + 0.5, -0.35);

  // Torso — aero tuck (rotated forward ~35°)
  const torsoGrp = new THREE.Group();
  torsoGrp.rotation.x = 0.6;
  torsoGrp.position.y = 0.3;

  const chest = new THREE.Mesh(
    new THREE.SphereGeometry(1, segs, Math.max(6, segs / 2)),
    accentMat(),
  );
  chest.scale.set(0.18, 0.28, 0.13);
  chest.userData.accent = true;
  torsoGrp.add(chest);

  // Shoulder caps
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, segs, Math.max(4, segs / 2)),
      accentMat(),
    );
    shoulder.position.set(side * 0.2, 0.18, 0);
    shoulder.userData.accent = true;
    torsoGrp.add(shoulder);
  }

  // Jersey accent stripe
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.01), accentMat());
  stripe.position.set(0, 0.05, 0.135);
  stripe.userData.accent = true;
  torsoGrp.add(stripe);

  // Neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.1, segs), skinMat());
  neck.position.y = 0.32;
  torsoGrp.add(neck);

  rider.add(torsoGrp);

  // Head — slightly forward of torso
  const headGrp = new THREE.Group();
  headGrp.position.set(0, 0.62, 0.35);
  const cranium = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, segs, Math.max(6, segs / 2)),
    skinMat(),
  );
  headGrp.add(cranium);
  // Helmet (accent)
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, segs, Math.max(4, segs / 2)),
    accentMat(),
  );
  helmet.scale.set(1, 0.7, 1.1);
  helmet.position.y = 0.03;
  helmet.userData.accent = true;
  headGrp.add(helmet);
  rider.add(headGrp);

  // Thighs that pedal
  const thighs: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const thigh = taperedCapsule(0.05, 0.04, 0.35, kitMat(), segs);
    thigh.position.set(side * 0.1, -0.1, 0.2);
    rider.add(thigh);
    thighs.push(thigh);
  }

  // Arms from shoulders down to bars, fixed in tuck
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    const upperArm = taperedCapsule(0.032, 0.026, 0.26, skinMat(), segs);
    upperArm.rotation.x = -0.7;
    arm.add(upperArm);
    const forearm = taperedCapsule(0.026, 0.02, 0.24, skinMat(), segs);
    forearm.position.set(0, -0.08, 0.2);
    forearm.rotation.x = -0.5;
    arm.add(forearm);
    arm.position.set(side * 0.17, 0.2, 0.3);
    arm.rotation.x = -0.7;
    rider.add(arm);
  }
  group.add(rider);

  const animate = (phase: number, reduce: boolean): void => {
    if (reduce) {
      for (const w of wheels) w.rotation.x = 0;
      cranks.rotation.x = 0;
      for (const t of thighs) t.rotation.x = 0;
      rider.rotation.z = 0;
      return;
    }
    for (const w of wheels) w.rotation.x = phase * 2.4;
    cranks.rotation.x = phase;
    thighs[0].rotation.x = Math.sin(phase) * 0.5;
    thighs[1].rotation.x = Math.sin(phase + Math.PI) * 0.5;
    rider.rotation.z = Math.sin(phase) * 0.05;
  };

  finalizeAvatar(group, castShadow, opacity);
  return { group, animate };
}

const SPORT_PROFILES: Record<Sport, SportProfile> = {
  rower: {
    waves: true,
    roll: true,
    bobAmp: 0.06,
    metersPerCycle: METERS_PER_CYCLE.rower,
    surgeAmp: 0.22,
    sprayOffset: 2.2, // off the blade tips
    groundOpacity: 0.4,
    trailColor: 0xffffff,
    groundColor: (t) => hex((t === "dark" ? COLORS_DARK : COLORS_LIGHT).laneLine),
    make: makeRowerAvatar,
  },
  skierg: {
    waves: false,
    roll: false,
    bobAmp: 0.03,
    metersPerCycle: METERS_PER_CYCLE.skierg,
    surgeAmp: 0.08,
    sprayOffset: 0.4, // at the pole baskets
    groundOpacity: 1,
    trailColor: 0xffffff,
    groundColor: (t) => (t === "dark" ? 0xb8c4cc : 0xeef4f7),
    make: makeSkierAvatar,
  },
  bike: {
    waves: false,
    roll: false,
    bobAmp: 0.02,
    metersPerCycle: METERS_PER_CYCLE.bike,
    surgeAmp: 0,
    sprayOffset: null,
    groundOpacity: 1,
    trailColor: null,
    groundColor: (t) => (t === "dark" ? 0x2a333a : 0x9aa4ac),
    make: makeBikeAvatar,
  },
};

/**
 * A fading trail of flat quads dropped along an avatar's recent path — water
 * foam for the rower, snow spray for the skier. Each segment owns its material
 * so opacity can fade toward the tail.
 */
class WakeTrail {
  private segs: THREE.Mesh[] = [];
  private mats: THREE.MeshBasicMaterial[] = [];
  private hist: THREE.Vector3[] = [];

  constructor(scene: THREE.Scene, n: number, geo: THREE.PlaneGeometry, color = 0xffffff) {
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const seg = new THREE.Mesh(geo, mat);
      seg.rotation.x = -Math.PI / 2;
      seg.position.y = 0.02;
      seg.visible = false;
      scene.add(seg);
      this.segs.push(seg);
      this.mats.push(mat);
    }
  }

  update(x: number, z: number): void {
    const n = this.segs.length;
    // Recycle the tail vector once at capacity — no per-frame allocation.
    const entry = this.hist.length >= n ? this.hist.pop()! : new THREE.Vector3();
    entry.set(x, 0.02, z);
    this.hist.unshift(entry);
    // Travel direction, refreshed per segment from its older neighbour and
    // reused when a neighbour is missing.
    let dx = 0;
    let dz = 0;
    for (let i = 0; i < n; i++) {
      const seg = this.segs[i];
      const h = this.hist[i];
      if (!h) {
        seg.visible = false;
        continue;
      }
      const older = this.hist[i + 1];
      if (older) {
        const ddx = h.x - older.x;
        const ddz = h.z - older.z;
        const len = Math.hypot(ddx, ddz);
        if (len > 1e-4) {
          dx = ddx / len;
          dz = ddz / len;
        }
      }
      const f = 1 - i / n; // 1 at boat, 0 at tail
      // Diverging V: alternate segments drift port/starboard as they age.
      const spread = (1 - f) * 0.6 * (i % 2 === 0 ? 1 : -1);
      seg.visible = true;
      seg.position.set(h.x - dz * spread, 0.02, h.z + dx * spread);
      // Foam disperses: it spreads and grows while it fades.
      this.mats[i].opacity = Math.sqrt(f) * f * 0.45;
      const s = 0.55 + (1 - f) * 1.2;
      seg.scale.set(s, s, s);
    }
  }

  reset(): void {
    this.hist.length = 0;
    for (const seg of this.segs) seg.visible = false;
  }

  dispose(): void {
    for (const seg of this.segs) seg.removeFromParent();
    for (const m of this.mats) m.dispose();
  }
}

/**
 * WebGL course replay — lazy-loaded; mirrors 2D RenderState in a low-poly scene.
 * The athlete travels around a circular loop: one lap = 1 km (matching ErgData),
 * so longer pieces wrap multiple times. The avatar (rowing scull, SkiErg skier,
 * or BikeErg cyclist) and ground (water / snow / asphalt) are chosen from the
 * workout's `sport`. `three` is imported only in this module.
 */
export class CourseRenderer3D implements ReplayRenderer {
  static readonly LOOP_METERS = 1000; // one lap = 1 km
  private readonly loopRadius = 30;
  private readonly ghostRadius = 26;

  private cfg: QualityConfig;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private cameraInit = false;
  private w = 0;
  private h = 0;
  private animPhase = 0;
  private lastAnimPhase = NaN;
  private strokePhase = 0;
  private lastLiveMeters = 0;
  private lastGhostMeters = 0;
  private lastNowMs = NaN;
  /** Replay-space speed (m/s), smoothed; breathes the chase-camera FOV. */
  private smoothedSpeed = 0;
  private fovCurrent = 46;
  /** Steps effects down when frames run persistently over budget. */
  private governor = new PerfGovernor({ maxLevel: 3 });
  /** Set once the governor flattens the water (level 3). */
  private waterFlat = false;
  private sprayOff = false;
  private reduceMotion = false;
  private lastReduceMotion = false;
  private theme: "light" | "dark" = "light";

  private host: HTMLElement;
  private canvas: HTMLCanvasElement;
  private readonly profile: SportProfile;
  private groundMesh!: THREE.Mesh;
  private liveBoat: THREE.Group; // outer: position + heading
  private liveAvatar: Avatar; // inner: bob + roll + stroke
  private ghostGroup: THREE.Group; // outer: position + heading + visibility
  private ghostAvatar: Avatar;
  private liveWake: WakeTrail | null = null;
  private ghostWake: WakeTrail | null = null;
  private sprayPool: ParticlePool | null = null;
  private sprayMesh: THREE.InstancedMesh | null = null;
  private sprayMat: THREE.MeshBasicMaterial | null = null;
  private buoyMesh: THREE.InstancedMesh | null = null;
  private buoyMat: THREE.MeshStandardMaterial | null = null;
  private tmpMat4 = new THREE.Matrix4();
  private liveLabel: THREE.Sprite;
  private liveLabelTex: THREE.CanvasTexture;
  private ghostLabel: THREE.Sprite | null = null;
  private ghostLabelTex: THREE.CanvasTexture | null = null;
  private lastLiveLabel = "";
  private lastGhostLabel = "";
  private chase = new THREE.Vector3();
  private lookAt = new THREE.Vector3();
  private disposables: THREE.Material[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private postMatMajor!: THREE.MeshStandardMaterial;
  private postMatMinor!: THREE.MeshStandardMaterial;
  private cellMatDark!: THREE.MeshStandardMaterial;
  private cellMatLight!: THREE.MeshStandardMaterial;

  constructor(host: HTMLElement, quality: RenderQuality = "medium", sport: Sport = "rower") {
    this.cfg = QUALITY[quality];
    this.profile = SPORT_PROFILES[sport];
    // A canvas can only ever hold ONE context type for its lifetime, and the 2D
    // renderer locks the shared page canvas to '2d'. So the 3D renderer creates
    // and owns its own canvas (and removes it on destroy) — this also means a
    // fresh context every time, so destroy()'s loseContext() can't poison reuse.
    this.host = host;
    this.canvas = document.createElement("canvas");
    this.canvas.style.display = "block";
    this.canvas.style.width = "100%";
    host.appendChild(this.canvas);
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.cfg.antialias,
      alpha: true,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (this.cfg.shadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 500);

    // Sky/ground hemisphere fill + a key sun give boats nicer shading than a
    // flat ambient. The sun casts shadows only at high quality.
    this.scene.add(new THREE.HemisphereLight(0xddeaf2, 0x4a5560, 0.85));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(14, 26, 10);
    if (this.cfg.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      const c = sun.shadow.camera;
      c.near = 1;
      c.far = 90;
      c.left = c.bottom = -42;
      c.right = c.top = 42;
    }
    this.scene.add(sun);

    this.liveAvatar = this.profile.make(
      hex(COLORS_LIGHT.live),
      this.cfg.shadows,
      1,
      this.cfg.avatarDetail,
    );
    this.liveBoat = new THREE.Group();
    this.liveBoat.add(this.liveAvatar.group);
    // Ghost: translucent + no shadow so it reads as a phantom, clearly distinct
    // from the solid live avatar.
    this.ghostAvatar = this.profile.make(
      hex(COLORS_LIGHT.ghost),
      false,
      0.45,
      this.cfg.avatarDetail,
    );
    this.ghostGroup = new THREE.Group();
    this.ghostGroup.visible = false;
    this.ghostGroup.add(this.ghostAvatar.group);
    this.scene.add(this.liveBoat, this.ghostGroup);

    const liveSpr = makeTextSprite("", COLORS_LIGHT.labelBg, COLORS_LIGHT.live);
    this.liveLabel = liveSpr.sprite;
    this.liveLabelTex = liveSpr.texture;
    this.scene.add(this.liveLabel);

    this.buildStaticScene();

    if (this.cfg.wake > 0 && this.profile.trailColor !== null) {
      const wakeGeo = this.track(new THREE.PlaneGeometry(0.9, 0.9));
      const c = this.profile.trailColor;
      this.liveWake = new WakeTrail(this.scene, this.cfg.wake, wakeGeo, c);
      this.ghostWake = new WakeTrail(this.scene, this.cfg.wake, wakeGeo, c);
    }

    // Catch spray for the live lane: one InstancedMesh, one draw call. The
    // droplets shrink as they die, so no per-particle materials are needed.
    if (this.cfg.spray && this.profile.sprayOffset !== null) {
      this.sprayPool = new ParticlePool(40);
      const sprayGeo = this.track(new THREE.IcosahedronGeometry(0.05, 0));
      this.sprayMat = this.mat(new THREE.MeshBasicMaterial({ color: hex(COLORS_LIGHT.foam) }));
      this.sprayMesh = new THREE.InstancedMesh(sprayGeo, this.sprayMat, this.sprayPool.capacity);
      this.sprayMesh.count = 0;
      this.sprayMesh.frustumCulled = false;
      this.scene.add(this.sprayMesh);
    }
  }

  private track<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  private mat<T extends THREE.Material>(m: T): T {
    this.disposables.push(m);
    return m;
  }

  private loopAngle(meters: number): number {
    return (meters / CourseRenderer3D.LOOP_METERS) * Math.PI * 2;
  }

  private buildStaticScene(): void {
    const seg = this.profile.waves ? this.cfg.groundSegments : 1;
    const groundGeo = this.track(new THREE.PlaneGeometry(140, 140, seg, seg));
    // Water is glossier than snow/asphalt so the sun glints off the moving
    // wave normals; the displacement loop recomputes them each frame.
    const groundMat = this.mat(
      new THREE.MeshStandardMaterial({
        color: this.profile.groundColor("light"),
        transparent: this.profile.groundOpacity < 1,
        opacity: this.profile.groundOpacity,
        roughness: this.profile.waves ? 0.45 : 0.85,
        metalness: this.profile.waves ? 0.12 : 0.05,
      }),
    );
    groundMat.name = "ground";
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.name = "ground";
    ground.receiveShadow = this.cfg.shadows;
    this.groundMesh = ground;
    this.scene.add(ground);

    const innerR = this.ghostRadius - 4;
    const outerR = this.loopRadius + 4;
    const laneGeo = this.track(new THREE.RingGeometry(innerR, outerR, 72));
    const laneMat = this.mat(
      new THREE.MeshStandardMaterial({
        color: hex(COLORS_LIGHT.courseFill),
        roughness: 0.85,
      }),
    );
    laneMat.name = "lane";
    const lane = new THREE.Mesh(laneGeo, laneMat);
    lane.name = "lane";
    lane.rotation.x = -Math.PI / 2;
    lane.receiveShadow = this.cfg.shadows;
    this.scene.add(lane);

    this.postMatMajor = this.mat(
      new THREE.MeshStandardMaterial({ color: hex(COLORS_LIGHT.tickMajor) }),
    );
    this.postMatMinor = this.mat(
      new THREE.MeshStandardMaterial({ color: hex(COLORS_LIGHT.tickMinor) }),
    );
    const postGeo = this.track(new THREE.BoxGeometry(0.16, 1.3, 0.16));
    const postR = outerR + 1.4;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const post = new THREE.Mesh(postGeo, i % 5 === 0 ? this.postMatMajor : this.postMatMinor);
      post.position.set(postR * Math.sin(a), 0.65, postR * Math.cos(a));
      post.castShadow = this.cfg.shadows;
      this.scene.add(post);
    }

    // Buoy lines marking the lane edges — static, one InstancedMesh draw call.
    if (this.cfg.buoys) {
      const buoyGeo = this.track(new THREE.SphereGeometry(0.11, 6, 4));
      this.buoyMat = this.mat(
        new THREE.MeshStandardMaterial({ color: hex(COLORS_LIGHT.markerCap), roughness: 0.6 }),
      );
      const rings = [
        this.ghostRadius - 2.5,
        (this.ghostRadius + this.loopRadius) / 2,
        this.loopRadius + 2.5,
      ];
      const perRing = 48;
      const inst = new THREE.InstancedMesh(buoyGeo, this.buoyMat, rings.length * perRing);
      const m = new THREE.Matrix4();
      let bi = 0;
      for (const r of rings) {
        for (let k = 0; k < perRing; k++) {
          const a = (k / perRing) * Math.PI * 2;
          m.setPosition(r * Math.sin(a), 0.06, r * Math.cos(a));
          inst.setMatrixAt(bi++, m);
        }
      }
      inst.instanceMatrix.needsUpdate = true;
      this.buoyMesh = inst;
      this.scene.add(inst);
    }

    // Start/finish line — flat checker across the lane at the lap crossing.
    this.cellMatDark = this.mat(
      new THREE.MeshStandardMaterial({ color: hex(COLORS_LIGHT.finishDark) }),
    );
    this.cellMatLight = this.mat(
      new THREE.MeshStandardMaterial({ color: hex(COLORS_LIGHT.finishLight) }),
    );
    const cellGeo = this.track(new THREE.BoxGeometry(0.9, 0.06, 0.95));
    for (let zc = 0; zc < 9; zc++) {
      for (let xc = 0; xc < 2; xc++) {
        const cell = new THREE.Mesh(
          cellGeo,
          (zc + xc) % 2 === 0 ? this.cellMatDark : this.cellMatLight,
        );
        cell.position.set(-0.5 + xc, 0.04, innerR + 0.6 + zc * 0.95);
        this.scene.add(cell);
      }
    }
  }

  private applyTheme(themeName: "light" | "dark"): void {
    const C = themeName === "dark" ? COLORS_DARK : COLORS_LIGHT;
    this.theme = themeName;
    this.scene.background = new THREE.Color(C.courseFill);
    this.scene.fog = new THREE.Fog(C.courseFill, 55, 170);

    const recolor = (name: string, color: string) => {
      const obj = this.scene.getObjectByName(name);
      if (obj && obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
        obj.material.color.setHex(hex(color));
      }
    };
    recolor("lane", C.courseFill);
    if (this.groundMesh.material instanceof THREE.MeshStandardMaterial) {
      this.groundMesh.material.color.setHex(this.profile.groundColor(themeName));
    }

    this.postMatMajor.color.setHex(hex(C.tickMajor));
    this.postMatMinor.color.setHex(hex(C.tickMinor));
    this.cellMatDark.color.setHex(hex(C.finishDark));
    this.cellMatLight.color.setHex(hex(C.finishLight));
    this.buoyMat?.color.setHex(hex(C.markerCap));
    this.sprayMat?.color.setHex(hex(C.foam));

    this.recolorAccent(this.liveAvatar.group, C.live);
    this.recolorAccent(this.ghostAvatar.group, C.ghost);
  }

  private recolorAccent(group: THREE.Group, color: string): void {
    const c = hex(color);
    group.traverse((o) => {
      if (
        o instanceof THREE.Mesh &&
        o.userData.accent &&
        o.material instanceof THREE.MeshStandardMaterial
      ) {
        o.material.color.setHex(c);
      }
    });
  }

  resize(cssWidth: number, cssHeight: number): void {
    this.w = cssWidth;
    this.h = cssHeight;
    // The governor tightens the dpr cap when the GPU can't hold the budget —
    // resolution is the cheapest visual to sacrifice on weak hardware.
    const cap =
      this.governor.level >= 2
        ? 1
        : this.governor.level === 1
          ? Math.min(this.cfg.dprCap, 1.5)
          : this.cfg.dprCap;
    const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, cap);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(cssWidth, cssHeight);
    this.camera.aspect = cssWidth / Math.max(cssHeight, 1);
    this.camera.updateProjectionMatrix();
  }

  /**
   * Map governor levels to concrete savings. Levels 1–2 lower the pixel
   * ratio; level 3 flattens the water and stops the spray. Geometry,
   * lighting and avatars are untouched, so the scene degrades gracefully.
   */
  private applyPerfLevel(): void {
    if (this.governor.level >= 1) this.resize(this.w, this.h);
    if (this.governor.level >= 3) {
      this.sprayOff = true;
      this.sprayPool?.clear();
      if (this.sprayMesh) this.sprayMesh.count = 0;
      this.flattenWater();
    }
  }

  private flattenWater(): void {
    if (this.waterFlat) return;
    this.waterFlat = true;
    const water = this.groundMesh;
    if (this.profile.waves && water?.geometry instanceof THREE.PlaneGeometry) {
      const pos = water.geometry.attributes.position;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < pos.count; i++) arr[i * 3 + 2] = 0;
      pos.needsUpdate = true;
      water.geometry.computeVertexNormals();
    }
  }

  /** Place an avatar on its lap circle and animate bob/roll + the stroke. */
  private placeAvatar(
    outer: THREE.Group,
    avatar: Avatar,
    radius: number,
    meters: number,
    cadence: number,
  ): { x: number; z: number; tx: number; tz: number; y: number } {
    const a = this.loopAngle(meters);
    const sin = Math.sin(a);
    const cos = Math.cos(a);
    const x = radius * sin;
    const z = radius * cos;
    const tx = cos; // unit tangent (direction of increasing distance)
    const tz = -sin;
    const reduce = this.reduceMotion;
    const bob =
      reduce || this.profile.bobAmp === 0
        ? 0
        : Math.sin(this.animPhase * 2 + cadence * 0.1) * this.profile.bobAmp;
    outer.position.set(x, 0, z);
    outer.rotation.y = Math.atan2(tx, tz); // local +Z (travel) -> tangent
    avatar.group.position.y = bob;
    // Stroke surge: the hull checks at the catch and runs out through the
    // drive — a local +Z (travel) offset synced to the shared stroke phase.
    avatar.group.position.z =
      reduce || this.profile.surgeAmp === 0
        ? 0
        : strokeSurge(warpStrokePhase(this.strokePhase)) * this.profile.surgeAmp;
    avatar.group.rotation.z =
      reduce || !this.profile.roll ? 0 : Math.sin(this.animPhase + cadence * 0.05) * 0.05;
    avatar.animate(this.strokePhase, reduce);
    return { x, z, tx, tz, y: bob };
  }

  render(state: RenderState, playing: boolean, themeName: "light" | "dark" = "light"): void {
    if (this.w === 0) return;
    if (themeName !== this.theme) this.applyTheme(themeName);
    const C = themeName === "dark" ? COLORS_DARK : COLORS_LIGHT;
    this.reduceMotion = prefersReducedMotion();

    // Wall-clock dt (clamped) keeps water, camera and FOV motion identical on
    // 30/60/120 Hz displays — phases advance by time, not by frame count.
    const nowMs = performance.now();
    const rawDtMs = playing && Number.isFinite(this.lastNowMs) ? nowMs - this.lastNowMs : 0;
    const dt = playing ? clampDt(rawDtMs) : 0;
    this.lastNowMs = playing ? nowMs : NaN;

    // Adaptive degradation: a sustained run of over-budget frames steps the
    // governor, shedding resolution first and effects last.
    if (playing && this.governor.sample(rawDtMs) !== null) this.applyPerfLevel();

    if (playing && !this.reduceMotion) this.animPhase += (2.4 + state.frame.spm / 13) * dt;

    // Stroke phase advances by time at the recorded stroke rate (spm), so the
    // figures stroke at the workout's true cadence — a 20 spm interval animates
    // slower than a 36 spm sprint, matching the real erg rhythm.
    const liveMeters = state.frame.d;
    const dLive = liveMeters - this.lastLiveMeters;
    this.lastLiveMeters = liveMeters;
    const prevStroke = this.strokePhase;
    if (!this.reduceMotion && dt > 0 && state.frame.spm > 0)
      this.strokePhase += (state.frame.spm / 60) * dt * Math.PI * 2;

    // Water displacement (rowing only; skipped when flat/low quality, governor
    //-flattened, or phase unchanged). Three interfering wave trains read as a
    // living surface where one sine reads as a conveyor belt.
    const water = this.groundMesh;
    const reduceMotionChanged = this.reduceMotion !== this.lastReduceMotion;
    if (
      this.cfg.displacement &&
      this.profile.waves &&
      !this.waterFlat &&
      (this.animPhase !== this.lastAnimPhase || reduceMotionChanged) &&
      water?.geometry instanceof THREE.PlaneGeometry
    ) {
      const pos = water.geometry.attributes.position;
      const arr = pos.array as Float32Array;
      const count = pos.count;
      const t = this.animPhase;
      for (let i = 0; i < count; i++) {
        const idx = i * 3;
        // local y (arr[idx+1]) maps to world Z after the -90° X rotation, so
        // the primary ripple runs along the course rather than as uniform
        // cross-lane bands; the two faster trains break up the pattern.
        const lx = arr[idx];
        const ly = arr[idx + 1];
        arr[idx + 2] = this.reduceMotion
          ? 0
          : Math.sin(ly * 0.25 + t) * 0.05 +
            Math.sin(lx * 0.31 + t * 1.7) * 0.03 +
            Math.sin((lx + ly) * 0.13 - t * 0.6) * 0.025;
      }
      pos.needsUpdate = true;
      water.geometry.computeVertexNormals();
      this.lastAnimPhase = this.animPhase;
      this.lastReduceMotion = this.reduceMotion;
    }

    const p = this.placeAvatar(
      this.liveBoat,
      this.liveAvatar,
      this.loopRadius,
      liveMeters,
      state.frame.spm,
    );

    this.advanceWake(this.liveWake, dLive, p.x - p.tx * 1.6, p.z - p.tz * 1.6);

    // Catch spray on the live lane: spawn a burst as each stroke catches,
    // integrate, and write the survivors into the InstancedMesh.
    if (this.sprayPool && this.sprayMesh && !this.sprayOff) {
      const pool = this.sprayPool;
      if (this.reduceMotion) {
        pool.clear();
      } else {
        if (dt > 0) pool.update(dt, 0, -5.5, 0);
        if (playing && catchEvents(prevStroke, this.strokePhase) > 0) {
          const off = this.profile.sprayOffset ?? 0;
          const rx = p.x / this.loopRadius;
          const rz = p.z / this.loopRadius;
          for (const side of [-1, 1]) {
            for (let k = 0; k < 4; k++) {
              pool.spawn(
                p.x + rx * off * side + (Math.random() - 0.5) * 0.3,
                0.12,
                p.z + rz * off * side + (Math.random() - 0.5) * 0.3,
                rx * side * (0.3 + Math.random() * 0.5) - p.tx * (0.3 + Math.random() * 0.5),
                1.1 + Math.random() * 1.2,
                rz * side * (0.3 + Math.random() * 0.5) - p.tz * (0.3 + Math.random() * 0.5),
                0.4 + Math.random() * 0.3,
                0.5 + Math.random(),
              );
            }
          }
        }
      }
      for (let i = 0; i < pool.alive; i++) {
        const sc = pool.size[i] * (0.4 + 0.6 * pool.fade(i));
        this.tmpMat4.makeScale(sc, sc, sc);
        this.tmpMat4.setPosition(pool.x[i], pool.y[i], pool.z[i]);
        this.sprayMesh.setMatrixAt(i, this.tmpMat4);
      }
      this.sprayMesh.count = pool.alive;
      this.sprayMesh.instanceMatrix.needsUpdate = true;
    }

    const laps = Math.max(1, Math.ceil(state.totalDistance / CourseRenderer3D.LOOP_METERS));
    const lap = Math.min(laps, Math.floor(liveMeters / CourseRenderer3D.LOOP_METERS) + 1);
    const liveText =
      laps > 1
        ? `YOU · ${fmtPace(state.frame.pace)} · L${lap}/${laps}`
        : `YOU · ${fmtPace(state.frame.pace)} · ${Math.round(clamp01(state.distFrac) * 100)}%`;
    if (liveText !== this.lastLiveLabel) {
      updateTextSprite(this.liveLabel, this.liveLabelTex, liveText, C.labelBg, C.live);
      this.lastLiveLabel = liveText;
    }
    this.liveLabel.position.set(p.x, 2.4 + p.y, p.z);

    if (state.ghost) {
      if (!this.ghostLabel) {
        const spr = makeTextSprite("", C.labelBg, C.ghost);
        this.ghostLabel = spr.sprite;
        this.ghostLabelTex = spr.texture;
        this.scene.add(this.ghostLabel);
      }
      this.ghostLabel.visible = true;
      this.ghostGroup.visible = true;
      const ghostMeters = clamp01(state.ghost.distFrac) * state.totalDistance;
      const dGhost = ghostMeters - this.lastGhostMeters;
      this.lastGhostMeters = ghostMeters;
      // Ghost shares the stroke phase visually; only its placement differs.
      const gp = this.placeAvatar(
        this.ghostGroup,
        this.ghostAvatar,
        this.ghostRadius,
        ghostMeters,
        state.ghost.spm,
      );
      this.advanceWake(this.ghostWake, dGhost, gp.x - gp.tx * 1.6, gp.z - gp.tz * 1.6);
      const ghostText = `${state.ghost.label || "PB"} · ${Math.round(state.ghost.distFrac * 100)}%`;
      if (ghostText !== this.lastGhostLabel && this.ghostLabel && this.ghostLabelTex) {
        updateTextSprite(this.ghostLabel, this.ghostLabelTex, ghostText, C.labelBg, C.ghost);
        this.lastGhostLabel = ghostText;
      }
      this.ghostLabel.position.set(gp.x, 2.2 + gp.y, gp.z);
    } else {
      this.ghostGroup.visible = false;
      if (this.ghostLabel) this.ghostLabel.visible = false;
      this.ghostWake?.reset();
      this.lastGhostLabel = "";
      this.lastGhostMeters = NaN;
    }

    // Speed-aware FOV: the lens breathes out gently as the boat runs faster
    // (or the playback rate rises), selling the sense of speed. A zoom is a
    // vestibular trigger, so it is pinned flat under reduced motion; seek-
    // sized distance jumps are excluded from the speed estimate so a scrub
    // doesn't pulse the lens.
    if (this.reduceMotion) {
      this.smoothedSpeed = 0;
      this.fovCurrent = 46;
    } else {
      if (dt > 0 && dLive >= 0 && dLive < dt * 120) {
        const inst = dLive > 0 ? Math.min(dLive / dt, 40) : 0;
        this.smoothedSpeed += (inst - this.smoothedSpeed) * dampFactor(3, dt);
      }
      const fovTarget = 46 + Math.max(0, Math.min(1, (this.smoothedSpeed - 3) / 6)) * 5;
      this.fovCurrent +=
        (fovTarget - this.fovCurrent) * (this.cameraInit ? dampFactor(2.5, dt) : 1);
    }
    if (Math.abs(this.camera.fov - this.fovCurrent) > 0.01) {
      this.camera.fov = this.fovCurrent;
      this.camera.updateProjectionMatrix();
    }

    // Chase camera: behind the live boat along its tangent, raised, looking
    // ahead, with a slight outward offset so the athlete reads three-quarter
    // rather than dead astern.
    const back = 9.5;
    const height = 5.5;
    const ahead = 7;
    const lateral = 1.8;
    const rx = p.x / this.loopRadius;
    const rz = p.z / this.loopRadius;
    this.chase.set(p.x - p.tx * back + rx * lateral, height, p.z - p.tz * back + rz * lateral);
    this.lookAt.set(p.x + p.tx * ahead, 1.1, p.z + p.tz * ahead);
    if (!this.cameraInit) {
      this.camera.position.copy(this.chase);
      this.cameraInit = true;
    } else if (playing) {
      // Exponential damping is frame-rate independent.
      this.camera.position.lerp(this.chase, dampFactor(7.5, dt));
    } else if (dLive !== 0 || this.camera.position.distanceToSquared(this.chase) > 9) {
      // Paused renders are on-demand, so nothing would drive a gradual
      // convergence: snap only when the target actually jumped (seek,
      // workout change). The sub-metre trailing lag left at the pause
      // boundary is kept, avoiding a visible pop.
      this.camera.position.copy(this.chase);
    }
    this.camera.lookAt(this.lookAt);

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Advance a wake trail for a frame's travel `d` (m). Backward seeks and
   * teleport-sized jumps restart the trail instead of painting quads along
   * the scrub chord; paused renders (d = 0) leave it untouched.
   */
  private advanceWake(wake: WakeTrail | null, d: number, x: number, z: number): void {
    if (!wake) return;
    if (this.reduceMotion || d < 0 || d > 30) wake.reset();
    else if (d > 0) wake.update(x, z);
  }

  private disposeObject3D(root: THREE.Object3D): void {
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m.dispose();
      }
    });
  }

  destroy(): void {
    this.disposeObject3D(this.liveBoat);
    this.disposeObject3D(this.ghostGroup);
    this.liveWake?.dispose();
    this.ghostWake?.dispose();
    // Instance buffers are owned by the InstancedMesh, not the tracked
    // geometry/material, so they need their own dispose.
    this.buoyMesh?.dispose();
    this.sprayMesh?.dispose();
    if (this.liveLabel.material instanceof THREE.Material) this.liveLabel.material.dispose();
    if (this.ghostLabel?.material instanceof THREE.Material) this.ghostLabel.material.dispose();
    this.liveLabelTex.dispose();
    this.ghostLabelTex?.dispose();
    for (const m of this.disposables) m.dispose();
    for (const g of this.geometries) g.dispose();
    // Lose the context *before* dispose(): once disposed, getContext() may
    // return a stale/null reference in some three versions.
    const gl = this.renderer.getContext();
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    this.renderer.dispose();
    // Remove the owned canvas so the next 3D activation builds a fresh one.
    this.canvas.remove();
  }
}
