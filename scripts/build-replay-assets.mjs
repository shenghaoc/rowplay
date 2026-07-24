import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

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

function performanceSaddleGeometry() {
  const shell = loftGeometry(
    [
      { p: -0.16, rx: 0.052, rz: 0.025 },
      { p: -0.11, rx: 0.085, rz: 0.042, oz: 0.004 },
      { p: -0.035, rx: 0.12, rz: 0.056, oz: 0.012 },
      { p: 0.045, rx: 0.116, rz: 0.052, oz: 0.016 },
      { p: 0.115, rx: 0.09, rz: 0.04, oz: 0.012 },
      { p: 0.16, rx: 0.055, rz: 0.025, oz: 0.006 },
    ],
    16,
    "z",
    Math.PI / 16,
  );
  const centralRelief = ridgeGeometry(
    [
      new THREE.Vector3(0, 0.044, -0.1),
      new THREE.Vector3(0, 0.062, -0.015),
      new THREE.Vector3(0, 0.054, 0.1),
    ],
    0.008,
    10,
    8,
  );
  const underside = loftGeometry(
    [
      { p: -0.11, rx: 0.062, rz: 0.012 },
      { p: 0.08, rx: 0.07, rz: 0.014 },
    ],
    12,
    "z",
    Math.PI / 12,
  );
  underside.translate(0, -0.045, -0.015);
  return composeGeometry(shell, centralRelief, underside);
}

function cliplessPedalGeometry() {
  const body = loftGeometry(
    [
      { p: -0.11, rx: 0.018, rz: 0.028 },
      { p: -0.075, rx: 0.032, rz: 0.046 },
      { p: 0, rx: 0.038, rz: 0.052 },
      { p: 0.075, rx: 0.032, rz: 0.046 },
      { p: 0.11, rx: 0.018, rz: 0.028 },
    ],
    12,
    "x",
    Math.PI / 12,
  );
  const axle = new THREE.CylinderGeometry(0.015, 0.015, 0.24, 12);
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
    const result = spawnSync(
      blender,
      ["--background", "--python", ROWING_SHELL_GENERATOR, "--", "--output", sourcePath],
      { stdio: "inherit" },
    );
    if (result.error) throw result.error;
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
  const shaft = tubeGeometryBetween([-0.61, 0, 0], [2.14, 0, 0], 0.032, 16, 0.82);
  const grip = loftGeometry(
    [
      { p: -0.78, rx: 0.031, rz: 0.031 },
      { p: -0.68, rx: 0.045, rz: 0.042 },
      { p: -0.5, rx: 0.047, rz: 0.043 },
      { p: -0.42, rx: 0.034, rz: 0.033 },
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
  const handleCap = ellipsoidGeometry([0.04, 0.04, 0.04], 14, 10, [-0.79, 0, 0]);
  return [
    { name: "shaft", geometry: shaft, materialRole: "equipment-light" },
    { name: "grip", geometry: grip, materialRole: "equipment-grip" },
    { name: "handle-cap", geometry: handleCap, materialRole: "equipment-dark" },
    { name: "collar", geometry: collar, materialRole: "equipment-metal" },
    { name: "blade-sleeve", geometry: sleeve, materialRole: "equipment-painted" },
  ];
}

/** One local ski, rooted at its existing per-side anchor: (side × .21, 0, .16). */
function skiAssemblyParts() {
  const base = loftGeometry(
    [
      { p: -1.05, rx: 0.028, rz: 0.012 },
      { p: -0.88, rx: 0.048, rz: 0.018 },
      { p: -0.43, rx: 0.065, rz: 0.024 },
      { p: 0.16, rx: 0.067, rz: 0.026 },
      { p: 0.66, rx: 0.059, rz: 0.024 },
      { p: 1.0, rx: 0.044, rz: 0.018, oz: 0.016 },
      { p: 1.16, rx: 0.018, rz: 0.01, oz: 0.07 },
    ],
    18,
    "z",
    Math.PI / 18,
  );
  base.translate(0, 0.028, 0);
  const topDeck = loftGeometry(
    [
      { p: -0.89, rx: 0.033, rz: 0.008 },
      { p: -0.46, rx: 0.052, rz: 0.011 },
      { p: 0.08, rx: 0.055, rz: 0.012 },
      { p: 0.67, rx: 0.046, rz: 0.01 },
      { p: 0.97, rx: 0.026, rz: 0.008, oz: 0.014 },
    ],
    16,
    "z",
    Math.PI / 16,
  );
  topDeck.translate(0, 0.058, -0.04);
  const binding = composeGeometry(
    loftGeometry(
      [
        { p: -0.18, rx: 0.062, rz: 0.028 },
        { p: -0.04, rx: 0.08, rz: 0.042 },
        { p: 0.16, rx: 0.074, rz: 0.034 },
      ],
      14,
      "z",
      Math.PI / 14,
    ),
    tubeGeometryBetween([-0.055, 0.105, -0.11], [-0.055, 0.105, 0.12], 0.008, 10),
    tubeGeometryBetween([0.055, 0.105, -0.11], [0.055, 0.105, 0.12], 0.008, 10),
  );
  binding.translate(0, 0.075, 0.02);
  const kick = ridgeGeometry(
    [
      new THREE.Vector3(0, 0.054, 0.74),
      new THREE.Vector3(0, 0.08, 1.0),
      new THREE.Vector3(0, 0.145, 1.16),
    ],
    0.009,
    8,
    7,
  );
  return [
    { name: "base", geometry: base, materialRole: "equipment-dark" },
    { name: "top-deck", geometry: topDeck, materialRole: "equipment-painted" },
    { name: "binding", geometry: binding, materialRole: "equipment-dark" },
    { name: "tip-ridge", geometry: kick, materialRole: "equipment-light" },
  ];
}

/** One wheel, rooted at the existing wheel-group centre with an axle along X. */
function bikeWheelAssemblyParts() {
  const tyre = bakeGeometry(aeroRingGeometry(0.45, 0.065, 56), { rotation: [0, Math.PI / 2, 0] });
  const rim = bakeGeometry(aeroRingGeometry(0.385, 0.031, 56), {
    rotation: [0, Math.PI / 2, 0],
  });
  const hub = bakeGeometry(new THREE.CylinderGeometry(0.052, 0.052, 0.128, 18), {
    rotation: [0, 0, Math.PI / 2],
  });
  // A rotor is a thin structural object, not a floating torus. The carrier,
  // six lightening spokes and bolt heads keep the detail readable when the
  // chase camera catches a spinning wheel, without introducing a texture or
  // a dense per-tooth mesh.
  const rotorOffsetX = 0.068;
  const rotorParts = [
    bakeGeometry(new THREE.TorusGeometry(0.105, 0.007, 7, 30), {
      rotation: [0, Math.PI / 2, 0],
      position: [rotorOffsetX, 0, 0],
    }),
    bakeGeometry(new THREE.TorusGeometry(0.036, 0.006, 6, 18), {
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
        [rotorOffsetX, cos * 0.03, sin * 0.03],
        [rotorOffsetX, cos * 0.096, sin * 0.096],
        0.005,
        8,
        0.78,
      ),
      bakeGeometry(new THREE.CylinderGeometry(0.006, 0.006, 0.012, 8), {
        rotation: [0, 0, Math.PI / 2],
        position: [rotorOffsetX + 0.007, cos * 0.046, sin * 0.046],
      }),
    );
  }
  const rotor = composeGeometry(...rotorParts);
  const spokes = [];
  for (let index = 0; index < 14; index++) {
    const angle = (index / 14) * Math.PI * 2 + Math.PI / 14;
    const end = [0, Math.cos(angle) * 0.382, Math.sin(angle) * 0.382];
    spokes.push(tubeGeometryBetween([0, 0, 0], end, 0.006, 8, 0.72));
  }
  return [
    { name: "tyre", geometry: tyre, materialRole: "equipment-rubber" },
    { name: "aero-rim", geometry: rim, materialRole: "equipment-metal" },
    { name: "hub", geometry: hub, materialRole: "equipment-dark" },
    { name: "brake-rotor", geometry: rotor, materialRole: "equipment-metal" },
    { name: "spokes", geometry: composeGeometry(...spokes), materialRole: "equipment-metal" },
  ];
}

/** Bike-root coordinates match the current avatar group exactly. */
function bikeFrameAssemblyParts() {
  const bottomBracket = [0, 0.45, -0.05];
  const seatCluster = [0, 1.21, -0.4];
  const headBottom = [0, 1.0, 0.42];
  const headTop = [0, 1.25, 0.5];
  const rearAxle = [0, 0.45, -0.85];
  const frontAxle = [0, 0.45, 0.85];
  const mainFrame = composeGeometry(
    tubeGeometryBetween(bottomBracket, headBottom, 0.055, 16, 0.85),
    tubeGeometryBetween(bottomBracket, seatCluster, 0.052, 16, 0.88),
    tubeGeometryBetween(seatCluster, headTop, 0.048, 16, 0.9),
    tubeGeometryBetween(headBottom, headTop, 0.06, 16),
  );
  const stays = [];
  for (const side of [-1, 1]) {
    stays.push(
      tubeGeometryBetween([side * 0.065, 0.45, -0.85], [side * 0.055, 0.45, -0.05], 0.027, 12),
      tubeGeometryBetween([side * 0.065, 0.45, -0.85], [side * 0.055, 1.21, -0.4], 0.026, 12, 0.82),
      tubeGeometryBetween([side * 0.043, 1.0, 0.42], [side * 0.046, 0.45, 0.85], 0.031, 14, 0.82),
    );
  }
  // These endpoints intentionally match the runtime's explicit grip-contact
  // anchors. The procedural anchors remain the authoritative hand-IK targets;
  // the authored cockpit must meet them rather than creating a prettier bar a
  // few decimetres ahead of the rider's hands.
  const barCentre = [0, 1.25, 0.35];
  const leftGripContact = [-0.32, 1.23, 0.39];
  const rightGripContact = [0.32, 1.23, 0.39];
  const cockpit = composeGeometry(
    tubeGeometryBetween(headTop, barCentre, 0.028, 12),
    tubeGeometryBetween([-0.36, 1.25, 0.35], [0.36, 1.25, 0.35], 0.03, 16),
    tubeGeometryBetween([-0.34, 1.25, 0.35], leftGripContact, 0.022, 12),
    tubeGeometryBetween([0.34, 1.25, 0.35], rightGripContact, 0.022, 12),
  );
  // The sculpted hoods and their lever blades meet the existing hand anchors
  // exactly. They enrich the visible control hardware without becoming a new
  // source of hand targets: the procedural contact nodes still drive arms.
  const brakeHoodForms = [];
  const brakeLeverForms = [];
  for (const [side, contact] of [
    [-1, leftGripContact],
    [1, rightGripContact],
  ]) {
    const barEnd = [side * 0.34, 1.25, 0.35];
    brakeHoodForms.push(
      tubeGeometryBetween(barEnd, contact, 0.031, 14, 0.82),
      ellipsoidGeometry([0.043, 0.052, 0.06], 18, 12, contact),
    );
    brakeLeverForms.push(
      ridgeGeometry(
        [
          new THREE.Vector3(side * 0.365, 1.15, 0.49),
          new THREE.Vector3(side * 0.362, 1.18, 0.45),
          new THREE.Vector3(...contact),
        ],
        0.008,
        10,
        8,
      ),
    );
  }
  const brakeHoods = composeGeometry(...brakeHoodForms);
  const brakeLevers = composeGeometry(...brakeLeverForms);

  // Disc calipers sit at the actual rotor plane on the fork and rear stay.
  // Keeping them in the static frame assembly preserves the wheel and crank
  // animation groups while still making the braking system read as assembled.
  const brakeCalipers = composeGeometry(
    ellipsoidGeometry([0.052, 0.067, 0.042], 16, 11, [0.09, 0.67, 0.78]),
    ellipsoidGeometry([0.042, 0.058, 0.038], 16, 11, [0.09, 0.59, -0.79]),
    tubeGeometryBetween([0.077, 0.67, 0.78], [0.043, 0.9, 0.59], 0.014, 10, 0.8),
    tubeGeometryBetween([0.077, 0.59, -0.79], [0.048, 1.0, -0.54], 0.014, 10, 0.8),
    bakeGeometry(new THREE.CylinderGeometry(0.016, 0.016, 0.025, 10), {
      rotation: [0, 0, Math.PI / 2],
      position: [0.112, 0.67, 0.78],
    }),
    bakeGeometry(new THREE.CylinderGeometry(0.014, 0.014, 0.025, 10), {
      rotation: [0, 0, Math.PI / 2],
      position: [0.112, 0.59, -0.79],
    }),
  );

  // A single visible-side chain line and compact stepped cassette establish
  // the BikeErg's mechanical connection without a dense, noisy link mesh.
  // The chain lives in frame-root coordinates; pedal rotation remains entirely
  // owned by the separate drivetrain root.
  const driveSideX = -0.078;
  const chainAndCassetteForms = [
    ridgeGeometry(
      [
        new THREE.Vector3(driveSideX, 0.585, -0.08),
        new THREE.Vector3(driveSideX, 0.55, -0.43),
        new THREE.Vector3(driveSideX, 0.515, -0.83),
      ],
      0.008,
      12,
      7,
    ),
    ridgeGeometry(
      [
        new THREE.Vector3(driveSideX, 0.315, -0.08),
        new THREE.Vector3(driveSideX, 0.34, -0.43),
        new THREE.Vector3(driveSideX, 0.37, -0.83),
      ],
      0.008,
      12,
      7,
    ),
    ellipsoidGeometry([0.03, 0.062, 0.048], 14, 10, [driveSideX - 0.012, 0.36, -0.77]),
    tubeGeometryBetween([driveSideX - 0.012, 0.39, -0.77], [driveSideX, 0.43, -0.84], 0.012, 10),
  ];
  for (const [index, radius] of [0.052, 0.066, 0.081, 0.096].entries()) {
    chainAndCassetteForms.push(
      bakeGeometry(new THREE.TorusGeometry(radius, 0.006, 6, 24), {
        rotation: [0, Math.PI / 2, 0],
        position: [driveSideX - index * 0.009, rearAxle[1], rearAxle[2]],
      }),
    );
  }
  const chainAndCassette = composeGeometry(...chainAndCassetteForms);
  const saddle = performanceSaddleGeometry();
  saddle.translate(0, 1.24, -0.4);
  const seatPost = tubeGeometryBetween([0, 1.18, -0.4], [0, 1.3, -0.4], 0.024, 12);
  const forkCrown = ellipsoidGeometry([0.07, 0.07, 0.055], 16, 10, headBottom);
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
    {
      name: "chain-and-cassette",
      geometry: chainAndCassette,
      materialRole: "equipment-metal",
    },
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
  const chainring = bakeGeometry(new THREE.TorusGeometry(0.16, 0.016, 8, 36), {
    rotation: [0, Math.PI / 2, 0],
  });
  const spider = composeGeometry(
    tubeGeometryBetween([0, -0.14, 0], [0, 0.14, 0], 0.012, 10),
    tubeGeometryBetween([0, 0, -0.14], [0, 0, 0.14], 0.012, 10),
  );
  const crankArms = composeGeometry(
    tubeGeometryBetween([0, 0, 0], [0, -0.215, 0], 0.018, 12, 0.82),
    tubeGeometryBetween([0, 0, 0], [0, 0.215, 0], 0.018, 12, 0.82),
  );
  const pedals = [];
  for (const side of [-1, 1]) {
    const pedal = cliplessPedalGeometry();
    // Match the procedural pedal/foot-contact radius exactly. The runtime
    // still owns that contact solve even after this visible assembly replaces
    // its fallback pedal meshes.
    pedal.translate(side * 0.1, side * 0.21, 0);
    pedals.push(pedal);
  }
  const spindle = bakeGeometry(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 16), {
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

/**
 * Add one v3-compatible legacy leaf.  The material itself remains deliberately
 * neutral: the runtime selects theme, team/ghost identity and physical finish
 * from the metadata role rather than importing baked colours from this GLB.
 */
function addLeafSlot(scene, slot, geometry, materialRole) {
  if (!MATERIAL_ROLES.has(materialRole)) throw new Error(`Unknown material role: ${materialRole}`);
  const mesh = new THREE.Mesh(geometry, PLACEHOLDER);
  mesh.name = slot;
  mesh.userData.replayAssetSlot = slot;
  mesh.userData.replayAssetKind = "leaf";
  mesh.userData.replayMaterialRole = materialRole;
  scene.add(mesh);
}

/**
 * V3 composite roots are stable, transform-free local templates. Each child
 * bakes its placement into geometry, so a renderer can clone the whole root
 * into an existing equipment group without introducing a second animation
 * hierarchy or per-frame asset work.
 */
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

/** Bake an authoring transform into a geometry; v3 nodes retain identity TRS. */
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
