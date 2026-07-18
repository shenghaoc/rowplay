import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

const OUTPUT = resolve("static/replay-assets/rowplay-rigs-v1.glb");
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
  flat.computeVertexNormals();
  flat.computeBoundingBox();
  flat.computeBoundingSphere();
  return flat;
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

function addSlot(scene, slot, geometry) {
  const mesh = new THREE.Mesh(geometry, PLACEHOLDER);
  mesh.name = slot;
  mesh.userData.replayAssetSlot = slot;
  scene.add(mesh);
}

const scene = new THREE.Scene();
scene.name = "ROWPLAY_RIG_ASSET_LIBRARY_V1";

// Coherent athlete shells. Normalized parts are fitted to the existing rig
// transforms at runtime; the shoe/neck/equipment slots use authored metre sizes.
addSlot(
  scene,
  "athlete:torso",
  loftGeometry(
    [
      { p: -0.76, rx: 0.46, rz: 0.58, oz: -0.04 },
      { p: -0.52, rx: 0.67, rz: 0.75, oz: -0.02 },
      { p: -0.18, rx: 0.67, rz: 0.82 },
      { p: 0.08, rx: 0.83, rz: 0.94, oz: 0.02 },
      { p: 0.3, rx: 1.02, rz: 0.98, oz: -0.02 },
      { p: 0.43, rx: 1.12, rz: 0.8, oz: -0.04 },
      { p: 0.52, rx: 0.42, rz: 0.52, oz: 0.01 },
    ],
    10,
    "y",
    0,
  ),
);
addSlot(
  scene,
  "athlete:pelvis",
  loftGeometry(
    [
      { p: -1, rx: 0.62, rz: 0.66, oz: -0.03 },
      { p: -0.72, rx: 0.9, rz: 0.82 },
      { p: 0.08, rx: 1.04, rz: 0.94, oz: -0.04 },
      { p: 0.68, rx: 0.93, rz: 0.86, oz: -0.02 },
      { p: 1, rx: 0.7, rz: 0.68 },
    ],
    8,
    "y",
    0,
  ),
);
addSlot(
  scene,
  "athlete:head",
  loftGeometry(
    [
      { p: -0.78, rx: 0.48, rz: 0.42, oz: 0.18 },
      { p: -0.66, rx: 0.78, rz: 0.7, oz: 0.2 },
      { p: -0.12, rx: 1.02, rz: 0.98, oz: 0.05 },
      { p: 0.48, rx: 0.96, rz: 1.04, oz: -0.08 },
      { p: 0.86, rx: 0.66, rz: 0.72, oz: -0.04 },
      { p: 1, rx: 0.28, rz: 0.32 },
    ],
    8,
    "y",
    Math.PI / 8,
  ),
);
addSlot(
  scene,
  "athlete:hair",
  loftGeometry(
    [
      { p: -0.72, rx: 0.76, rz: 0.82, oz: -0.08 },
      { p: -0.1, rx: 1.02, rz: 1.02, oz: -0.1 },
      { p: 0.56, rx: 0.92, rz: 1, oz: -0.09 },
      { p: 0.94, rx: 0.52, rz: 0.6, oz: -0.04 },
      { p: 1.04, rx: 0.18, rz: 0.22 },
    ],
    8,
    "y",
    Math.PI / 8,
  ),
);

const limbSlots = [
  ["athlete:upper-arm", 0.82, 0.62, 0.68, 0.52],
  ["athlete:forearm", 0.68, 0.5, 0.56, 0.4],
  ["athlete:thigh", 1, 0.72, 0.84, 0.62],
  ["athlete:shin", 0.78, 0.52, 0.65, 0.43],
];
for (const [slot, upperX, lowerX, upperY, lowerY] of limbSlots) {
  addSlot(
    scene,
    slot,
    loftGeometry(
      [
        { p: -0.57, rx: lowerX * 0.88, rz: lowerY * 0.84 },
        { p: -0.42, rx: lowerX, rz: lowerY },
        { p: -0.12, rx: (upperX + lowerX) * 0.54, rz: (upperY + lowerY) * 0.54 },
        { p: 0.28, rx: upperX * 1.05, rz: upperY * 1.02 },
        { p: 0.48, rx: upperX, rz: upperY },
        { p: 0.57, rx: upperX * 0.86, rz: upperY * 0.84 },
      ],
      6,
      "z",
      Math.PI / 6,
    ),
  );
}

addSlot(
  scene,
  "athlete:hand",
  wedgeGeometry({ width: 2, height: 2, depth: 2, heel: 0.68, toeLift: 0.18 }),
);
addSlot(
  scene,
  "athlete:shoe",
  wedgeGeometry({ width: 0.14, height: 0.09, depth: 0.25, heel: 0.68, toeLift: 0.025 }),
);
addSlot(
  scene,
  "athlete:neck",
  loftGeometry(
    [
      { p: -0.055, rx: 0.064, rz: 0.058 },
      { p: 0.03, rx: 0.052, rz: 0.05, oz: 0.004 },
      { p: 0.065, rx: 0.045, rz: 0.045, oz: 0.006 },
    ],
    6,
    "y",
    0,
  ),
);
addSlot(
  scene,
  "athlete:shoulder",
  loftGeometry(
    [
      { p: -1.08, rx: 0.54, rz: 0.64 },
      { p: -0.62, rx: 0.92, rz: 0.86, oz: -0.04 },
      { p: 0, rx: 1, rz: 0.9, oz: -0.06 },
      { p: 0.62, rx: 0.92, rz: 0.86, oz: -0.04 },
      { p: 1.08, rx: 0.54, rz: 0.64 },
    ],
    6,
    "x",
    Math.PI / 6,
  ),
);
addSlot(
  scene,
  "athlete:helmet",
  loftGeometry(
    [
      { p: -0.18, rx: 0.88, rz: 0.92, oz: -0.08 },
      { p: 0.14, rx: 1.05, rz: 1.06, oz: -0.06 },
      { p: 0.58, rx: 0.8, rz: 0.88, oz: -0.14 },
      { p: 0.78, rx: 0.28, rz: 0.38, oz: -0.1 },
    ],
    8,
    "y",
    Math.PI / 8,
  ),
);

// Sport equipment templates. They are deliberately texture-free and reuse the
// existing contact/motion nodes; only their visible shells are replaced.
addSlot(
  scene,
  "equipment:row:hull",
  loftGeometry(
    [
      { p: -1.82, rx: 0.06, rz: 0.05 },
      { p: -1.38, rx: 0.24, rz: 0.18 },
      { p: -0.42, rx: 0.34, rz: 0.24 },
      { p: 0.58, rx: 0.3, rz: 0.21 },
      { p: 1.42, rx: 0.18, rz: 0.14 },
      { p: 1.82, rx: 0.025, rz: 0.035 },
    ],
    8,
    "y",
    Math.PI / 8,
  ),
);
addSlot(
  scene,
  "equipment:row:blade",
  wedgeGeometry({ width: 0.16, height: 0.035, depth: 0.5, heel: 0.48, toeLift: 0.012 }),
);
addSlot(
  scene,
  "equipment:ski:ski",
  wedgeGeometry({ width: 0.13, height: 0.045, depth: 1.8, heel: 0.45, toeLift: 0.06 }),
);
addSlot(scene, "equipment:bike:tyre", aeroRingGeometry(0.45, 0.06, 18));
addSlot(
  scene,
  "equipment:bike:frame-tube",
  loftGeometry(
    [
      { p: -0.53, rx: 0.86, rz: 0.64 },
      { p: -0.42, rx: 1.02, rz: 0.72 },
      { p: 0.38, rx: 0.94, rz: 0.68 },
      { p: 0.53, rx: 0.72, rz: 0.56 },
    ],
    6,
    "z",
    Math.PI / 6,
  ),
);
addSlot(
  scene,
  "equipment:bike:saddle",
  wedgeGeometry({ width: 0.24, height: 0.07, depth: 0.32, heel: 0.74, toeLift: 0.012 }),
);
addSlot(
  scene,
  "equipment:bike:pedal",
  wedgeGeometry({ width: 0.22, height: 0.05, depth: 0.1, heel: 0.92, toeLift: 0 }),
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
