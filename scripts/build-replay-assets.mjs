import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { BIKE_RIG, bikeWheelAxleY } from "../src/lib/replay/bikeRig.js";
import { SKI_ATHLETE_PROPORTIONS } from "../src/lib/replay/skiEquipment.ts";
import { buildBikeSaddleGeometry } from "../src/lib/replay/bikeSaddle.js";

// v3 deliberately widens the asset contract from isolated replacement shells
// to a small set of authored equipment assemblies.  Keeping this a new file
// makes the v2 leaf-only fallback available to older renderer builds while the
// v3 loader can opt into the higher-detail hierarchy explicitly.
const OUTPUT = resolve("static/replay-assets/rowplay-rigs-v3.glb");
const ROWING_SHELL_GENERATOR = resolve("scripts/build-replay-rowing-shell-blender.py");
const DEFAULT_BLENDER = "/Applications/Blender.app/Contents/MacOS/blender";
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
  // Keep shared vertices so the renderer can retain smooth anatomical normals
  // across each shell. A few useful Three.js authoring geometries (notably
  // TubeGeometry) also add UVs, which would turn a texture-free library into
  // an accidental schema expansion at export time. Keep the package
  // geometry-only at its boundary.
  for (const attribute of Object.keys(geometry.attributes)) {
    if (attribute !== "position" && attribute !== "normal") geometry.deleteAttribute(attribute);
  }
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute("normal");
  for (let index = 0; index < normals.count; index++) {
    const x = normals.getX(index);
    const y = normals.getY(index);
    const z = normals.getZ(index);
    const length = Math.hypot(x, y, z);
    if (length > 1e-8) normals.setXYZ(index, x / length, y / length, z / length);
    else normals.setXYZ(index, 0, 1, 0);
  }
  normals.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Merge small authored forms into one strict replay-asset primitive.  Each
 * slot remains a single named mesh/material at runtime, while disconnected
 * forms such as a sole, visor, or sculpted cuff can still enrich its outline.
 */
function composeGeometry(...sources) {
  const positions = [];
  const indices = [];
  let vertexOffset = 0;
  for (const source of sources) {
    const geometry = flatGeometry(source);
    const position = geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++) {
      positions.push(position.getX(i), position.getY(i), position.getZ(i));
    }
    const sourceIndices = geometry.getIndex();
    if (sourceIndices) {
      for (let i = 0; i < sourceIndices.count; i++)
        indices.push(sourceIndices.getX(i) + vertexOffset);
    } else {
      for (let i = 0; i < position.count; i++) indices.push(i + vertexOffset);
    }
    vertexOffset += position.count;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
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
function ridgeGeometry(points, radius, tubularSegments = 10, radialSegments = 8) {
  const path = new THREE.CatmullRomCurve3(points, false, "centripetal");
  return flatGeometry(new THREE.TubeGeometry(path, tubularSegments, radius, radialSegments, false));
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

function aeroRingGeometry(radius, depth, radialSegments = 16) {
  const positions = [];
  const indices = [];
  const radialProfile = [
    { r: radius - depth * 0.5, z: 0 },
    { r: radius - depth * 0.34, z: depth * 0.42 },
    { r: radius - depth * 0.08, z: depth * 0.7 },
    { r: radius + depth * 0.2, z: depth * 0.62 },
    { r: radius + depth * 0.42, z: depth * 0.28 },
    { r: radius + depth * 0.47, z: -depth * 0.16 },
    { r: radius + depth * 0.24, z: -depth * 0.58 },
    { r: radius - depth * 0.1, z: -depth * 0.72 },
    { r: radius - depth * 0.38, z: -depth * 0.4 },
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
      // A small asymmetric drift through the cross-sections gives the limb a
      // believable biceps/calf belly and tendon landing.  It is intentionally
      // encoded in the authored shell rather than as extra runtime geometry:
      // the contact-safe +Z bone contract remains exactly unchanged.
      { p: -0.52, rx: proximalX * 0.76, rz: proximalY * 0.78, ox: -0.03, oz: -0.015 },
      { p: -0.46, rx: proximalX * 0.91, rz: proximalY * 0.92, ox: -0.045, oz: -0.018 },
      { p: -0.34, rx: proximalX * 1.04, rz: proximalY * 1.05, ox: -0.055, oz: -0.01 },
      { p: -0.2, rx: proximalX * belly, rz: proximalY * (belly + 0.025), ox: -0.045 },
      { p: -0.06, rx: proximalX * 1.05, rz: proximalY * 1.06, ox: -0.015, oz: 0.014 },
      { p: 0.08, rx: proximalX * 0.91, rz: proximalY * 0.93, ox: 0.018, oz: 0.026 },
      {
        p: 0.2,
        rx: (proximalX + distalX) * 0.54,
        rz: (proximalY + distalY) * 0.54,
        ox: 0.035,
        oz: 0.022,
      },
      { p: 0.32, rx: distalX * 1.03, rz: distalY * 1.04, ox: 0.044, oz: 0.012 },
      { p: 0.42, rx: distalX * 0.9, rz: distalY * 0.91, ox: 0.035, oz: 0.004 },
      { p: 0.49, rx: distalX * 0.68, rz: distalY * 0.7, ox: 0.016 },
      { p: 0.52, rx: distalX * 0.58, rz: distalY * 0.6, ox: 0.006 },
    ],
    16,
    "z",
    Math.PI / 10,
  );
}

/**
 * One directional, generic human head.  The replay camera is too distant for
 * literal facial features, but a brow/nose plane, jaw taper and ears prevent
 * the head from reading as a featureless bead.  +Z is the gaze direction used
 * by the existing head group, so the profile stays coherent for row, ski and
 * bike without adding a new runtime transform.
 */
function directionalHeadGeometry() {
  const cranium = loftGeometry(
    [
      { p: -0.98, rx: 0.26, rz: 0.22, oz: 0.2 },
      { p: -0.82, rx: 0.5, rz: 0.42, oz: 0.25 },
      { p: -0.64, rx: 0.72, rz: 0.62, oz: 0.22 },
      { p: -0.4, rx: 0.9, rz: 0.8, oz: 0.13 },
      { p: -0.1, rx: 1.02, rz: 0.94, oz: 0.015 },
      { p: 0.2, rx: 1.04, rz: 0.98, oz: -0.09 },
      { p: 0.48, rx: 0.92, rz: 0.9, oz: -0.16 },
      { p: 0.72, rx: 0.68, rz: 0.67, oz: -0.15 },
      { p: 0.9, rx: 0.38, rz: 0.36, oz: -0.1 },
      { p: 1, rx: 0.14, rz: 0.16, oz: -0.05 },
    ],
    20,
    "y",
    Math.PI / 12,
  );
  const brow = ridgeGeometry(
    [
      new THREE.Vector3(-0.56, 0.16, 0.74),
      new THREE.Vector3(0, 0.25, 0.9),
      new THREE.Vector3(0.56, 0.16, 0.74),
    ],
    0.04,
    10,
    7,
  );
  const nose = loftGeometry(
    [
      { p: 0.5, rx: 0.14, rz: 0.17, oz: 0.015 },
      { p: 0.76, rx: 0.13, rz: 0.18, oz: -0.02 },
      { p: 0.98, rx: 0.075, rz: 0.105, oz: -0.08 },
      { p: 1.06, rx: 0.035, rz: 0.045, oz: -0.11 },
    ],
    10,
    "z",
    Math.PI / 10,
  );
  const ears = [-1, 1].map((side) =>
    ellipsoidGeometry([0.15, 0.26, 0.075], 14, 10, [side * 1.01, -0.02, -0.01]),
  );
  return composeGeometry(cranium, brow, nose, ...ears);
}

/**
 * A cap of hair rather than a second smooth sphere.  Its swept crown, nape and
 * short temples give the otherwise generic athlete an authored silhouette
 * without creating a hairstyle/likeness claim or a separate material slot.
 */
function sweptHairGeometry() {
  const crown = loftGeometry(
    [
      { p: -0.42, rx: 0.62, rz: 0.5, oz: -0.32 },
      { p: -0.18, rx: 0.86, rz: 0.73, oz: -0.31 },
      { p: 0.14, rx: 1.03, rz: 0.9, oz: -0.28 },
      { p: 0.45, rx: 1.05, rz: 0.95, oz: -0.24 },
      { p: 0.7, rx: 0.84, rz: 0.72, oz: -0.2 },
      { p: 0.9, rx: 0.48, rz: 0.42, oz: -0.16 },
      { p: 1.04, rx: 0.16, rz: 0.18, oz: -0.11 },
    ],
    20,
    "y",
    Math.PI / 12,
  );
  const nape = loftGeometry(
    [
      { p: -0.72, rx: 0.42, rz: 0.18, oz: -0.8 },
      { p: -0.48, rx: 0.62, rz: 0.23, oz: -0.72 },
      { p: -0.2, rx: 0.54, rz: 0.19, oz: -0.6 },
      { p: 0.02, rx: 0.32, rz: 0.12, oz: -0.48 },
    ],
    14,
    "y",
    Math.PI / 12,
  );
  const temples = [-1, 1].map((side) =>
    ridgeGeometry(
      [
        new THREE.Vector3(side * 0.78, 0.34, 0.24),
        new THREE.Vector3(side * 0.9, 0.08, 0.12),
        new THREE.Vector3(side * 0.8, -0.16, -0.08),
      ],
      0.07,
      8,
      7,
    ),
  );
  return composeGeometry(crown, nape, ...temples);
}

/**
 * Preserve the old helmet bounds but make the shell legible as an aero helmet:
 * rounded crown, rear tail, central ridge and a compact forward visor.  This
 * is all one compatibility leaf, so BikeErg keeps the same head anchor.
 */
function aeroHelmetGeometry() {
  const shell = loftGeometry(
    [
      { p: -0.48, rx: 0.52, rz: 0.42, oz: -0.28 },
      { p: -0.22, rx: 0.82, rz: 0.68, oz: -0.26 },
      { p: 0.08, rx: 1.02, rz: 0.88, oz: -0.22 },
      { p: 0.36, rx: 1.1, rz: 0.96, oz: -0.18 },
      { p: 0.6, rx: 0.94, rz: 0.8, oz: -0.16 },
      { p: 0.8, rx: 0.62, rz: 0.52, oz: -0.13 },
      { p: 0.92, rx: 0.24, rz: 0.22, oz: -0.1 },
    ],
    20,
    "y",
    Math.PI / 12,
  );
  const tail = loftGeometry(
    [
      { p: -1.12, rx: 0.08, rz: 0.09, oz: 0.12 },
      { p: -0.88, rx: 0.22, rz: 0.18, oz: 0.1 },
      { p: -0.6, rx: 0.42, rz: 0.3, oz: 0.06 },
      { p: -0.3, rx: 0.56, rz: 0.35, oz: 0.01 },
    ],
    14,
    "z",
    Math.PI / 10,
  );
  const ridge = ridgeGeometry(
    [
      new THREE.Vector3(0, 0.64, -0.86),
      new THREE.Vector3(0, 0.88, -0.16),
      new THREE.Vector3(0, 0.68, 0.42),
    ],
    0.052,
    12,
    8,
  );
  const visor = ridgeGeometry(
    [
      new THREE.Vector3(-0.56, 0.08, 0.76),
      new THREE.Vector3(0, 0.02, 0.94),
      new THREE.Vector3(0.56, 0.08, 0.76),
    ],
    0.038,
    10,
    7,
  );
  return composeGeometry(shell, tail, ridge, visor);
}

/**
 * The single torso leaf replaces the fallback yokes at runtime, so its surface
 * carries the visible garment construction: a soft collar, raglan seams and a
 * rear scapular line. They are low relief rather than texture decals, retaining
 * a clean sports-illustration read in both WebGL and WebGPU.
 */
function performanceJerseyGeometry() {
  const shell = loftGeometry(
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
    20,
    "y",
    0,
  );
  const collar = bakeGeometry(new THREE.TorusGeometry(0.48, 0.04, 8, 24), {
    scale: [1, 0.66, 1],
    rotation: [Math.PI / 2, 0, 0],
    position: [0, 0.49, 0.005],
  });
  const seams = [-1, 1].map((side) =>
    ridgeGeometry(
      [
        new THREE.Vector3(side * 0.12, 0.46, 0.56),
        new THREE.Vector3(side * 0.48, 0.32, 0.74),
        new THREE.Vector3(side * 0.9, 0.17, 0.56),
      ],
      0.026,
      10,
      7,
    ),
  );
  const backYoke = ridgeGeometry(
    [
      new THREE.Vector3(-0.86, 0.18, -0.62),
      new THREE.Vector3(0, 0.4, -0.77),
      new THREE.Vector3(0.86, 0.18, -0.62),
    ],
    0.023,
    12,
    7,
  );
  return composeGeometry(shell, collar, ...seams, backYoke);
}

/** A compact deltoid/collar form for the separate shoulder contact leaf. */
function deltoidShoulderGeometry() {
  const cap = loftGeometry(
    [
      { p: -1.04, rx: 0.36, rz: 0.42, oz: 0.06 },
      { p: -0.72, rx: 0.7, rz: 0.72, oz: 0.1 },
      { p: -0.28, rx: 0.98, rz: 0.96, oz: 0.08 },
      { p: 0.18, rx: 1.02, rz: 0.98, oz: 0.04 },
      { p: 0.58, rx: 0.82, rz: 0.8 },
      { p: 0.9, rx: 0.5, rz: 0.52, oz: -0.02 },
      { p: 1.08, rx: 0.26, rz: 0.32, oz: -0.04 },
    ],
    18,
    "x",
    Math.PI / 10,
  );
  const collarbone = ridgeGeometry(
    [
      new THREE.Vector3(-0.8, 0.34, 0.45),
      new THREE.Vector3(0, 0.48, 0.56),
      new THREE.Vector3(0.8, 0.34, 0.45),
    ],
    0.028,
    10,
    7,
  );
  return composeGeometry(cap, collarbone);
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
    14,
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
    10,
    8,
  );
  const thumb = loftGeometry(
    [
      { p: -0.25, rx: 0.18, rz: 0.15 },
      { p: -0.05, rx: 0.28, rz: 0.23, oz: -0.02 },
      { p: 0.15, rx: 0.25, rz: 0.22, oz: -0.04 },
      { p: 0.28, rx: 0.14, rz: 0.12 },
    ],
    10,
    "z",
    Math.PI / 10,
  );
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
    14,
    "z",
    Math.PI / 8,
  );
  const olecranon = new THREE.SphereGeometry(0.23, 14, 10);
  olecranon.scale(0.9, 0.62, 0.78);
  olecranon.translate(0.06, -0.56, 0.23);
  return composeGeometry(cuff, olecranon);
}

function performanceShoeGeometry() {
  const upper = loftGeometry(
    [
      { p: -0.125, rx: 0.045, rz: 0.03, oz: -0.006 },
      { p: -0.09, rx: 0.055, rz: 0.047 },
      { p: -0.035, rx: 0.068, rz: 0.058, oz: 0.006 },
      { p: 0.035, rx: 0.072, rz: 0.064, oz: 0.012 },
      { p: 0.095, rx: 0.07, rz: 0.055, oz: 0.016 },
      { p: 0.125, rx: 0.052, rz: 0.038, oz: 0.023 },
    ],
    12,
    "z",
    Math.PI / 12,
  );
  const sole = loftGeometry(
    [
      { p: -0.13, rx: 0.048, rz: 0.012 },
      { p: -0.085, rx: 0.06, rz: 0.016 },
      { p: 0.04, rx: 0.078, rz: 0.017 },
      { p: 0.13, rx: 0.07, rz: 0.014 },
    ],
    12,
    "z",
    Math.PI / 12,
  );
  sole.translate(0, -0.046, 0.004);
  const heelCounter = loftGeometry(
    [
      { p: -0.042, rx: 0.048, rz: 0.027 },
      { p: 0, rx: 0.057, rz: 0.039 },
      { p: 0.042, rx: 0.046, rz: 0.028 },
    ],
    12,
    "z",
    Math.PI / 12,
  );
  heelCounter.translate(0, 0.002, -0.096);
  const toeCap = new THREE.SphereGeometry(0.05, 12, 8);
  toeCap.scale(1.28, 0.55, 0.52);
  toeCap.translate(0, -0.008, 0.108);
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

/** Unit-length race carbon shaft (fitted to the rigid pole span at runtime). */
function nordicPoleShaftGeometry() {
  const shaft = loftGeometry(
    [
      { p: -0.5, rx: 0.48, rz: 0.48 },
      { p: -0.28, rx: 0.62, rz: 0.62 },
      { p: 0.1, rx: 0.78, rz: 0.78 },
      { p: 0.38, rx: 0.64, rz: 0.64 },
      { p: 0.5, rx: 0.42, rz: 0.42 },
    ],
    8,
    "z",
    Math.PI / 8,
  );
  const lowerReinforcement = new THREE.CylinderGeometry(0.55, 0.42, 0.1, 8);
  lowerReinforcement.rotateX(Math.PI / 2);
  lowerReinforcement.translate(0, 0, 0.4);
  return composeGeometry(shaft, lowerReinforcement);
}

function nordicPoleGripGeometry() {
  const grip = loftGeometry(
    [
      { p: -0.5, rx: 0.48, rz: 0.55 },
      { p: -0.28, rx: 0.78, rz: 0.86, oz: -0.03 },
      { p: 0.1, rx: 0.88, rz: 0.94, oz: -0.04 },
      { p: 0.38, rx: 0.62, rz: 0.68, oz: -0.02 },
      { p: 0.5, rx: 0.4, rz: 0.44 },
    ],
    8,
    "z",
    Math.PI / 8,
  );
  const guard = new THREE.TorusGeometry(0.62, 0.08, 6, 10);
  guard.translate(0, 0, -0.4);
  const strap = new THREE.TorusGeometry(0.68, 0.05, 6, 12);
  strap.translate(0, 0, -0.1);
  const cap = translatedGeometry(new THREE.CylinderGeometry(0.4, 0.32, 0.06, 10), 0, 0, 0.42);
  return composeGeometry(grip, guard, strap, cap);
}

/** Hard-track basket — small disc, not a powder snowshoe. */
function nordicPoleBasketGeometry() {
  const basket = new THREE.CylinderGeometry(0.55, 0.62, 0.14, 8);
  const ferrule = translatedGeometry(new THREE.ConeGeometry(0.22, 0.36, 6), 0, -0.28, 0);
  const cap = translatedGeometry(new THREE.CylinderGeometry(0.36, 0.36, 0.05, 6), 0, 0.1, 0);
  const ribs = [];
  for (let spoke = 0; spoke < 4; spoke++) {
    const angle = (spoke / 4) * Math.PI * 2;
    ribs.push(
      tubeGeometryBetween(
        [0, 0.08, 0],
        [Math.cos(angle) * 0.48, 0.08, Math.sin(angle) * 0.48],
        0.035,
        5,
        0.68,
      ),
    );
  }
  return composeGeometry(basket, ferrule, cap, ...ribs);
}

function performanceSaddleGeometry() {
  // Winged, cut-out performance saddle straight from the shared BIKE_SADDLE
  // station table — the same one the procedural renderer lofts and the
  // penetration guard tests against, so the authored pad cannot drift from
  // the cushion the fit is solved on.
  //
  // The previous pad was a lofted block, widest in the middle and tapered at
  // both ends. With the saddle placed under the perineum rather than the sit
  // bones it looked plausible; once the fit was corrected it was 19 mm inside
  // the rider's thighs at the crank extremes.
  const shell = buildBikeSaddleGeometry(THREE, { lateralSegments: 5, stationsPerSpan: 2 });
  // Rails: two tubes under the shell running back from the clamp, as a real
  // saddle carries its load to the post.
  const rails = [];
  for (const side of [-1, 1]) {
    rails.push(
      ridgeGeometry(
        [
          new THREE.Vector3(side * 0.022, -0.03, -0.02),
          new THREE.Vector3(side * 0.026, -0.036, 0.05),
          new THREE.Vector3(side * 0.02, -0.03, 0.11),
        ],
        0.0035,
        8,
        6,
      ),
    );
  }
  return composeGeometry(shell, ...rails);
}

function cliplessPedalGeometry() {
  const body = loftGeometry(
    [
      { p: -0.038, rx: 0.007, rz: 0.02 },
      { p: -0.026, rx: 0.011, rz: 0.031 },
      { p: 0, rx: 0.013, rz: 0.035 },
      { p: 0.026, rx: 0.011, rz: 0.031 },
      { p: 0.038, rx: 0.007, rz: 0.02 },
    ],
    12,
    "x",
    Math.PI / 12,
  );
  const axle = new THREE.CylinderGeometry(0.006, 0.006, 0.085, 12);
  axle.rotateZ(Math.PI / 2);
  const toeHook = loftGeometry(
    [
      { p: -0.026, rx: 0.016, rz: 0.028 },
      { p: 0, rx: 0.022, rz: 0.04 },
      { p: 0.026, rx: 0.016, rz: 0.028 },
    ],
    10,
    "z",
    Math.PI / 10,
  );
  toeHook.translate(0, 0.03, 0.034);
  return composeGeometry(body, axle, toeHook);
}

const ROWING_BOAT_PARTS = new Map([
  // Keep the lower hull visually separate from the lane-coloured deck. This
  // gives the open cockpit a readable waterline and stops the shell reading
  // as one flat purple plank at chase-camera distance.
  ["hull", "equipment-dark"],
  ["stern-deck", "equipment-painted"],
  ["bow-deck", "equipment-painted"],
  ["cockpit-tub", "equipment-dark"],
  ["bulkheads", "equipment-trim"],
  ["gunwales", "equipment-light"],
  ["slide-rails", "equipment-metal"],
  ["accent-strakes", "equipment-light"],
  ["foot-stretcher", "equipment-dark"],
  ["heel-cups", "equipment-rubber"],
  ["stretcher-hardware", "equipment-metal"],
  ["riggers", "equipment-metal"],
  ["oarlocks", "equipment-metal"],
  ["keel-fin", "equipment-dark"],
]);

const ROWING_SEAT_PARTS = new Map([
  ["seat-pad", "equipment-trim"],
  ["seat-carriage", "equipment-metal"],
  ["seat-rollers", "equipment-rubber"],
  ["seat-guides", "equipment-trim"],
]);

function parseGlb(bytes) {
  const payload = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((accept, reject) => new GLTFLoader().parse(payload, "", accept, reject));
}

function disposeBlenderSource(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (!object.isMesh) return;
    if (object.geometry) geometries.add(object.geometry);
    const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of sourceMaterials) if (material) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

function collectBlenderParts(scene, expectedParts) {
  const components = new Map([...expectedParts.keys()].map((name) => [name, []]));
  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    if (!object.isMesh) return;
    const part = object.userData.replayAssetPart;
    const role = object.userData.replayMaterialRole;
    if (!expectedParts.has(part)) return;
    if (role !== expectedParts.get(part)) {
      throw new Error(
        `Blender rowing part ${part} has ${role}; expected ${expectedParts.get(part)}`,
      );
    }
    const geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    components.get(part).push(flatGeometry(geometry));
  });

  return [...expectedParts].map(([name, materialRole]) => {
    const sources = components.get(name);
    if (!sources || sources.length === 0) {
      throw new Error(`Blender rowing source is missing required part: ${name}`);
    }
    const geometry = composeGeometry(...sources);
    for (const source of sources) source.dispose();
    return { name, geometry, materialRole };
  });
}

/**
 * Run Blender as the actual hard-surface authoring step, then collapse its
 * named components into the stable V3 template roots. The boat and moving
 * seat share one source file but remain separate runtime anchors because the
 * deterministic motion rig owns seat travel.
 */
async function buildRowingAssemblyParts() {
  const scratch = await mkdtemp(join(tmpdir(), "rowplay-rowing-shell-blender-"));
  const sourcePath = join(scratch, "rowplay-rowing-shell-source.glb");
  const blender = process.env.BLENDER_BIN || DEFAULT_BLENDER;
  try {
    // The build must stay a pure function of reviewed source. An earlier
    // revision fell back to reading OUTPUT — the artifact this script writes —
    // when Blender was missing, which made the result depend on the previously
    // committed binary, produced two different byte-outputs from one commit,
    // and turned a deleted GLB into an ENOENT instead of a rebuild. Blender is
    // required; set BLENDER_BIN if it is not at the default path.
    const unavailable = (reason) =>
      new Error(
        `Blender rowing-shell authoring unavailable: ${reason}. ` +
          `Install Blender or set BLENDER_BIN; the V3 asset cannot be rebuilt without it.`,
      );
    const result = spawnSync(
      blender,
      ["--background", "--python", ROWING_SHELL_GENERATOR, "--", "--output", sourcePath],
      { stdio: "inherit" },
    );
    if (result.error) throw unavailable(result.error.message);
    if (result.status === null) throw unavailable("Blender terminated before producing output");
    if (result.status !== 0) {
      throw new Error(`Blender rowing-shell authoring failed with exit code ${result.status}`);
    }
    const sourceBytes = await readFile(sourcePath);
    const source = await parseGlb(sourceBytes);
    try {
      return {
        boat: collectBlenderParts(source.scene, ROWING_BOAT_PARTS),
        seat: collectBlenderParts(source.scene, ROWING_SEAT_PARTS),
      };
    } finally {
      disposeBlenderSource(source.scene);
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

function rowOarRigParts() {
  const shaft = tubeGeometryBetween([-0.61, 0, 0], [2.14, 0, 0], 0.02, 16, 0.82);
  const grip = loftGeometry(
    [
      { p: -0.78, rx: 0.018, rz: 0.018 },
      { p: -0.68, rx: 0.023, rz: 0.021 },
      { p: -0.5, rx: 0.024, rz: 0.022 },
      { p: -0.42, rx: 0.018, rz: 0.018 },
    ],
    14,
    "x",
    Math.PI / 14,
  );
  const collar = bakeGeometry(new THREE.TorusGeometry(0.052, 0.012, 8, 18), {
    rotation: [0, Math.PI / 2, 0],
    position: [1.82, 0, 0],
  });
  const sleeve = bakeGeometry(new THREE.CylinderGeometry(0.043, 0.036, 0.19, 16), {
    rotation: [0, 0, Math.PI / 2],
    position: [1.57, 0, 0],
  });
  const handleCap = ellipsoidGeometry([0.022, 0.022, 0.022], 14, 10, [-0.79, 0, 0]);
  return [
    { name: "shaft", geometry: shaft, materialRole: "equipment-light" },
    { name: "grip", geometry: grip, materialRole: "equipment-grip" },
    { name: "handle-cap", geometry: handleCap, materialRole: "equipment-dark" },
    { name: "collar", geometry: collar, materialRole: "equipment-metal" },
    { name: "blade-sleeve", geometry: sleeve, materialRole: "equipment-painted" },
  ];
}

/**
 * One local readable-classic ski, rooted at its measured per-side anchor:
 * (side × 0.15, 0, 0.16). Max width ~72 mm, free-heel toe bar. Wider than
 * literal 44 mm race stock so the boot still sits on a platform at
 * chase-camera distance; narrower than the old 110 mm toy planks.
 *
 * The profile below is authored at a 2.06 m native length; every part is
 * scaled longitudinally to `SKI_ATHLETE_PROPORTIONS.skiLength` on the way
 * out, so the shipped ski always matches the runtime contract the contact
 * solver and the procedural fallback read.
 */
const SKI_NATIVE_LENGTH = 2.06;

function skiAssemblyParts() {
  const lengthScale = SKI_ATHLETE_PROPORTIONS.skiLength / SKI_NATIVE_LENGTH;
  const toContractLength = (geometry) => {
    geometry.scale(1, 1, lengthScale);
    geometry.computeVertexNormals();
    return geometry;
  };
  // Loft half-profiles along Z: rx is half-width, rz is half-thickness.
  // Sidecut waist is narrower than the shovel; tip rises gradually.
  const base = loftGeometry(
    [
      { p: -1.03, rx: 0.016, rz: 0.007 },
      { p: -0.88, rx: 0.03, rz: 0.01 },
      { p: -0.4, rx: 0.028, rz: 0.011 },
      { p: 0.05, rx: 0.03, rz: 0.011 },
      { p: 0.55, rx: 0.036, rz: 0.01 },
      { p: 0.88, rx: 0.028, rz: 0.008, oz: 0.012 },
      { p: 1.03, rx: 0.01, rz: 0.005, oz: 0.055 },
    ],
    12,
    "z",
    Math.PI / 12,
  );
  base.translate(0, 0.016, 0);
  const topDeck = loftGeometry(
    [
      { p: -0.86, rx: 0.02, rz: 0.004 },
      { p: -0.36, rx: 0.026, rz: 0.005 },
      { p: 0.1, rx: 0.028, rz: 0.005 },
      { p: 0.55, rx: 0.024, rz: 0.0045 },
      { p: 0.9, rx: 0.014, rz: 0.004, oz: 0.012 },
    ],
    10,
    "z",
    Math.PI / 10,
  );
  topDeck.translate(0, 0.03, -0.02);
  const edgeLeft = ridgeGeometry(
    [
      new THREE.Vector3(-0.028, 0.024, -0.88),
      new THREE.Vector3(-0.032, 0.024, -0.3),
      new THREE.Vector3(-0.034, 0.026, 0.25),
      new THREE.Vector3(-0.024, 0.034, 0.78),
    ],
    0.004,
    8,
    4,
  );
  const edgeRight = edgeLeft.clone();
  edgeRight.scale(-1, 1, 1);
  edgeRight.computeVertexNormals();
  // NIS plate spans most of the ski width; free heel, not an alpine block.
  const bindingPlate = composeGeometry(
    loftGeometry(
      [
        { p: -0.1, rx: 0.026, rz: 0.007 },
        { p: 0.0, rx: 0.032, rz: 0.009 },
        { p: 0.1, rx: 0.028, rz: 0.007 },
      ],
      8,
      "z",
      Math.PI / 8,
    ),
    tubeGeometryBetween([-0.02, 0.044, -0.07], [-0.02, 0.044, 0.1], 0.0032, 5),
    tubeGeometryBetween([0.02, 0.044, -0.07], [0.02, 0.044, 0.1], 0.0032, 5),
  );
  bindingPlate.translate(0, 0.032, 0.02);
  const bindingToe = composeGeometry(
    ellipsoidGeometry([0.028, 0.014, 0.022], 8, 6, [0, 0.052, -0.08]),
    ridgeGeometry(
      [
        new THREE.Vector3(-0.022, 0.058, -0.085),
        new THREE.Vector3(0, 0.064, -0.1),
        new THREE.Vector3(0.022, 0.058, -0.085),
      ],
      0.0035,
      6,
      4,
    ),
  );
  // Low free-heel bumper only — heel is not locked.
  const bindingHeel = composeGeometry(
    ellipsoidGeometry([0.022, 0.006, 0.024], 7, 5, [0, 0.04, 0.1]),
    tubeGeometryBetween([-0.018, 0.042, 0.1], [0.018, 0.042, 0.1], 0.0028, 5),
  );
  const kick = ridgeGeometry(
    [
      new THREE.Vector3(0, 0.024, 0.72),
      new THREE.Vector3(0, 0.042, 0.92),
      new THREE.Vector3(0, 0.072, 1.03),
    ],
    0.005,
    6,
    5,
  );
  return [
    { name: "base", geometry: base, materialRole: "equipment-dark" },
    { name: "top-deck", geometry: topDeck, materialRole: "equipment-painted" },
    { name: "edge-left", geometry: edgeLeft, materialRole: "equipment-metal" },
    { name: "edge-right", geometry: edgeRight, materialRole: "equipment-metal" },
    { name: "binding-plate", geometry: bindingPlate, materialRole: "equipment-dark" },
    { name: "binding-toe", geometry: bindingToe, materialRole: "equipment-metal" },
    { name: "binding-heel", geometry: bindingHeel, materialRole: "equipment-trim" },
    { name: "tip-ridge", geometry: kick, materialRole: "equipment-light" },
  ].map((part) => ({ ...part, geometry: toContractLength(part.geometry) }));
}
/**
 * One wheel, rooted at the existing wheel-group centre with an axle along X.
 *
 * Sized from `BIKE_RIG`, not from constants typed here: the frame reads its
 * axles from the contract, so a wheel authored at a different radius would
 * float off its own dropouts.
 */
function bikeWheelAssemblyParts() {
  const outer = bikeWheelAxleY(BIKE_RIG);
  const rimRadius = outer - BIKE_RIG.tyreTube - 0.008;
  const tyre = bakeGeometry(aeroRingGeometry(outer - BIKE_RIG.tyreTube, BIKE_RIG.tyreTube, 56), {
    rotation: [0, Math.PI / 2, 0],
  });
  const rim = bakeGeometry(aeroRingGeometry(rimRadius, 0.017, 56), {
    rotation: [0, Math.PI / 2, 0],
  });
  const hub = bakeGeometry(new THREE.CylinderGeometry(0.024, 0.024, 0.1, 18), {
    rotation: [0, 0, Math.PI / 2],
  });
  const rotorOffsetX = 0.05;
  const rotorParts = [
    bakeGeometry(new THREE.TorusGeometry(0.07, 0.005, 7, 30), {
      rotation: [0, Math.PI / 2, 0],
      position: [rotorOffsetX, 0, 0],
    }),
    bakeGeometry(new THREE.TorusGeometry(0.025, 0.004, 6, 18), {
      rotation: [0, Math.PI / 2, 0],
      position: [rotorOffsetX, 0, 0],
    }),
  ];
  for (let index = 0; index < 6; index++) {
    const angle = (index / 6) * Math.PI * 2 + Math.PI / 6;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    rotorParts.push(
      tubeGeometryBetween(
        [rotorOffsetX, cos * 0.022, sin * 0.022],
        [rotorOffsetX, cos * 0.064, sin * 0.064],
        0.0035,
        8,
        0.78,
      ),
      bakeGeometry(new THREE.CylinderGeometry(0.004, 0.004, 0.009, 8), {
        rotation: [0, 0, Math.PI / 2],
        position: [rotorOffsetX + 0.005, cos * 0.032, sin * 0.032],
      }),
    );
  }
  const rotor = composeGeometry(...rotorParts);
  const spokes = [];
  for (let index = 0; index < 16; index++) {
    const angle = (index / 16) * Math.PI * 2 + Math.PI / 16;
    const end = [0, Math.cos(angle) * rimRadius, Math.sin(angle) * rimRadius];
    spokes.push(tubeGeometryBetween([0, 0, 0], end, 0.0022, 6, 0.72));
  }
  return [
    { name: "tyre", geometry: tyre, materialRole: "equipment-rubber" },
    { name: "aero-rim", geometry: rim, materialRole: "equipment-metal" },
    { name: "hub", geometry: hub, materialRole: "equipment-dark" },
    { name: "brake-rotor", geometry: rotor, materialRole: "equipment-metal" },
    { name: "spokes", geometry: composeGeometry(...spokes), materialRole: "equipment-metal" },
  ];
}

/**
 * Bike-root coordinates match the current avatar group exactly.
 *
 * Every frame node is read from the shared `BIKE_RIG` contract rather than
 * re-typed here. That is what makes the README's no-drift guarantee real: the
 * checked-in V3 package and `makeBikeAvatar` cannot disagree about where the
 * bottom bracket, saddle pad, grips, or axles are.
 */
function bikeFrameAssemblyParts() {
  const wheelAxleY = bikeWheelAxleY(BIKE_RIG); // tyres rest on the ground plane
  const bottomBracket = [...BIKE_RIG.bottomBracket];
  const seatCluster = [...BIKE_RIG.seatCluster];
  const headBottom = [...BIKE_RIG.headBottom];
  const headTop = [...BIKE_RIG.headTop];
  const rearAxle = [0, wheelAxleY, BIKE_RIG.rearAxleZ];
  const frontAxle = [0, wheelAxleY, BIKE_RIG.frontAxleZ];
  const barY = BIKE_RIG.handlebar.base[1];
  const gripY = BIKE_RIG.handlebar.grip.y;
  const gripHalfSpan = BIKE_RIG.handlebar.grip.halfSpan;
  const gripZ = BIKE_RIG.handlebar.grip.z;
  const barZ = BIKE_RIG.handlebar.base[2];
  // Real road tubing diameters (~35 mm down tube down to ~19 mm stays). These
  // were nearly three times thicker when the bike was oversized.
  const mainFrame = composeGeometry(
    tubeGeometryBetween(bottomBracket, headBottom, 0.0185, 16, 0.85),
    tubeGeometryBetween(bottomBracket, seatCluster, 0.0165, 16, 0.88),
    tubeGeometryBetween(seatCluster, headTop, 0.015, 16, 0.9),
    tubeGeometryBetween(headBottom, headTop, 0.021, 16),
  );
  const stays = [];
  for (const side of [-1, 1]) {
    stays.push(
      tubeGeometryBetween(
        [side * 0.055, wheelAxleY, rearAxle[2]],
        [side * 0.036, bottomBracket[1], bottomBracket[2]],
        0.0115,
        12,
      ),
      tubeGeometryBetween(
        [side * 0.055, wheelAxleY, rearAxle[2]],
        [side * 0.026, seatCluster[1], seatCluster[2]],
        0.0095,
        12,
        0.82,
      ),
      tubeGeometryBetween(
        [side * 0.022, headBottom[1] - 0.012, headBottom[2] + 0.004],
        [side * 0.048, wheelAxleY, frontAxle[2]],
        0.0115,
        14,
        0.82,
      ),
    );
  }
  const barCentre = [0, barY, barZ];
  const leftGripContact = [-gripHalfSpan, gripY, gripZ];
  const rightGripContact = [gripHalfSpan, gripY, gripZ];
  const barHalfWidth = gripHalfSpan;
  const cockpit = composeGeometry(
    tubeGeometryBetween(headTop, barCentre, 0.0125, 12),
    tubeGeometryBetween([-barHalfWidth, barY, barZ], [barHalfWidth, barY, barZ], 0.0125, 16),
    tubeGeometryBetween([-gripHalfSpan, barY, barZ], leftGripContact, 0.0125, 12),
    tubeGeometryBetween([gripHalfSpan, barY, barZ], rightGripContact, 0.0125, 12),
  );
  const brakeHoodForms = [];
  const brakeLeverForms = [];
  for (const [side, contact] of [
    [-1, leftGripContact],
    [1, rightGripContact],
  ]) {
    // The hood is the shaped lever body the palm actually rests on, and the
    // drop curves down and back from it, so the bar is something a hand can
    // hold rather than a rod that ends in a point.
    const barEnd = [side * gripHalfSpan, barY, barZ];
    brakeHoodForms.push(
      tubeGeometryBetween(barEnd, contact, 0.0125, 14, 0.82),
      ellipsoidGeometry([0.019, 0.022, 0.055], 18, 12, [
        contact[0],
        contact[1] + 0.012,
        contact[2] - 0.012,
      ]),
      ridgeGeometry(
        [
          new THREE.Vector3(...contact),
          new THREE.Vector3(side * gripHalfSpan, gripY - 0.045, gripZ + 0.045),
          new THREE.Vector3(side * gripHalfSpan, gripY - 0.115, gripZ + 0.012),
        ],
        0.0125,
        12,
        8,
      ),
    );
    brakeLeverForms.push(
      ridgeGeometry(
        [
          new THREE.Vector3(side * gripHalfSpan, gripY - 0.06, gripZ + 0.052),
          new THREE.Vector3(side * gripHalfSpan, gripY - 0.03, gripZ + 0.05),
          new THREE.Vector3(contact[0], contact[1] + 0.004, contact[2] + 0.01),
        ],
        0.005,
        10,
        8,
      ),
    );
  }
  const brakeHoods = composeGeometry(...brakeHoodForms);
  const brakeLevers = composeGeometry(...brakeLeverForms);
  // Rim calipers sit just above each tyre at the brake track, derived from the
  // axles rather than pinned to coordinates from the oversized bike.
  const caliperReach = wheelAxleY - BIKE_RIG.tyreTube - 0.012;
  const brakeCalipers = composeGeometry(
    ellipsoidGeometry([0.02, 0.03, 0.016], 16, 11, [0.012, caliperReach, frontAxle[2] - 0.012]),
    ellipsoidGeometry([0.018, 0.027, 0.015], 16, 11, [0.012, caliperReach, rearAxle[2] + 0.02]),
    tubeGeometryBetween(
      [0.012, caliperReach, frontAxle[2] - 0.012],
      [0.012, caliperReach + 0.04, frontAxle[2] - 0.03],
      0.006,
      10,
      0.8,
    ),
    tubeGeometryBetween(
      [0.012, caliperReach, rearAxle[2] + 0.02],
      [0.012, caliperReach + 0.04, rearAxle[2] + 0.045],
      0.006,
      10,
      0.8,
    ),
  );
  // Chain: two external tangents plus the arcs it wraps, so it actually meets
  // the chainring and the cassette instead of floating between two guesses.
  const driveSideX = -0.045;
  const ringRadius = 0.098;
  const cogRadius = 0.043;
  const chainDz = rearAxle[2] - bottomBracket[2];
  const chainDy = rearAxle[1] - bottomBracket[1];
  const chainSpan = Math.hypot(chainDz, chainDy);
  const chainAlpha = Math.atan2(chainDy, chainDz);
  const chainBeta = Math.asin(Math.max(-1, Math.min(1, (ringRadius - cogRadius) / chainSpan)));
  const chainTangent = Math.PI / 2 - chainBeta;
  const chainPoints = [];
  const pushArc = (centreY, centreZ, radius, from, to, steps) => {
    for (let i = 0; i <= steps; i++) {
      const angle = from + ((to - from) * i) / steps;
      chainPoints.push(
        new THREE.Vector3(
          driveSideX,
          centreY + radius * Math.sin(angle),
          centreZ + radius * Math.cos(angle),
        ),
      );
    }
  };
  pushArc(
    bottomBracket[1],
    bottomBracket[2],
    ringRadius,
    chainAlpha + chainTangent,
    chainAlpha - chainTangent + Math.PI * 2,
    14,
  );
  pushArc(
    rearAxle[1],
    rearAxle[2],
    cogRadius,
    chainAlpha - chainTangent,
    chainAlpha + chainTangent,
    10,
  );
  const chainAndCassetteForms = [
    flatGeometry(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(chainPoints, true, "centripetal"),
        96,
        0.0042,
        6,
        true,
      ),
    ),
  ];
  for (const [index, radius] of [0.043, 0.036, 0.03, 0.025].entries()) {
    chainAndCassetteForms.push(
      bakeGeometry(new THREE.TorusGeometry(radius, 0.0035, 6, 24), {
        rotation: [0, Math.PI / 2, 0],
        position: [driveSideX - index * 0.006, rearAxle[1], rearAxle[2]],
      }),
    );
  }
  const chainAndCassette = composeGeometry(...chainAndCassetteForms);
  const saddle = performanceSaddleGeometry();
  // Match BIKE_RIG.saddle so the V4 sit surface lands on the pad, not under it.
  saddle.translate(BIKE_RIG.saddle[0], BIKE_RIG.saddle[1], BIKE_RIG.saddle[2]);
  // The post carries the saddle from below and stops under the pad. It must
  // never reach the pad top: the rider's sit surface is one nestle beneath it,
  // so any post that outruns the cushion spears straight through the athlete.
  const seatPost = tubeGeometryBetween(seatCluster, [...BIKE_RIG.saddleClamp], 0.0135, 12);
  const forkCrown = ellipsoidGeometry([0.03, 0.026, 0.022], 16, 10, [
    headBottom[0],
    headBottom[1] - 0.012,
    headBottom[2] + 0.004,
  ]);
  return [
    { name: "main-triangle", geometry: mainFrame, materialRole: "equipment-painted" },
    {
      name: "stays-and-fork",
      geometry: composeGeometry(...stays),
      materialRole: "equipment-painted",
    },
    { name: "cockpit", geometry: cockpit, materialRole: "equipment-metal" },
    { name: "brake-hoods", geometry: brakeHoods, materialRole: "equipment-dark" },
    { name: "brake-levers", geometry: brakeLevers, materialRole: "equipment-metal" },
    { name: "brake-calipers", geometry: brakeCalipers, materialRole: "equipment-dark" },
    { name: "chain-and-cassette", geometry: chainAndCassette, materialRole: "equipment-metal" },
    { name: "saddle", geometry: saddle, materialRole: "equipment-dark" },
    { name: "seat-post", geometry: seatPost, materialRole: "equipment-metal" },
    { name: "fork-crown", geometry: forkCrown, materialRole: "equipment-painted" },
    {
      name: "rear-axle",
      geometry: ellipsoidGeometry([0.06, 0.035, 0.035], 14, 9, rearAxle),
      materialRole: "equipment-metal",
    },
    {
      name: "front-axle",
      geometry: ellipsoidGeometry([0.06, 0.035, 0.035], 14, 9, frontAxle),
      materialRole: "equipment-metal",
    },
  ];
}

/** Bike crank-root coordinates: the runtime still rotates this assembly about X. */
function bikeDrivetrainAssemblyParts() {
  const chainring = bakeGeometry(new THREE.TorusGeometry(0.098, 0.006, 8, 36), {
    rotation: [0, Math.PI / 2, 0],
  });
  const spider = composeGeometry(
    tubeGeometryBetween([0, -0.085, 0], [0, 0.085, 0], 0.007, 10),
    tubeGeometryBetween([0, 0, -0.085], [0, 0, 0.085], 0.007, 10),
  );
  // Crank arms reach exactly the contract pedal radius so the authored arm ends
  // where the runtime solves the shoe contact.
  const crankRadius = BIKE_RIG.crank.pedalRadius;
  const crankArms = composeGeometry(
    tubeGeometryBetween([0, 0, 0], [0, -crankRadius, 0], 0.009, 12, 0.82),
    tubeGeometryBetween([0, 0, 0], [0, crankRadius, 0], 0.009, 12, 0.82),
  );
  const pedals = [];
  for (const side of [-1, 1]) {
    const pedal = cliplessPedalGeometry();
    pedal.translate(side * BIKE_RIG.crank.lateral, side * crankRadius, 0);
    pedals.push(pedal);
  }
  const spindle = bakeGeometry(new THREE.CylinderGeometry(0.019, 0.019, 0.145, 16), {
    rotation: [0, 0, Math.PI / 2],
  });
  return [
    { name: "chainring", geometry: chainring, materialRole: "equipment-metal" },
    { name: "spider", geometry: spider, materialRole: "equipment-dark" },
    { name: "crank-arms", geometry: crankArms, materialRole: "equipment-metal" },
    {
      name: "clipless-pedals",
      geometry: composeGeometry(...pedals),
      materialRole: "equipment-dark",
    },
    { name: "bottom-bracket", geometry: spindle, materialRole: "equipment-metal" },
  ];
}

const MATERIAL_ROLES = new Set([
  "athlete-skin",
  "athlete-fabric",
  "athlete-hair",
  "athlete-footwear",
  "equipment-painted",
  "equipment-dark",
  "equipment-light",
  "equipment-metal",
  "equipment-rubber",
  "equipment-grip",
  "equipment-trim",
]);

function addLeafSlot(scene, slot, geometry, materialRole) {
  if (!MATERIAL_ROLES.has(materialRole)) throw new Error(`Unknown material role: ${materialRole}`);
  const mesh = new THREE.Mesh(geometry, PLACEHOLDER);
  mesh.name = slot;
  mesh.userData.replayAssetSlot = slot;
  mesh.userData.replayAssetKind = "leaf";
  mesh.userData.replayMaterialRole = materialRole;
  scene.add(mesh);
}

function addCompositeTemplate(scene, template, parts) {
  const root = new THREE.Group();
  root.name = template;
  root.userData.replayAssetTemplateSlot = template;
  root.userData.replayAssetKind = "composite";
  root.userData.replayAssetVersion = 3;
  root.userData.replayAssetPartCount = parts.length;
  root.userData.replayMaterialRoles = [...new Set(parts.map((part) => part.materialRole))].sort(
    (left, right) => left.localeCompare(right),
  );
  for (const part of parts) {
    if (!MATERIAL_ROLES.has(part.materialRole)) {
      throw new Error(`Unknown material role: ${part.materialRole}`);
    }
    const mesh = new THREE.Mesh(part.geometry, PLACEHOLDER);
    mesh.name = `${template}:${part.name}`;
    mesh.userData.replayAssetTemplateSlot = template;
    mesh.userData.replayAssetPart = part.name;
    mesh.userData.replayMaterialRole = part.materialRole;
    root.add(mesh);
  }
  scene.add(root);
}

function bakeGeometry(geometry, { position, rotation, scale } = {}) {
  if (scale) geometry.scale(scale[0], scale[1], scale[2]);
  if (rotation?.[0]) geometry.rotateX(rotation[0]);
  if (rotation?.[1]) geometry.rotateY(rotation[1]);
  if (rotation?.[2]) geometry.rotateZ(rotation[2]);
  if (position) geometry.translate(position[0], position[1], position[2]);
  return flatGeometry(geometry);
}

/** A smooth tube constructed between two locally authored points. */
function tubeGeometryBetween(start, end, radius, radialSegments = 14, taper = 1) {
  const from = new THREE.Vector3(...start);
  const to = new THREE.Vector3(...end);
  const direction = to.clone().sub(from);
  const length = direction.length();
  if (length < 1e-5) throw new Error("tube endpoints must be distinct");
  const geometry = new THREE.CylinderGeometry(radius * taper, radius, length, radialSegments, 2);
  geometry.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()),
  );
  geometry.translate((from.x + to.x) * 0.5, (from.y + to.y) * 0.5, (from.z + to.z) * 0.5);
  return flatGeometry(geometry);
}

function ellipsoidGeometry(radius, segments = 18, rings = 12, position = [0, 0, 0]) {
  return bakeGeometry(new THREE.SphereGeometry(1, segments, rings), {
    scale: radius,
    position,
  });
}

const scene = new THREE.Scene();
scene.name = "ROWPLAY_RIG_ASSET_LIBRARY_V3";

// Coherent athlete shells. Normalized parts are fitted to the existing rig
// transforms at runtime; the shoe/neck/equipment slots use authored metre sizes.
// Rings bias toward a broadcast sports-illustration silhouette: broad back,
// clear waist, directional head, and soft joint-overlap on limbs so the
// chase camera never reads ball-joint mannequin seams.
addLeafSlot(scene, "athlete:torso", performanceJerseyGeometry(), "athlete-fabric");
addLeafSlot(
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
    16,
    "y",
    0,
  ),
  "athlete-fabric",
);
addLeafSlot(scene, "athlete:head", directionalHeadGeometry(), "athlete-skin");
addLeafSlot(scene, "athlete:hair", sweptHairGeometry(), "athlete-hair");

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
  addLeafSlot(
    scene,
    slot,
    anatomicalLimbGeometry(proportions),
    slot === "athlete:upper-arm" || slot === "athlete:forearm" ? "athlete-skin" : "athlete-fabric",
  );
}

addLeafSlot(scene, "athlete:hand", clenchedHandGeometry(), "athlete-skin");
addLeafSlot(scene, "athlete:elbow", elbowFlexCuffGeometry(), "athlete-skin");
addLeafSlot(scene, "athlete:shoe", performanceShoeGeometry(), "athlete-footwear");
addLeafSlot(
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
    12,
    "y",
    0,
  ),
  "athlete-skin",
);
addLeafSlot(scene, "athlete:shoulder", deltoidShoulderGeometry(), "athlete-fabric");
addLeafSlot(scene, "athlete:helmet", aeroHelmetGeometry(), "athlete-fabric");

// Eighteen compatibility leaves retain the exact athlete and contact-bound
// part contract. The high-visibility equipment now uses six canonical roots
// so its nested structure survives authoring instead of being crushed into a
// single fallback AABB at runtime.
addLeafSlot(scene, "equipment:row:blade", scullBladeGeometry(), "equipment-painted");
addLeafSlot(scene, "equipment:ski:pole-shaft", nordicPoleShaftGeometry(), "equipment-light");
addLeafSlot(scene, "equipment:ski:pole-grip", nordicPoleGripGeometry(), "equipment-grip");
addLeafSlot(scene, "equipment:ski:pole-basket", nordicPoleBasketGeometry(), "equipment-painted");

const rowingAssemblies = await buildRowingAssemblyParts();
addCompositeTemplate(scene, "equipment:row:boat-assembly", rowingAssemblies.boat);
addCompositeTemplate(scene, "equipment:row:seat-carriage", rowingAssemblies.seat);
addCompositeTemplate(scene, "equipment:row:oar-rig", rowOarRigParts());
addCompositeTemplate(scene, "equipment:ski:ski-assembly", skiAssemblyParts());
addCompositeTemplate(scene, "equipment:bike:wheel-assembly", bikeWheelAssemblyParts());
addCompositeTemplate(scene, "equipment:bike:frame-assembly", bikeFrameAssemblyParts());
addCompositeTemplate(scene, "equipment:bike:drivetrain-assembly", bikeDrivetrainAssemblyParts());

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
