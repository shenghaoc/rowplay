import { readFile } from "node:fs/promises";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";

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
import {
  disposeReplayAssetTemplateLibrary,
  fetchReplayAssetTemplateLibrary,
  type ReplayAssetTemplateLibrary,
} from "./renderer3dAssets";
import {
  disposeReplayV4AssetTemplate,
  fetchReplayV4Asset,
  type ReplayV4AssetTemplate,
  type ReplayV4AthleteInstance,
  type ReplayV4EffectorName,
} from "./renderer3dV4Assets";
import { sampleRowerMotionGraph } from "./motionGraph";
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

function sceneObjectWithAssetSlot(renderer: CourseRenderer3D, slot: string): THREE.Object3D {
  let target: THREE.Object3D | null = null;
  getScene(renderer).traverse((object) => {
    if (!target && object.userData.replayAssetSlot === slot) target = object;
  });
  expect(target, `missing asset slot ${slot}`).toBeDefined();
  return target!;
}

function worldPosition(renderer: CourseRenderer3D, name: string): THREE.Vector3 {
  return sceneObject(renderer, name).getWorldPosition(new THREE.Vector3());
}

function nearestWorldVertexDistance(mesh: THREE.Mesh, point: THREE.Vector3): number {
  const positions = mesh.geometry.getAttribute("position");
  expect(positions, `missing position attribute on ${mesh.name}`).toBeDefined();
  const vertex = new THREE.Vector3();
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < positions.count; index++) {
    vertex.set(positions.getX(index), positions.getY(index), positions.getZ(index));
    nearest = Math.min(nearest, vertex.applyMatrix4(mesh.matrixWorld).distanceTo(point));
  }
  return nearest;
}

async function loadCheckedInReplayAssetTemplateLibrary(): Promise<ReplayAssetTemplateLibrary> {
  const bytes = await readFile(
    new URL("../../../static/replay-assets/rowplay-rigs-v3.glb", import.meta.url),
  );
  return fetchReplayAssetTemplateLibrary(
    async () =>
      new Response(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), {
        status: 200,
        headers: { "content-type": "model/gltf-binary" },
      }),
  );
}

async function loadCheckedInReplayV4AssetTemplate(): Promise<ReplayV4AssetTemplate> {
  const bytes = await readFile(
    new URL("../../../static/replay-assets/rowplay-athlete-v4.glb", import.meta.url),
  );
  return fetchReplayV4Asset(
    async () =>
      new Response(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), {
        status: 200,
        headers: { "content-type": "model/gltf-binary" },
      }),
  );
}

type V4ContactTargets = Readonly<
  Record<
    | "pelvis"
    | "leftHand"
    | "rightHand"
    | "leftElbow"
    | "rightElbow"
    | "leftFoot"
    | "rightFoot"
    | "leftKnee"
    | "rightKnee",
    THREE.Object3D
  >
>;

interface V4MotionTestAccess {
  readonly root: THREE.Group;
  readonly mesh: THREE.SkinnedMesh;
  readonly enabled: boolean;
  readonly options: { readonly instance: ReplayV4AthleteInstance };
}

interface V4AvatarTestAccess {
  readonly group: THREE.Group;
  readonly v4Targets: V4ContactTargets;
  readonly v4Motion?: V4MotionTestAccess | null;
}

function v4Lane(renderer: CourseRenderer3D, lane: "live" | "ghost" = "live") {
  const avatars = renderer as unknown as {
    liveAvatar: V4AvatarTestAccess;
    ghostAvatar: V4AvatarTestAccess;
  };
  const avatar = lane === "live" ? avatars.liveAvatar : avatars.ghostAvatar;
  const motion = avatar.v4Motion;
  expect(motion, `${lane} V4 motion controller`).not.toBeNull();
  expect(motion, `${lane} V4 motion controller`).toBeDefined();
  if (!motion) throw new Error(`${lane} V4 motion controller is unavailable`);
  return { avatar, motion, instance: motion.options.instance };
}

function v4EffectorWorld(
  instance: ReplayV4AthleteInstance,
  effector: ReplayV4EffectorName,
): THREE.Vector3 {
  const metric = instance.effectors[effector];
  return instance.bones[metric.bone].localToWorld(
    new THREE.Vector3(metric.contactOffset[0], metric.contactOffset[1], metric.contactOffset[2]),
  );
}

function v4PoseSnapshot(instance: ReplayV4AthleteInstance): number[] {
  const values = [
    ...instance.root.position.toArray(),
    ...instance.root.quaternion.toArray(),
    ...instance.root.scale.toArray(),
  ];
  for (const bone of instance.skeleton.bones) {
    values.push(...bone.position.toArray(), ...bone.quaternion.toArray(), ...bone.scale.toArray());
  }
  return values;
}

function expectNumericSnapshotClose(
  actual: readonly number[],
  expected: readonly number[],
  tolerance = 1e-9,
): void {
  expect(actual).toHaveLength(expected.length);
  const maximumDelta = actual.reduce(
    (maximum, value, index) => Math.max(maximum, Math.abs(value - (expected[index] ?? 0))),
    0,
  );
  expect(maximumDelta).toBeLessThan(tolerance);
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

function attachedTemplate(
  renderer: CourseRenderer3D,
  anchorName: string,
  expectedTemplate: string,
): THREE.Object3D {
  const anchor = sceneObject(renderer, anchorName);
  const instance = anchor.children.find(
    (child) => child.userData.authoredReplayAssetTemplate === expectedTemplate,
  );
  expect(instance, `${anchorName} attached ${expectedTemplate}`).toBeDefined();
  expect(instance?.name).toBe(`authored-template:${expectedTemplate}`);
  return instance!;
}

function templatePart(instance: THREE.Object3D, suffix: string): THREE.Mesh {
  let part: THREE.Mesh | null = null;
  instance.traverse((object) => {
    if (!part && object instanceof THREE.Mesh && object.name.endsWith(suffix)) part = object;
  });
  expect(part, `missing ${suffix} in ${instance.name}`).not.toBeNull();
  return part!;
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
        "rower-bow-deck-stripe",
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

  it("builds an organic, layered high-detail world instead of lathed low-poly props", () => {
    const ski = new CourseRenderer3D(makeHost(), "ultra", "skierg");
    const pines = sceneObject(ski, "environment:skierg:pines") as THREE.InstancedMesh;
    const peaks = sceneObject(ski, "environment:skierg:mountain-peaks") as THREE.InstancedMesh;
    const snowcaps = sceneObject(ski, "environment:skierg:snowcaps") as THREE.InstancedMesh;
    const foothills = sceneObject(ski, "environment:skierg:foothills") as THREE.InstancedMesh;
    const berms = sceneObject(ski, "environment:skierg:snowbank") as THREE.InstancedMesh;
    const ground = sceneObject(ski, "ground") as THREE.Mesh<THREE.BufferGeometry>;
    const skiTorso = sceneObject(ski, "skierg-torso") as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.Material
    >;

    expect(pines.geometry).not.toBeInstanceOf(THREE.LatheGeometry);
    expect(pines.geometry.userData.organicRadialSurface).toBe(true);
    expect(pines.geometry.name).toBe("environment:evergreen-canopy");
    expect(pines.geometry.getIndex()?.count).toBeGreaterThan(3_000);
    expect(peaks.geometry).not.toBeInstanceOf(THREE.LatheGeometry);
    expect(peaks.geometry.userData.organicRadialSurface).toBe(true);
    expect(peaks.geometry.name).toBe("environment:alpine-massif");
    expect(peaks.geometry.getIndex()?.count).toBeGreaterThan(7_000);
    expect(snowcaps.geometry.userData.organicRadialSurface).toBe(true);
    expect(snowcaps.geometry.name).toBe("environment:alpine-snow-mantle");
    expect(foothills.geometry.userData.organicRadialSurface).toBe(true);
    expect(foothills.count).toBeGreaterThan(7);
    expect(berms.geometry.getAttribute("position").count).toBeGreaterThan(200);
    expect(ground.geometry.getAttribute("color")).toBeDefined();
    expect(skiTorso.material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect((skiTorso.material as THREE.MeshPhysicalMaterial).sheen).toBeGreaterThan(0);
    ski.destroy();

    const bike = new CourseRenderer3D(makeHost(), "ultra", "bike");
    const topTube = sceneObject(bike, "bike-top-tube") as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.Material
    >;
    expect(topTube.material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect((topTube.material as THREE.MeshPhysicalMaterial).clearcoat).toBeGreaterThan(0);
    expect(
      (sceneObject(bike, "ground") as THREE.Mesh).geometry.getAttribute("color"),
    ).toBeDefined();
    bike.destroy();
  });

  it("keeps semantic body and equipment values separated in both themes", () => {
    const names = {
      rower: {
        torso: "rower-torso-shell",
        yoke: "rower-jersey-back",
        skin: "rower-upper-arm-left",
        shoe: "rower-foot-contact-left",
        equipment: "rower-bow-deck-stripe",
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

  it("stages RowErg pelvis, spine, shoulders, head, and elbows from the shared graph", () => {
    const renderer = new CourseRenderer3D(makeHost(), "medium", "rower");
    renderer.resize(1140, 420);

    const sample = (cycle: number) => {
      const state = makeSportState("rower", cycle);
      const graph = sampleRowerMotionGraph(state.strokePose!);
      renderer.render(state, false);
      const head = sceneObject(renderer, "athlete:head");
      const headUp = new THREE.Vector3(0, 1, 0).applyQuaternion(
        head.getWorldQuaternion(new THREE.Quaternion()),
      );
      return {
        graph,
        hipsPitch: sceneObject(renderer, "rower-hips").rotation.x,
        torsoZ: sceneObject(renderer, "rower-torso").position.z,
        shoulderTrimZ: sceneObject(renderer, "rower-shoulder-trim").position.z,
        headUp,
      };
    };

    const catchPose = sample(0.01);
    const finishPose = sample(0.37);
    expect(finishPose.graph.body.shoulderSet.value).toBeGreaterThan(0.8);
    expect(finishPose.graph.body.handleTravel.value).toBeGreaterThan(0.8);
    // Local +Z faces the footplate: positive X pitch leans into the catch and
    // negative X pitch opens toward the finish. Pelvis/spine, clavicles and
    // head must all follow that same anatomical direction.
    expect(finishPose.hipsPitch).toBeLessThan(catchPose.hipsPitch - 0.12);
    expect(finishPose.torsoZ).toBeLessThan(catchPose.torsoZ - 0.008);
    expect(finishPose.shoulderTrimZ).toBeLessThan(catchPose.shoulderTrimZ - 0.008);
    expect(catchPose.headUp.y).toBeGreaterThan(0.88);
    expect(finishPose.headUp.y).toBeGreaterThan(0.88);

    const athlete = sceneObject(renderer, "rower-athlete");
    for (const side of [-1, 1]) {
      const label = side < 0 ? "left" : "right";
      const shoulder = athlete.worldToLocal(
        worldPosition(renderer, `rower-shoulder-${label}`).clone(),
      );
      const elbow = athlete.worldToLocal(worldPosition(renderer, `rower-elbow-${label}`).clone());
      // The RowErg athlete faces +z in its local frame. A completed draw
      // therefore sends the elbow behind the torso (-z), with only restrained
      // lateral clearance instead of a horizontal goalpost/chicken wing.
      expect(elbow.z, `${label} elbow rearward at finish`).toBeLessThan(shoulder.z - 0.04);
      expect((elbow.x - shoulder.x) * side, `${label} elbow outward restraint`).toBeLessThan(0.16);
    }

    renderer.destroy();
  });

  it("keeps both procedural RowErg elbows on the rearward branch through a dense stroke", () => {
    const renderer = new CourseRenderer3D(makeHost(), "medium", "rower");
    renderer.resize(1140, 420);
    const previous = new Map<string, THREE.Vector3>();

    for (let step = 0; step <= 256; step++) {
      const cycle = step / 256;
      const state = makeSportState("rower", cycle);
      const graph = sampleRowerMotionGraph(state.strokePose!);
      renderer.render(state, false);
      const athlete = sceneObject(renderer, "rower-athlete");

      for (const side of ["left", "right"] as const) {
        const shoulder = athlete.worldToLocal(
          worldPosition(renderer, `rower-shoulder-${side}`).clone(),
        );
        const elbow = athlete.worldToLocal(worldPosition(renderer, `rower-elbow-${side}`).clone());
        const hand = worldPosition(renderer, `rower-hand-${side}`);
        const grip = worldPosition(renderer, `rower-hand-contact-${side}`);
        const handLocal = athlete.worldToLocal(hand.clone());

        expect(hand.distanceTo(grip), `${side} grip closure at ${cycle}`).toBeLessThan(1e-6);
        // A nearly straight catch arm may run diagonally from the shoulder to
        // a swept scull grip. The elbow is only a chicken wing if it leaves
        // that shoulder→hand corridor, not merely because the entire long arm
        // is lateral at the catch.
        const corridorMinX = Math.min(shoulder.x, handLocal.x) - 0.04;
        const corridorMaxX = Math.max(shoulder.x, handLocal.x) + 0.04;
        expect(elbow.x, `${side} elbow stays inside arm corridor at ${cycle}`).toBeGreaterThan(
          corridorMinX,
        );
        expect(elbow.x, `${side} elbow stays inside arm corridor at ${cycle}`).toBeLessThan(
          corridorMaxX,
        );
        const upper = elbow.clone().sub(shoulder);
        const forearm = handLocal.clone().sub(elbow);
        const straightness = upper.dot(forearm) / (upper.length() * forearm.length());
        if (graph.body.armDraw.value > 0.9) {
          expect(
            elbow.z,
            `${side} elbow travels rearward during visible draw at ${cycle}`,
          ).toBeLessThan(shoulder.z - 0.025);
        }
        if (graph.body.armDraw.value < 0.03) {
          expect(straightness, `${side} long arm before/after draw at ${cycle}`).toBeGreaterThan(
            0.82,
          );
        }

        const prior = previous.get(side);
        if (prior && step < 256) {
          expect(elbow.distanceTo(prior), `${side} elbow continuity at ${cycle}`).toBeLessThan(
            0.08,
          );
        }
        previous.set(side, elbow.clone());
      }
    }

    renderer.destroy();
  });

  it("keeps procedural RowErg arms long until the handle clears the knees", () => {
    const renderer = new CourseRenderer3D(makeHost(), "medium", "rower");
    renderer.resize(1140, 420);
    const samples: Array<{
      cycle: number;
      handMinusKnee: number;
      bendDegrees: number;
      armDraw: number;
      legExtension: number;
    }> = [];

    for (let step = 0; step <= 128; step++) {
      const cycle = step / 128;
      const state = makeSportState("rower", cycle);
      if (cycle > state.strokePose!.driveFrac) break;
      const graph = sampleRowerMotionGraph(state.strokePose!);
      renderer.render(state, false);
      const athlete = sceneObject(renderer, "rower-athlete");
      const shoulder = athlete.worldToLocal(worldPosition(renderer, "rower-shoulder-left").clone());
      const elbow = athlete.worldToLocal(worldPosition(renderer, "rower-elbow-left").clone());
      const hand = athlete.worldToLocal(worldPosition(renderer, "rower-hand-left").clone());
      const knee = athlete.worldToLocal(worldPosition(renderer, "rower-knee-left").clone());
      const upper = elbow.clone().sub(shoulder);
      const forearm = hand.clone().sub(elbow);
      const straightness = upper.dot(forearm) / (upper.length() * forearm.length());
      samples.push({
        cycle,
        handMinusKnee: hand.z - knee.z,
        bendDegrees: (Math.acos(THREE.MathUtils.clamp(straightness, -1, 1)) * 180) / Math.PI,
        armDraw: graph.body.armDraw.value,
        legExtension: graph.body.legExtension.value,
      });
    }
    renderer.destroy();

    const peakIndex = samples.reduce(
      (best, sample, index) => (sample.handMinusKnee > samples[best]!.handMinusKnee ? index : best),
      0,
    );
    const clearanceIndex = samples.findIndex(
      (sample, index) => index > peakIndex && sample.handMinusKnee <= 0,
    );
    const visibleDrawIndex = samples.findIndex((sample) => sample.bendDegrees > 10);
    if (clearanceIndex < 1 || visibleDrawIndex < 0) {
      throw new Error("Procedural RowErg drive did not expose hand/knee clearance and arm draw");
    }

    expect(samples[clearanceIndex - 1]!.handMinusKnee).toBeGreaterThan(0);
    expect(
      Math.max(...samples.slice(0, clearanceIndex).map((sample) => sample.bendDegrees)),
      "squared blades retain a softly unlocked long arm through the leg drive",
    ).toBeLessThan(9);
    expect(
      visibleDrawIndex,
      "procedural elbow flexion follows drive-side knee clearance",
    ).toBeGreaterThan(clearanceIndex);
    expect(
      samples[visibleDrawIndex]!.legExtension,
      "the legs finish driving before the arms visibly draw",
    ).toBeGreaterThan(0.99);
    expect(samples.at(-1)!.bendDegrees, "finish has a readable late arm draw").toBeGreaterThan(55);
  });

  it("renders visible V3 elbow cuffs through the full RowErg pull", async () => {
    const assets = await loadCheckedInReplayAssetTemplateLibrary();
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
    disposeReplayAssetTemplateLibrary(assets);
  });

  it("orients each authored elbow cuff from a stable arm bend without losing contacts", async () => {
    const assets = await loadCheckedInReplayAssetTemplateLibrary();
    const contactPrefix = {
      rower: "rower-hand-contact",
      skierg: "skierg-pole-grip",
      bike: "bike-hand-contact",
    } as const;

    try {
      for (const sport of ["rower", "skierg", "bike"] as const) {
        const renderer = new CourseRenderer3D(makeHost(), "medium", sport, { assets });
        renderer.resize(1140, 420);
        const previousAxis = new Map<string, THREE.Vector3>();

        for (let step = 0; step < 96; step++) {
          const cycle = step / 96;
          renderer.render(makeSportState(sport, cycle, 120 + cycle * 8), false);
          for (const side of ["left", "right"] as const) {
            const shoulder = worldPosition(renderer, `${sport}-shoulder-${side}`);
            const elbow = worldPosition(renderer, `${sport}-elbow-${side}`);
            const hand = worldPosition(renderer, `${sport}-hand-${side}`);
            const cuff = sceneObject(renderer, `${sport}-elbow-${side}`) as THREE.Mesh;
            const chord = hand.clone().sub(shoulder).normalize();
            const cuffAxis = new THREE.Vector3(0, 0, 1).transformDirection(cuff.matrixWorld);
            const outside = elbow.multiplyScalar(2).sub(shoulder).sub(hand);
            outside.addScaledVector(chord, -outside.dot(chord));

            expect(cuff.userData.authoredReplayAsset, `${sport} ${side} authored cuff`).toBe(true);
            expect(cuffAxis.dot(chord), `${sport} ${side} cuff follows arm chord`).toBeGreaterThan(
              0.995,
            );
            if (outside.lengthSq() > 1e-5) {
              outside.normalize();
              const olecranon = new THREE.Vector3(0, -1, 0).transformDirection(cuff.matrixWorld);
              expect(
                olecranon.dot(outside),
                `${sport} ${side} cuff exposes the outer elbow`,
              ).toBeGreaterThan(0.995);
            }
            const previous = previousAxis.get(side);
            if (previous) {
              expect(
                cuffAxis.dot(previous),
                `${sport} ${side} cuff does not roll-flip at ${step}/96`,
              ).toBeGreaterThan(0.35);
            }
            previousAxis.set(side, cuffAxis);
            expect(
              hand.distanceTo(worldPosition(renderer, `${contactPrefix[sport]}-${side}`)),
              `${sport} ${side} hand contact`,
            ).toBeLessThan(1e-6);
          }
        }

        renderer.destroy();
      }
    } finally {
      disposeReplayAssetTemplateLibrary(assets);
    }
  });

  it("installs V3 equipment assemblies in place of toy fallback blocks", async () => {
    const assets = await loadCheckedInReplayAssetTemplateLibrary();
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

      if (sport === "rower") {
        const boat = attachedTemplate(renderer, "rower-boat-visual", "equipment:row:boat-assembly");
        const seat = attachedTemplate(
          renderer,
          "rower-seat-carriage",
          "equipment:row:seat-carriage",
        );
        expect(sceneObjectWithAssetSlot(renderer, "equipment:row:hull").visible).toBe(false);
        expect(sceneObject(renderer, "rower-seat").visible).toBe(false);
        expect(templatePart(boat, "slide-rails")).toBeDefined();
        expect(templatePart(boat, "cockpit-tub")).toBeDefined();
        expect(templatePart(seat, "seat-rollers")).toBeDefined();
        for (const side of ["left", "right"] as const) {
          attachedTemplate(renderer, `rower-oar-visual-${side}`, "equipment:row:oar-rig");
          // The hand target and feathering blade remain their original dynamic
          // rig nodes while V3 replaces only the static shaft/grip/collar.
          expect(sceneObject(renderer, `rower-blade-${side}`).visible).toBe(true);
        }
      } else if (sport === "skierg") {
        for (const side of ["left", "right"] as const) {
          attachedTemplate(renderer, `skierg-ski-visual-${side}`, "equipment:ski:ski-assembly");
        }
        expect(sceneObject(renderer, "skierg-ski-deck").visible).toBe(false);
        expect(sceneObject(renderer, "skierg-ski-tip").visible).toBe(false);
      } else {
        const wheel = attachedTemplate(
          renderer,
          "bike-wheel-visual-front",
          "equipment:bike:wheel-assembly",
        );
        attachedTemplate(renderer, "bike-wheel-visual-rear", "equipment:bike:wheel-assembly");
        attachedTemplate(renderer, "bike-frame-visual", "equipment:bike:frame-assembly");
        attachedTemplate(renderer, "bike-drivetrain-visual", "equipment:bike:drivetrain-assembly");
        const wheelMeshes: THREE.Mesh[] = [];
        wheel.traverse((object) => {
          if (object instanceof THREE.Mesh) wheelMeshes.push(object);
        });
        // The named source nodes are intentionally not a runtime contract;
        // the meaningful visual guarantee is a rim, hub, rotor and a dense
        // spoke field rather than three visible cylinder crosses.
        expect(wheelMeshes).toHaveLength(5);
        expect(
          wheelMeshes.every((mesh) => !(mesh.geometry instanceof THREE.CylinderGeometry)),
        ).toBe(true);
        expect(
          Math.max(...wheelMeshes.map((mesh) => mesh.geometry.getAttribute("position").count)),
        ).toBeGreaterThan(500);
        expect(wheelMeshes.some((mesh) => firstStandardMaterial(mesh).metalness > 0.5)).toBe(true);
        for (const index of [0, 1, 2]) {
          expect(sceneObject(renderer, `bike-wheel-front-spoke-${index}`).visible).toBe(false);
        }
      }
      renderer.destroy();
    }
    disposeReplayAssetTemplateLibrary(assets);
  });

  it("connects V3 RowErg riggers and oarlocks to the animated oar pivots", async () => {
    const assets = await loadCheckedInReplayAssetTemplateLibrary();
    const renderer = new CourseRenderer3D(makeHost(), "ultra", "rower", { assets });
    try {
      renderer.resize(1140, 420);
      const boat = attachedTemplate(renderer, "rower-boat-visual", "equipment:row:boat-assembly");
      const riggers = templatePart(boat, "riggers");
      const oarlocks = templatePart(boat, "oarlocks");

      for (const cycle of [0.05, 0.3, 0.58, 0.86]) {
        renderer.render(makeSportState("rower", cycle), false);
        for (const side of ["left", "right"] as const) {
          const pivot = worldPosition(renderer, `rower-oar-${side}`);
          expect(
            nearestWorldVertexDistance(riggers, pivot),
            `${side} rigger reaches oar pivot at ${cycle}`,
          ).toBeLessThan(0.025);
          expect(
            nearestWorldVertexDistance(oarlocks, pivot),
            `${side} oarlock reaches oar pivot at ${cycle}`,
          ).toBeLessThan(0.025);
        }
      }
    } finally {
      renderer.destroy();
      disposeReplayAssetTemplateLibrary(assets);
    }
  });

  it("keeps the Blender shell open and the moving seat carriage on its rails", async () => {
    const assets = await loadCheckedInReplayAssetTemplateLibrary();
    const renderer = new CourseRenderer3D(makeHost(), "ultra", "rower", { assets });
    try {
      renderer.resize(1140, 420);
      const boat = attachedTemplate(renderer, "rower-boat-visual", "equipment:row:boat-assembly");
      const seat = attachedTemplate(renderer, "rower-seat-carriage", "equipment:row:seat-carriage");
      const sternDeck = templatePart(boat, "stern-deck");
      const bowDeck = templatePart(boat, "bow-deck");
      const cockpit = templatePart(boat, "cockpit-tub");
      const rails = templatePart(boat, "slide-rails");
      for (const mesh of [sternDeck, bowDeck, cockpit, rails]) mesh.geometry.computeBoundingBox();
      expect(sternDeck.geometry.boundingBox?.max.z).toBeLessThan(-0.75);
      expect(bowDeck.geometry.boundingBox?.min.z).toBeGreaterThan(0.88);
      expect(cockpit.geometry.boundingBox?.max.y).toBeLessThan(0.28);
      expect(rails.geometry.boundingBox?.min.z).toBeLessThanOrEqual(-0.65);
      expect(rails.geometry.boundingBox?.max.z).toBeGreaterThanOrEqual(0.33);
      expect(templatePart(seat, "seat-rollers")).toBeDefined();

      const seatAnchor = sceneObject(renderer, "rower-seat-carriage");
      const boatSpace = sceneObject(renderer, "rower-boat-visual").parent;
      if (!boatSpace) throw new Error("rowing shell has no shared boat space");
      const slidePositions: THREE.Vector3[] = [];
      for (const cycle of [0, 0.4]) {
        renderer.render(makeSportState("rower", cycle), false);
        getScene(renderer).updateMatrixWorld(true);
        const inverse = boatSpace.matrixWorld.clone().invert();
        const localSeat = seatAnchor.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse);
        expect(localSeat.z, `seat remains over rail at ${cycle}`).toBeGreaterThan(-0.66);
        expect(localSeat.z, `seat remains over rail at ${cycle}`).toBeLessThan(0.34);
        slidePositions.push(localSeat);
      }
      expect(
        slidePositions[0]?.distanceTo(slidePositions[1] ?? new THREE.Vector3()),
      ).toBeGreaterThan(0.35);
    } finally {
      renderer.destroy();
      disposeReplayAssetTemplateLibrary(assets);
    }
  });

  it("keeps the authored BikeErg cockpit on the authoritative hand contacts", async () => {
    const assets = await loadCheckedInReplayAssetTemplateLibrary();
    const renderer = new CourseRenderer3D(makeHost(), "ultra", "bike", { assets });
    try {
      renderer.resize(1140, 420);
      renderer.render(makeSportState("bike", 0.3), false);
      const cockpit = sceneObject(renderer, "equipmentbikeframe-assemblycockpit") as THREE.Mesh;
      expect(cockpit.userData.authoredReplayAssetTemplate).toBe("equipment:bike:frame-assembly");

      for (const side of ["left", "right"] as const) {
        expect(
          nearestWorldVertexDistance(cockpit, worldPosition(renderer, `bike-hand-contact-${side}`)),
          `${side} cockpit grip reaches hand contact`,
        ).toBeLessThan(0.035);
      }
    } finally {
      renderer.destroy();
      disposeReplayAssetTemplateLibrary(assets);
    }
  });

  it("keeps V3 BikeErg clipless pedals on the authoritative foot contacts", async () => {
    const assets = await loadCheckedInReplayAssetTemplateLibrary();
    const renderer = new CourseRenderer3D(makeHost(), "ultra", "bike", { assets });
    try {
      renderer.resize(1140, 420);
      for (const cycle of [0.05, 0.3, 0.58, 0.86]) {
        renderer.render(makeSportState("bike", cycle), false);
        const pedals = sceneObject(
          renderer,
          "equipmentbikedrivetrain-assemblyclipless-pedals",
        ) as THREE.Mesh;
        for (const side of ["left", "right"] as const) {
          expect(
            nearestWorldVertexDistance(
              pedals,
              worldPosition(renderer, `bike-foot-contact-${side}`),
            ),
            `${side} pedal reaches foot contact at ${cycle}`,
          ).toBeLessThan(0.01);
        }
      }
    } finally {
      renderer.destroy();
      disposeReplayAssetTemplateLibrary(assets);
    }
  });

  describe("production V4 skinned athlete integration", () => {
    let v3Assets: ReplayAssetTemplateLibrary | null = null;
    let v4Assets: ReplayV4AssetTemplate | null = null;

    beforeAll(async () => {
      [v3Assets, v4Assets] = await Promise.all([
        loadCheckedInReplayAssetTemplateLibrary(),
        loadCheckedInReplayV4AssetTemplate(),
      ]);
    });

    afterAll(() => {
      if (v4Assets) disposeReplayV4AssetTemplate(v4Assets);
      if (v3Assets) disposeReplayAssetTemplateLibrary(v3Assets);
    });

    function rendererFor(sport: "rower" | "skierg" | "bike") {
      if (!v3Assets || !v4Assets) throw new Error("production replay assets did not load");
      const renderer = new CourseRenderer3D(makeHost(), "ultra", sport, {
        assets: v3Assets,
        v4Assets,
      });
      renderer.resize(1140, 420);
      return renderer;
    }

    function expectV4Contacts(renderer: CourseRenderer3D, label: string): void {
      const { avatar, motion, instance } = v4Lane(renderer);
      getScene(renderer).updateMatrixWorld(true);
      expect(motion.enabled, `${label} V4 remains enabled`).toBe(true);
      expect(motion.root.visible, `${label} V4 root visible`).toBe(true);
      for (const [effector, targetName] of [
        ["leftHand", "leftHand"],
        ["rightHand", "rightHand"],
        ["leftFoot", "leftFoot"],
        ["rightFoot", "rightFoot"],
      ] as const) {
        const metric = instance.effectors[effector];
        const target = avatar.v4Targets[targetName];
        const contact = v4EffectorWorld(instance, effector);
        const targetPosition = target.getWorldPosition(new THREE.Vector3());
        // The clip supplies base performance and arm bend planes; rigid sport
        // equipment remains the terminal contact authority. Orientation stays
        // restrained so exact position never corkscrews a forearm.
        expect(
          contact.distanceTo(targetPosition),
          `${label} ${effector} position contact`,
        ).toBeLessThan(0.015);
        const contactOrientation = instance.bones[metric.bone].getWorldQuaternion(
          new THREE.Quaternion(),
        );
        expect(
          Number.isFinite(contactOrientation.x + contactOrientation.y + contactOrientation.z),
          `${label} ${effector} orientation finite`,
        ).toBe(true);
      }
      expect(
        instance.bones.v4Hips
          .getWorldPosition(new THREE.Vector3())
          .distanceTo(avatar.v4Targets.pelvis.getWorldPosition(new THREE.Vector3())),
        `${label} pelvis translation`,
      ).toBeLessThan(1e-6);
    }

    it("keeps both RowErg V4 leg chains above the open cockpit", () => {
      const renderer = rendererFor("rower");
      try {
        const boat = attachedTemplate(renderer, "rower-boat-visual", "equipment:row:boat-assembly");
        const cockpitTop = new THREE.Box3().setFromObject(templatePart(boat, "cockpit-tub")).max.y;
        for (const cycle of [0, 0.2, 0.4, 0.6, 0.8]) {
          renderer.render(makeSportState("rower", cycle), false);
          const { avatar, instance } = v4Lane(renderer);
          getScene(renderer).updateMatrixWorld(true);
          const leftKnee = instance.bones.v4LeftLowerLeg.getWorldPosition(new THREE.Vector3());
          const rightKnee = instance.bones.v4RightLowerLeg.getWorldPosition(new THREE.Vector3());
          for (const [side, knee, target] of [
            ["left", leftKnee, avatar.v4Targets.leftKnee],
            ["right", rightKnee, avatar.v4Targets.rightKnee],
          ] as const) {
            expect(knee.y, `${side} knee clears cockpit at ${cycle}`).toBeGreaterThan(
              cockpitTop + 0.08,
            );
            expect(
              knee.distanceTo(target.getWorldPosition(new THREE.Vector3())),
              `${side} knee follows deterministic rig at ${cycle}`,
            ).toBeLessThan(0.1);
          }
          expect(
            leftKnee.distanceTo(rightKnee),
            `paired knees retain a readable silhouette at ${cycle}`,
          ).toBeGreaterThan(0.18);
        }
      } finally {
        renderer.destroy();
      }
    });

    it("shows one continuous V4 hero while retaining authored equipment for every sport", () => {
      const fallbackTorso = {
        rower: "rower-torso-shell",
        skierg: "skierg-torso",
        bike: "bike-torso",
      } as const;
      const equipment = {
        rower: "rower-blade-left",
        skierg: "skierg-pole-shaft-left",
        bike: "bike-wheel-front",
      } as const;

      for (const sport of ["rower", "skierg", "bike"] as const) {
        const renderer = rendererFor(sport);
        try {
          renderer.render(makeSportState(sport, 0.23), false);
          const { avatar, motion, instance } = v4Lane(renderer);
          const skinnedMeshes: THREE.SkinnedMesh[] = [];
          avatar.group.traverse((object) => {
            if (object instanceof THREE.SkinnedMesh) skinnedMeshes.push(object);
          });

          expect(motion.enabled).toBe(true);
          expect(motion.root.visible).toBe(true);
          expect(motion.root.userData).toMatchObject({
            replayV4Athlete: true,
            replayV4Sport: sport,
          });
          expect(instance.mesh.visible).toBe(true);
          expect(instance.mesh.frustumCulled).toBe(false);
          expect(skinnedMeshes).toEqual([instance.mesh]);

          const hiddenTorso = sceneObject(renderer, fallbackTorso[sport]);
          expect(hiddenTorso.userData.authoredReplayAsset).toBe(true);
          expect(hiddenTorso.visible, `${sport} V3 athlete hidden`).toBe(false);
          expect(
            sceneObject(renderer, equipment[sport]).visible,
            `${sport} equipment retained`,
          ).toBe(true);
        } finally {
          renderer.destroy();
        }
      }
    });

    it("keeps V3 arm and leg tubes hidden across a full stroke so the athlete is not double-limbed", () => {
      const limbNames = {
        rower: [
          "rower-thigh-left",
          "rower-shin-left",
          "rower-upper-arm-left",
          "rower-forearm-left",
          "rower-thigh-right",
          "rower-shin-right",
          "rower-upper-arm-right",
          "rower-forearm-right",
          "rower-elbow-left",
          "rower-elbow-right",
          "rower-torso-shell",
        ],
        skierg: [
          "skierg-thigh-left",
          "skierg-shin-left",
          "skierg-upper-arm-left",
          "skierg-forearm-left",
          "skierg-thigh-right",
          "skierg-shin-right",
          "skierg-upper-arm-right",
          "skierg-forearm-right",
          "skierg-elbow-left",
          "skierg-elbow-right",
          "skierg-torso",
        ],
        bike: [
          "bike-thigh-left",
          "bike-shin-left",
          "bike-upper-arm-left",
          "bike-forearm-left",
          "bike-thigh-right",
          "bike-shin-right",
          "bike-upper-arm-right",
          "bike-forearm-right",
          "bike-elbow-left",
          "bike-elbow-right",
          "bike-torso",
        ],
      } as const;
      const equipment = {
        rower: "rower-blade-left",
        skierg: "skierg-pole-shaft-left",
        bike: "bike-wheel-front",
      } as const;

      function chainVisible(object: THREE.Object3D): boolean {
        let current: THREE.Object3D | null = object;
        while (current) {
          if (!current.visible) return false;
          current = current.parent;
        }
        return true;
      }

      for (const sport of ["rower", "skierg", "bike"] as const) {
        const renderer = rendererFor(sport);
        try {
          for (let step = 0; step <= 24; step++) {
            const cycle = step / 24;
            renderer.render(makeSportState(sport, cycle), false);
            const { motion, instance } = v4Lane(renderer);
            expect(motion.enabled, `${sport} @${cycle} V4 enabled`).toBe(true);
            expect(motion.root.visible, `${sport} @${cycle} V4 visible`).toBe(true);
            expect(instance.mesh.visible, `${sport} @${cycle} skinned mesh`).toBe(true);
            for (const name of limbNames[sport]) {
              const limb = sceneObject(renderer, name);
              expect(limb.visible, `${sport} @${cycle} ${name} self-hidden`).toBe(false);
              expect(chainVisible(limb), `${sport} @${cycle} ${name} chain-hidden`).toBe(false);
            }
            expect(
              sceneObject(renderer, equipment[sport]).visible,
              `${sport} @${cycle} equipment retained`,
            ).toBe(true);
          }
        } finally {
          renderer.destroy();
        }
      }
    });

    it("keeps RowErg hands on separate scull grips without chicken-wing elbows", () => {
      const renderer = rendererFor("rower");
      try {
        const inv = new THREE.Matrix4();
        const leftLocal = new THREE.Vector3();
        const rightLocal = new THREE.Vector3();
        const leftElbow = new THREE.Vector3();
        const rightElbow = new THREE.Vector3();
        for (let step = 0; step <= 32; step++) {
          const cycle = step / 32;
          renderer.render(makeSportState("rower", cycle), false);
          const { avatar, instance } = v4Lane(renderer);
          getScene(renderer).updateMatrixWorld(true);
          inv.copy(avatar.group.matrixWorld).invert();
          leftLocal.copy(v4EffectorWorld(instance, "leftHand")).applyMatrix4(inv);
          rightLocal.copy(v4EffectorWorld(instance, "rightHand")).applyMatrix4(inv);
          leftElbow
            .copy(instance.bones.v4LeftForearm.getWorldPosition(new THREE.Vector3()))
            .applyMatrix4(inv);
          rightElbow
            .copy(instance.bones.v4RightForearm.getWorldPosition(new THREE.Vector3()))
            .applyMatrix4(inv);
          // Each palm stays on its own inboard scull handle.
          expect(leftLocal.x, `left hand stays port at ${cycle}`).toBeLessThan(0.02);
          expect(rightLocal.x, `right hand stays starboard at ${cycle}`).toBeGreaterThan(-0.02);
          expect(rightLocal.x - leftLocal.x, `hands uncrossed at ${cycle}`).toBeGreaterThan(0.06);
          expect(
            Math.abs(leftElbow.x) - Math.abs(leftLocal.x),
            `left elbow not a chicken wing at ${cycle}`,
          ).toBeLessThan(0.45);
          expect(
            Math.abs(rightElbow.x) - Math.abs(rightLocal.x),
            `right elbow not a chicken wing at ${cycle}`,
          ).toBeLessThan(0.45);
        }
      } finally {
        renderer.destroy();
      }
    });

    it("matches classic double-pole elbow and shaft landmarks without horizontal arm flips", () => {
      const renderer = rendererFor("skierg");
      try {
        const inv = new THREE.Matrix4();
        const handLocal = new THREE.Vector3();
        const handBoneLocal = new THREE.Vector3();
        const elbowLocal = new THREE.Vector3();
        const shoulderLocal = new THREE.Vector3();
        let minHandY = Number.POSITIVE_INFINITY;
        let maxHandY = Number.NEGATIVE_INFINITY;
        let maxElbowLateralDeviation = 0;
        const landmarks = new Map<
          number,
          {
            elbowAngle: number;
            poleAngle: number;
            elbowVertical: number;
            elbowForeAft: number;
            handVertical: number;
            handForeAft: number;
          }
        >();

        // Published on-snow double-poling landmarks: steep plant, deepest
        // elbow flexion near 11%, near-extension at ~29% pole-off, and maximum
        // extension just after release. The renderer remains stylised, so use
        // bounded technique envelopes rather than pretending to reproduce one
        // athlete's measured joint path.
        for (const cycle of [0.02, 0.11, 0.24, 0.29, 0.34, 0.44, 0.52, 0.8, 0.97]) {
          renderer.render(makeSportState("skierg", cycle, 200 + cycle * 8), false);
          const { avatar, instance } = v4Lane(renderer);
          getScene(renderer).updateMatrixWorld(true);
          inv.copy(avatar.group.matrixWorld).invert();
          handLocal.copy(v4EffectorWorld(instance, "leftHand")).applyMatrix4(inv);
          elbowLocal
            .copy(instance.bones.v4LeftForearm.getWorldPosition(new THREE.Vector3()))
            .applyMatrix4(inv);
          shoulderLocal
            .copy(instance.bones.v4LeftUpperArm.getWorldPosition(new THREE.Vector3()))
            .applyMatrix4(inv);
          handBoneLocal
            .copy(instance.bones.v4LeftHand.getWorldPosition(new THREE.Vector3()))
            .applyMatrix4(inv);
          const elbowAngle = THREE.MathUtils.radToDeg(
            Math.acos(
              THREE.MathUtils.clamp(
                shoulderLocal
                  .clone()
                  .sub(elbowLocal)
                  .normalize()
                  .dot(handBoneLocal.clone().sub(elbowLocal).normalize()),
                -1,
                1,
              ),
            ),
          );
          const poleVector = worldPosition(renderer, "skierg-pole-grip-left").sub(
            worldPosition(renderer, "skierg-pole-contact-left"),
          );
          const poleAngle = THREE.MathUtils.radToDeg(
            Math.atan2(Math.abs(poleVector.y), Math.hypot(poleVector.x, poleVector.z)),
          );
          landmarks.set(cycle, {
            elbowAngle,
            poleAngle,
            elbowVertical: elbowLocal.y - shoulderLocal.y,
            elbowForeAft: elbowLocal.z - shoulderLocal.z,
            handVertical: handLocal.y - shoulderLocal.y,
            handForeAft: handLocal.z - shoulderLocal.z,
          });
          maxHandY = Math.max(maxHandY, handLocal.y);
          minHandY = Math.min(minHandY, handLocal.y);
          const armMidX = (shoulderLocal.x + handBoneLocal.x) * 0.5;
          maxElbowLateralDeviation = Math.max(
            maxElbowLateralDeviation,
            Math.abs(elbowLocal.x - armMidX),
          );
          expect(
            Math.abs(elbowLocal.x - armMidX),
            `elbow remains near the sagittal arm plane at ${cycle}`,
          ).toBeLessThan(0.13);
        }

        const plant = landmarks.get(0.02)!;
        const loaded = landmarks.get(0.11)!;
        const poleOff = landmarks.get(0.29)!;
        const postRelease = landmarks.get(0.34)!;
        const lateRecovery = landmarks.get(0.8)!;
        const preplant = landmarks.get(0.97)!;
        const techniqueMetrics = Array.from(
          landmarks,
          ([cycle, values]) =>
            `${cycle.toFixed(2)}:${values.elbowAngle.toFixed(1)}°/${values.poleAngle.toFixed(1)}° elbow(y=${values.elbowVertical.toFixed(3)},z=${values.elbowForeAft.toFixed(3)}) hand(y=${values.handVertical.toFixed(3)},z=${values.handForeAft.toFixed(3)})`,
        ).join(" ");
        expect(plant.poleAngle, techniqueMetrics).toBeGreaterThan(70);
        expect(plant.poleAngle).toBeLessThan(86);
        expect(loaded.elbowAngle).toBeGreaterThan(48);
        expect(loaded.elbowAngle).toBeLessThan(76);
        expect(poleOff.elbowAngle).toBeGreaterThan(140);
        expect(poleOff.elbowAngle).toBeLessThan(170);
        expect(postRelease.elbowAngle).toBeGreaterThan(poleOff.elbowAngle);
        expect(postRelease.elbowAngle).toBeLessThan(178);
        expect(plant.elbowVertical, techniqueMetrics).toBeLessThan(0);
        expect(loaded.elbowVertical, techniqueMetrics).toBeLessThan(0);
        expect(landmarks.get(0.24)!.elbowForeAft, techniqueMetrics).toBeLessThan(0);
        expect(lateRecovery.handVertical, techniqueMetrics).toBeGreaterThan(
          landmarks.get(0.24)!.handVertical,
        );
        expect(lateRecovery.handForeAft, techniqueMetrics).toBeGreaterThan(
          landmarks.get(0.24)!.handForeAft,
        );
        expect(preplant.elbowVertical, techniqueMetrics).toBeLessThan(0);
        expect(poleOff.poleAngle).toBeGreaterThan(15);
        expect(poleOff.poleAngle).toBeLessThan(28);
        expect(maxHandY - minHandY, "hands drop through the double-pole press").toBeGreaterThan(
          0.12,
        );
        expect(minHandY, "press brings hands well below high reach").toBeLessThan(maxHandY - 0.1);
        expect(maxElbowLateralDeviation, "elbows avoid a rear-view goalpost pose").toBeLessThan(
          0.13,
        );
      } finally {
        renderer.destroy();
      }
    });

    it("keeps BikeErg knees ahead of the hips without joint flips through a crank cycle", () => {
      const renderer = rendererFor("bike");
      try {
        const inv = new THREE.Matrix4();
        const kneeLocal = new THREE.Vector3();
        const hipLocal = new THREE.Vector3();
        const ankleLocal = new THREE.Vector3();
        const previousKnees = new Map<"Left" | "Right", THREE.Vector3>();
        const firstKnees = new Map<"Left" | "Right", THREE.Vector3>();
        for (let step = 0; step <= 256; step++) {
          const cycle = step / 256;
          renderer.render(makeSportState("bike", cycle), false);
          const { avatar, instance } = v4Lane(renderer);
          getScene(renderer).updateMatrixWorld(true);
          inv.copy(avatar.group.matrixWorld).invert();
          for (const side of ["Left", "Right"] as const) {
            const upper = instance.bones[`v4${side}UpperLeg`];
            const lower = instance.bones[`v4${side}LowerLeg`];
            const foot = instance.bones[`v4${side}Foot`];
            hipLocal.copy(upper.getWorldPosition(new THREE.Vector3())).applyMatrix4(inv);
            kneeLocal.copy(lower.getWorldPosition(new THREE.Vector3())).applyMatrix4(inv);
            ankleLocal.copy(foot.getWorldPosition(new THREE.Vector3())).applyMatrix4(inv);
            // The selected sphere-intersection branch is always forward (+Z)
            // and outside its hip. A rear branch is the characteristic
            // backwards-snapping leg defect near crank dead centre.
            expect(kneeLocal.z, `${side} knee forward at ${cycle}`).toBeGreaterThan(
              hipLocal.z + 0.02,
            );
            expect(kneeLocal.y, `${side} knee stays above the pedal at ${cycle}`).toBeGreaterThan(
              0.55,
            );
            const interiorAngle = kneeLocal
              .clone()
              .sub(hipLocal)
              .angleTo(ankleLocal.clone().sub(kneeLocal));
            expect(interiorAngle, `${side} knee stays unlocked at ${cycle}`).toBeGreaterThan(0.35);
            expect(interiorAngle, `${side} knee flexion bounded at ${cycle}`).toBeLessThan(2.4);

            const prior = previousKnees.get(side);
            if (prior) {
              expect(
                kneeLocal.distanceTo(prior),
                `${side} knee trajectory continuous at ${cycle}`,
              ).toBeLessThan(0.04);
            } else {
              firstKnees.set(side, kneeLocal.clone());
            }
            previousKnees.set(side, kneeLocal.clone());
          }
        }
        for (const side of ["Left", "Right"] as const) {
          expect(
            previousKnees.get(side)!.distanceTo(firstKnees.get(side)!),
            `${side} knee closes continuously at 0 / 2π`,
          ).toBeLessThan(1e-5);
        }
      } finally {
        renderer.destroy();
      }
    });

    it("locks every V4 palm and sole after clip sampling while preserving authored hip motion", () => {
      const phases = {
        rower: [0.01, 0.18, 0.38, 0.54, 0.64, 0.73, 0.78, 0.98],
        skierg: [0.02, 0.12, 0.24, 0.48, 0.7, 0.94],
        bike: [0, 0.125, 0.25, 0.5, 0.75, 0.999],
      } as const;

      for (const sport of ["rower", "skierg", "bike"] as const) {
        const renderer = rendererFor(sport);
        try {
          const hips: THREE.Quaternion[] = [];
          for (const cycle of phases[sport]) {
            renderer.render(makeSportState(sport, cycle), false);
            expectV4Contacts(renderer, `${sport} ${cycle}`);
            hips.push(v4Lane(renderer).instance.bones.v4Hips.quaternion.clone());
          }
          const authoredHipRange = Math.max(
            ...hips.slice(1).map((quaternion) => quaternion.angleTo(hips[0]!)),
          );
          expect(authoredHipRange, `${sport} authored hip rotation survives IK`).toBeGreaterThan(
            0.01,
          );
        } finally {
          renderer.destroy();
        }
      }
    });

    it("repeats exact seeks and holds one calm contact-safe pose in reduced motion", () => {
      for (const sport of ["rower", "skierg", "bike"] as const) {
        const renderer = rendererFor(sport);
        try {
          renderer.render(makeSportState(sport, 0.17, 120), false);
          const first = v4PoseSnapshot(v4Lane(renderer).instance);
          renderer.render(makeSportState(sport, 0.73, 120), false);
          renderer.render(makeSportState(sport, 0.17, 120), false);
          expectNumericSnapshotClose(v4PoseSnapshot(v4Lane(renderer).instance), first);

          reducedMotion = true;
          renderer.render(makeSportState(sport, 0.09, 120), true);
          const reduced = v4PoseSnapshot(v4Lane(renderer).instance);
          expectV4Contacts(renderer, `${sport} reduced first`);
          renderer.render(makeSportState(sport, 0.81, 120), true);
          expectNumericSnapshotClose(v4PoseSnapshot(v4Lane(renderer).instance), reduced);
          expectV4Contacts(renderer, `${sport} reduced second`);
        } finally {
          reducedMotion = false;
          renderer.destroy();
        }
      }
    });

    it("keeps V4 RowErg palms and forearms outside the torso core through the stroke", () => {
      const renderer = rendererFor("rower");
      try {
        const previousPalms = new Map<"left" | "right", THREE.Vector3>();
        const firstPalms = new Map<"left" | "right", THREE.Vector3>();
        for (let step = 0; step <= 128; step++) {
          const cycle = step / 128;
          renderer.render(makeSportState("rower", cycle), false);
          const { motion, instance } = v4Lane(renderer);
          expect(motion.enabled, `rower V4 remains enabled at ${cycle}`).toBe(true);
          const hips = instance.bones.v4Hips.getWorldPosition(new THREE.Vector3());
          const chest = instance.bones.v4Chest.getWorldPosition(new THREE.Vector3());
          const torsoAxis = chest.clone().sub(hips);
          const torsoLengthSquared = torsoAxis.lengthSq();

          for (const side of ["left", "right"] as const) {
            const effector = `${side}Hand` as const;
            const palm = v4EffectorWorld(instance, effector);
            expect(
              palm.distanceTo(worldPosition(renderer, `rower-hand-contact-${side}`)),
              `${side} palm stays on rigid scull grip at ${cycle}`,
            ).toBeLessThan(0.015);
            const elbow = instance.bones[
              side === "left" ? "v4LeftForearm" : "v4RightForearm"
            ].getWorldPosition(new THREE.Vector3());

            for (const [part, point] of [
              ["palm", palm],
              ["forearm midpoint", elbow.clone().lerp(palm, 0.5)],
            ] as const) {
              const along = THREE.MathUtils.clamp(
                point.clone().sub(hips).dot(torsoAxis) / torsoLengthSquared,
                0,
                1,
              );
              const torsoCenter = hips.clone().addScaledVector(torsoAxis, along);
              expect(
                point.distanceTo(torsoCenter),
                `${side} ${part} torso clearance at ${cycle}`,
              ).toBeGreaterThan(part === "palm" ? 0.14 : 0.11);
            }
            const prior = previousPalms.get(side);
            if (prior) {
              expect(palm.distanceTo(prior), `${side} palm continuity at ${cycle}`).toBeLessThan(
                0.06,
              );
            } else {
              firstPalms.set(side, palm.clone());
            }
            previousPalms.set(side, palm.clone());
          }
        }
        for (const side of ["left", "right"] as const) {
          expect(previousPalms.get(side)!.distanceTo(firstPalms.get(side)!)).toBeLessThan(1e-5);
        }
      } finally {
        renderer.destroy();
      }
    });

    it("keeps V4 RowErg arms long until the handle clears the knees", () => {
      const renderer = rendererFor("rower");
      const samples: Array<{
        cycle: number;
        handMinusKnee: number;
        bendDegrees: number;
        armDraw: number;
        legExtension: number;
        shoulderAuthorityError: number;
      }> = [];
      try {
        for (let step = 0; step <= 128; step++) {
          const cycle = step / 128;
          const state = makeSportState("rower", cycle);
          if (cycle > state.strokePose!.driveFrac) break;
          const graph = sampleRowerMotionGraph(state.strokePose!);
          renderer.render(state, false);
          const { avatar, instance } = v4Lane(renderer);
          const inverse = avatar.group.matrixWorld.clone().invert();
          const shoulder = instance.bones.v4LeftUpperArm
            .getWorldPosition(new THREE.Vector3())
            .applyMatrix4(inverse);
          const elbow = instance.bones.v4LeftForearm
            .getWorldPosition(new THREE.Vector3())
            .applyMatrix4(inverse);
          const hand = v4EffectorWorld(instance, "leftHand").applyMatrix4(inverse);
          const wrist = instance.bones.v4LeftHand
            .getWorldPosition(new THREE.Vector3())
            .applyMatrix4(inverse);
          const knee = instance.bones.v4LeftLowerLeg
            .getWorldPosition(new THREE.Vector3())
            .applyMatrix4(inverse);
          const authorityShoulder = worldPosition(renderer, "rower-shoulder-left").applyMatrix4(
            inverse,
          );
          const upper = elbow.clone().sub(shoulder);
          const forearm = wrist.clone().sub(elbow);
          const straightness = upper.dot(forearm) / (upper.length() * forearm.length());
          samples.push({
            cycle,
            handMinusKnee: hand.z - knee.z,
            bendDegrees: (Math.acos(THREE.MathUtils.clamp(straightness, -1, 1)) * 180) / Math.PI,
            armDraw: graph.body.armDraw.value,
            legExtension: graph.body.legExtension.value,
            shoulderAuthorityError: authorityShoulder.distanceTo(shoulder),
          });
        }
      } finally {
        renderer.destroy();
      }

      const peakIndex = samples.reduce(
        (best, sample, index) =>
          sample.handMinusKnee > samples[best]!.handMinusKnee ? index : best,
        0,
      );
      const clearanceIndex = samples.findIndex(
        (sample, index) => index > peakIndex && sample.handMinusKnee <= 0,
      );
      const visibleDrawIndex = samples.findIndex((sample) => sample.bendDegrees > 10);
      if (clearanceIndex < 1 || visibleDrawIndex < 0) {
        throw new Error("V4 RowErg drive did not expose hand/knee clearance and arm draw");
      }

      expect(samples[clearanceIndex - 1]!.handMinusKnee).toBeGreaterThan(0);
      expect(
        Math.max(...samples.slice(0, clearanceIndex).map((sample) => sample.bendDegrees)),
        "the skinned elbows never fold and re-extend during the leg/body drive",
      ).toBeLessThan(13);
      expect(
        visibleDrawIndex,
        "visible V4 elbow flexion starts at or after drive-side knee clearance",
      ).toBeGreaterThanOrEqual(clearanceIndex);
      expect(samples[visibleDrawIndex]!.armDraw).toBeGreaterThan(0);
      expect(
        samples[visibleDrawIndex]!.legExtension,
        "the V4 legs finish driving before the arms visibly draw",
      ).toBeGreaterThan(0.99);
      expect(samples.at(-1)!.bendDegrees, "V4 finish has a readable late arm draw").toBeGreaterThan(
        55,
      );
      expect(
        Math.max(...samples.map((sample) => sample.shoulderAuthorityError)),
        "rigid grips are refined from the visible V4 shoulders",
      ).toBeLessThan(1e-6);
    });

    it("keeps planted SkiErg hardware fixed in the course while the V4 skier advances", () => {
      const renderer = rendererFor("skierg");
      const plantedTips = new Map<string, THREE.Vector3>();
      const previousGrips = new Map<"left" | "right", THREE.Vector3>();
      const previousElbows = new Map<"left" | "right", THREE.Vector3>();
      const avatarInverse = new THREE.Matrix4();
      try {
        for (let step = 0; step <= 256; step++) {
          const cycle = step / 256;
          const state = makeSportState("skierg", cycle, 200 + cycle * 8);
          const kinematics = solveSkierKinematics(state.strokePose!);
          renderer.render(state, false);
          expectV4Contacts(renderer, `skierg ${cycle}`);
          const { avatar, instance } = v4Lane(renderer);
          avatarInverse.copy(avatar.group.matrixWorld).invert();
          for (const side of ["left", "right"] as const) {
            const tip = worldPosition(renderer, `skierg-pole-contact-${side}`);
            const grip = worldPosition(renderer, `skierg-pole-grip-${side}`);
            const shoulderWorld = instance.bones[
              side === "left" ? "v4LeftUpperArm" : "v4RightUpperArm"
            ].getWorldPosition(new THREE.Vector3());
            const elbowWorld = instance.bones[
              side === "left" ? "v4LeftForearm" : "v4RightForearm"
            ].getWorldPosition(new THREE.Vector3());
            const handBoneWorld = instance.bones[
              side === "left" ? "v4LeftHand" : "v4RightHand"
            ].getWorldPosition(new THREE.Vector3());
            const markerWorld = avatar.v4Targets[
              side === "left" ? "leftElbow" : "rightElbow"
            ].getWorldPosition(new THREE.Vector3());
            const armChord = handBoneWorld.clone().sub(shoulderWorld).normalize();
            const solvedPlane = elbowWorld.clone().sub(shoulderWorld);
            solvedPlane.addScaledVector(armChord, -solvedPlane.dot(armChord));
            const markerPlane = markerWorld.clone().sub(shoulderWorld);
            markerPlane.addScaledVector(armChord, -markerPlane.dot(armChord));
            if (solvedPlane.lengthSq() > 1e-8 && markerPlane.lengthSq() > 1e-8) {
              expect(
                solvedPlane.normalize().dot(markerPlane.normalize()),
                `${side} elbow keeps the shared sagittal branch at ${cycle}`,
              ).toBeGreaterThan(0.72);
            }
            const elbow = elbowWorld.clone().applyMatrix4(avatarInverse);
            expect(grip.distanceTo(tip), `${side} rigid pole at ${cycle}`).toBeCloseTo(1.55, 5);
            expect(
              tip.y,
              `${side} basket never passes through snow at ${cycle}`,
            ).toBeGreaterThanOrEqual(0.055 - 1e-5);
            if (kinematics.poleFlight >= 1 - 1e-9 && kinematics.poleLift > 0.15) {
              expect(tip.y, `${side} basket visibly clears snow at ${cycle}`).toBeGreaterThan(0.1);
            }
            expect(
              v4EffectorWorld(instance, `${side}Hand`).distanceTo(grip),
              `${side} V4 hand stays on grip at ${cycle}`,
            ).toBeLessThan(0.015);

            if (kinematics.poleContact >= 1 - 1e-9) {
              const plantKey = `${state.strokePose!.index}:${side}`;
              const priorPlant = plantedTips.get(plantKey);
              if (priorPlant) {
                expect(tip.distanceTo(priorPlant), `${side} V4 planted-tip drift`).toBeLessThan(
                  0.004,
                );
              } else {
                plantedTips.set(plantKey, tip.clone());
              }
              expect(tip.y, `${side} V4 planted-tip height`).toBeCloseTo(0.055, 5);
            }

            const priorGrip = previousGrips.get(side);
            if (priorGrip) {
              expect(
                grip.distanceTo(priorGrip),
                `${side} grip continuity at ${cycle}; contact=${kinematics.poleContact.toFixed(4)} prior=${priorGrip
                  .toArray()
                  .map((value) => value.toFixed(3))
                  .join(",")} next=${grip
                  .toArray()
                  .map((value) => value.toFixed(3))
                  .join(",")} tip=${tip
                  .toArray()
                  .map((value) => value.toFixed(3))
                  .join(",")}`,
              ).toBeLessThan(0.06);
            }
            previousGrips.set(side, grip.clone());
            const priorElbow = previousElbows.get(side);
            if (priorElbow) {
              expect(
                elbow.distanceTo(priorElbow),
                `${side} athlete-local elbow continuity at ${cycle}; prior=${priorElbow
                  .toArray()
                  .map((value) => value.toFixed(3))
                  .join(",")} next=${elbow
                  .toArray()
                  .map((value) => value.toFixed(3))
                  .join(
                    ",",
                  )} sweep=${kinematics.poleSweep.toFixed(4)} load=${kinematics.elbowLoad.toFixed(4)} extension=${kinematics.armExtension.toFixed(4)}`,
              ).toBeLessThan(0.06);
            }
            previousElbows.set(side, elbow);
          }
        }
        for (const side of ["left", "right"] as const) {
          expect(plantedTips.get(`0:${side}`), `${side} loaded plant sampled`).toBeDefined();
        }
      } finally {
        renderer.destroy();
      }
    });

    it("keeps V4 BikeErg palms near the bar and soles on opposed pedals", () => {
      const renderer = rendererFor("bike");
      try {
        for (const cycle of [0, 0.125, 0.25, 0.5, 0.75, 0.999]) {
          renderer.render(makeSportState("bike", cycle), false);
          expectV4Contacts(renderer, `bike ${cycle}`);
          const { instance } = v4Lane(renderer);
          for (const side of ["left", "right"] as const) {
            expect(
              v4EffectorWorld(instance, `${side}Hand`).distanceTo(
                worldPosition(renderer, `bike-hand-contact-${side}`),
              ),
              `${side} V4 palm-bar contact at ${cycle}`,
            ).toBeLessThan(0.015);
            expect(
              v4EffectorWorld(instance, `${side}Foot`).distanceTo(
                worldPosition(renderer, `bike-pedal-${side}`),
              ),
              `${side} V4 sole-pedal contact at ${cycle}`,
            ).toBeLessThan(0.015);
          }
        }
      } finally {
        renderer.destroy();
      }
    });

    it("keeps live and ghost skins fully independent and releases both safely", () => {
      const renderer = rendererFor("rower");
      let destroyed = false;
      try {
        const state = makeSportState("rower", 0.22, 120, {
          ghost: { distFrac: 0.07, pace: 118, spm: 30, label: "PB" },
          ghostStrokePose: fallbackStrokePose("rower", 0.64 * TAU, 30),
        });
        renderer.render(state, false);
        const live = v4Lane(renderer, "live").instance;
        const ghost = v4Lane(renderer, "ghost").instance;

        expect(live.root).not.toBe(ghost.root);
        expect(live.mesh).not.toBe(ghost.mesh);
        expect(live.mesh.geometry).not.toBe(ghost.mesh.geometry);
        expect(live.mesh.material).not.toBe(ghost.mesh.material);
        expect(live.skeleton).not.toBe(ghost.skeleton);
        expect(live.bones.v4LeftForearm).not.toBe(ghost.bones.v4LeftForearm);
        expect(live.mixer).not.toBe(ghost.mixer);
        expect(v4Lane(renderer, "ghost").motion.root.visible).toBe(true);
        for (const [lane, athlete, requestedOpacity] of [
          ["live", live, 1],
          ["ghost", ghost, 0.45],
        ] as const) {
          const material = athlete.mesh.material as THREE.Material;
          expect(material.transparent, `${lane} skinned body stays in opaque pass`).toBe(false);
          expect(material.opacity, `${lane} skinned body opacity`).toBe(1);
          expect(material.depthWrite, `${lane} skinned body writes depth`).toBe(true);
          expect(material.depthTest, `${lane} skinned body tests depth`).toBe(true);
          expect(athlete.mesh.userData, `${lane} material diagnostic`).toMatchObject({
            replayRequestedOpacity: requestedOpacity,
            replayBodyRenderMode: "opaque-depth-writing",
          });
        }

        const livePose = v4PoseSnapshot(live);
        const ghostPose = v4PoseSnapshot(ghost);
        renderer.render(
          makeSportState("rower", 0.22, 120, {
            ghost: { distFrac: 0.07, pace: 118, spm: 30, label: "PB" },
            ghostStrokePose: fallbackStrokePose("rower", 0.86 * TAU, 30),
          }),
          false,
        );
        expectNumericSnapshotClose(v4PoseSnapshot(live), livePose);
        const changedGhostPose = v4PoseSnapshot(ghost);
        expect(
          changedGhostPose.some((value, index) => Math.abs(value - (ghostPose[index] ?? 0)) > 1e-5),
        ).toBe(true);

        const liveGeometryDispose = vi.spyOn(live.mesh.geometry, "dispose");
        const ghostGeometryDispose = vi.spyOn(ghost.mesh.geometry, "dispose");
        const liveSkeletonDispose = vi.spyOn(live.skeleton, "dispose");
        const ghostSkeletonDispose = vi.spyOn(ghost.skeleton, "dispose");
        expect(() => renderer.destroy()).not.toThrow();
        destroyed = true;
        expect(liveGeometryDispose).toHaveBeenCalledTimes(1);
        expect(ghostGeometryDispose).toHaveBeenCalledTimes(1);
        expect(liveSkeletonDispose).toHaveBeenCalledTimes(1);
        expect(ghostSkeletonDispose).toHaveBeenCalledTimes(1);
      } finally {
        if (!destroyed) renderer.destroy();
      }
    });
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
    expect(minimumNearPoleLength).toBeGreaterThan(32);
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
        ["rower-upper-arm-left", 0.39],
        ["rower-upper-arm-right", 0.39],
        ["rower-forearm-left", 0.38],
        ["rower-forearm-right", 0.38],
        ["rower-thigh-left", 0.552],
        ["rower-thigh-right", 0.552],
        ["rower-shin-left", 0.552],
        ["rower-shin-right", 0.552],
      ],
      skierg: [
        ["skierg-upper-arm-left", 0.49],
        ["skierg-upper-arm-right", 0.49],
        ["skierg-forearm-left", 0.47],
        ["skierg-forearm-right", 0.47],
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
    const driveBladeY = worldPosition(renderer, "rower-blade-left").y;
    const squaredDrive = sceneObject(renderer, "rower-blade-left").rotation.x;
    // The shaft fulcrum remains locked at its oarlock; immersion is supplied
    // by the blade's rotation rather than dropping the whole pivot through
    // the rigger during the drive.
    expect(sceneObject(renderer, "rower-oar-left").position.y).toBeCloseTo(0.38, 5);
    expect(squaredDrive).toBeCloseTo(Math.PI / 2, 5);

    renderer.render(makeSportState("rower", 0.69), false);
    const recoveryBladeY = worldPosition(renderer, "rower-blade-left").y;
    const feathered = sceneObject(renderer, "rower-blade-left").rotation.x;
    expect(sceneObject(renderer, "rower-oar-left").position.y).toBeCloseTo(0.38, 5);
    expect(driveBladeY).toBeLessThan(recoveryBladeY - 0.08);
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
    expect(sceneObject(renderer, "rower-oar-left").position.y).toBeCloseTo(0.38, 8);
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
      0.055 + expectedSki.hipHinge * 0.56,
      8,
    );
    expect(sceneObject(skiRenderer, "skierg-upper").position.y).toBeCloseTo(
      0.735 - expectedSki.kneeFlex * 0.11,
      8,
    );
    expect(sceneObject(skiRenderer, "skierg-upper").position.z).toBeCloseTo(
      expectedSki.hipHinge * 0.055,
      8,
    );
    expect(sceneObject(skiRenderer, "athlete:head").rotation.x).toBeCloseTo(
      -expectedSki.hipHinge * 0.38,
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

  it("keeps the SkiErg press athletic instead of collapsing the torso and gaze", () => {
    const renderer = new CourseRenderer3D(makeHost(), "medium", "skierg");
    renderer.resize(1140, 420);
    let maximumTorsoPitch = Number.NEGATIVE_INFINITY;
    let minimumPelvisHeight = Number.POSITIVE_INFINITY;
    let minimumHeadHeight = Number.POSITIVE_INFINITY;
    let minimumGazeUp = Number.POSITIVE_INFINITY;

    for (let step = 0; step < 128; step++) {
      renderer.render(makeSportState("skierg", step / 128), false);
      const upper = sceneObject(renderer, "skierg-upper");
      const head = sceneObject(renderer, "athlete:head");
      maximumTorsoPitch = Math.max(maximumTorsoPitch, upper.rotation.x);
      minimumPelvisHeight = Math.min(minimumPelvisHeight, upper.position.y);
      minimumHeadHeight = Math.min(minimumHeadHeight, worldPosition(renderer, "athlete:head").y);
      const headUp = new THREE.Vector3(0, 1, 0).applyQuaternion(
        head.getWorldQuaternion(new THREE.Quaternion()),
      );
      minimumGazeUp = Math.min(minimumGazeUp, headUp.y);
    }

    // At peak press the skier stays tall enough to share load through the
    // legs, keeps the torso inside an athletic hinge envelope, and counterposes
    // the head so it continues looking down-course instead of at the snow.
    expect(maximumTorsoPitch).toBeLessThan(0.63);
    expect(minimumPelvisHeight).toBeGreaterThan(0.61);
    expect(minimumHeadHeight).toBeGreaterThan(1.2);
    expect(minimumGazeUp).toBeGreaterThan(0.95);
    renderer.destroy();
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
    const assets = await loadCheckedInReplayAssetTemplateLibrary();
    const renderer = new CourseRenderer3D(makeHost(), "medium", "skierg", { assets });
    renderer.resize(1140, 420);
    const plantedCycles = [0.07, 0.11, 0.18, 0.22];
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
        expect(grip.distanceTo(tip), `${side} rigid planted pole span`).toBeCloseTo(1.55, 5);
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
    disposeReplayAssetTemplateLibrary(assets);
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
    const previousKnees = new Map<"left" | "right", THREE.Vector3>();
    const firstKnees = new Map<"left" | "right", THREE.Vector3>();

    for (let step = 0; step <= 256; step++) {
      const cycle = step / 256;
      renderer.render(makeSportState("bike", cycle), false);
      const pelvisObject = sceneObject(renderer, "bike-pelvis");
      const rider = pelvisObject.parent;
      expect(rider, "bike rider root").toBeDefined();
      const pelvis = rider!.worldToLocal(pelvisObject.getWorldPosition(new THREE.Vector3()));
      for (const side of ["left", "right"] as const) {
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
        const knee = rider!.worldToLocal(worldPosition(renderer, `bike-knee-${side}`));
        expect(knee.z, `${side} fallback knee stays forward at ${cycle}`).toBeGreaterThan(
          pelvis.z + 0.02,
        );
        const prior = previousKnees.get(side);
        if (prior) {
          expect(
            knee.distanceTo(prior),
            `${side} fallback knee continuity at ${cycle}`,
          ).toBeLessThan(0.04);
        } else {
          firstKnees.set(side, knee.clone());
        }
        previousKnees.set(side, knee);
      }
    }
    for (const side of ["left", "right"] as const) {
      expect(previousKnees.get(side)!.distanceTo(firstKnees.get(side)!)).toBeLessThan(1e-5);
    }
    renderer.destroy();
  });

  it("gives the BikeErg rider a connected pelvis, shoulder, and head counterpose", () => {
    const renderer = new CourseRenderer3D(makeHost(), "medium", "bike");
    renderer.resize(800, 600);

    renderer.render(makeSportState("bike", 0.25), false);
    const downstroke = {
      pelvisX: sceneObject(renderer, "bike-pelvis").position.x,
      torsoRoll: sceneObject(renderer, "bike-spine").rotation.z,
      shoulderRoll: sceneObject(renderer, "bike-shoulder-girdle").rotation.z,
      headRoll: sceneObject(renderer, "bike-head-stabilizer").rotation.z,
    };
    renderer.render(makeSportState("bike", 0.75), false);
    const oppositeDownstroke = {
      pelvisX: sceneObject(renderer, "bike-pelvis").position.x,
      torsoRoll: sceneObject(renderer, "bike-spine").rotation.z,
      shoulderRoll: sceneObject(renderer, "bike-shoulder-girdle").rotation.z,
      headRoll: sceneObject(renderer, "bike-head-stabilizer").rotation.z,
    };

    expect(downstroke.pelvisX).toBeGreaterThan(0.01);
    expect(oppositeDownstroke.pelvisX).toBeLessThan(-0.01);
    expect(downstroke.torsoRoll).toBeGreaterThan(0.1);
    expect(oppositeDownstroke.torsoRoll).toBeLessThan(-0.1);
    expect(downstroke.shoulderRoll).toBeLessThan(0);
    expect(oppositeDownstroke.shoulderRoll).toBeGreaterThan(0);
    expect(downstroke.headRoll).toBeLessThan(0);
    expect(oppositeDownstroke.headRoll).toBeGreaterThan(0);

    for (const side of ["left", "right"] as const) {
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

    it("propagates repeated frame failures to the page fallback after the threshold", () => {
      const host = makeHost();
      const r = new CourseRenderer3D(host, "low", "rower");
      const failure = new Error("persistent render failure");
      r.resize(800, 600);
      (r as unknown as { _renderImpl: () => void })._renderImpl = () => {
        throw failure;
      };

      for (let attempt = 1; attempt < 5; attempt++) {
        expect(() => r.render(makeRenderState(), true)).not.toThrow();
      }
      expect(() => r.render(makeRenderState(), true)).toThrow(failure);
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

    it("holds a clear rear-three-quarter camera line across static and narrow layouts", () => {
      for (const sport of ["rower", "skierg", "bike"] as const) {
        const renderer = new CourseRenderer3D(makeHost(), "low", sport);
        const liveBoat = (renderer as unknown as { liveBoat: THREE.Group }).liveBoat;
        const measures = (): { lateral: number; retreat: number } => {
          const { chase } = getCameraRig(renderer);
          const radial = liveBoat.position.clone().setY(0).normalize();
          const tangent = new THREE.Vector3(radial.z, 0, -radial.x);
          const offset = chase.clone().sub(liveBoat.position);
          return { lateral: offset.dot(radial), retreat: -offset.dot(tangent) };
        };

        renderer.resize(1140, 420);
        renderer.render(makeSportState(sport, 0.2, 0), false);
        const desktop = measures();
        expect(desktop.lateral, `${sport} desktop lateral reveal`).toBeGreaterThan(1.2);
        expect(
          desktop.lateral / desktop.retreat,
          `${sport} desktop three-quarter ratio`,
        ).toBeGreaterThan(0.38);

        renderer.resize(390, 360);
        renderer.render(makeSportState(sport, 0.2, 0), false);
        const narrow = measures();
        expect(narrow.lateral, `${sport} narrow lateral reveal`).toBeGreaterThan(1.2);
        expect(narrow.retreat, `${sport} narrow pullback`).toBeGreaterThan(desktop.retreat);

        reducedMotion = true;
        renderer.render(makeSportState(sport, 0.2, 0), true);
        const reduced = measures();
        expect(reduced.lateral, `${sport} reduced-motion lateral reveal`).toBeGreaterThan(1.2);
        expect(reduced.retreat, `${sport} reduced-motion static pullback`).toBeGreaterThan(
          desktop.retreat,
        );
        reducedMotion = false;
        renderer.destroy();
      }
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
