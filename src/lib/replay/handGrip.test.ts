import { describe, expect, it } from "vite-plus/test";
import * as THREE from "three";
import {
  collectHandDigitChains,
  HAND_FIST_CENTRE,
  HAND_FIST_RADIUS,
  HAND_FIST_REFERENCE_GRIP_RADIUS,
  HAND_GRIP_SEAT_FLESH,
  HAND_PALM_CONTACT,
  handChannelCentre,
  handCurlAxis,
  handCurlAxisThumbward,
  orientHandToGripChannel,
  solveHandGripClosure,
  type HandDigitChain,
} from "./handGrip";
import { ROWER_SCULL_GRIP } from "./rowRig";
import { SKI_POLE_GRIP_RADIUS } from "./skiEquipment";

// Right-hand digit joints in hand-local rest space, composed from the sealed
// contract's helper rest transforms (rowplay-athlete-v4.contract.json). Using
// the real hand geometry keeps these solver tests honest: a pass here means
// the shipped hand can enclose the shipped equipment, not that an idealised
// test hand can enclose an idealised cylinder.

// Rest transform of the `v4RightFingers` palm-cup helper relative to the
// hand, straight from the sealed contract — the pivot the closure uses to
// pose finger chains into the fitted carrying cup.
const RIGHT_CUP_NODE = {
  helper: "v4RightFingers",
  position: new THREE.Vector3(0.047148, -0.003128, 0.010683),
  quaternion: new THREE.Quaternion(0.39194, 0.501992, 0.727161, -0.256173),
};

const RIGHT_HAND_CHAINS: HandDigitChain[] = [
  {
    digit: "index",
    joints: [
      {
        helper: "v4RightIndexProximal",
        position: new THREE.Vector3(0.033185, 0.011829, 0.038712),
        quaternion: new THREE.Quaternion(0.286909, 0.590902, 0.727214, -0.199192),
      },
      {
        helper: "v4RightIndexIntermediate",
        position: new THREE.Vector3(0.048175, 0.006529, 0.056475),
        quaternion: new THREE.Quaternion(0.288692, 0.527383, 0.782834, -0.160297),
      },
      {
        helper: "v4RightIndexDistal",
        position: new THREE.Vector3(0.059262, -0.001302, 0.071109),
        quaternion: new THREE.Quaternion(0.302053, 0.643125, 0.649308, -0.271207),
      },
    ],
    tipLength: 0.018364,
    cupNode: RIGHT_CUP_NODE,
  },
  {
    digit: "middle",
    joints: [
      {
        helper: "v4RightMiddleProximal",
        position: new THREE.Vector3(0.045794, 0.005197, 0.017982),
        quaternion: new THREE.Quaternion(0.339424, 0.554037, 0.722447, -0.23644),
      },
      {
        helper: "v4RightMiddleIntermediate",
        position: new THREE.Vector3(0.065418, -0.002302, 0.03548),
        quaternion: new THREE.Quaternion(0.332547, 0.510378, 0.768984, -0.193882),
      },
      {
        helper: "v4RightMiddleDistal",
        position: new THREE.Vector3(0.079984, -0.011528, 0.050466),
        quaternion: new THREE.Quaternion(0.250103, 0.681875, 0.650677, -0.221618),
      },
    ],
    tipLength: 0.021017,
    cupNode: RIGHT_CUP_NODE,
  },
  {
    digit: "ring",
    joints: [
      {
        helper: "v4RightRingProximal",
        position: new THREE.Vector3(0.053872, -0.005905, 0.001443),
        quaternion: new THREE.Quaternion(0.399846, 0.483067, 0.73851, -0.247734),
      },
      {
        helper: "v4RightRingIntermediate",
        position: new THREE.Vector3(0.071725, -0.015648, 0.013674),
        quaternion: new THREE.Quaternion(0.364586, 0.437472, 0.802979, -0.17584),
      },
      {
        helper: "v4RightRingDistal",
        position: new THREE.Vector3(0.084833, -0.027755, 0.026194),
        quaternion: new THREE.Quaternion(0.360178, 0.548484, 0.708493, -0.259757),
      },
    ],
    tipLength: 0.020054,
    cupNode: RIGHT_CUP_NODE,
  },
  {
    digit: "pinky",
    joints: [
      {
        helper: "v4RightPinkyProximal",
        position: new THREE.Vector3(0.055741, -0.023635, -0.015403),
        quaternion: new THREE.Quaternion(0.567623, 0.361656, 0.659074, -0.335606),
      },
      {
        helper: "v4RightPinkyIntermediate",
        position: new THREE.Vector3(0.075177, -0.035328, -0.013222),
        quaternion: new THREE.Quaternion(0.560275, 0.345521, 0.691414, -0.297749),
      },
      {
        helper: "v4RightPinkyDistal",
        position: new THREE.Vector3(0.088827, -0.045305, -0.010759),
        quaternion: new THREE.Quaternion(0.535788, 0.436281, 0.514724, -0.507592),
      },
    ],
    tipLength: 0.015719,
    cupNode: RIGHT_CUP_NODE,
  },
  {
    digit: "thumb",
    joints: [
      {
        helper: "v4RightThumb",
        position: new THREE.Vector3(-0.00765, -0.007115, 0.029362),
        quaternion: new THREE.Quaternion(0.105569, 0.72076, 0.683716, -0.043514),
      },
      {
        helper: "v4RightThumbIntermediate",
        position: new THREE.Vector3(-0.002587, -0.006092, 0.052714),
        quaternion: new THREE.Quaternion(0.118378, 0.699452, 0.702769, -0.053575),
      },
      {
        helper: "v4RightThumbDistal",
        position: new THREE.Vector3(0.002893, -0.006452, 0.07479),
        quaternion: new THREE.Quaternion(0.012742, 0.783808, 0.616735, 0.071556),
      },
    ],
    tipLength: 0.020929,
  },
];

function axisDistance(point: readonly [number, number, number], radius: number): number {
  const axis = handCurlAxisThumbward(1);
  const centre = handChannelCentre(radius, 1);
  const delta = new THREE.Vector3(point[0], point[1], point[2]).sub(centre);
  const along = delta.dot(axis);
  return Math.sqrt(Math.max(0, delta.lengthSq() - along * along));
}

/** Signed angle of a point around the channel axis (0 at the palm normal). */
function angleAroundAxis(point: readonly [number, number, number], radius: number): number {
  const axis = handCurlAxisThumbward(1);
  const centre = handChannelCentre(radius, 1);
  const reference = centre
    .clone()
    .sub(new THREE.Vector3(HAND_PALM_CONTACT.x, HAND_PALM_CONTACT.y, HAND_PALM_CONTACT.z));
  reference.addScaledVector(axis, -reference.dot(axis)).normalize();
  const other = new THREE.Vector3().crossVectors(axis, reference);
  const delta = new THREE.Vector3(point[0], point[1], point[2]).sub(centre);
  delta.addScaledVector(axis, -delta.dot(axis));
  return Math.atan2(delta.dot(other), delta.dot(reference));
}

describe("hand grip channel", () => {
  it("reproduces the fitted SkiErg fist centre at the fitted radius", () => {
    const right = handChannelCentre(HAND_FIST_RADIUS, 1);
    expect(right.x).toBeCloseTo(HAND_FIST_CENTRE.x, 6);
    expect(right.y).toBeCloseTo(HAND_FIST_CENTRE.y, 6);
    expect(right.z).toBeCloseTo(HAND_FIST_CENTRE.z, 6);
    const left = handChannelCentre(HAND_FIST_RADIUS, -1);
    expect(left.x).toBeCloseTo(-HAND_FIST_CENTRE.x, 6);
    expect(left.y).toBeCloseTo(HAND_FIST_CENTRE.y, 6);
    expect(left.z).toBeCloseTo(HAND_FIST_CENTRE.z, 6);
  });

  it("keeps the digit-flesh calibration tied to the equipment it was fitted on", () => {
    // The fitted channel and the rubber it was fitted around are one
    // calibration: their difference is the flesh every solved grip on all
    // three sports stands off by. Re-sizing the rendered pole grip without
    // re-fitting the channel would silently move every contact, so the
    // rendered capsule reads the calibration constant rather than its own
    // literal.
    expect(SKI_POLE_GRIP_RADIUS).toBe(HAND_FIST_REFERENCE_GRIP_RADIUS);
    expect(HAND_FIST_RADIUS).toBeGreaterThan(HAND_FIST_REFERENCE_GRIP_RADIUS);
    // ~0.9 mm: helpers of this low-poly mesh run at the skin, not at
    // anatomical bone depth. A textbook pad (8 mm) would hold every knuckle
    // off the shaft and reduce the closure to a hook.
    const flesh = HAND_FIST_RADIUS - HAND_FIST_REFERENCE_GRIP_RADIUS;
    expect(flesh).toBeGreaterThan(0.0005);
    expect(flesh).toBeLessThan(0.002);
  });

  it("seats larger equipment proportionally further from the palm", () => {
    expect(HAND_GRIP_SEAT_FLESH).toBeGreaterThan(0.02);
    expect(HAND_GRIP_SEAT_FLESH).toBeLessThan(0.04);
    const palm = new THREE.Vector3(HAND_PALM_CONTACT.x, HAND_PALM_CONTACT.y, HAND_PALM_CONTACT.z);
    const thin = handChannelCentre(0.012, 1).distanceTo(palm);
    const scull = handChannelCentre(ROWER_SCULL_GRIP.radius, 1).distanceTo(palm);
    expect(scull - thin).toBeCloseTo(ROWER_SCULL_GRIP.radius - 0.012, 6);
  });

  it("signs the curl axis thumb-ward on both hands", () => {
    const indexRoot = RIGHT_HAND_CHAINS[0]!.joints[0]!.position;
    const pinkyRoot = RIGHT_HAND_CHAINS[3]!.joints[0]!.position;
    const thumbward = handCurlAxisThumbward(1);
    expect(indexRoot.clone().sub(pinkyRoot).dot(thumbward)).toBeGreaterThan(0);
    // The left mirror flips the raw axis so index-ward stays positive.
    const left = handCurlAxisThumbward(-1);
    const rawLeft = handCurlAxis(-1);
    expect(left.dot(rawLeft)).toBeLessThan(0);
  });
});

describe("solveHandGripClosure", () => {
  const scull = {
    radius: ROWER_SCULL_GRIP.radius,
    thumbEndAxial: ROWER_SCULL_GRIP.anchorFromEnd,
  };

  it("closes every finger onto the scull rubber and the thumb onto its end", () => {
    const closure = solveHandGripClosure(RIGHT_HAND_CHAINS, {
      side: 1,
      surface: scull,
      thumbOppose: 0.3,
    });
    expect(closure.contacts).toHaveLength(5);
    for (const contact of closure.contacts) {
      expect(contact.contact, `${contact.digit} reaches the surface`).toBe(true);
      // Contact is the stop condition: pads land on the surface and deep
      // penetration cannot be authored.
      expect(contact.surfaceDistance, `${contact.digit} no deep penetration`).toBeGreaterThan(
        -0.004,
      );
      expect(contact.surfaceDistance, `${contact.digit} on the surface`).toBeLessThan(0.004);
    }
  });

  it("keeps the handle axis inside the finger/thumb enclosure with opposing contacts", () => {
    const closure = solveHandGripClosure(RIGHT_HAND_CHAINS, {
      side: 1,
      surface: { radius: HAND_FIST_RADIUS },
      thumbOppose: 0.62,
    });
    const fingerAngles = closure.contacts
      .filter((contact) => contact.digit !== "thumb")
      .map((contact) => angleAroundAxis(contact.tip, HAND_FIST_RADIUS));
    const thumbAngle = angleAroundAxis(
      closure.contacts.find((contact) => contact.digit === "thumb")!.tip,
      HAND_FIST_RADIUS,
    );
    // Finger tips wrap past the far side of the shaft while the thumb stays
    // on the near/opposing side: the shaft is caged, not cupped from one side.
    let minAngle = Infinity;
    let maxAngle = -Infinity;
    for (const angle of [...fingerAngles, thumbAngle]) {
      minAngle = Math.min(minAngle, angle);
      maxAngle = Math.max(maxAngle, angle);
    }
    expect(maxAngle - minAngle, "angular coverage around the shaft").toBeGreaterThan(
      Math.PI * 0.72,
    );
    for (const fingerAngle of fingerAngles) {
      // On a thin shaft a fully closed thumb legitimately wraps toward the
      // index (its pad lands beside it, as on a real pole grip); opposition
      // here means it still approaches from its own side of the channel
      // rather than folding across the knuckle plane. The thick scull rubber
      // asserts true end-stop opposition separately.
      expect(Math.abs(fingerAngle - thumbAngle), "thumb opposes the fingers").toBeGreaterThan(
        Math.PI * 0.25,
      );
    }
  });

  it("lands the row thumb pad at the flat handle end", () => {
    const closure = solveHandGripClosure(RIGHT_HAND_CHAINS, {
      side: 1,
      surface: scull,
      thumbOppose: 0.3,
    });
    const thumb = closure.contacts.find((contact) => contact.digit === "thumb")!;
    const axis = handCurlAxisThumbward(1);
    const centre = handChannelCentre(scull.radius, 1);
    const axial = new THREE.Vector3(...thumb.tip).sub(centre).dot(axis);
    // The pad presses the stop from outside, `anchorFromEnd` out from the
    // channel anchor. The nearest pad point compresses to the face (see the
    // surfaceDistance assertions above); the very tip may ride marginally
    // past the rim, exactly like a real thumb over a thumb stop.
    expect(axial).toBeGreaterThan(scull.thumbEndAxial - 0.002);
    expect(axial).toBeLessThan(scull.thumbEndAxial + 0.02);
    // The pressing thumb stays near the handle rim rather than hovering far
    // off-axis at the end plane.
    expect(axisDistance(thumb.tip, scull.radius)).toBeLessThan(scull.radius + 0.03);
  });

  it("respects per-stage flexion limits and stays deterministic", () => {
    const first = solveHandGripClosure(RIGHT_HAND_CHAINS, {
      side: 1,
      surface: scull,
      thumbOppose: 0.3,
    });
    const second = solveHandGripClosure(RIGHT_HAND_CHAINS, {
      side: 1,
      surface: scull,
      thumbOppose: 0.3,
    });
    expect(second.poses).toEqual(first.poses);
    for (const pose of first.poses) {
      expect(pose.flex).toBeGreaterThanOrEqual(0);
      expect(pose.flex, `${pose.helper} stays inside stage limits`).toBeLessThanOrEqual(1.93);
      expect(Number.isFinite(pose.oppose)).toBe(true);
    }
  });

  it("reports an unreached surface instead of faking contact", () => {
    // A hair-thin shaft with no pad flesh cannot be touched exactly by every
    // bone point; the report must say so rather than clamping into "contact".
    const closure = solveHandGripClosure(RIGHT_HAND_CHAINS, {
      side: 1,
      surface: { radius: 0.0004 },
      thumbOppose: 0.62,
      fingerFlesh: 0,
      thumbFlesh: 0,
    });
    for (const contact of closure.contacts) {
      expect(contact.surfaceDistance).toBeGreaterThan(-0.004);
    }
    expect(closure.contacts.some((contact) => !contact.contact)).toBe(true);
  });
});

describe("orientHandToGripChannel", () => {
  const shaft = new THREE.Vector3(0.2, 0.05, 0.97).normalize();
  const roll = new THREE.Vector3(0.1, -1, 0.05).normalize();

  function orient(base = new THREE.Quaternion(), rollReference: THREE.Vector3 = roll) {
    const hand = new THREE.Object3D();
    orientHandToGripChannel(hand, 1, ROWER_SCULL_GRIP.radius, shaft, rollReference, base);
    return hand.quaternion.clone();
  }

  it("lays the thumb-ward curl axis exactly on the requested shaft direction", () => {
    const quaternion = orient();
    const applied = handCurlAxisThumbward(1).applyQuaternion(quaternion);
    expect(applied.dot(shaft)).toBeGreaterThan(0.9999);
  });

  it("resolves the spin so the channel sits on the requested side of the wrist", () => {
    const quaternion = orient();
    const channel = handChannelCentre(ROWER_SCULL_GRIP.radius, 1).applyQuaternion(quaternion);
    channel.addScaledVector(shaft, -channel.dot(shaft)).normalize();
    const reference = roll.clone().addScaledVector(shaft, -roll.dot(shaft)).normalize();
    expect(channel.dot(reference)).toBeGreaterThan(0.9999);
  });

  it("cancels equipment roll about its own shaft — the handle feathers inside the fingers", () => {
    const squared = orient();
    const feathered = orient(new THREE.Quaternion().setFromAxisAngle(shaft, 0.72));
    expect(Math.abs(squared.dot(feathered))).toBeGreaterThan(1 - 1e-9);
  });

  it("is idempotent for repeated identical inputs", () => {
    const first = orient();
    const second = orient();
    expect(Math.abs(first.dot(second))).toBeGreaterThan(1 - 1e-12);
  });

  it("keeps the shaft alignment when the requested roll is exactly opposite", () => {
    const aligned = new THREE.Quaternion().setFromUnitVectors(handCurlAxisThumbward(1), shaft);
    const alignedChannel = handChannelCentre(ROWER_SCULL_GRIP.radius, 1).applyQuaternion(aligned);
    const oppositeRoll = alignedChannel
      .addScaledVector(shaft, -alignedChannel.dot(shaft))
      .normalize()
      .multiplyScalar(-1);
    const quaternion = orient(new THREE.Quaternion(), oppositeRoll);
    const appliedAxis = handCurlAxisThumbward(1).applyQuaternion(quaternion);
    const appliedChannel = handChannelCentre(ROWER_SCULL_GRIP.radius, 1).applyQuaternion(
      quaternion,
    );
    appliedChannel.addScaledVector(shaft, -appliedChannel.dot(shaft)).normalize();

    expect(appliedAxis.dot(shaft)).toBeGreaterThan(0.9999);
    expect(appliedChannel.dot(oppositeRoll)).toBeGreaterThan(0.9999);
  });
});

describe("collectHandDigitChains", () => {
  it("composes hand-local joint transforms through the helper hierarchy", () => {
    const hand = new THREE.Object3D();
    hand.name = "v4RightHand";
    const fingers = new THREE.Object3D();
    fingers.name = "v4RightFingers";
    fingers.position.set(0.04, -0.002, 0.012);
    fingers.quaternion.setFromEuler(new THREE.Euler(0.4, 0.5, 0.7));
    hand.add(fingers);
    const bones = new Map<string, THREE.Object3D>([
      ["v4RightFingers", fingers],
      ["v4RightHand", hand],
    ]);
    for (const digit of ["Index", "Middle", "Ring", "Pinky"]) {
      let parent: THREE.Object3D = fingers;
      for (const stage of ["Proximal", "Intermediate", "Distal"]) {
        const bone = new THREE.Object3D();
        bone.name = `v4Right${digit}${stage}`;
        bone.position.set(0.002, 0.024, 0.001);
        bone.quaternion.setFromEuler(new THREE.Euler(0.05, 0.02, 0.01));
        parent.add(bone);
        bones.set(bone.name, bone);
        parent = bone;
      }
    }
    let thumbParent: THREE.Object3D = hand;
    for (const stage of ["", "Intermediate", "Distal"]) {
      const bone = new THREE.Object3D();
      bone.name = `v4RightThumb${stage}`;
      bone.position.set(0.004, 0.022, 0.002);
      thumbParent.add(bone);
      bones.set(bone.name, bone);
      thumbParent = bone;
    }
    hand.updateMatrixWorld(true);

    const chains = collectHandDigitChains(hand, (name) => bones.get(name), 1);
    expect(chains).toHaveLength(5);
    for (const chain of chains) {
      expect(chain.joints).toHaveLength(3);
      expect(chain.tipLength).toBeGreaterThan(0.011);
      const measured = bones.get(chain.joints[2]!.helper)!.getWorldPosition(new THREE.Vector3());
      hand.worldToLocal(measured);
      expect(measured.distanceTo(chain.joints[2]!.position)).toBeLessThan(1e-6);
    }
  });
});
