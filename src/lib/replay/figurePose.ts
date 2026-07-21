/** A readonly point or direction in the replay's 2D figure plane. */
export interface FigurePoint2 {
  readonly x: number;
  readonly y: number;
}

/** Caller-owned 2D output, reused by the renderer on every frame. */
export interface MutableFigurePoint2 {
  x: number;
  y: number;
}

/** A readonly point or direction in the replay's 3D world. */
export interface FigurePoint3 extends FigurePoint2 {
  readonly z: number;
}

/** Caller-owned 3D output, compatible with the mutable shape of THREE.Vector3. */
export interface MutableFigurePoint3 extends MutableFigurePoint2 {
  z: number;
}

const SOLVE_EPSILON = 1e-9;

function finite(value: number): number {
  if (!Number.isFinite(value)) {
    if (import.meta.env.DEV) console.warn("[figurePose] non-finite input sanitized to 0");
    return 0;
  }
  return value;
}

function segmentLength(value: number): number {
  if (!Number.isFinite(value)) {
    if (import.meta.env.DEV) console.warn("[figurePose] non-finite segment length sanitized to 0");
    return 0;
  }
  return Math.max(0, Math.abs(value));
}

function clampedReach(distance: number, firstLength: number, secondLength: number): number {
  return Math.max(
    Math.abs(firstLength - secondLength),
    Math.min(firstLength + secondLength, distance),
  );
}

/**
 * Solves a fixed-length two-segment chain in 2D and writes its joint and
 * reachable contact into `jointOut` and `endOut`. Positive and negative
 * `bendDirection` select opposite sides of the root-to-target axis.
 *
 * Reachable targets retain both declared segment lengths exactly. Unreachable
 * targets are moved to the nearest edge of the chain's reach annulus, which
 * keeps both segments rigid without manufacturing a longer limb. Coincident
 * equal-length targets use a stable folded pose.
 *
 * This hot-path function creates no objects or arrays. The returned object is
 * the caller-owned `jointOut` so renderers can chain it without allocations.
 */
export function solveTwoBone2D(
  root: FigurePoint2,
  target: FigurePoint2,
  firstSegmentLength: number,
  secondSegmentLength: number,
  bendDirection: number,
  jointOut: MutableFigurePoint2,
  endOut: MutableFigurePoint2,
): MutableFigurePoint2 {
  const rootX = finite(root.x);
  const rootY = finite(root.y);
  const targetX = finite(target.x);
  const targetY = finite(target.y);
  const firstLength = segmentLength(firstSegmentLength);
  const secondLength = segmentLength(secondSegmentLength);
  const deltaX = targetX - rootX;
  const deltaY = targetY - rootY;
  const distance = Math.hypot(deltaX, deltaY);
  const bend = Number.isFinite(bendDirection) && bendDirection < 0 ? -1 : 1;

  if (firstLength + secondLength <= SOLVE_EPSILON) {
    endOut.x = rootX;
    endOut.y = rootY;
    jointOut.x = rootX;
    jointOut.y = rootY;
    return jointOut;
  }

  // Equal-length segments can fold exactly onto a coincident target. There is
  // no root-target axis in that pose, so use a deterministic vertical bend.
  if (distance <= SOLVE_EPSILON && Math.abs(firstLength - secondLength) <= SOLVE_EPSILON) {
    endOut.x = rootX;
    endOut.y = rootY;
    jointOut.x = rootX;
    jointOut.y = rootY + firstLength * bend;
    return jointOut;
  }

  const directionX = distance > SOLVE_EPSILON ? deltaX / distance : 1;
  const directionY = distance > SOLVE_EPSILON ? deltaY / distance : 0;
  if (!Number.isFinite(directionX) || !Number.isFinite(directionY)) {
    // Overflow in the subtraction of large coordinate values can produce
    // NaN through Infinity/Infinity; clamp to a safe default direction.
    if (import.meta.env.DEV)
      console.warn("[figurePose] NaN direction from overflow, using default");
    jointOut.x = rootX;
    jointOut.y = rootY + firstLength;
    endOut.x = rootX;
    endOut.y = rootY + firstLength + secondLength;
    return jointOut;
  }
  const solveDistance = clampedReach(distance, firstLength, secondLength);
  if (solveDistance === distance) {
    endOut.x = targetX;
    endOut.y = targetY;
  } else {
    endOut.x = rootX + directionX * solveDistance;
    endOut.y = rootY + directionY * solveDistance;
  }

  // A zero reach only remains possible when both segments were zero, handled
  // above. The epsilon guard also keeps pathological subnormal inputs finite.
  const safeDistance = Math.max(SOLVE_EPSILON, solveDistance);
  const along =
    (firstLength * firstLength - secondLength * secondLength + safeDistance * safeDistance) /
    (2 * safeDistance);
  const perpendicular = Math.sqrt(Math.max(0, firstLength * firstLength - along * along));

  jointOut.x = rootX + directionX * along - directionY * perpendicular * bend;
  jointOut.y = rootY + directionY * along + directionX * perpendicular * bend;
  return jointOut;
}

/**
 * Resolve the point nearest `preferred` which is exactly `contactLength` from
 * `contactCenter` and remains inside the root's reachable annulus.
 *
 * This is the planar counterpart of `solveRigidContactPoint3D`: a Canvas hand
 * can stay on a rigid oar or pole while its two-link arm remains reachable.
 * Reachable preferences are projected directly onto the contact circle;
 * otherwise the nearest of the two circle/circle intersections is selected.
 *
 * `false` means the declared circles do not intersect. `out` still receives a
 * finite point on the rigid contact circle nearest the root, so equipment is
 * never stretched as a fallback.
 */
export function solveRigidContactPoint2D(
  root: FigurePoint2,
  preferred: FigurePoint2,
  contactCenter: FigurePoint2,
  contactLength: number,
  minimumReach: number,
  maximumReach: number,
  out: MutableFigurePoint2,
): boolean {
  const rootX = finite(root.x);
  const rootY = finite(root.y);
  const centerX = finite(contactCenter.x);
  const centerY = finite(contactCenter.y);
  const preferredWorldX = finite(preferred.x);
  const preferredWorldY = finite(preferred.y);
  const radius = segmentLength(contactLength);
  const reachA = segmentLength(minimumReach);
  const reachB = segmentLength(maximumReach);
  const minReach = Math.min(reachA, reachB);
  const maxReach = Math.max(reachA, reachB);

  let preferredX = preferredWorldX - centerX;
  let preferredY = preferredWorldY - centerY;
  let preferredLength = Math.hypot(preferredX, preferredY);
  if (preferredLength <= SOLVE_EPSILON) {
    preferredX = rootX - centerX;
    preferredY = rootY - centerY;
    preferredLength = Math.hypot(preferredX, preferredY);
  }
  if (preferredLength <= SOLVE_EPSILON) {
    preferredX = 1;
    preferredY = 0;
    preferredLength = 1;
  }

  const candidateScale = radius / preferredLength;
  const candidateX = centerX + preferredX * candidateScale;
  const candidateY = centerY + preferredY * candidateScale;
  const candidateReach = Math.hypot(candidateX - rootX, candidateY - rootY);
  if (candidateReach >= minReach - SOLVE_EPSILON && candidateReach <= maxReach + SOLVE_EPSILON) {
    out.x = candidateX;
    out.y = candidateY;
    return true;
  }

  const boundaryReach = candidateReach > maxReach ? maxReach : minReach;
  let rootDeltaX = rootX - centerX;
  let rootDeltaY = rootY - centerY;
  const centerDistance = Math.hypot(rootDeltaX, rootDeltaY);
  const circlesIntersect =
    centerDistance > SOLVE_EPSILON &&
    centerDistance <= radius + boundaryReach + SOLVE_EPSILON &&
    centerDistance + Math.min(radius, boundaryReach) + SOLVE_EPSILON >=
      Math.max(radius, boundaryReach);

  if (circlesIntersect) {
    rootDeltaX /= centerDistance;
    rootDeltaY /= centerDistance;
    const along =
      (radius * radius - boundaryReach * boundaryReach + centerDistance * centerDistance) /
      (2 * centerDistance);
    const chordX = centerX + rootDeltaX * along;
    const chordY = centerY + rootDeltaY * along;
    const halfChord = Math.sqrt(Math.max(0, radius * radius - along * along));
    const perpendicularX = -rootDeltaY * halfChord;
    const perpendicularY = rootDeltaX * halfChord;
    const positiveX = chordX + perpendicularX;
    const positiveY = chordY + perpendicularY;
    const negativeX = chordX - perpendicularX;
    const negativeY = chordY - perpendicularY;
    const positiveDistanceSquared =
      (positiveX - preferredWorldX) * (positiveX - preferredWorldX) +
      (positiveY - preferredWorldY) * (positiveY - preferredWorldY);
    const negativeDistanceSquared =
      (negativeX - preferredWorldX) * (negativeX - preferredWorldX) +
      (negativeY - preferredWorldY) * (negativeY - preferredWorldY);
    if (positiveDistanceSquared <= negativeDistanceSquared) {
      out.x = positiveX;
      out.y = positiveY;
    } else {
      out.x = negativeX;
      out.y = negativeY;
    }
    return true;
  }

  if (centerDistance > SOLVE_EPSILON) {
    const nearestScale = radius / centerDistance;
    out.x = centerX + (rootX - centerX) * nearestScale;
    out.y = centerY + (rootY - centerY) * nearestScale;
  } else {
    out.x = centerX + preferredX * candidateScale;
    out.y = centerY + preferredY * candidateScale;
  }
  return false;
}

/**
 * Solves a fixed-length two-segment chain in 3D and writes its joint into
 * `jointOut`, and writes the reachable contact into `endOut`. `bendHint` is a
 * world-space direction toward the preferred side of the limb (for example,
 * forward for a knee or down for an elbow).
 *
 * The hint is projected perpendicular to the root-to-target axis. Parallel or
 * zero hints fall back to a deterministic perpendicular, avoiding NaNs and
 * frame-to-frame bend flips. Like the 2D solver, this function is allocation
 * free and clamps unreachable targets to the nearest valid solve distance.
 */
export function solveTwoBone3D(
  root: FigurePoint3,
  target: FigurePoint3,
  firstSegmentLength: number,
  secondSegmentLength: number,
  bendHint: FigurePoint3,
  jointOut: MutableFigurePoint3,
  endOut: MutableFigurePoint3,
): MutableFigurePoint3 {
  const rootX = finite(root.x);
  const rootY = finite(root.y);
  const rootZ = finite(root.z);
  const targetX = finite(target.x);
  const targetY = finite(target.y);
  const targetZ = finite(target.z);
  const firstLength = segmentLength(firstSegmentLength);
  const secondLength = segmentLength(secondSegmentLength);
  const deltaX = targetX - rootX;
  const deltaY = targetY - rootY;
  const deltaZ = targetZ - rootZ;
  const distance = Math.hypot(deltaX, deltaY, deltaZ);

  if (firstLength + secondLength <= SOLVE_EPSILON) {
    endOut.x = rootX;
    endOut.y = rootY;
    endOut.z = rootZ;
    jointOut.x = rootX;
    jointOut.y = rootY;
    jointOut.z = rootZ;
    return jointOut;
  }

  let directionX = 1;
  let directionY = 0;
  let directionZ = 0;
  if (distance > SOLVE_EPSILON) {
    directionX = deltaX / distance;
    directionY = deltaY / distance;
    directionZ = deltaZ / distance;
  }

  let hintX = finite(bendHint.x);
  let hintY = finite(bendHint.y);
  let hintZ = finite(bendHint.z);
  let hintDot = hintX * directionX + hintY * directionY + hintZ * directionZ;
  hintX -= directionX * hintDot;
  hintY -= directionY * hintDot;
  hintZ -= directionZ * hintDot;
  let hintLength = Math.hypot(hintX, hintY, hintZ);

  if (hintLength <= SOLVE_EPSILON) {
    // Project the least-aligned world axis into the bend plane. Choosing the
    // least-aligned axis maximises numerical headroom for normalisation.
    const absoluteX = Math.abs(directionX);
    const absoluteY = Math.abs(directionY);
    const absoluteZ = Math.abs(directionZ);
    if (absoluteX <= absoluteY && absoluteX <= absoluteZ) {
      hintDot = directionX;
      hintX = 1 - directionX * hintDot;
      hintY = -directionY * hintDot;
      hintZ = -directionZ * hintDot;
    } else if (absoluteY <= absoluteZ) {
      hintDot = directionY;
      hintX = -directionX * hintDot;
      hintY = 1 - directionY * hintDot;
      hintZ = -directionZ * hintDot;
    } else {
      hintDot = directionZ;
      hintX = -directionX * hintDot;
      hintY = -directionY * hintDot;
      hintZ = 1 - directionZ * hintDot;
    }
    hintLength = Math.hypot(hintX, hintY, hintZ);
  }

  hintX /= hintLength;
  hintY /= hintLength;
  hintZ /= hintLength;

  if (distance <= SOLVE_EPSILON && Math.abs(firstLength - secondLength) <= SOLVE_EPSILON) {
    endOut.x = rootX;
    endOut.y = rootY;
    endOut.z = rootZ;
    jointOut.x = rootX + hintX * firstLength;
    jointOut.y = rootY + hintY * firstLength;
    jointOut.z = rootZ + hintZ * firstLength;
    return jointOut;
  }

  const solveDistance = clampedReach(distance, firstLength, secondLength);
  if (solveDistance === distance) {
    endOut.x = targetX;
    endOut.y = targetY;
    endOut.z = targetZ;
  } else {
    endOut.x = rootX + directionX * solveDistance;
    endOut.y = rootY + directionY * solveDistance;
    endOut.z = rootZ + directionZ * solveDistance;
  }
  const safeDistance = Math.max(SOLVE_EPSILON, solveDistance);
  const along =
    (firstLength * firstLength - secondLength * secondLength + safeDistance * safeDistance) /
    (2 * safeDistance);
  const perpendicular = Math.sqrt(Math.max(0, firstLength * firstLength - along * along));

  jointOut.x = rootX + directionX * along + hintX * perpendicular;
  jointOut.y = rootY + directionY * along + hintY * perpendicular;
  jointOut.z = rootZ + directionZ * along + hintZ * perpendicular;
  return jointOut;
}

/**
 * Resolve the point nearest `preferred` which is exactly `contactLength` from
 * `contactCenter` and remains inside the root's reachable annulus.
 *
 * This is the closed-chain solve used by a rigid ski pole: the pole length is
 * never allowed to stretch, while the hand is free to move over the pole-tip
 * sphere until the shoulder can reach it. When the preferred point is already
 * feasible it is projected straight onto that sphere. Otherwise the function
 * chooses the nearest point on the sphere/sphere intersection circle.
 *
 * The return value is `false` only when the two constraints have no geometric
 * intersection. `out` still receives the finite point on the contact sphere
 * nearest the root, preserving the rigid equipment invariant for callers that
 * need a deterministic degraded pose.
 */
export function solveRigidContactPoint3D(
  root: FigurePoint3,
  preferred: FigurePoint3,
  contactCenter: FigurePoint3,
  contactLength: number,
  minimumReach: number,
  maximumReach: number,
  out: MutableFigurePoint3,
): boolean {
  const rootX = finite(root.x);
  const rootY = finite(root.y);
  const rootZ = finite(root.z);
  const centerX = finite(contactCenter.x);
  const centerY = finite(contactCenter.y);
  const centerZ = finite(contactCenter.z);
  const radius = segmentLength(contactLength);
  const reachA = segmentLength(minimumReach);
  const reachB = segmentLength(maximumReach);
  const minReach = Math.min(reachA, reachB);
  const maxReach = Math.max(reachA, reachB);

  let preferredX = finite(preferred.x) - centerX;
  let preferredY = finite(preferred.y) - centerY;
  let preferredZ = finite(preferred.z) - centerZ;
  let preferredLength = Math.hypot(preferredX, preferredY, preferredZ);
  if (preferredLength <= SOLVE_EPSILON) {
    preferredX = rootX - centerX;
    preferredY = rootY - centerY;
    preferredZ = rootZ - centerZ;
    preferredLength = Math.hypot(preferredX, preferredY, preferredZ);
  }
  if (preferredLength <= SOLVE_EPSILON) {
    preferredX = 1;
    preferredY = 0;
    preferredZ = 0;
    preferredLength = 1;
  }

  const candidateScale = radius / preferredLength;
  const candidateX = centerX + preferredX * candidateScale;
  const candidateY = centerY + preferredY * candidateScale;
  const candidateZ = centerZ + preferredZ * candidateScale;
  const candidateReach = Math.hypot(candidateX - rootX, candidateY - rootY, candidateZ - rootZ);
  if (candidateReach >= minReach - SOLVE_EPSILON && candidateReach <= maxReach + SOLVE_EPSILON) {
    out.x = candidateX;
    out.y = candidateY;
    out.z = candidateZ;
    return true;
  }

  // Intersect the rigid-contact sphere with the violated reach boundary. The
  // closest point on that circle is the projection of the authored preference
  // into its plane, so the correction is minimal and continuous.
  const boundaryReach = candidateReach > maxReach ? maxReach : minReach;
  let rootDeltaX = rootX - centerX;
  let rootDeltaY = rootY - centerY;
  let rootDeltaZ = rootZ - centerZ;
  const centerDistance = Math.hypot(rootDeltaX, rootDeltaY, rootDeltaZ);
  const spheresIntersect =
    centerDistance > SOLVE_EPSILON &&
    centerDistance <= radius + boundaryReach + SOLVE_EPSILON &&
    centerDistance + Math.min(radius, boundaryReach) + SOLVE_EPSILON >=
      Math.max(radius, boundaryReach);

  if (spheresIntersect) {
    rootDeltaX /= centerDistance;
    rootDeltaY /= centerDistance;
    rootDeltaZ /= centerDistance;
    const along =
      (radius * radius - boundaryReach * boundaryReach + centerDistance * centerDistance) /
      (2 * centerDistance);
    const circleX = centerX + rootDeltaX * along;
    const circleY = centerY + rootDeltaY * along;
    const circleZ = centerZ + rootDeltaZ * along;
    const circleRadius = Math.sqrt(Math.max(0, radius * radius - along * along));

    let planeX = finite(preferred.x) - circleX;
    let planeY = finite(preferred.y) - circleY;
    let planeZ = finite(preferred.z) - circleZ;
    const planeDot = planeX * rootDeltaX + planeY * rootDeltaY + planeZ * rootDeltaZ;
    planeX -= rootDeltaX * planeDot;
    planeY -= rootDeltaY * planeDot;
    planeZ -= rootDeltaZ * planeDot;
    let planeLength = Math.hypot(planeX, planeY, planeZ);
    if (planeLength <= SOLVE_EPSILON) {
      // Same least-aligned-axis rule as the two-bone solver keeps the exact
      // circle solve deterministic at its one ambiguous configuration.
      const absoluteX = Math.abs(rootDeltaX);
      const absoluteY = Math.abs(rootDeltaY);
      const absoluteZ = Math.abs(rootDeltaZ);
      if (absoluteX <= absoluteY && absoluteX <= absoluteZ) {
        planeX = 1 - rootDeltaX * rootDeltaX;
        planeY = -rootDeltaX * rootDeltaY;
        planeZ = -rootDeltaX * rootDeltaZ;
      } else if (absoluteY <= absoluteZ) {
        planeX = -rootDeltaY * rootDeltaX;
        planeY = 1 - rootDeltaY * rootDeltaY;
        planeZ = -rootDeltaY * rootDeltaZ;
      } else {
        planeX = -rootDeltaZ * rootDeltaX;
        planeY = -rootDeltaZ * rootDeltaY;
        planeZ = 1 - rootDeltaZ * rootDeltaZ;
      }
      planeLength = Math.hypot(planeX, planeY, planeZ);
    }

    const circleScale = circleRadius / Math.max(SOLVE_EPSILON, planeLength);
    out.x = circleX + planeX * circleScale;
    out.y = circleY + planeY * circleScale;
    out.z = circleZ + planeZ * circleScale;
    return true;
  }

  // Impossible input: preserve rigid contact and minimise the arm residual.
  // Callers can use the boolean to release/re-author the contact instead of
  // hiding the incompatibility by stretching equipment.
  if (centerDistance > SOLVE_EPSILON) {
    const nearestScale = radius / centerDistance;
    out.x = centerX + (rootX - centerX) * nearestScale;
    out.y = centerY + (rootY - centerY) * nearestScale;
    out.z = centerZ + (rootZ - centerZ) * nearestScale;
  } else {
    out.x = centerX + preferredX * candidateScale;
    out.y = centerY + preferredY * candidateScale;
    out.z = centerZ + preferredZ * candidateScale;
  }
  return false;
}
