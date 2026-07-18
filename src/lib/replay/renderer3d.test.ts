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
import { REDUCED_REPLAY_POSES } from "./renderer";
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

function getCameraRig(renderer: CourseRenderer3D) {
  return renderer as unknown as {
    camera: THREE.PerspectiveCamera;
    chase: THREE.Vector3;
    lookAt: THREE.Vector3;
    cameraAim: THREE.Vector3;
  };
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

  it("keeps procedural torso depth within human-scale silhouette bounds", () => {
    const expected = {
      rower: ["rower-torso-shell", 0.25, 0.62, 0.16],
      skierg: ["skierg-torso", 0.25, 0.66, 0.16],
      bike: ["bike-torso", 0.23, 0.6, 0.145],
    } as const;

    for (const sport of ["rower", "skierg", "bike"] as const) {
      const renderer = new CourseRenderer3D(makeHost(), "low", sport);
      const [name, width, height, depth] = expected[sport];
      const torso = sceneObject(renderer, name) as THREE.Mesh<THREE.BufferGeometry>;
      torso.geometry.computeBoundingBox();
      const bounds = torso.geometry.boundingBox?.getSize(new THREE.Vector3());

      expect(torso.scale.toArray()).toEqual([width, height, depth]);
      expect(bounds).toBeDefined();
      if (bounds) {
        bounds.multiply(torso.scale);
        expect(bounds.z).toBeLessThan(bounds.x * 0.8);
        expect(bounds.y).toBeGreaterThan(bounds.x);
      }
      renderer.destroy();
    }
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
        ["rower-upper-arm-left", 0.49],
        ["rower-upper-arm-right", 0.49],
        ["rower-forearm-left", 0.48],
        ["rower-forearm-right", 0.48],
        ["rower-thigh-left", 0.56],
        ["rower-thigh-right", 0.56],
        ["rower-shin-left", 0.56],
        ["rower-shin-right", 0.56],
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
    expect(firstPose.z).toBeCloseTo(0.18 - expected.legExtension * 0.42, 8);
    expect(sceneObject(renderer, "rower-oar-left").position.y).toBeCloseTo(
      0.34 - expected.bladeDepth * 0.16,
      8,
    );
    expect(sceneObject(renderer, "rower-blade-left").rotation.x).toBeCloseTo(
      (1 - expected.bladeFeather) * (Math.PI / 2),
      8,
    );
    renderer.render(makeSportState("rower", 0.8), true);
    expect(sceneObject(renderer, "rower-athlete").position).toEqual(firstPose);
    expect(getCameraRig(renderer).camera.fov).toBe(46);
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
      0.1 + expectedSki.hipHinge * 0.72,
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
        ).toBeLessThan(0.22);
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

    it("renders with dark theme without throwing", () => {
      const host = makeHost();
      const r = new CourseRenderer3D(host, "low", "rower");
      r.resize(800, 600);
      expect(() => r.render(makeRenderState(), false, "dark")).not.toThrow();
    });

    it("recolors the sport-specific course surface on dark theme", () => {
      const host = makeHost();
      const r = new CourseRenderer3D(host, "low", "bike");
      r.resize(800, 600);
      r.render(makeRenderState({ sport: "bike" }), false, "dark");
      const lane = getScene(r).getObjectByName("lane") as unknown as {
        material: { color: { getHex(): number } };
      };
      expect(lane.material.color.getHex()).toBe(0x262c32);
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

    it("keeps the full RowErg oar span inside a portrait viewport", () => {
      const host = makeHost();
      const renderer = new CourseRenderer3D(host, "low", "rower");
      renderer.resize(600, 800);
      renderer.render(makeSportState("rower", 0.2, 0), false);
      const { camera } = getCameraRig(renderer);
      camera.updateMatrixWorld(true);
      camera.updateProjectionMatrix();

      for (const side of ["left", "right"]) {
        const projected = worldPosition(renderer, `rower-blade-${side}`).project(camera);
        expect(Math.abs(projected.x)).toBeLessThan(0.95);
      }
      renderer.destroy();
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
