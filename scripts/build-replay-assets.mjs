import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

const OUTPUT = resolve("static/replay-assets/rowplay-rigs-v2.glb");
const PLACEHOLDER = new THREE.MeshStandardMaterial({
  color: 0x9aa6b2,
  roughness: 0.78,
  metalness: 0,
});

// GLTFExporter uses the browser FileReader API. Node's Blob already exposes the
// same bytes, so this tiny deterministic adapter keeps the authoring tool local.
globalThis.FileReader ??= class FileReader {
  result = null;
  onloadend = null;

  readAsArrayBuffer(blob) {
    void blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }

  readAsDataURL(blob) {
    void blob.arrayBuffer().then((buffer) => {
      const base64 = Buffer.from(buffer).toString("base64");
      this.result = `data:${blob.type || "application/octet-stream"};base64,${base64}`;
      this.onloadend?.();
    });
  }
};

function flatGeometry(geometry) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  // The runtime contract deliberately permits only position + normal data. A
  // few useful Three.js authoring geometries (notably TubeGeometry) also add
  // UVs, which would turn a texture-free library into an accidental schema
  // expansion at export time. Keep the package geometry-only at its boundary.
  for (const attribute of Object.keys(flat.attributes)) {
    if (attribute !== "position" && attribute !== "normal") flat.deleteAttribute(attribute);
  }
  flat.computeVertexNormals();
  flat.computeBoundingBox();
  flat.computeBoundingSphere();
  return flat;
}

/**
 * Merge small authored forms into one strict replay-asset primitive.  Each
 * slot remains a single named mesh/material at runtime, while disconnected
 * forms such as a sole, visor, or sculpted cuff can still enrich its outline.
 */
function composeGeometry(...sources) {
  const positions = [];
  for (const source of sources) {
    const geometry = flatGeometry(source);
    const position = geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++) {
      positions.push(position.getX(i), position.getY(i), position.getZ(i));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return flatGeometry(geometry);
}

function translatedGeometry(geometry, x = 0, y = 0, z = 0) {
  geometry.translate(x, y, z);
  return geometry;
}

/**
 * A compact raised accent following a Catmull-Rom path.  TubeGeometry gives
 * us a controlled, directional ridge without a texture, downloaded model, or
 * a second runtime object.  The resulting geometry is stripped back to the
 * package's position/normal-only contract by `flatGeometry`.
 */
function ridgeGeometry(points, radius, tubularSegments = 8, radialSegments = 6) {
  const path = new THREE.CatmullRomCurve3(points, false, "centripetal");
  return new THREE.TubeGeometry(path, tubularSegments, radius, radialSegments, false);
}

/**
 * Build a closed authored loft from elliptical cross-sections. Ring offsets,
 * uneven radii and low side counts create intentional anatomical planes rather
 * than a scaled sphere/capsule. Axis is the direction of the part's rig bone.
 */
function loftGeometry(rings, sides = 8, axis = "y", angleOffset = Math.PI / 8) {
  const positions = [];
  const indices = [];
  for (const ring of rings) {
    for (let side = 0; side < sides; side++) {
      const angle = angleOffset + (side / sides) * Math.PI * 2;
      const a = Math.cos(angle) * ring.rx + (ring.ox ?? 0);
      const b = Math.sin(angle) * ring.rz + (ring.oz ?? 0);
      if (axis === "y") positions.push(a, ring.p, b);
      else if (axis === "z") positions.push(a, b, ring.p);
      else positions.push(ring.p, a, b);
    }
  }
  for (let ring = 0; ring < rings.length - 1; ring++) {
    for (let side = 0; side < sides; side++) {
      const next = (side + 1) % sides;
      const a = ring * sides + side;
      const b = ring * sides + next;
      const c = (ring + 1) * sides + side;
      const d = (ring + 1) * sides + next;
      indices.push(a, c, b, b, c, d);
    }
  }
  const firstCenter = positions.length / 3;
  const first = rings[0];
  const lastCenter = firstCenter + 1;
  const last = rings.at(-1);
  if (!first || !last) throw new Error("loft requires at least two rings");
  if (axis === "y") {
    positions.push(first.ox ?? 0, first.p, first.oz ?? 0);
    positions.push(last.ox ?? 0, last.p, last.oz ?? 0);
  } else if (axis === "z") {
    positions.push(first.ox ?? 0, first.oz ?? 0, first.p);
    positions.push(last.ox ?? 0, last.oz ?? 0, last.p);
  } else {
    positions.push(first.p, first.ox ?? 0, first.oz ?? 0);
    positions.push(last.p, last.ox ?? 0, last.oz ?? 0);
  }
  const lastStart = (rings.length - 1) * sides;
  for (let side = 0; side < sides; side++) {
    const next = (side + 1) % sides;
    indices.push(firstCenter, side, next);
    indices.push(lastCenter, lastStart + next, lastStart + side);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return flatGeometry(geometry);
}

function wedgeGeometry({ width, height, depth, heel = 0.72, toeLift = 0 }) {
  const hw = width / 2;
  const hh = height / 2;
  const hd = depth / 2;
  const back = -hd;
  const front = hd;
  const positions = [
    -hw * heel,
    -hh,
    back,
    hw * heel,
    -hh,
    back,
    -hw * heel,
    hh * 0.72,
    back,
    hw * heel,
    hh * 0.72,
    back,
    -hw,
    -hh + toeLift * 0.28,
    front,
    hw,
    -hh + toeLift * 0.28,
    front,
    -hw * 0.92,
    hh + toeLift,
    front,
    hw * 0.92,
    hh + toeLift,
    front,
  ];
  const indices = [
    0, 1, 2, 1, 3, 2, 4, 6, 5, 5, 6, 7, 0, 4, 1, 1, 4, 5, 2, 3, 6, 3, 7, 6, 0, 2, 4, 2, 6, 4, 1, 5,
    3, 3, 5, 7,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return flatGeometry(geometry);
}

function aeroRingGeometry(radius, depth, radialSegments = 16) {
  const positions = [];
  const indices = [];
  const radialProfile = [
    { r: radius - depth * 0.42, z: 0 },
    { r: radius - depth * 0.12, z: depth * 0.72 },
    { r: radius + depth * 0.32, z: depth * 0.42 },
    { r: radius + depth * 0.45, z: -depth * 0.18 },
    { r: radius, z: -depth * 0.72 },
  ];
  for (let radial = 0; radial < radialSegments; radial++) {
    const angle = (radial / radialSegments) * Math.PI * 2;
    for (const profile of radialProfile) {
      positions.push(Math.cos(angle) * profile.r, Math.sin(angle) * profile.r, profile.z);
    }
  }
  const profileCount = radialProfile.length;
  for (let radial = 0; radial < radialSegments; radial++) {
    const nextRadial = (radial + 1) % radialSegments;
    for (let p = 0; p < profileCount; p++) {
      const nextP = (p + 1) % profileCount;
      const a = radial * profileCount + p;
      const b = radial * profileCount + nextP;
      const c = nextRadial * profileCount + p;
      const d = nextRadial * profileCount + nextP;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return flatGeometry(geometry);
}

/**
 * A unit-length limb oriented along +Z. The proximal cuff begins at -Z and
 * the distal cuff ends at +Z, matching `placeSegmentBetween` in the renderer.
 * Keeping the distal end narrow is especially important at a flexed elbow:
 * the silhouette reads as a biceps/triceps transition instead of two swollen
 * capsules fighting over the same joint.
 */
function anatomicalLimbGeometry({ proximalX, proximalY, distalX, distalY, belly = 1.1 }) {
  return loftGeometry(
    [
      { p: -0.52, rx: proximalX * 0.76, rz: proximalY * 0.78 },
      { p: -0.42, rx: proximalX * 0.96, rz: proximalY * 0.96 },
      { p: -0.18, rx: proximalX * belly, rz: proximalY * (belly + 0.02) },
      { p: 0.04, rx: proximalX * 0.98, rz: proximalY * 1.0 },
      { p: 0.24, rx: (proximalX + distalX) * 0.52, rz: (proximalY + distalY) * 0.52 },
      { p: 0.4, rx: distalX * 0.94, rz: distalY * 0.94 },
      { p: 0.49, rx: distalX * 0.7, rz: distalY * 0.72 },
      { p: 0.52, rx: distalX * 0.58, rz: distalY * 0.6 },
    ],
    10,
    "z",
    Math.PI / 10,
  );
}

function clenchedHandGeometry() {
  const palm = loftGeometry(
    [
      { p: -0.92, rx: 0.54, rz: 0.5 },
      { p: -0.66, rx: 0.74, rz: 0.66 },
      { p: -0.2, rx: 0.9, rz: 0.76, oz: -0.06 },
      { p: 0.26, rx: 0.86, rz: 0.72, oz: -0.1 },
      { p: 0.58, rx: 0.7, rz: 0.58, oz: -0.06 },
      { p: 0.78, rx: 0.5, rz: 0.42 },
    ],
    8,
    "z",
    Math.PI / 8,
  );
  // A lightly raised knuckle bridge catches the camera rim light and makes a
  // hand holding an oar/pole read as a grip rather than a featureless mitten.
  const knuckleBridge = ridgeGeometry(
    [
      new THREE.Vector3(-0.52, 0.58, -0.1),
      new THREE.Vector3(-0.18, 0.72, 0.2),
      new THREE.Vector3(0.2, 0.72, 0.34),
      new THREE.Vector3(0.5, 0.52, 0.48),
    ],
    0.1,
    6,
    5,
  );
  const thumb = wedgeGeometry({
    width: 0.62,
    height: 0.42,
    depth: 0.46,
    heel: 0.7,
    toeLift: 0.04,
  });
  thumb.rotateZ(-0.3);
  thumb.translate(0.5, -0.18, 0.14);
  return composeGeometry(palm, knuckleBridge, thumb);
}

/**
 * A local-origin elbow shell with a shallow flex groove and an asymmetric
 * olecranon point. It is deliberately compact: limb ends now meet at ±0.52,
 * so this form reads as an anatomical transition rather than a second ball
 * forced between self-intersecting arm segments.
 */
function elbowFlexCuffGeometry() {
  const cuff = loftGeometry(
    [
      { p: -0.94, rx: 0.48, rz: 0.46, ox: -0.02 },
      { p: -0.7, rx: 0.72, rz: 0.64, ox: -0.035 },
      { p: -0.3, rx: 0.88, rz: 0.74, ox: -0.025, oz: -0.045 },
      { p: 0.06, rx: 0.84, rz: 0.78, ox: 0.02, oz: -0.09 },
      { p: 0.4, rx: 0.7, rz: 0.65, ox: 0.06, oz: -0.04 },
      { p: 0.74, rx: 0.5, rz: 0.5, ox: 0.04 },
      { p: 0.94, rx: 0.34, rz: 0.36, ox: 0.02 },
    ],
    8,
    "z",
    Math.PI / 8,
  );
  const olecranon = translatedGeometry(new THREE.TetrahedronGeometry(0.24, 1), 0.06, -0.58, 0.25);
  return composeGeometry(cuff, olecranon);
}

function performanceShoeGeometry() {
  const upper = wedgeGeometry({
    width: 0.14,
    height: 0.09,
    depth: 0.25,
    heel: 0.66,
    toeLift: 0.027,
  });
  const sole = translatedGeometry(new THREE.BoxGeometry(0.15, 0.018, 0.258), 0, -0.054, 0.012);
  const heelCounter = translatedGeometry(
    new THREE.BoxGeometry(0.105, 0.055, 0.052),
    0,
    0.004,
    -0.1,
  );
  const toeCap = translatedGeometry(new THREE.BoxGeometry(0.13, 0.028, 0.05), 0, -0.006, 0.11);
  return composeGeometry(upper, sole, heelCounter, toeCap);
}

function scullBladeGeometry() {
  const spoon = loftGeometry(
    [
      { p: -0.29, rx: 0.014, rz: 0.055 },
      { p: -0.2, rx: 0.022, rz: 0.11 },
      { p: -0.02, rx: 0.032, rz: 0.16, oz: 0.007 },
      { p: 0.16, rx: 0.028, rz: 0.14, oz: 0.01 },
      { p: 0.27, rx: 0.018, rz: 0.075 },
    ],
    8,
    "x",
    0,
  );
  const spine = ridgeGeometry(
    [
      new THREE.Vector3(-0.22, 0.026, 0),
      new THREE.Vector3(-0.02, 0.05, 0),
      new THREE.Vector3(0.18, 0.035, 0),
    ],
    0.009,
    6,
    5,
  );
  return composeGeometry(spoon, spine);
}

function nordicSkiGeometry() {
  const ski = loftGeometry(
    [
      { p: -0.98, rx: 0.035, rz: 0.012 },
      { p: -0.72, rx: 0.052, rz: 0.02 },
      { p: -0.22, rx: 0.06, rz: 0.028 },
      { p: 0.36, rx: 0.058, rz: 0.028 },
      { p: 0.76, rx: 0.05, rz: 0.025 },
      { p: 0.98, rx: 0.032, rz: 0.02, oz: 0.03 },
    ],
    8,
    "z",
    Math.PI / 8,
  );
  const binding = translatedGeometry(new THREE.BoxGeometry(0.1, 0.028, 0.25), 0, 0.028, -0.04);
  const tipRidge = ridgeGeometry(
    [
      new THREE.Vector3(0, 0.026, 0.38),
      new THREE.Vector3(0, 0.036, 0.74),
      new THREE.Vector3(0, 0.085, 0.98),
    ],
    0.009,
    6,
    5,
  );
  return composeGeometry(ski, binding, tipRidge);
}

function nordicPoleShaftGeometry() {
  const shaft = loftGeometry(
    [
      { p: -0.5, rx: 0.72, rz: 0.72 },
      { p: -0.32, rx: 0.82, rz: 0.82 },
      { p: 0.12, rx: 0.98, rz: 0.98 },
      { p: 0.36, rx: 0.8, rz: 0.8 },
      { p: 0.5, rx: 0.62, rz: 0.62 },
    ],
    8,
    "z",
    Math.PI / 8,
  );
  const lowerReinforcement = new THREE.CylinderGeometry(0.92, 0.72, 0.14, 8);
  lowerReinforcement.rotateX(Math.PI / 2);
  lowerReinforcement.translate(0, 0, 0.39);
  return composeGeometry(shaft, lowerReinforcement);
}

function nordicPoleGripGeometry() {
  const grip = loftGeometry(
    [
      { p: -0.5, rx: 0.62, rz: 0.7 },
      { p: -0.3, rx: 0.92, rz: 1.0, oz: -0.04 },
      { p: 0.12, rx: 1.02, rz: 1.06, oz: -0.06 },
      { p: 0.4, rx: 0.76, rz: 0.82, oz: -0.03 },
      { p: 0.5, rx: 0.5, rz: 0.56 },
    ],
    8,
    "z",
    Math.PI / 8,
  );
  const guard = new THREE.TorusGeometry(0.84, 0.11, 6, 10);
  guard.translate(0, 0, -0.42);
  return composeGeometry(grip, guard);
}

function nordicPoleBasketGeometry() {
  const basket = new THREE.CylinderGeometry(0.88, 1, 0.28, 10);
  const ferrule = translatedGeometry(new THREE.ConeGeometry(0.36, 0.52, 8), 0, -0.38, 0);
  const cap = translatedGeometry(new THREE.CylinderGeometry(0.58, 0.58, 0.08, 10), 0, 0.18, 0);
  return composeGeometry(basket, ferrule, cap);
}

function treadedAeroRingGeometry(radius, depth, radialSegments = 20) {
  const parts = [aeroRingGeometry(radius, depth, radialSegments)];
  for (let index = 0; index < radialSegments; index++) {
    const angle = (index / radialSegments) * Math.PI * 2;
    const tread = new THREE.BoxGeometry(depth * 0.72, depth * 0.46, depth * 0.9);
    tread.rotateZ(angle);
    tread.translate(
      Math.cos(angle) * (radius + depth * 0.26),
      Math.sin(angle) * (radius + depth * 0.26),
      0,
    );
    parts.push(tread);
  }
  return composeGeometry(...parts);
}

function addSlot(scene, slot, geometry) {
  const mesh = new THREE.Mesh(geometry, PLACEHOLDER);
  mesh.name = slot;
  mesh.userData.replayAssetSlot = slot;
  scene.add(mesh);
}

const scene = new THREE.Scene();
scene.name = "ROWPLAY_RIG_ASSET_LIBRARY_V2";

// Coherent athlete shells. Normalized parts are fitted to the existing rig
// transforms at runtime; the shoe/neck/equipment slots use authored metre sizes.
// Rings bias toward a broadcast sports-illustration silhouette: broad back,
// clear waist, directional head, and soft joint-overlap on limbs so the
// chase camera never reads ball-joint mannequin seams.
addSlot(
  scene,
  "athlete:torso",
  loftGeometry(
    [
      { p: -0.78, rx: 0.5, rz: 0.6, oz: -0.07 },
      { p: -0.66, rx: 0.62, rz: 0.73, oz: -0.06 },
      { p: -0.48, rx: 0.75, rz: 0.84, oz: -0.045 },
      { p: -0.24, rx: 0.7, rz: 0.89, oz: -0.02 },
      { p: -0.04, rx: 0.75, rz: 0.96, oz: 0.015 },
      { p: 0.14, rx: 0.98, rz: 1.02, oz: 0.018 },
      { p: 0.29, rx: 1.12, rz: 1.0, oz: -0.01 },
      { p: 0.4, rx: 1.2, rz: 0.91, oz: -0.055 },
      { p: 0.47, rx: 1.09, rz: 0.82, oz: -0.055 },
      { p: 0.53, rx: 0.78, rz: 0.66, oz: -0.025 },
      { p: 0.56, rx: 0.36, rz: 0.44, oz: 0.005 },
    ],
    14,
    "y",
    0,
  ),
);
addSlot(
  scene,
  "athlete:pelvis",
  loftGeometry(
    [
      { p: -1, rx: 0.66, rz: 0.68, oz: -0.04 },
      { p: -0.78, rx: 0.86, rz: 0.8, oz: -0.035 },
      { p: -0.44, rx: 1.04, rz: 0.94, oz: -0.04 },
      { p: -0.04, rx: 1.12, rz: 1.02, oz: -0.055 },
      { p: 0.38, rx: 1.06, rz: 0.98, oz: -0.05 },
      { p: 0.7, rx: 0.9, rz: 0.84, oz: -0.025 },
      { p: 1, rx: 0.7, rz: 0.68 },
    ],
    12,
    "y",
    0,
  ),
);
addSlot(
  scene,
  "athlete:head",
  loftGeometry(
    [
      { p: -0.82, rx: 0.38, rz: 0.34, oz: 0.25 },
      { p: -0.68, rx: 0.62, rz: 0.56, oz: 0.27 },
      { p: -0.52, rx: 0.8, rz: 0.75, oz: 0.22 },
      { p: -0.3, rx: 0.94, rz: 0.9, oz: 0.14 },
      { p: -0.04, rx: 1.04, rz: 0.99, oz: 0.045 },
      { p: 0.24, rx: 1.02, rz: 1.03, oz: -0.025 },
      { p: 0.5, rx: 0.92, rz: 0.98, oz: -0.065 },
      { p: 0.74, rx: 0.72, rz: 0.8, oz: -0.05 },
      { p: 0.9, rx: 0.46, rz: 0.52, oz: -0.025 },
      { p: 1, rx: 0.22, rz: 0.25 },
    ],
    12,
    "y",
    Math.PI / 10,
  ),
);
addSlot(
  scene,
  "athlete:hair",
  loftGeometry(
    [
      { p: -0.72, rx: 0.72, rz: 0.78, oz: -0.11 },
      { p: -0.48, rx: 0.94, rz: 0.98, oz: -0.13 },
      { p: -0.1, rx: 1.08, rz: 1.08, oz: -0.14 },
      { p: 0.28, rx: 1.05, rz: 1.1, oz: -0.13 },
      { p: 0.6, rx: 0.88, rz: 0.95, oz: -0.1 },
      { p: 0.84, rx: 0.56, rz: 0.62, oz: -0.06 },
      { p: 1.04, rx: 0.16, rz: 0.2 },
    ],
    12,
    "y",
    Math.PI / 10,
  ),
);

const limbSlots = [
  [
    "athlete:upper-arm",
    { proximalX: 0.78, proximalY: 0.68, distalX: 0.5, distalY: 0.46, belly: 1.14 },
  ],
  [
    "athlete:forearm",
    { proximalX: 0.64, proximalY: 0.56, distalX: 0.4, distalY: 0.36, belly: 1.12 },
  ],
  ["athlete:thigh", { proximalX: 1.02, proximalY: 0.88, distalX: 0.68, distalY: 0.6, belly: 1.16 }],
  ["athlete:shin", { proximalX: 0.74, proximalY: 0.64, distalX: 0.42, distalY: 0.36, belly: 1.1 }],
];
for (const [slot, proportions] of limbSlots) {
  addSlot(scene, slot, anatomicalLimbGeometry(proportions));
}

addSlot(scene, "athlete:hand", clenchedHandGeometry());
addSlot(scene, "athlete:elbow", elbowFlexCuffGeometry());
addSlot(scene, "athlete:shoe", performanceShoeGeometry());
addSlot(
  scene,
  "athlete:neck",
  loftGeometry(
    [
      { p: -0.055, rx: 0.066, rz: 0.06 },
      { p: -0.025, rx: 0.064, rz: 0.06, oz: 0.002 },
      { p: 0.02, rx: 0.054, rz: 0.052, oz: 0.005 },
      { p: 0.052, rx: 0.048, rz: 0.047, oz: 0.007 },
      { p: 0.068, rx: 0.042, rz: 0.042, oz: 0.008 },
    ],
    8,
    "y",
    0,
  ),
);
addSlot(
  scene,
  "athlete:shoulder",
  loftGeometry(
    [
      { p: -1.12, rx: 0.5, rz: 0.62 },
      { p: -0.78, rx: 0.78, rz: 0.82, oz: -0.035 },
      { p: -0.32, rx: 1.0, rz: 0.95, oz: -0.065 },
      { p: 0.1, rx: 1.08, rz: 0.98, oz: -0.075 },
      { p: 0.5, rx: 0.92, rz: 0.9, oz: -0.045 },
      { p: 0.86, rx: 0.7, rz: 0.76 },
      { p: 1.12, rx: 0.46, rz: 0.58 },
    ],
    10,
    "x",
    Math.PI / 7,
  ),
);
addSlot(
  scene,
  "athlete:helmet",
  composeGeometry(
    loftGeometry(
      [
        { p: -0.24, rx: 0.78, rz: 0.82, oz: -0.12 },
        { p: -0.08, rx: 1.0, rz: 1.02, oz: -0.11 },
        { p: 0.16, rx: 1.1, rz: 1.1, oz: -0.09 },
        { p: 0.4, rx: 1.0, rz: 1.02, oz: -0.11 },
        { p: 0.6, rx: 0.78, rz: 0.82, oz: -0.13 },
        { p: 0.76, rx: 0.3, rz: 0.36, oz: -0.1 },
      ],
      12,
      "y",
      Math.PI / 10,
    ),
    ridgeGeometry(
      [
        new THREE.Vector3(0, 0.42, -0.72),
        new THREE.Vector3(0, 0.72, -0.12),
        new THREE.Vector3(0, 0.64, 0.38),
      ],
      0.052,
      8,
      6,
    ),
  ),
);

// Sport equipment templates. They are deliberately texture-free and reuse the
// existing contact/motion nodes; only their visible shells are replaced.
addSlot(
  scene,
  "equipment:row:hull",
  loftGeometry(
    [
      { p: -1.9, rx: 0.03, rz: 0.026 },
      { p: -1.7, rx: 0.11, rz: 0.09 },
      { p: -1.38, rx: 0.23, rz: 0.17 },
      { p: -0.9, rx: 0.32, rz: 0.23 },
      { p: -0.32, rx: 0.37, rz: 0.26 },
      { p: 0.36, rx: 0.35, rz: 0.245 },
      { p: 0.96, rx: 0.28, rz: 0.2 },
      { p: 1.42, rx: 0.19, rz: 0.14 },
      { p: 1.72, rx: 0.1, rz: 0.078 },
      { p: 1.9, rx: 0.018, rz: 0.022 },
    ],
    14,
    "y",
    Math.PI / 9,
  ),
);
addSlot(scene, "equipment:row:blade", scullBladeGeometry());
addSlot(scene, "equipment:ski:ski", nordicSkiGeometry());
addSlot(scene, "equipment:ski:pole-shaft", nordicPoleShaftGeometry());
addSlot(scene, "equipment:ski:pole-grip", nordicPoleGripGeometry());
addSlot(scene, "equipment:ski:pole-basket", nordicPoleBasketGeometry());
addSlot(scene, "equipment:bike:tyre", treadedAeroRingGeometry(0.45, 0.06, 20));
addSlot(
  scene,
  "equipment:bike:frame-tube",
  loftGeometry(
    [
      { p: -0.53, rx: 0.64, rz: 0.54 },
      { p: -0.43, rx: 0.9, rz: 0.68 },
      { p: -0.22, rx: 1.02, rz: 0.76 },
      { p: 0.1, rx: 1.0, rz: 0.74 },
      { p: 0.36, rx: 0.9, rz: 0.68 },
      { p: 0.5, rx: 0.66, rz: 0.54 },
    ],
    8,
    "z",
    Math.PI / 6,
  ),
);
addSlot(
  scene,
  "equipment:bike:saddle",
  composeGeometry(
    wedgeGeometry({ width: 0.24, height: 0.07, depth: 0.32, heel: 0.7, toeLift: 0.014 }),
    translatedGeometry(new THREE.BoxGeometry(0.14, 0.018, 0.22), 0, -0.046, -0.025),
    translatedGeometry(new THREE.BoxGeometry(0.18, 0.024, 0.08), 0, 0.016, 0.09),
  ),
);
addSlot(
  scene,
  "equipment:bike:pedal",
  composeGeometry(
    wedgeGeometry({ width: 0.22, height: 0.05, depth: 0.1, heel: 0.9, toeLift: 0 }),
    translatedGeometry(new THREE.BoxGeometry(0.17, 0.022, 0.025), 0, 0.035, 0.035),
    translatedGeometry(new THREE.BoxGeometry(0.17, 0.022, 0.025), 0, 0.035, -0.035),
  ),
);

const exporter = new GLTFExporter();
const result = await exporter.parseAsync(scene, {
  binary: true,
  onlyVisible: true,
  trs: false,
  truncateDrawRange: true,
});
if (!(result instanceof ArrayBuffer)) throw new Error("Expected binary GLB output");
await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, Buffer.from(result));
console.log(`wrote ${OUTPUT} (${result.byteLength} bytes)`);
