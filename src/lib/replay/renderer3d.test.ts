import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

// Mock only WebGLRenderer — everything else in Three.js works headlessly in Node.
vi.mock("three", async (importOriginal) => {
  const THREE = await importOriginal<typeof import("three")>();

  const fakeGl = {
    getExtension: vi.fn().mockReturnValue({ loseContext: vi.fn() }),
  };

  class FakeWebGLRenderer {
    outputColorSpace = "";
    shadowMap = { enabled: false, type: 0 };
    setPixelRatio = vi.fn();
    setSize = vi.fn();
    render = vi.fn();
    getContext = vi.fn().mockReturnValue(fakeGl);
    dispose = vi.fn();
  }

  return { ...THREE, WebGLRenderer: FakeWebGLRenderer };
});

import { CourseRenderer3D } from "./renderer3d";
import { COLORS_DARK, REDUCED_REPLAY_POSES } from "./renderer";
import { fetchReplayAssetLibrary, type ReplayAssetLibrary } from "./renderer3dAssets";
import { buildStrokeTimeline, fallbackStrokePose, strokePoseAt } from "./strokeModel";
import { solveBikeKinematics, solveRowerKinematics, solveSkierKinematics } from "./sportKinematics";
import * as THREE from "three";

/** Minimal 2D context stub for text sprite canvas creation. */
function make2dCtx() {
  return {
    font: "",
    fillStyle: "",
    textAlign: "",
    textBaseline: "",
    fillRect: vi.fn(),
    fillText: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    measureText: vi.fn().mockReturnValue({ width: 60 }),
  };
}

/** Minimal canvas stub. */
function makeCanvas() {
  const style: Record<string, string> = {};
  const ctx2d = make2dCtx();
  return {
    style,
    width: 0,
    height: 0,
    getContext: (type: string) => (type === "2d" ? ctx2d : null),
    remove: vi.fn(),
  };
}

const origDocument = globalThis.document;
let reducedMotion = false;

beforeEach(() => {
  reducedMotion = false;
  // Stub document so canvas creation works without jsdom.
  globalThis.document = {
    createElement: (tag: string) => {
      if (tag === "canvas") return makeCanvas();
      return {};
    },
  } as unknown as Document;
  // window.matchMedia isn't available in Node; stub it for prefersReducedMotion
  // @ts-expect-error stub
  globalThis.window = {
    devicePixelRatio: 1,
    matchMedia: vi.fn().mockImplementation(() => ({
      get matches() {
        return reducedMotion;
      },
    })),
  };
});

afterEach(() => {
  globalThis.document = origDocument;
  // @ts-expect-error cleanup
  delete globalThis.window;
  vi.clearAllMocks();
});

function makeHost() {
  const children: unknown[] = [];
  return {
    appendChild: (c: unknown) => children.push(c),
    children,
  } as unknown as HTMLElement;
}

function makeRenderState(overrides: Partial<Parameters<CourseRenderer3D["render"]>[0]> = {}) {
  const timeline = buildStrokeTimeline(
    [
      { t: 2, d: 10, pace: 120, spm: 28, watts: 160 },
      { t: 4, d: 21, pace: 118, spm: 30, watts: 190 },
    ],
    "rower",
    true,
  );
  return {
    frame: { t: 2.1, d: 100, pace: 120, spm: 28, watts: 100, hr: 0 },
    ghost: null,
    strokePose: strokePoseAt(timeline, 2.1),
    distFrac: 0.5,
    totalDistance: 2000,
    ...overrides,
  } as Parameters<CourseRenderer3D["render"]>[0];
}

function getScene(renderer: CourseRenderer3D) {
  return (renderer as unknown as { scene: THREE.Scene }).scene;
}

const TAU = Math.PI * 2;
const deg = (value: number) => (value * Math.PI) / 180;

function angleInSector(angle: number, start: number, span: number): boolean {
  const delta = (((angle - start) % TAU) + TAU) % TAU;
  return delta <= span + 1e-6;
}

function instanceAngles(mesh: THREE.InstancedMesh): number[] {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  return Array.from({ length: mesh.count }, (_, index) => {
    mesh.getMatrixAt(index, matrix);
    position.setFromMatrixPosition(matrix);
    return Math.atan2(position.x, position.z);
  });
}

function makeSportState(
  sport: "rower" | "skierg" | "bike",
  cycle: number,
  meters = 100,
  overrides: Partial<Parameters<CourseRenderer3D["render"]>[0]> = {},
) {
  const rate = sport === "bike" ? 86 : sport === "skierg" ? 32 : 28;
  return makeRenderState({
    sport,
    frame: {
      t: cycle,
      d: meters,
      pace: 120,
      spm: rate,
      watts: 180,
      hr: 0,
      progress: meters / 2000,
    },
    strokePose: fallbackStrokePose(sport, cycle * TAU, rate),
    distFrac: meters / 2000,
    ...overrides,
  });
}

function sceneObject(renderer: CourseRenderer3D, name: string): THREE.Object3D {
  const scene = getScene(renderer);
  scene.updateMatrixWorld(true);
  const object = scene.getObjectByName(name);
  expect(object, `missing scene object ${name}`).toBeDefined();
  return object as THREE.Object3D;
}

function worldPosition(renderer: CourseRenderer3D, name: string): THREE.Vector3 {
  return sceneObject(renderer, name).getWorldPosition(new THREE.Vector3());
}

async function loadCheckedInReplayAssetLibrary(): Promise<ReplayAssetLibrary> {
  const bytes = await readFile(
    new URL("../../../static/replay-assets/rowplay-rigs-v2.glb", import.meta.url),
  );
  return fetchReplayAssetLibrary(
    async () =>
      new Response(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), {
        status: 200,
        headers: { "content-type": "model/gltf-binary" },
      }),
  );
}

function disposeReplayAssetLibrary(library: ReplayAssetLibrary): void {
  for (const geometry of library.geometries.values()) geometry.dispose();
}

function projectToPixels(
  renderer: CourseRenderer3D,
  name: string,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
): THREE.Vector2 {
  const point = worldPosition(renderer, name).project(camera);
  return new THREE.Vector2(((point.x + 1) * width) / 2, ((1 - point.y) * height) / 2);
}

function relativeLuminance(color: THREE.Color): number {
  const hex = color.getHex();
  const channel = (shift: number) => {
    const value = ((hex >> shift) & 0xff) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return channel(16) * 0.2126 + channel(8) * 0.7152 + channel(0) * 0.0722;
}

function firstStandardMaterial(object: THREE.Object3D): THREE.MeshStandardMaterial {
  let material: THREE.MeshStandardMaterial | null = null;
  object.traverse((child) => {
    if (
      !material &&
      child instanceof THREE.Mesh &&
      child.material instanceof THREE.MeshStandardMaterial
    ) {
      material = child.material;
    }
  });
  expect(material, `missing standard material below ${object.name}`).not.toBeNull();
  return material!;
}

function getCameraRig(renderer: CourseRenderer3D) {
  return renderer as unknown as {
    camera: THREE.PerspectiveCamera;
    chase: THREE.Vector3;
    lookAt: THREE.Vector3;
    cameraAim: THREE.Vector3;
  };
}

function getShadowRig(renderer: CourseRenderer3D) {
  return renderer as unknown as {
    renderer: { shadowMap?: { enabled: boolean; type: unknown } };
    sunLight: THREE.DirectionalLight;
    liveBoat: THREE.Group;
  };
}

function updateShadowMatrices(renderer: CourseRenderer3D): THREE.DirectionalLight {
  const scene = getScene(renderer);
  const { sunLight } = getShadowRig(renderer);
  scene.updateMatrixWorld(true);
  sunLight.shadow.updateMatrices(sunLight);
  return sunLight;
}

describe("CourseRenderer3D", () => {
  it("constructs without throwing for each sport", () => {
    for (const sport of ["rower", "skierg", "bike"] as const) {
      const host = makeHost();
      expect(() => new CourseRenderer3D(host, "low", sport)).not.toThrow();
    }
  });

  it("removes the canvas from the host when renderer instantiation throws", () => {
    // backend=webgpu with no WebGPURenderer option forces the early-throw guard
    // inside the constructor. The canvas was appended to host before that
    // throw — the constructor must remove it before rethrowing so the host
    // doesn't end up with a stub canvas that no instance owns.
    const host = makeHost();
    const removeSpy = vi.spyOn(makeCanvas(), "remove");
    // Re-seed createElement to return a canvas whose remove is the spied one.
    const stubCanvas = makeCanvas();
    globalThis.document = {
      createElement: (tag: string) => (tag === "canvas" ? stubCanvas : {}),
    } as unknown as Document;
    expect(() => new CourseRenderer3D(host, "low", "rower", { backend: "webgpu" })).toThrow(
      "WebGPU renderer unavailable",
    );
    expect(stubCanvas.remove).toHaveBeenCalledTimes(1);
    removeSpy.mockRestore();
  });

  it("builds sport-specific course groups and track details", () => {
    const detailName = {
      rower: "course:rower:water-streak",
      skierg: "course:skierg:groomed-groove",
      bike: "course:bike:curb",
    } as const;
    const equipmentNames = {
      rower: [
        "rower-deck-stripe",
        "rower-oar-collar",
        "rower-handle-left",
        "rower-handle-right",
        "rower-footplate",
        "athlete:head",
        "rower-torso-shell",
        "rower-jersey-back",
        "rower-shoulder-left",
        "rower-elbow-left",
        "rower-knee-left",
        "rower-hand-left",
        "rower-foot-contact-left",
      ],
      skierg: [
        "skierg-ski-tip",
        "skierg-pole-grip-left",
        "skierg-pole-shaft-left",
        "skierg-pole-contact-left",
        "athlete:head",
        "skierg-torso",
        "skierg-jersey-back",
        "skierg-shoulder-left",
        "skierg-elbow-left",
        "skierg-knee-left",
        "skierg-hand-left",
      ],
      bike: [
        "bike-top-tube",
        "bike-chain-ring",
        "bike-handlebar",
        "bike-pedal-left",
        "bike-wheel-front",
        "bike-saddle",
        "bike-pelvis",
        "bike-jersey-back",
        "bike-shoulder-left",
        "bike-elbow-left",
        "bike-knee-left",
        "bike-helmet",
        "athlete:head",
        "bike-hand-left",
        "bike-hand-contact-left",
        "bike-foot-contact-left",
      ],
    } as const;

    for (const sport of ["rower", "skierg", "bike"] as const) {
      const host = makeHost();
      const renderer = new CourseRenderer3D(host, "low", sport);
      const scene = getScene(renderer);
      expect(scene.getObjectByName(`course:${sport}`)).toBeDefined();
      expect(scene.getObjectByName("course:edge-inner")).toBeDefined();
      expect(scene.getObjectByName(detailName[sport])).toBeDefined();
      for (const equipmentName of equipmentNames[sport]) {
        expect(scene.getObjectByName(equipmentName)).toBeDefined();
      }
      renderer.destroy();
    }
  });

  it("builds a complete sport-authored world at every quality floor", () => {
    for (const sport of ["rower", "skierg", "bike"] as const) {
      const renderer = new CourseRenderer3D(makeHost(), "low", sport);
      const scene = getScene(renderer);
      for (const layer of [
        `environment:${sport}:sky`,
        `environment:${sport}:horizon-far`,
        `environment:${sport}:horizon-mid`,
        `environment:${sport}:infield`,
        `environment:${sport}:apron`,
        "athlete:live:contact-footprint",
      ]) {
        expect(scene.getObjectByName(layer), `${sport} missing ${layer}`).toBeDefined();
      }
      expect(scene.background).toBeInstanceOf(THREE.Color);
      expect(scene.fog).toBeInstanceOf(THREE.Fog);
      renderer.destroy();
    }
  });

  it("places venue dressing in authored sectors with deliberate open vistas", () => {
    const rower = new CourseRenderer3D(makeHost(), "low", "rower");
    const rowPines = sceneObject(rower, "environment:rower:pines") as THREE.InstancedMesh;
    expect(
      instanceAngles(rowPines).every(
        (angle) =>
          angleInSector(angle, deg(-25), deg(95)) || angleInSector(angle, deg(185), deg(70)),
      ),
    ).toBe(true);
    for (const landmark of [
      "environment:rower:regatta-pavilion",
      "environment:rower:boathouse",
      "environment:rower:timing-tower",
    ]) {
      expect(getScene(rower).getObjectByName(landmark)).toBeDefined();
    }

    const skier = new CourseRenderer3D(makeHost(), "low", "skierg");
    const peaks = sceneObject(skier, "environment:skierg:mountain-peaks") as THREE.InstancedMesh;
    expect(
      instanceAngles(peaks).every(
        (angle) =>
          angleInSector(angle, deg(-150), deg(65)) || angleInSector(angle, deg(35), deg(60)),
      ),
    ).toBe(true);
    expect(getScene(skier).getObjectByName("environment:skierg:timing-lodge")).toBeDefined();

    const bike = new CourseRenderer3D(makeHost(), "low", "bike");
    const wallPanels = sceneObject(bike, "environment:bike:wall-panels") as THREE.InstancedMesh;
    expect(
      instanceAngles(wallPanels).every(
        (angle) =>
          angleInSector(angle, deg(55), deg(85)) || angleInSector(angle, deg(220), deg(60)),
      ),
    ).toBe(true);
    const arenaWall = sceneObject(bike, "environment:bike:arena-wall");
    expect(arenaWall.children).toHaveLength(2);
    expect(
      arenaWall.children.reduce(
        (span, sector) =>
          span + ((sector.userData.authoredSector as { span?: number } | undefined)?.span ?? 0),
        0,
      ),
    ).toBeLessThan(TAU * 0.5);
    expect(getScene(bike).getObjectByName("environment:bike:scoreboard")).toBeDefined();

    rower.destroy();
    skier.destroy();
    bike.destroy();
  });

  it("keeps regatta buoy strings out of SkiErg and BikeErg", () => {
    for (const sport of ["skierg", "bike"] as const) {
      const renderer = new CourseRenderer3D(makeHost(), "ultra", sport);
      expect(getScene(renderer).getObjectByName("environment:rower:buoy-strings")).toBeUndefined();
      renderer.destroy();
    }
    const rower = new CourseRenderer3D(makeHost(), "low", "rower");
    const buoys = sceneObject(rower, "environment:rower:buoy-strings");
    expect(buoys).toBeInstanceOf(THREE.InstancedMesh);
    expect((buoys as THREE.InstancedMesh).count).toBe(48);
    rower.destroy();
  });

  it("initializes the professional color pipeline before the first light render", () => {
    const renderer = new CourseRenderer3D(makeHost(), "low", "rower");
    const internals = renderer as unknown as {
      renderer: { toneMapping: number; toneMappingExposure: number };
      scene: THREE.Scene;
    };
    expect(internals.renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(internals.renderer.toneMappingExposure).toBeGreaterThan(1);
    expect((internals.scene.background as THREE.Color).getHex()).toBe(0xf0c98e);
    expect(internals.scene.fog).toBeInstanceOf(THREE.Fog);
    renderer.destroy();
  });

  it("bounds optional environment density by quality while preserving the core world", () => {
    const low = new CourseRenderer3D(makeHost(), "low", "rower");
    const ultra = new CourseRenderer3D(makeHost(), "ultra", "rower");
    const lowScene = getScene(low);
    const ultraScene = getScene(ultra);
    const lowPines = lowScene.getObjectByName("environment:rower:pines") as THREE.InstancedMesh;
    const ultraPines = ultraScene.getObjectByName("environment:rower:pines") as THREE.InstancedMesh;

    expect(lowPines.count).toBe(28);
    expect(ultraPines.count).toBe(76);
    for (const scene of [lowScene, ultraScene]) {
      expect(scene.getObjectByName("environment:rower:sky")).toBeDefined();
      expect(scene.getObjectByName("environment:rower:horizon-mid")).toBeDefined();
      expect(scene.getObjectByName("lane")).toBeDefined();
    }
    low.destroy();
    ultra.destroy();
  });

  it("re-themes the complete environment rather than recoloring only the athlete", () => {
    const renderer = new CourseRenderer3D(makeHost(), "medium", "rower");
    renderer.resize(800, 600);
    const scene = getScene(renderer);
    const lightBackground = (scene.background as THREE.Color).getHex();
    const ground = scene.getObjectByName("ground") as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshStandardMaterial
    >;
    const lightGround = ground.material.color.getHex();

    renderer.render(makeSportState("rower", 0.2), false, "dark");

    expect((scene.background as THREE.Color).getHex()).not.toBe(lightBackground);
    expect(ground.material.color.getHex()).not.toBe(lightGround);
    expect(scene.fog).toBeInstanceOf(THREE.Fog);
    renderer.destroy();
  });

  it("uses equipment-specific contact footprints and carries staged surge into their placement", () => {
    const expectedPatches = {
      rower: ["hull-reflection"],
      skierg: ["ski-left", "ski-right"],
      bike: ["tyre-rear", "tyre-front"],
    } as const;
    for (const sport of ["rower", "skierg", "bike"] as const) {
      const renderer = new CourseRenderer3D(makeHost(), "low", sport);
      const footprint = sceneObject(renderer, "athlete:live:contact-footprint");
      expect(footprint.children.map((child) => child.name)).toEqual(
        expectedPatches[sport].map((patch) => `athlete:live:contact-${patch}`),
      );
      renderer.destroy();
    }

    const rower = new CourseRenderer3D(makeHost(), "low", "rower");
    rower.resize(800, 600);
    rower.render(makeSportState("rower", 0, 250), false);
    const internals = rower as unknown as {
      liveBoat: THREE.Group;
      liveAvatar: { group: THREE.Group };
      liveContactFootprint: THREE.Group;
    };
    expect(Math.abs(internals.liveAvatar.group.position.z)).toBeGreaterThan(0.1);
    const expected = internals.liveBoat.position
      .clone()
      .add(
        new THREE.Vector3(0, 0, internals.liveAvatar.group.position.z).applyQuaternion(
          internals.liveBoat.quaternion,
        ),
      );
    const actual = internals.liveContactFootprint.position;
    expect(
      new THREE.Vector2(actual.x, actual.z).distanceTo(new THREE.Vector2(expected.x, expected.z)),
    ).toBeLessThan(1e-8);
    rower.destroy();
  });

  it("aligns live and ghost contact footprints with their independent course tangents", () => {
    const renderer = new CourseRenderer3D(makeHost(), "low", "bike");
    renderer.resize(800, 600);
    renderer.render(
      makeSportState("bike", 0.25, 250, {
        totalDistance: 1_000,
        ghost: { distFrac: 0, pace: 125, spm: 82, label: "PB" },
      }),
      false,
    );

    const axes = (name: string) => {
      const shadow = sceneObject(renderer, name);
      const orientation = shadow.getWorldQuaternion(new THREE.Quaternion());
      return {
        long: new THREE.Vector3(1, 0, 0).applyQuaternion(orientation).normalize(),
        normal: new THREE.Vector3(0, 0, 1).applyQuaternion(orientation).normalize(),
      };
    };
    const live = axes("athlete:live:contact-footprint");
    const ghost = axes("athlete:ghost:contact-footprint");
    expect(live.long.dot(new THREE.Vector3(0, 0, -1))).toBeCloseTo(1, 8);
    expect(ghost.long.dot(new THREE.Vector3(1, 0, 0))).toBeCloseTo(1, 8);
    expect(live.normal.y).toBeCloseTo(1, 8);
    expect(ghost.normal.y).toBeCloseTo(1, 8);
    renderer.destroy();
  });

  it("uses one stable native shadow system at High and Ultra", () => {
    for (const [quality, mapSize] of [
      ["high", 1024],
      ["ultra", 2048],
    ] as const) {
      const renderer = new CourseRenderer3D(makeHost(), quality, "rower");
      renderer.resize(1140, 420);
      renderer.render(makeSportState("rower", 0.18, 250), false);
      const { renderer: rendererInternals, sunLight } = getShadowRig(renderer);
      const camera = sunLight.shadow.camera as THREE.OrthographicCamera;

      expect(rendererInternals.shadowMap?.enabled).toBe(true);
      expect(rendererInternals.shadowMap?.type).toBe(THREE.VSMShadowMap);
      expect(sunLight.castShadow).toBe(true);
      expect(sunLight.shadow.mapSize.toArray()).toEqual([mapSize, mapSize]);
      expect(sunLight.shadow.blurSamples).toBe(8);
      expect(sunLight.shadow.normalBias).toBeLessThanOrEqual(0.012);
      expect(sunLight.shadow.intensity).toBeCloseTo(0.58, 8);
      expect(camera.right - camera.left).toBeLessThanOrEqual(14);
      expect(sceneObject(renderer, "athlete:live:contact-footprint").visible).toBe(false);
      expect(sceneObject(renderer, "ground").receiveShadow).toBe(true);
      expect(sceneObject(renderer, "lane").receiveShadow).toBe(false);
      expect(sceneObject(renderer, "course:edge-inner").receiveShadow).toBe(false);
      renderer.destroy();
    }

    const fallback = new CourseRenderer3D(makeHost(), "medium", "bike");
    expect(sceneObject(fallback, "athlete:live:contact-footprint").visible).toBe(true);
    fallback.destroy();

    const premiumWithGhost = new CourseRenderer3D(makeHost(), "ultra", "bike");
    premiumWithGhost.resize(1140, 420);
    premiumWithGhost.render(
      makeSportState("bike", 0.2, 250, {
        totalDistance: 1_000,
        ghost: { distFrac: 0.18, pace: 125, spm: 82, label: "PB" },
      }),
      false,
    );
    expect(sceneObject(premiumWithGhost, "athlete:live:contact-footprint").visible).toBe(false);
    expect(sceneObject(premiumWithGhost, "athlete:ghost:contact-footprint").visible).toBe(true);
    premiumWithGhost.destroy();
  });

  it("texel-snaps the focused directional shadow without changing its visible sun direction", () => {
    const renderer = new CourseRenderer3D(makeHost(), "high", "rower");
    renderer.resize(1140, 420);
    let initialTarget: THREE.Vector3 | null = null;
    let priorTarget: THREE.Vector3 | null = null;
    let initialOffset: THREE.Vector3 | null = null;
    let cameraRight: THREE.Vector3 | null = null;
    let cameraUp: THREE.Vector3 | null = null;
    let texelX = 0;
    let texelY = 0;

    for (const delta of [0, 0.003, 0.006, 0.009, 0.012, 0.015, 0.018, 0.021]) {
      renderer.render(makeSportState("rower", 0.2, 250 + delta), false);
      const sunLight = updateShadowMatrices(renderer);
      const camera = sunLight.shadow.camera as THREE.OrthographicCamera;
      const target = sunLight.target.position.clone();
      const offset = sunLight.position.clone().sub(target);
      const liveFocus = getShadowRig(renderer).liveBoat.position.clone().setY(0.55);

      if (!initialTarget) {
        initialTarget = target.clone();
        priorTarget = target.clone();
        initialOffset = offset.clone();
        cameraRight = new THREE.Vector3(1, 0, 0).transformDirection(camera.matrixWorld);
        cameraUp = new THREE.Vector3(0, 1, 0).transformDirection(camera.matrixWorld);
        texelX = (camera.right - camera.left) / sunLight.shadow.mapSize.x;
        texelY = (camera.top - camera.bottom) / sunLight.shadow.mapSize.y;
      }

      expect(offset.distanceTo(initialOffset!)).toBeLessThan(1e-9);
      const moved = target.clone().sub(initialTarget!);
      const xTexels = moved.dot(cameraRight!) / texelX;
      const yTexels = moved.dot(cameraUp!) / texelY;
      expect(Math.abs(xTexels - Math.round(xTexels))).toBeLessThan(1e-6);
      expect(Math.abs(yTexels - Math.round(yTexels))).toBeLessThan(1e-6);
      expect(
        Math.abs(target.clone().sub(priorTarget!).dot(cameraRight!)) / texelX,
      ).toBeLessThanOrEqual(1 + 1e-6);
      expect(
        Math.abs(target.clone().sub(priorTarget!).dot(cameraUp!)) / texelY,
      ).toBeLessThanOrEqual(1 + 1e-6);
      const focusError = target.clone().sub(liveFocus);
      expect(Math.abs(focusError.dot(cameraRight!))).toBeLessThanOrEqual(texelX * 0.500001);
      expect(Math.abs(focusError.dot(cameraUp!))).toBeLessThanOrEqual(texelY * 0.500001);
      priorTarget = target;
    }

    const sun = sceneObject(renderer, "environment:rower:sun-disc");
    const sunDirection = sun.position.clone().normalize();
    const { sunLight } = getShadowRig(renderer);
    const lightDirection = sunLight.position.clone().sub(sunLight.target.position).normalize();
    expect(sunDirection.distanceTo(lightDirection)).toBeLessThan(1e-6);
    renderer.destroy();
  });

  it("joins the BikeErg diamond-frame tubes at their authored endpoints", () => {
    const renderer = new CourseRenderer3D(makeHost(), "low", "bike");
    const expected = {
      "bike-down-tube": [new THREE.Vector3(0, 0.45, -0.05), new THREE.Vector3(0, 1, 0.42)],
      "bike-seat-tube": [new THREE.Vector3(0, 0.45, -0.05), new THREE.Vector3(0, 1.21, -0.4)],
      "bike-top-tube": [new THREE.Vector3(0, 1.21, -0.4), new THREE.Vector3(0, 1.25, 0.5)],
      "bike-head-tube": [new THREE.Vector3(0, 1, 0.42), new THREE.Vector3(0, 1.25, 0.5)],
    } as const;

    for (const [name, [expectedStart, expectedEnd]] of Object.entries(expected)) {
      const tube = sceneObject(renderer, name);
      const half = new THREE.Vector3(0, 0, tube.scale.z * 0.5).applyQuaternion(tube.quaternion);
      const actualStart = tube.position.clone().sub(half);
      const actualEnd = tube.position.clone().add(half);
      const direct = actualStart.distanceTo(expectedStart) + actualEnd.distanceTo(expectedEnd);
      const reversed = actualStart.distanceTo(expectedEnd) + actualEnd.distanceTo(expectedStart);
      expect(Math.min(direct, reversed), name).toBeLessThan(1e-6);
    }
    renderer.destroy();
  });

  it("keeps procedural torso depth within human-scale silhouette bounds", () => {
    const expected = {
      rower: ["rower-torso-shell", 0.29, 0.64, 0.175],
      skierg: ["skierg-torso", 0.3, 0.68, 0.18],
      bike: ["bike-torso", 0.28, 0.64, 0.17],
    } as const;

    for (const sport of ["rower", "skierg", "bike"] as const) {
      const renderer = new CourseRenderer3D(makeHost(), "low", sport);
      const [name, width, height, depth] = expected[sport];
      const torso = sceneObject(renderer, name) as THREE.Mesh<THREE.BufferGeometry>;
      torso.geometry.computeBoundingBox();
      const bounds = torso.geometry.boundingBox?.getSize(new THREE.Vector3());

      expect(torso.scale.toArray()).toEqual([width, height, depth]);
      expect(bounds).toBeDefined();
      const normals = torso.geometry.getAttribute("normal");
      // The two final vertices are the authored bottom/top cap centres. Their
      // normals prove the torso closes outward rather than being back-face
      // culled at its waist and neck.
      expect(normals.getY(normals.count - 2)).toBeLessThan(-0.99);
      expect(normals.getY(normals.count - 1)).toBeGreaterThan(0.99);
      if (bounds) {
        bounds.multiply(torso.scale);
        expect(bounds.z).toBeLessThan(bounds.x * 0.8);
        expect(bounds.y).toBeGreaterThan(bounds.x);
      }
      renderer.destroy();
    }
  });

  it("uses smooth high-contrast body masses instead of blocky sticker figures", () => {
    const renderer = new CourseRenderer3D(makeHost(), "medium", "rower");
    const torso = sceneObject(renderer, "rower-torso-shell") as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshStandardMaterial
    >;
    const yoke = sceneObject(renderer, "rower-jersey-back") as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshStandardMaterial
    >;
    const shoulder = sceneObject(renderer, "rower-shoulder-left") as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshStandardMaterial
    >;

    expect(torso.material.flatShading).toBe(false);
    expect(torso.material.emissiveIntensity).toBeGreaterThan(0);
    expect(relativeLuminance(yoke.material.color)).toBeLessThan(
      relativeLuminance(torso.material.color),
    );
    expect(relativeLuminance(shoulder.material.color)).toBeGreaterThan(
      relativeLuminance(yoke.material.color),
    );
    renderer.destroy();
  });

  it("keeps semantic body and equipment values separated in both themes", () => {
    const names = {
      rower: {
        torso: "rower-torso-shell",
        yoke: "rower-jersey-back",
        skin: "rower-upper-arm-left",
        shoe: "rower-foot-contact-left",
        equipment: "rower-deck-stripe",
      },
      skierg: {
        torso: "skierg-torso",
        yoke: "skierg-jersey-back",
        // SkiErg intentionally uses a full-sleeve Nordic kit. Compare the
        // jersey with the actual visible skin mass rather than misclassifying
        // the authored sleeve as bare skin.
        skin: "athlete:head:cranium",
        shoe: "skierg-foot-contact-left",
        equipment: "skierg-pole-shaft-right",
      },
      bike: {
        torso: "bike-torso",
        yoke: "bike-jersey-back",
        skin: "bike-upper-arm-left",
        shoe: "bike-foot-contact-left",
        equipment: "bike-saddle",
      },
    } as const;

    for (const theme of ["light", "dark"] as const) {
      for (const sport of ["rower", "skierg", "bike"] as const) {
        const renderer = new CourseRenderer3D(makeHost(), "low", sport);
        renderer.resize(800, 600);
        renderer.render(makeSportState(sport, 0.2), false, theme);
        const semantic = names[sport];
        const value = (name: string) =>
          relativeLuminance(firstStandardMaterial(sceneObject(renderer, name)).color);
        const torso = value(semantic.torso);
        const yoke = value(semantic.yoke);
        const skin = value(semantic.skin);
        const shoe = value(semantic.shoe);
        const equipment = value(semantic.equipment);
        const surface = relativeLuminance(
          firstStandardMaterial(sceneObject(renderer, "lane")).color,
        );

        expect(Math.abs(torso - yoke), `${sport} ${theme} torso/yoke`).toBeGreaterThan(0.05);
        expect(Math.abs(torso - skin), `${sport} ${theme} torso/skin`).toBeGreaterThan(0.08);
        expect(Math.abs(shoe - surface), `${sport} ${theme} shoe/surface`).toBeGreaterThan(0.1);
        expect(
          Math.abs(equipment - surface),
          `${sport} ${theme} equipment/surface`,
        ).toBeGreaterThan(0.1);
        renderer.destroy();
      }
    }
  });

  it("repaints both telemetry pills when only the theme changes", () => {
    const renderer = new CourseRenderer3D(makeHost(), "low", "rower");
    renderer.resize(800, 600);
    const state = makeSportState("rower", 0.2, 100, {
      ghost: { distFrac: 0.08, pace: 121, spm: 28, label: "PB" },
    });
    renderer.render(state, false, "light");

    const labels = renderer as unknown as {
      liveLabelTex: THREE.CanvasTexture;
      ghostLabelTex: THREE.CanvasTexture;
    };
    const liveVersion = labels.liveLabelTex.version;
    const ghostVersion = labels.ghostLabelTex.version;

    renderer.render(state, false, "dark");

    expect(labels.liveLabelTex.version).toBeGreaterThan(liveVersion);
    expect(labels.ghostLabelTex.version).toBeGreaterThan(ghostVersion);
    renderer.destroy();
  });

  it("locks RowErg hands to the oar grips and feet to the boat through the full stroke", () => {
    const host = makeHost();
    const renderer = new CourseRenderer3D(host, "medium", "rower");
    renderer.resize(800, 600);

    for (const cycle of [0.01, 0.12, 0.19, 0.37, 0.5, 0.69, 0.9, 0.99]) {
      renderer.render(makeSportState("rower", cycle), false);
      for (const side of ["left", "right"]) {
        const handError = worldPosition(renderer, `rower-hand-${side}`).distanceTo(
          worldPosition(renderer, `rower-hand-contact-${side}`),
        );
        expect(handError).toBeLessThan(1e-6);
        expect(
          worldPosition(renderer, `rower-foot-contact-${side}`).distanceTo(
            worldPosition(renderer, `rower-footplate-contact-${side}`),
          ),
        ).toBeLessThan(1e-6);
      }
    }
    renderer.destroy();
  });

  it("keeps RowErg grips out of the torso volume through every stroke phase", () => {
    const renderer = new CourseRenderer3D(makeHost(), "medium", "rower");
    renderer.resize(1140, 420);
    const torso = sceneObject(renderer, "rower-torso-shell") as THREE.Mesh;
    torso.geometry.computeBoundingBox();
    const body = torso.geometry.boundingBox?.clone();
    expect(body).toBeDefined();

    for (let step = 0; step < 64; step++) {
      renderer.render(makeSportState("rower", step / 64), false);
      for (const side of ["left", "right"] as const) {
        const gripInTorsoSpace = torso.worldToLocal(
          worldPosition(renderer, `rower-hand-contact-${side}`).clone(),
        );
        // A finish can bring the hands to the jersey, but never through its
        // volume. Keep a small core margin so a grazing outer cuff stays valid.
        const torsoCore = body!.clone().expandByScalar(-0.08);
        expect(torsoCore.containsPoint(gripInTorsoSpace), `${side} grip at ${step}/64`).toBe(false);
      }
    }
    renderer.destroy();
  });

  it("keeps the RowErg shoulder-to-grip reach within a human arm envelope", () => {
    const renderer = new CourseRenderer3D(makeHost(), "medium", "rower");
    renderer.resize(1140, 420);
    let maximumReach = 0;

    for (let step = 0; step < 64; step++) {
      renderer.render(makeSportState("rower", step / 64), false);
      for (const side of ["left", "right"] as const) {
        maximumReach = Math.max(
          maximumReach,
          worldPosition(renderer, `rower-shoulder-${side}`).distanceTo(
            worldPosition(renderer, `rower-hand-contact-${side}`),
          ),
        );
      }
    }

    expect(maximumReach).toBeLessThan(0.9);
    renderer.destroy();
  });

  it("renders visible v2 elbow cuffs through the full RowErg pull", async () => {
    const assets = await loadCheckedInReplayAssetLibrary();
    const renderer = new CourseRenderer3D(makeHost(), "medium", "rower", { assets });
    renderer.resize(1140, 420);

    for (const cycle of [0.01, 0.14, 0.28, 0.38, 0.62, 0.86]) {
      renderer.render(makeSportState("rower", cycle), false);
      for (const side of ["left", "right"] as const) {
        const elbow = sceneObject(renderer, `rower-elbow-${side}`) as THREE.Mesh;
        expect(elbow.visible, `${side} elbow cuff visible`).toBe(true);
        expect(elbow.userData.authoredReplayAsset, `${side} authored cuff`).toBe(true);
        expect(elbow.geometry.name).toBe("authored-instance:athlete:elbow");
        expect(Number.isFinite(elbow.position.x + elbow.position.y + elbow.position.z)).toBe(true);
        expect(
          worldPosition(renderer, `rower-hand-${side}`).distanceTo(
            worldPosition(renderer, `rower-hand-contact-${side}`),
          ),
        ).toBeLessThan(1e-6);
      }
    }

    renderer.destroy();
    disposeReplayAssetLibrary(assets);
  });

  it("lets smooth authored shells replace fallback kit plates and toy wheel crosses", async () => {
    const assets = await loadCheckedInReplayAssetLibrary();
    const athleteTrim = {
      rower: [
        "rower-torso-shell",
        "rower-jersey-front",
        "rower-jersey-back",
        "rower-shoulder-trim",
      ],
      skierg: ["skierg-torso", "skierg-jersey-front", "skierg-jersey-back", "skierg-shoulder-trim"],
      bike: ["bike-torso", "bike-jersey-front", "bike-jersey-back", "bike-shoulder-trim"],
    } as const;

    for (const sport of ["rower", "skierg", "bike"] as const) {
      const renderer = new CourseRenderer3D(makeHost(), "ultra", sport, { assets });
      renderer.resize(1140, 420);
      renderer.render(makeSportState(sport, 0.3), false);
      const [torsoName, ...fallbackTrim] = athleteTrim[sport];
      const torso = sceneObject(renderer, torsoName) as THREE.Mesh;
      expect(torso.userData.authoredReplayAsset, `${sport} authored torso`).toBe(true);
      for (const name of fallbackTrim) {
        expect(sceneObject(renderer, name).visible, `${sport} ${name} hidden with assets`).toBe(
          false,
        );
      }

      if (sport === "bike") {
        for (const index of [0, 1, 2]) {
          const spoke = sceneObject(renderer, `bike-wheel-front-spoke-${index}`) as THREE.Mesh;
          expect(spoke.geometry).toBeInstanceOf(THREE.CylinderGeometry);
          expect(firstStandardMaterial(spoke).metalness).toBeGreaterThan(0.5);
        }
      }
      renderer.destroy();
    }
    disposeReplayAssetLibrary(assets);
  });

  it("keeps RowErg knees visually separated from the hull through the stroke", () => {
    const renderer = new CourseRenderer3D(makeHost(), "medium", "rower");
    renderer.resize(1140, 420);
    for (const cycle of [0.02, 0.2, 0.38, 0.7]) {
      renderer.render(makeSportState("rower", cycle), false);
      const { camera } = getCameraRig(renderer);
      camera.updateMatrixWorld(true);
      const left = projectToPixels(renderer, "rower-knee-left", camera, 1140, 420);
      const right = projectToPixels(renderer, "rower-knee-right", camera, 1140, 420);
      expect(left.distanceTo(right), `knee span at cycle ${cycle}`).toBeGreaterThan(14);
    }
    renderer.destroy();
  });

  it("keeps both SkiErg poles visibly separated through plant, press and recovery", () => {
    const renderer = new CourseRenderer3D(makeHost(), "medium", "skierg");
    renderer.resize(1140, 420);
    let minimumShaftSeparation = Number.POSITIVE_INFINITY;
    let minimumFarPoleLength = Number.POSITIVE_INFINITY;
    let minimumNearPoleLength = Number.POSITIVE_INFINITY;
    let minimumTipSpan = Number.POSITIVE_INFINITY;
    for (let step = 0; step < 128; step++) {
      const cycle = step / 128;
      renderer.render(makeSportState("skierg", cycle), false);
      const { camera } = getCameraRig(renderer);
      camera.updateMatrixWorld(true);
      const left = projectToPixels(renderer, "skierg-pole-shaft-left", camera, 1140, 420);
      const right = projectToPixels(renderer, "skierg-pole-shaft-right", camera, 1140, 420);
      const leftGrip = projectToPixels(renderer, "skierg-pole-grip-left", camera, 1140, 420);
      const leftTip = projectToPixels(renderer, "skierg-pole-contact-left", camera, 1140, 420);
      const rightGrip = projectToPixels(renderer, "skierg-pole-grip-right", camera, 1140, 420);
      const rightTip = projectToPixels(renderer, "skierg-pole-contact-right", camera, 1140, 420);

      minimumShaftSeparation = Math.min(minimumShaftSeparation, left.distanceTo(right));
      minimumFarPoleLength = Math.min(minimumFarPoleLength, leftGrip.distanceTo(leftTip));
      minimumNearPoleLength = Math.min(minimumNearPoleLength, rightGrip.distanceTo(rightTip));
      minimumTipSpan = Math.min(
        minimumTipSpan,
        worldPosition(renderer, "skierg-pole-contact-left").distanceTo(
          worldPosition(renderer, "skierg-pole-contact-right"),
        ),
      );
    }

    // A symmetric physical solve can legitimately foreshorten in the chase
    // camera, but its shafts and actual course contacts must never merge.
    expect(minimumShaftSeparation).toBeGreaterThan(40);
    expect(minimumTipSpan).toBeGreaterThan(0.7);
    expect(minimumFarPoleLength).toBeGreaterThan(48);
    expect(minimumNearPoleLength).toBeGreaterThan(40);
    renderer.destroy();
  });

  it("increases RowErg hip-to-foot separation through the leg drive", () => {
    const host = makeHost();
    const renderer = new CourseRenderer3D(host, "medium", "rower");
    renderer.resize(800, 600);

    renderer.render(makeSportState("rower", 0.01), false);
    const catchSeparation = worldPosition(renderer, "rower-hips").distanceTo(
      worldPosition(renderer, "rower-foot-contact-left"),
    );
    renderer.render(makeSportState("rower", 0.37), false);
    const finishSeparation = worldPosition(renderer, "rower-hips").distanceTo(
      worldPosition(renderer, "rower-foot-contact-left"),
    );

    expect(finishSeparation - catchSeparation).toBeGreaterThan(0.35);
    renderer.destroy();
  });

  it("keeps every authored arm and leg segment fixed through 128 poses per sport", () => {
    const expectedBones = {
      rower: [
        ["rower-upper-arm-left", 0.445],
        ["rower-upper-arm-right", 0.445],
        ["rower-forearm-left", 0.44],
        ["rower-forearm-right", 0.44],
        ["rower-thigh-left", 0.552],
        ["rower-thigh-right", 0.552],
        ["rower-shin-left", 0.552],
        ["rower-shin-right", 0.552],
      ],
      skierg: [
        ["skierg-pole-shaft-left", 1.38],
        ["skierg-pole-shaft-right", 1.38],
        ["skierg-upper-arm-left", 0.36],
        ["skierg-upper-arm-right", 0.36],
        ["skierg-forearm-left", 0.34],
        ["skierg-forearm-right", 0.34],
        ["skierg-thigh-left", 0.4],
        ["skierg-thigh-right", 0.4],
        ["skierg-shin-left", 0.39],
        ["skierg-shin-right", 0.39],
      ],
      bike: [
        ["bike-upper-arm-left", 0.37],
        ["bike-upper-arm-right", 0.37],
        ["bike-forearm-left", 0.35],
        ["bike-forearm-right", 0.35],
        ["bike-thigh-left", 0.54],
        ["bike-thigh-right", 0.54],
        ["bike-shin-left", 0.53],
        ["bike-shin-right", 0.53],
      ],
    } as const;

    for (const sport of ["rower", "skierg", "bike"] as const) {
      const renderer = new CourseRenderer3D(makeHost(), "low", sport);
      renderer.resize(800, 600);
      const sceneObjectsBefore: string[] = [];
      getScene(renderer).traverse((object) => sceneObjectsBefore.push(object.uuid));
      for (let step = 0; step < 128; step++) {
        renderer.render(makeSportState(sport, step / 128), false);
        for (const [name, expectedLength] of expectedBones[sport]) {
          const bone = sceneObject(renderer, name);
          expect(bone.scale.z, `${sport} ${name} at pose ${step}`).toBeCloseTo(expectedLength, 7);
          for (const value of [
            bone.position.x,
            bone.position.y,
            bone.position.z,
            bone.quaternion.x,
            bone.quaternion.y,
            bone.quaternion.z,
            bone.quaternion.w,
          ]) {
            expect(Number.isFinite(value)).toBe(true);
          }
        }
        for (const side of ["left", "right"] as const) {
          if (sport === "rower") {
            expect(
              worldPosition(renderer, `rower-hand-${side}`).distanceTo(
                worldPosition(renderer, `rower-hand-contact-${side}`),
              ),
              `rower ${side} hand contact at pose ${step}`,
            ).toBeLessThan(1e-6);
            expect(
              worldPosition(renderer, `rower-foot-contact-${side}`).distanceTo(
                worldPosition(renderer, `rower-footplate-contact-${side}`),
              ),
            ).toBeLessThan(1e-6);
          } else if (sport === "skierg") {
            expect(
              worldPosition(renderer, `skierg-hand-${side}`).distanceTo(
                worldPosition(renderer, `skierg-pole-grip-${side}`),
              ),
            ).toBeLessThan(1e-6);
          } else {
            expect(
              worldPosition(renderer, `bike-hand-${side}`).distanceTo(
                worldPosition(renderer, `bike-hand-contact-${side}`),
              ),
            ).toBeLessThan(1e-6);
            expect(
              worldPosition(renderer, `bike-foot-contact-${side}`).distanceTo(
                worldPosition(renderer, `bike-pedal-${side}`),
              ),
            ).toBeLessThan(1e-6);
          }
        }
      }
      const sceneObjectsAfter: string[] = [];
      getScene(renderer).traverse((object) => sceneObjectsAfter.push(object.uuid));
      expect(sceneObjectsAfter).toEqual(sceneObjectsBefore);
      renderer.destroy();
    }
  });

  it("buries, feathers, and re-squares RowErg blades continuously", () => {
    const host = makeHost();
    const renderer = new CourseRenderer3D(host, "medium", "rower");
    renderer.resize(800, 600);

    renderer.render(makeSportState("rower", 0.19), false);
    const driveOarY = sceneObject(renderer, "rower-oar-left").position.y;
    const squaredDrive = sceneObject(renderer, "rower-blade-left").rotation.x;
    expect(driveOarY).toBeLessThan(0.26);
    expect(squaredDrive).toBeCloseTo(Math.PI / 2, 5);

    renderer.render(makeSportState("rower", 0.69), false);
    const feathered = sceneObject(renderer, "rower-blade-left").rotation.x;
    expect(sceneObject(renderer, "rower-oar-left").position.y).toBeCloseTo(0.34, 5);
    expect(feathered).toBeCloseTo(0, 5);

    renderer.render(makeSportState("rower", 0.9), false);
    const squaring = sceneObject(renderer, "rower-blade-left").rotation.x;
    expect(squaring).toBeGreaterThan(feathered);
    expect(squaring).toBeLessThan(Math.PI / 2);

    renderer.render(makeSportState("rower", 0.999), false);
    expect(sceneObject(renderer, "rower-blade-left").rotation.x).toBeCloseTo(Math.PI / 2, 3);
    renderer.destroy();
  });

  it("builds RowErg shaped head detail", () => {
    const host = makeHost();
    const renderer = new CourseRenderer3D(host, "low", "rower");
    const scene = getScene(renderer);
    expect(scene.getObjectByName("athlete:head")).toBeDefined();
    expect(scene.getObjectByName("athlete:head:cranium")).toBeDefined();
    renderer.destroy();
  });

  it("animates the RowErg contact model from recorded stroke pose", () => {
    const host = makeHost();
    const renderer = new CourseRenderer3D(host, "medium", "rower");
    renderer.resize(800, 600);
    expect(() => renderer.render(makeRenderState({ sport: "rower" }), true)).not.toThrow();
    renderer.destroy();
  });

  it("does not turn inferred fatigue into a lower RowErg posture", () => {
    const host = makeHost();
    const renderer = new CourseRenderer3D(host, "medium", "rower");
    renderer.resize(800, 600);
    const basePose = fallbackStrokePose("rower", 0.2 * TAU, 28);

    renderer.render(
      makeSportState("rower", 0.2, 100, {
        strokePose: { ...basePose, fatigue: 0, amplitude: 0.72 },
      }),
      false,
    );
    const freshAthlete = sceneObject(renderer, "rower-athlete").position.clone();
    const freshTorsoPitch = sceneObject(renderer, "rower-torso").rotation.x;
    const freshHeadHeight = worldPosition(renderer, "athlete:head").y;

    renderer.render(
      makeSportState("rower", 0.2, 100, {
        strokePose: { ...basePose, fatigue: 1, amplitude: 1.32 },
      }),
      false,
    );
    expect(sceneObject(renderer, "rower-athlete").position).toEqual(freshAthlete);
    expect(sceneObject(renderer, "rower-torso").rotation.x).toBe(freshTorsoPitch);
    expect(worldPosition(renderer, "athlete:head").y).toBe(freshHeadHeight);
    renderer.destroy();
  });

  it("uses a contact-safe static RowErg pose and fixed lens in reduced motion", () => {
    const host = makeHost();
    const renderer = new CourseRenderer3D(host, "medium", "rower");
    renderer.resize(800, 600);

    // Exercise a live preference change after a non-static pose, not merely a
    // renderer that happened to start with reduced motion already enabled.
    renderer.render(makeSportState("rower", 0.1), true);
    reducedMotion = true;
    renderer.render(makeSportState("rower", 0.05), true);
    const firstPose = sceneObject(renderer, "rower-athlete").position.clone();
    const expected = solveRowerKinematics(REDUCED_REPLAY_POSES.rower);
    expect(firstPose.y).toBe(0);
    expect(firstPose.z).toBeCloseTo(0.26 - expected.legExtension * 0.5, 8);
    expect(sceneObject(renderer, "rower-oar-left").position.y).toBeCloseTo(
      0.34 - expected.bladeDepth * 0.2,
      8,
    );
    expect(sceneObject(renderer, "rower-blade-left").rotation.x).toBeCloseTo(
      (1 - expected.bladeFeather) * (Math.PI / 2),
      8,
    );
    renderer.render(makeSportState("rower", 0.8, 260), true);
    expect(sceneObject(renderer, "rower-athlete").position).toEqual(firstPose);
    const reducedRig = getCameraRig(renderer);
    expect(reducedRig.camera.fov).toBe(42);
    expect(reducedRig.camera.position).toEqual(reducedRig.chase);
    expect(reducedRig.cameraAim).toEqual(reducedRig.lookAt);
    for (const side of ["left", "right"]) {
      expect(
        worldPosition(renderer, `rower-hand-${side}`).distanceTo(
          worldPosition(renderer, `rower-hand-contact-${side}`),
        ),
      ).toBeLessThan(1e-6);
      expect(
        worldPosition(renderer, `rower-foot-contact-${side}`).distanceTo(
          worldPosition(renderer, `rower-footplate-contact-${side}`),
        ),
      ).toBeLessThan(1e-6);
    }
    renderer.destroy();
  });

  it("uses shared representative reduced poses for SkiErg and BikeErg", () => {
    reducedMotion = true;

    const skiRenderer = new CourseRenderer3D(makeHost(), "medium", "skierg");
    skiRenderer.resize(800, 600);
    skiRenderer.render(makeSportState("skierg", 0.8), true);
    const expectedSki = solveSkierKinematics(REDUCED_REPLAY_POSES.skierg);
    expect(sceneObject(skiRenderer, "skierg-upper").rotation.x).toBeCloseTo(
      0.08 + expectedSki.hipHinge * 0.88,
      8,
    );
    skiRenderer.destroy();

    const bikeRenderer = new CourseRenderer3D(makeHost(), "medium", "bike");
    bikeRenderer.resize(800, 600);
    bikeRenderer.render(makeSportState("bike", 0.8), true);
    const expectedBike = solveBikeKinematics(REDUCED_REPLAY_POSES.bike);
    expect(sceneObject(bikeRenderer, "bike-cranks").rotation.x).toBeCloseTo(
      expectedBike.crankAngle,
      8,
    );
    expect(sceneObject(bikeRenderer, "bike-foot-contact-left").rotation.x).toBeCloseTo(
      expectedBike.anklePitchLeft,
      8,
    );
    bikeRenderer.destroy();
  });

  it("keeps SkiErg hands on both grips and pole tips grounded only during contact", () => {
    const host = makeHost();
    const renderer = new CourseRenderer3D(host, "medium", "skierg");
    renderer.resize(800, 600);

    renderer.render(makeSportState("skierg", 0.17), false);
    for (const side of ["left", "right"]) {
      expect(
        worldPosition(renderer, `skierg-hand-${side}`).distanceTo(
          worldPosition(renderer, `skierg-pole-grip-${side}`),
        ),
      ).toBeLessThan(1e-6);
      expect(worldPosition(renderer, `skierg-pole-contact-${side}`).y).toBeCloseTo(0.055, 5);
    }

    renderer.render(makeSportState("skierg", 0.7), false);
    for (const side of ["left", "right"]) {
      expect(
        worldPosition(renderer, `skierg-hand-${side}`).distanceTo(
          worldPosition(renderer, `skierg-pole-grip-${side}`),
        ),
      ).toBeLessThan(1e-6);
      expect(worldPosition(renderer, `skierg-pole-contact-${side}`).y).toBeGreaterThan(0.25);
    }
    renderer.destroy();
  });

  it("anchors loaded SkiErg poles to the course with aligned, rigid hardware", async () => {
    const assets = await loadCheckedInReplayAssetLibrary();
    const renderer = new CourseRenderer3D(makeHost(), "medium", "skierg", { assets });
    renderer.resize(1140, 420);
    const plantedCycles = [0.05, 0.11, 0.18, 0.22];
    const plantedTips = new Map<string, THREE.Vector3>();

    for (const cycle of plantedCycles) {
      // Fallback SkiErg strokes advance 8 m per cycle. Advance course distance
      // consistently so every sample describes one deterministic plant.
      renderer.render(makeSportState("skierg", cycle, 200 + cycle * 8), false);
      for (const side of ["left", "right"] as const) {
        const hand = worldPosition(renderer, `skierg-hand-${side}`);
        const grip = worldPosition(renderer, `skierg-pole-grip-${side}`);
        const tip = worldPosition(renderer, `skierg-pole-contact-${side}`);
        const shaft = sceneObject(renderer, `skierg-pole-shaft-${side}`);
        const gripObject = sceneObject(renderer, `skierg-pole-grip-${side}`);
        const basket = sceneObject(renderer, `skierg-pole-tip-${side}`);

        expect(hand.distanceTo(grip), `${side} hand remains on grip`).toBeLessThan(1e-6);
        expect(grip.distanceTo(tip), `${side} rigid pole length`).toBeCloseTo(1.38, 5);
        expect(tip.y, `${side} carbide tip stays on snow`).toBeCloseTo(0.055, 5);
        const prior = plantedTips.get(side);
        // The skier's torso advances through the press, but a loaded basket
        // must read as planted rather than skating forward with the athlete.
        if (prior) expect(tip.distanceTo(prior), `${side} planted tip drift`).toBeLessThan(0.004);
        else plantedTips.set(side, tip.clone());

        const shaftDirection = new THREE.Vector3(0, 0, 1).applyQuaternion(
          shaft.getWorldQuaternion(new THREE.Quaternion()),
        );
        const gripDirection = new THREE.Vector3(0, 0, 1).applyQuaternion(
          gripObject.getWorldQuaternion(new THREE.Quaternion()),
        );
        const basketUp = new THREE.Vector3(0, 1, 0).applyQuaternion(
          basket.getWorldQuaternion(new THREE.Quaternion()),
        );
        expect(shaftDirection.dot(gripDirection), `${side} grip follows shaft`).toBeGreaterThan(
          0.999,
        );
        expect(
          basketUp.dot(new THREE.Vector3(0, 1, 0)),
          `${side} basket stays level`,
        ).toBeGreaterThan(0.999);
        expect(gripObject.userData.authoredReplayAsset, `${side} authored grip installed`).toBe(
          true,
        );
        const gripMesh = gripObject as THREE.Mesh;
        gripMesh.geometry.computeBoundingBox();
        const gripSize = gripMesh.geometry.boundingBox?.getSize(new THREE.Vector3());
        expect(gripSize?.z, `${side} grip stays long along pole axis`).toBeGreaterThan(
          (gripSize?.y ?? 0) * 2.5,
        );
      }
    }

    const leftPlant = plantedTips.get("left");
    const rightPlant = plantedTips.get("right");
    expect(leftPlant).toBeDefined();
    expect(rightPlant).toBeDefined();
    expect(leftPlant!.distanceTo(rightPlant!)).toBeGreaterThan(0.7);
    renderer.destroy();
    disposeReplayAssetLibrary(assets);
  });

  it("keeps SkiErg recovery pole sweeps in the course frame around the lap", () => {
    const renderer = new CourseRenderer3D(makeHost(), "medium", "skierg");
    renderer.resize(1140, 420);

    const recoveryDirection = (side: "left" | "right"): THREE.Vector3 => {
      const upper = sceneObject(renderer, "skierg-upper");
      const outer = upper.parent?.parent;
      expect(outer, "SkiErg outer course group").toBeDefined();
      const grip = worldPosition(renderer, `skierg-pole-grip-${side}`);
      const tip = worldPosition(renderer, `skierg-pole-contact-${side}`);
      return tip
        .sub(grip)
        .normalize()
        .applyQuaternion(outer!.getWorldQuaternion(new THREE.Quaternion()).invert());
    };

    renderer.render(makeSportState("skierg", 0.94, 0), false);
    const atStart = {
      left: recoveryDirection("left"),
      right: recoveryDirection("right"),
    };
    renderer.render(makeSportState("skierg", 0.94, CourseRenderer3D.LOOP_METERS / 4), false);
    const quarterLap = {
      left: recoveryDirection("left"),
      right: recoveryDirection("right"),
    };

    expect(atStart.left.distanceTo(quarterLap.left)).toBeLessThan(1e-6);
    expect(atStart.right.distanceTo(quarterLap.right)).toBeLessThan(1e-6);
    expect(atStart.left.x).toBeLessThan(-0.1);
    expect(atStart.right.x).toBeGreaterThan(0.1);
    renderer.destroy();
  });

  it("animates the SkiErg contact model from recorded stroke pose", () => {
    const host = makeHost();
    const renderer = new CourseRenderer3D(host, "medium", "skierg");
    renderer.resize(800, 600);
    expect(() => renderer.render(makeRenderState({ sport: "skierg" }), true)).not.toThrow();
    renderer.destroy();
  });

  it("locks BikeErg shoes to both pedals with bounded ankle articulation", () => {
    const host = makeHost();
    const renderer = new CourseRenderer3D(host, "medium", "bike");
    renderer.resize(800, 600);

    for (const cycle of [0, 0.125, 0.25, 0.5, 0.75, 0.999]) {
      renderer.render(makeSportState("bike", cycle), false);
      for (const side of ["left", "right"]) {
        expect(
          worldPosition(renderer, `bike-hand-${side}`).distanceTo(
            worldPosition(renderer, `bike-hand-contact-${side}`),
          ),
        ).toBeLessThan(1e-6);
        expect(
          worldPosition(renderer, `bike-foot-contact-${side}`).distanceTo(
            worldPosition(renderer, `bike-pedal-${side}`),
          ),
        ).toBeLessThan(1e-6);
        expect(
          Math.abs(sceneObject(renderer, `bike-foot-contact-${side}`).rotation.x),
        ).toBeLessThan(0.24);
      }
    }
    renderer.destroy();
  });

  it("rolls BikeErg wheels from travelled meters independently of crank phase", () => {
    const host = makeHost();
    const renderer = new CourseRenderer3D(host, "medium", "bike");
    renderer.resize(800, 600);

    renderer.render(makeSportState("bike", 0.25, 0), false);
    expect(sceneObject(renderer, "bike-wheel-front").rotation.x).toBe(0);
    renderer.render(makeSportState("bike", 0.25, 9), false);
    expect(sceneObject(renderer, "bike-wheel-front").rotation.x).toBeCloseTo(20, 8);
    expect(sceneObject(renderer, "bike-wheel-rear").rotation.x).toBeCloseTo(20, 8);
    expect(sceneObject(renderer, "bike-cranks").rotation.x).toBeCloseTo(Math.PI / 2, 8);
    renderer.destroy();
  });

  it("builds BikeErg shaped rider head detail", () => {
    const host = makeHost();
    const renderer = new CourseRenderer3D(host, "low", "bike");
    const scene = getScene(renderer);
    expect(scene.getObjectByName("athlete:head")).toBeDefined();
    expect(scene.getObjectByName("athlete:head:cranium")).toBeDefined();
    renderer.destroy();
  });

  it("animates the BikeErg contact model from recorded stroke pose", () => {
    const host = makeHost();
    const renderer = new CourseRenderer3D(host, "medium", "bike");
    renderer.resize(800, 600);
    expect(() => renderer.render(makeRenderState({ sport: "bike" }), true)).not.toThrow();
    renderer.destroy();
  });

  it("constructs at each quality level", () => {
    for (const quality of ["low", "medium", "high", "ultra"] as const) {
      const host = makeHost();
      expect(() => new CourseRenderer3D(host, quality, "rower")).not.toThrow();
    }
  });

  it("appends its canvas to the host element", () => {
    const host = makeHost();
    new CourseRenderer3D(host, "low", "rower");
    expect((host as unknown as { children: unknown[] }).children.length).toBe(1);
  });

  it("exposes the LOOP_METERS static constant", () => {
    expect(CourseRenderer3D.LOOP_METERS).toBe(1000);
  });

  describe("resize()", () => {
    it("sets w and h so render() can proceed", () => {
      const host = makeHost();
      const r = new CourseRenderer3D(host, "low", "rower");
      expect(() => r.resize(800, 600)).not.toThrow();
    });
  });

  describe("render()", () => {
    it("returns early (no throw) when w=0 before resize", () => {
      const host = makeHost();
      const r = new CourseRenderer3D(host, "low", "rower");
      // w is 0 until resize() is called; render() should no-op cleanly
      expect(() => r.render(makeRenderState(), false)).not.toThrow();
    });

    it("proceeds without throwing after resize()", () => {
      const host = makeHost();
      const r = new CourseRenderer3D(host, "low", "rower");
      r.resize(800, 600);
      expect(() => r.render(makeRenderState(), true)).not.toThrow();
    });

    it("handles ghost state in render", () => {
      const host = makeHost();
      const r = new CourseRenderer3D(host, "low", "rower");
      r.resize(800, 600);
      const stateWithGhost = makeRenderState({
        ghost: { distFrac: 0.4, pace: 118, spm: 24, label: "PB" },
        ghostStrokePose: makeRenderState().strokePose,
      });
      expect(() => r.render(stateWithGhost, false)).not.toThrow();
    });

    it("disables depth writes on every translucent ghost body part", () => {
      const renderer = new CourseRenderer3D(makeHost(), "medium", "skierg");
      const ghost = (renderer as unknown as { ghostGroup: THREE.Group }).ghostGroup;
      let transparentMeshes = 0;
      ghost.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (!(material instanceof THREE.Material)) continue;
          transparentMeshes++;
          expect(material.transparent).toBe(true);
          expect(material.depthWrite).toBe(false);
          expect(material.opacity).toBeCloseTo(0.45, 8);
        }
      });
      expect(transparentMeshes).toBeGreaterThan(0);

      const live = (renderer as unknown as { liveBoat: THREE.Group }).liveBoat;
      let liveMeshes = 0;
      live.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (!(material instanceof THREE.Material)) continue;
          liveMeshes++;
          expect(material.depthWrite).toBe(true);
        }
      });
      expect(liveMeshes).toBeGreaterThan(0);
      renderer.destroy();
    });

    it("renders with dark theme without throwing", () => {
      const host = makeHost();
      const r = new CourseRenderer3D(host, "low", "rower");
      r.resize(800, 600);
      expect(() => r.render(makeRenderState(), false, "dark")).not.toThrow();
      const torso = sceneObject(r, "rower-torso-shell") as THREE.Mesh<
        THREE.BufferGeometry,
        THREE.MeshStandardMaterial
      >;
      expect(torso.material.color.getHex()).toBe(Number.parseInt(COLORS_DARK.live.slice(1), 16));
      expect(torso.material.emissive.getHex()).toBe(torso.material.color.getHex());
      r.destroy();
    });

    it("recolors the sport-specific course surface on dark theme", () => {
      const host = makeHost();
      const r = new CourseRenderer3D(host, "low", "bike");
      r.resize(800, 600);
      r.render(makeRenderState({ sport: "bike" }), false, "dark");
      const lane = getScene(r).getObjectByName("lane") as unknown as {
        material: { color: { getHex(): number } };
      };
      expect(lane.material.color.getHex()).toBe(0x2a3038);
      r.destroy();
    });

    it("handles playing=true (animation phase advances)", () => {
      const host = makeHost();
      const r = new CourseRenderer3D(host, "low", "rower");
      r.resize(800, 600);
      expect(() => r.render(makeRenderState(), true)).not.toThrow();
    });

    it("frames each sport at an equipment-aware camera height", () => {
      const heights = new Map<string, number>();
      const distances = new Map<string, number>();
      for (const sport of ["rower", "skierg", "bike"] as const) {
        const host = makeHost();
        const renderer = new CourseRenderer3D(host, "low", sport);
        renderer.resize(800, 600);
        renderer.render(makeSportState(sport, 0.2, 0), false);
        heights.set(sport, getCameraRig(renderer).camera.position.y);
        distances.set(
          sport,
          getCameraRig(renderer).camera.position.distanceTo(new THREE.Vector3(0, 0, 30)),
        );
        renderer.destroy();
      }
      expect(heights.get("skierg")).toBeGreaterThan(heights.get("rower") ?? 0);
      expect(heights.get("rower")).toBeGreaterThan(heights.get("bike") ?? 0);
      // The former one-size chase rig sat ~6.9 m from the athlete. Each wide-
      // aspect sport rig now moves closer while retaining its own height.
      expect(Math.max(...distances.values())).toBeLessThan(6.65);
    });

    it("parents non-shadowing athlete fill and rim lights to the chase camera", () => {
      const renderer = new CourseRenderer3D(makeHost(), "medium", "rower");
      const scene = getScene(renderer);
      const { camera } = getCameraRig(renderer);
      for (const name of ["camera-athlete-fill", "camera-athlete-rim"]) {
        const light = scene.getObjectByName(name) as THREE.DirectionalLight;
        expect(light).toBeInstanceOf(THREE.DirectionalLight);
        expect(light.parent).toBe(camera);
        expect(light.target.parent).toBe(camera);
        expect(light.castShadow).toBe(false);
      }
      renderer.destroy();
    });

    it("bounds speed-aware lens breathing to the authored 42–44 degree range", () => {
      let now = 0;
      const nowSpy = vi.spyOn(globalThis.performance, "now").mockImplementation(() => now);
      try {
        const renderer = new CourseRenderer3D(makeHost(), "low", "bike");
        renderer.resize(1140, 420);
        renderer.render(makeSportState("bike", 0, 0), true);
        for (let frame = 1; frame <= 40; frame++) {
          now += 16;
          renderer.render(makeSportState("bike", frame / 40, frame * 0.5), true);
        }
        const { camera } = getCameraRig(renderer);
        expect(camera.fov).toBeGreaterThan(42);
        expect(camera.fov).toBeLessThanOrEqual(44);
        renderer.destroy();
      } finally {
        nowSpy.mockRestore();
      }
    });

    it("keeps every athlete legible at the real desktop and mobile stage sizes", () => {
      const feet = {
        rower: "rower-foot-contact-left",
        skierg: "skierg-foot-contact-left",
        bike: "bike-foot-contact-left",
      } as const;
      const shoulders = {
        rower: ["rower-shoulder-left", "rower-shoulder-right"],
        skierg: ["skierg-shoulder-left", "skierg-shoulder-right"],
        bike: ["bike-shoulder-left", "bike-shoulder-right"],
      } as const;
      const minimumDesktopHeight = { rower: 50, skierg: 120, bike: 95 } as const;
      const minimumMobileHeight = { rower: 35, skierg: 82, bike: 70 } as const;

      for (const [width, height] of [
        [1140, 420],
        [390, 360],
      ] as const) {
        for (const sport of ["rower", "skierg", "bike"] as const) {
          const renderer = new CourseRenderer3D(makeHost(), "low", sport);
          renderer.resize(width, height);
          renderer.render(makeSportState(sport, 0.2, 0), false);
          const { camera } = getCameraRig(renderer);
          camera.updateMatrixWorld(true);
          camera.updateProjectionMatrix();
          const head = projectToPixels(renderer, "athlete:head", camera, width, height);
          const foot = projectToPixels(renderer, feet[sport], camera, width, height);
          const leftShoulder = projectToPixels(
            renderer,
            shoulders[sport][0],
            camera,
            width,
            height,
          );
          const rightShoulder = projectToPixels(
            renderer,
            shoulders[sport][1],
            camera,
            width,
            height,
          );
          const minimumHeight =
            width >= 640 ? minimumDesktopHeight[sport] : minimumMobileHeight[sport];

          for (const name of [feet[sport], shoulders[sport][0], shoulders[sport][1]]) {
            const ndc = worldPosition(renderer, name).project(camera);
            expect(Math.abs(ndc.x), `${sport} ${name} x at ${width}×${height}`).toBeLessThan(0.98);
            expect(Math.abs(ndc.y), `${sport} ${name} y at ${width}×${height}`).toBeLessThan(0.98);
            expect(ndc.z, `${sport} ${name} near at ${width}×${height}`).toBeGreaterThan(-1);
            expect(ndc.z, `${sport} ${name} far at ${width}×${height}`).toBeLessThan(1);
          }
          const headNdc = worldPosition(renderer, "athlete:head").project(camera);
          expect(Math.abs(headNdc.x), `${sport} head x at ${width}×${height}`).toBeLessThan(0.98);
          expect(Math.abs(headNdc.y), `${sport} head y at ${width}×${height}`).toBeLessThan(0.98);
          expect(headNdc.z, `${sport} head near at ${width}×${height}`).toBeGreaterThan(-1);
          expect(headNdc.z, `${sport} head far at ${width}×${height}`).toBeLessThan(1);

          expect(
            Math.abs(head.y - foot.y),
            `${sport} athlete height at ${width}×${height}`,
          ).toBeGreaterThan(minimumHeight);
          expect(
            leftShoulder.distanceTo(rightShoulder),
            `${sport} shoulder span at ${width}×${height}`,
          ).toBeGreaterThan(width >= 640 ? 24 : 18);
          renderer.destroy();
        }
      }
    });

    it("pulls the camera back on narrow canvases", () => {
      const distances: number[] = [];
      for (const [width, height] of [
        [1200, 600],
        [600, 800],
      ] as const) {
        const host = makeHost();
        const renderer = new CourseRenderer3D(host, "low", "rower");
        renderer.resize(width, height);
        renderer.render(makeSportState("rower", 0.2, 0), false);
        const rig = getCameraRig(renderer);
        distances.push(rig.camera.position.distanceTo(rig.lookAt));
        renderer.destroy();
      }
      expect(distances[1]).toBeGreaterThan(distances[0]);
    });

    it("prioritizes the RowErg athlete and grip span in a portrait viewport", () => {
      const host = makeHost();
      const renderer = new CourseRenderer3D(host, "low", "rower");
      renderer.resize(390, 360);
      renderer.render(makeSportState("rower", 0.2, 0), false);
      const { camera } = getCameraRig(renderer);
      camera.updateMatrixWorld(true);
      camera.updateProjectionMatrix();

      for (const side of ["left", "right"]) {
        for (const part of [`rower-hand-contact-${side}`, `rower-blade-${side}`]) {
          const projected = worldPosition(renderer, part).project(camera);
          expect(Math.abs(projected.x), `${part} horizontal clip`).toBeLessThan(0.98);
          expect(Math.abs(projected.y), `${part} vertical clip`).toBeLessThan(0.98);
          expect(projected.z, `${part} near clip`).toBeGreaterThan(-1);
          expect(projected.z, `${part} far clip`).toBeLessThan(1);
        }
      }
      renderer.destroy();
    });

    it("keeps both live and ghost athletes inside the real mobile comparison stage", () => {
      const feet = {
        rower: "rower-foot-contact-left",
        skierg: "skierg-foot-contact-left",
        bike: "bike-foot-contact-left",
      } as const;

      for (const sport of ["rower", "skierg", "bike"] as const) {
        for (const progressGap of [60, 490, 500]) {
          const renderer = new CourseRenderer3D(makeHost(), "low", sport);
          renderer.resize(390, 390);
          const state = makeSportState(sport, 0.2, 100);
          renderer.render(
            {
              ...state,
              // Exercise the ordinary comparison case plus near-opposite and
              // exactly opposite positions, where average course tangents
              // approach or reach zero on the one-kilometre visual loop.
              ghost: {
                distFrac: (100 + progressGap) / state.totalDistance,
                pace: 121,
                spm: state.frame.spm,
                label: "PB",
              },
              ghostStrokePose: state.strokePose,
            },
            false,
          );
          const { camera } = getCameraRig(renderer);
          const groups = renderer as unknown as {
            liveBoat: THREE.Group;
            ghostGroup: THREE.Group;
          };
          getScene(renderer).updateMatrixWorld(true);
          camera.updateMatrixWorld(true);
          camera.updateProjectionMatrix();

          for (const [lane, group] of [
            ["live", groups.liveBoat],
            ["ghost", groups.ghostGroup],
          ] as const) {
            for (const name of ["athlete:head", feet[sport]]) {
              const object = group.getObjectByName(name);
              expect(object, `${sport} ${lane} ${name} at ${progressGap} m`).toBeDefined();
              const projected = object!.getWorldPosition(new THREE.Vector3()).project(camera);
              expect(
                Math.abs(projected.x),
                `${sport} ${lane} ${name} x at ${progressGap} m`,
              ).toBeLessThan(0.98);
              expect(
                Math.abs(projected.y),
                `${sport} ${lane} ${name} y at ${progressGap} m`,
              ).toBeLessThan(0.98);
              expect(
                projected.z,
                `${sport} ${lane} ${name} near at ${progressGap} m`,
              ).toBeGreaterThan(-1);
              expect(projected.z, `${sport} ${lane} ${name} far at ${progressGap} m`).toBeLessThan(
                1,
              );
            }
          }
          renderer.destroy();
        }
      }
    });

    it("keeps the comparison camera heading continuous through half-lap tangent cancellation", () => {
      const renderer = new CourseRenderer3D(makeHost(), "low", "rower");
      renderer.resize(390, 390);
      const state = makeSportState("rower", 0.2, 100);
      const groups = renderer as unknown as {
        liveBoat: THREE.Group;
        ghostGroup: THREE.Group;
      };
      const heading = new THREE.Vector2();
      const previousHeading = new THREE.Vector2();
      let hasPrevious = false;
      let maximumStep = 0;

      for (let progressGap = 470; progressGap <= 530; progressGap++) {
        renderer.render(
          {
            ...state,
            ghost: {
              distFrac: (100 + progressGap) / state.totalDistance,
              pace: 121,
              spm: state.frame.spm,
              label: "PB",
            },
            ghostStrokePose: state.strokePose,
          },
          false,
        );
        const { chase } = getCameraRig(renderer);
        const focusX = (groups.liveBoat.position.x + groups.ghostGroup.position.x) * 0.5;
        const focusZ = (groups.liveBoat.position.z + groups.ghostGroup.position.z) * 0.5;
        heading.set(chase.x - focusX, chase.z - focusZ).normalize();
        if (hasPrevious) {
          maximumStep = Math.max(
            maximumStep,
            Math.acos(THREE.MathUtils.clamp(previousHeading.dot(heading), -1, 1)),
          );
        }
        previousHeading.copy(heading);
        hasPrevious = true;
      }

      expect(maximumStep).toBeLessThan(THREE.MathUtils.degToRad(5));
      renderer.destroy();
    });

    it("retains readable three-quarter shoulder separation under reduced motion", () => {
      reducedMotion = true;
      const shoulders = {
        rower: ["rower-shoulder-left", "rower-shoulder-right"],
        skierg: ["skierg-shoulder-left", "skierg-shoulder-right"],
        bike: ["bike-shoulder-left", "bike-shoulder-right"],
      } as const;
      for (const sport of ["rower", "skierg", "bike"] as const) {
        const renderer = new CourseRenderer3D(makeHost(), "low", sport);
        renderer.resize(390, 360);
        renderer.render(makeSportState(sport, 0.2), true);
        const { camera } = getCameraRig(renderer);
        camera.updateMatrixWorld(true);
        const left = projectToPixels(renderer, shoulders[sport][0], camera, 390, 360);
        const right = projectToPixels(renderer, shoulders[sport][1], camera, 390, 360);
        expect(left.distanceTo(right), `${sport} reduced-motion shoulders`).toBeGreaterThan(18);
        expect(camera.fov).toBe(42);
        renderer.destroy();
      }
    });

    it("updates paused camera framing when viewport and ghost layout change", () => {
      const host = makeHost();
      const renderer = new CourseRenderer3D(host, "low", "rower");
      const state = makeSportState("rower", 0.2, 0);
      renderer.resize(1200, 600);
      renderer.render(state, false);
      const widePosition = getCameraRig(renderer).camera.position.clone();

      renderer.resize(600, 800);
      renderer.render(state, false);
      const rig = getCameraRig(renderer);
      const narrowPosition = rig.camera.position.clone();
      expect(narrowPosition).toEqual(rig.chase);
      expect(narrowPosition.distanceTo(widePosition)).toBeGreaterThan(1);

      renderer.render(
        makeSportState("rower", 0.2, 0, {
          ghost: { distFrac: 0, pace: 125, spm: 28, label: "PB" },
          ghostStrokePose: state.strokePose,
        }),
        false,
      );
      expect(rig.camera.position).toEqual(rig.chase);
      expect(rig.camera.position.distanceTo(narrowPosition)).toBeGreaterThan(0.5);
      renderer.destroy();
    });

    it("damps both chase position and aim across course curvature", () => {
      let now = 0;
      const nowSpy = vi.spyOn(globalThis.performance, "now").mockImplementation(() => now);
      try {
        const host = makeHost();
        const renderer = new CourseRenderer3D(host, "low", "rower");
        renderer.resize(800, 600);
        renderer.render(makeSportState("rower", 0.2, 0), true);
        const initialAim = getCameraRig(renderer).cameraAim.clone();

        now = 16;
        renderer.render(makeSportState("rower", 0.2, 1), true);
        const rig = getCameraRig(renderer);
        expect(rig.cameraAim.distanceTo(initialAim)).toBeGreaterThan(0);
        expect(rig.cameraAim.distanceTo(rig.lookAt)).toBeGreaterThan(0);
        expect(rig.camera.position.distanceTo(rig.chase)).toBeGreaterThan(0);
        renderer.destroy();
      } finally {
        nowSpy.mockRestore();
      }
    });
  });

  describe("destroy()", () => {
    it("removes the canvas from the DOM", () => {
      const host = makeHost();
      const r = new CourseRenderer3D(host, "low", "rower");
      expect(() => r.destroy()).not.toThrow();
    });

    it("can be called after resize+render without throwing", () => {
      const host = makeHost();
      const r = new CourseRenderer3D(host, "low", "rower");
      r.resize(400, 300);
      r.render(makeRenderState(), false);
      expect(() => r.destroy()).not.toThrow();
    });
  });

  describe("medium quality (default tier: spray, buoys, wake, displacement)", () => {
    it("distance-samples a bounded transparent wake without opaque square cards", () => {
      const renderer = new CourseRenderer3D(makeHost(), "medium", "rower");
      renderer.resize(800, 600);
      renderer.render(makeSportState("rower", 0.1, 10), true);
      renderer.render(makeSportState("rower", 0.12, 10.05), true);
      renderer.render(makeSportState("rower", 0.14, 11.2), true);
      const wake = (
        renderer as unknown as {
          liveWake: {
            segs: THREE.Mesh[];
            mats: THREE.MeshBasicMaterial[];
          };
        }
      ).liveWake;
      const visible = wake.segs.filter((segment) => segment.visible);

      expect(visible).toHaveLength(2);
      expect(visible[0]?.geometry).toBeInstanceOf(THREE.CircleGeometry);
      expect(Math.max(...visible.map((segment) => segment.scale.x))).toBeLessThanOrEqual(0.9);
      for (const segment of visible) expect(segment.renderOrder).toBe(-1);
      for (const material of wake.mats) {
        expect(material.transparent).toBe(true);
        expect(material.depthWrite).toBe(false);
        expect(material.opacity).toBeLessThanOrEqual(0.22);
      }
      renderer.destroy();
    });

    it("renders sequential playing frames across a stroke catch, with ghost, then destroys", () => {
      const host = makeHost();
      const r = new CourseRenderer3D(host, "medium", "rower");
      r.resize(800, 600);
      // Cross the modeled stroke-row boundary itself. Distance alone does not
      // imply a catch now that the renderer follows recorded StrokePose rows.
      for (const [cycle, d] of [
        [0.98, 10],
        [1.02, 11],
      ] as const) {
        const state = makeSportState("rower", cycle, d, {
          ghost: { distFrac: d / 2200, pace: 118, spm: 24, label: "PB" },
        });
        expect(() => r.render(state, true)).not.toThrow();
      }
      const spray = r as unknown as { sprayPool: { alive: number } | null };
      expect(spray.sprayPool?.alive).toBeGreaterThan(0);
      expect(() => r.destroy()).not.toThrow();
    });

    it("renders each sport at medium without throwing", () => {
      for (const sport of ["rower", "skierg", "bike"] as const) {
        const host = makeHost();
        const r = new CourseRenderer3D(host, "medium", sport);
        r.resize(800, 600);
        for (const d of [0, 6, 12]) {
          expect(() =>
            r.render(
              makeRenderState({
                frame: { t: d, d, pace: 120, spm: 28, watts: 100, hr: 0, progress: d / 2000 },
              }),
              true,
            ),
          ).not.toThrow();
        }
        r.destroy();
      }
    });
  });

  describe("adaptive degradation (PerfGovernor mapping)", () => {
    it("steps the pixel ratio down to 1.5 then 1 under sustained slow frames", () => {
      globalThis.window.devicePixelRatio = 2;
      let t = 0;
      const nowSpy = vi.spyOn(globalThis.performance, "now").mockImplementation(() => t);
      try {
        const host = makeHost();
        const r = new CourseRenderer3D(host, "medium", "rower");
        r.resize(800, 600);
        const gl = (r as unknown as { renderer: { setPixelRatio: ReturnType<typeof vi.fn> } })
          .renderer;
        // Calibration sees healthy 60 Hz frames, then frames run at 40 ms —
        // persistently over the calibrated budget — until the governor walks
        // the ladder: level 1 caps dpr at 1.5, level 2 at 1.
        let d = 0;
        const frame = () => {
          d += 1;
          r.render(
            makeRenderState({
              frame: { t: d, d, pace: 120, spm: 28, watts: 100, hr: 0, progress: d / 2000 },
            }),
            true,
          );
        };
        for (let i = 0; i < 32; i++) {
          t += 16;
          frame();
        }
        for (let i = 0; i < 600; i++) {
          t += 40;
          frame();
        }
        const ratios = gl.setPixelRatio.mock.calls.map((c: number[]) => c[0]);
        expect(ratios).toContain(1.5);
        expect(ratios[ratios.length - 1]).toBe(1);
        r.destroy();
      } finally {
        nowSpy.mockRestore();
        globalThis.window.devicePixelRatio = 1;
      }
    });
  });
});
