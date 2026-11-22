import * as THREE from './vendor/three.module.js';

// Metres, seconds, world Y up. Barrels and cans have their
// long axis along local X. An eight-sided prism encloses the round hull and
// its endcaps; unlike a capsule it also covers a short barrel's end corners.
const bodies = new WeakMap();
const UP = new THREE.Vector3(0, 1, 0);
const SKIN = 0.0012;
const EPS = 1e-9;
const PASSES = 64;
const FALLBACK_MASS = { barrel: 7, can: 0.42, plaque: 5.4 };
const prismEdges = [];
for (let i = 0; i < 8; i++) {
  prismEdges.push([i, (i + 1) % 8], [i + 8, (i + 1) % 8 + 8], [i, i + 8]);
}
const boxEdges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3],
  [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

const axisPool = Array.from({ length: 100 }, () => new THREE.Vector3());
const delta = new THREE.Vector3();
const oldDelta = new THREE.Vector3();
const normal = new THREE.Vector3();
const discreteNormal = new THREE.Vector3();
const sweepNormal = new THREE.Vector3();
const work = new THREE.Vector3();
const work2 = new THREE.Vector3();
const contactA = new THREE.Vector3();
const contactB = new THREE.Vector3();
const leverA = new THREE.Vector3();
const leverB = new THREE.Vector3();
const relative = new THREE.Vector3();
const tangent = new THREE.Vector3();
const impulse = new THREE.Vector3();
const torque = new THREE.Vector3();
let axisCount = 0;

function hasBoxHull(item) {
  const half = item.halfExtents;
  return item.collisionShape === 'box' && half?.x > 0 && half.y > 0 && half.z > 0;
}

function prepareBox(body, half) {
  // Dimensions include model scale. Local X spans the sign and local Z
  // is its thin face normal. The wire and other fittings have no hull.
  body.halfExtents = half;
  body.bound = Math.hypot(half.x, half.y, half.z);
  body.faces[0].copy(body.axis);
  body.faces[1].copy(body.y);
  body.faces[2].copy(body.z);
  for (let i = 0; i < 8; i++) {
    body.vertices[i].copy(body.axis).multiplyScalar(i & 1 ? half.x : -half.x)
      .addScaledVector(body.y, i & 2 ? half.y : -half.y)
      .addScaledVector(body.z, i & 4 ? half.z : -half.z);
  }
  const ix = body.mass * (half.y ** 2 + half.z ** 2) / 3;
  const iy = body.mass * (half.x ** 2 + half.z ** 2) / 3;
  const iz = body.mass * (half.x ** 2 + half.y ** 2) / 3;
  body.invRoll = body.held ? 0 : 1 / ix;
  body.invYaw = body.held ? 0 : 1 / (ix * body.axis.y ** 2 + iy * body.y.y ** 2 + iz * body.z.y ** 2);
}

function prepare(item, held, dt) {
  let body = bodies.get(item);
  const box = hasBoxHull(item);
  if (!body || body.box !== box) {
    body = {
      item, box, edges: box ? boxEdges : prismEdges,
      axis: new THREE.Vector3(),
      y: new THREE.Vector3(),
      z: new THREE.Vector3(),
      start: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      omega: new THREE.Vector3(),
      faces: Array.from({ length: box ? 3 : 5 }, () => new THREE.Vector3()),
      vertices: Array.from({ length: box ? 8 : 16 }, () => new THREE.Vector3()),
    };
    bodies.set(item, body);
  }
  const kind = item.kind || item.object.userData?.kind || 'can';
  body.position = item.object.position;
  body.held = item === held;
  body.sphere = item.collisionShape === 'sphere';
  body.radius = Math.max(0.015, Number(item.radius) || 0.15) + (kind === 'barrel' ? 0.012 : 0.003);
  body.halfLength = Math.max(0.015, (Number(item.length) || body.radius * 2) * 0.5) + 0.003;
  body.mass = Math.max(0.025, Number(item.mass) || FALLBACK_MASS[kind] || 1);
  body.invMass = body.held ? 0 : 1 / body.mass;
  body.rollField = kind === 'barrel' || kind === 'plaque' ? 'rollVelocity' : 'spin';
  body.axis.set(1, 0, 0).applyQuaternion(item.object.quaternion);
  body.y.set(0, 1, 0).applyQuaternion(item.object.quaternion);
  body.z.set(0, 0, 1).applyQuaternion(item.object.quaternion);
  if (box) prepareBox(body, item.halfExtents);
  else prepareRoundHull(body);
  readVelocity(body);
  // The caller has already advanced the bodies. Reconstruct just this substep,
  // rather than retaining positions which would misread a responsive relayout.
  body.start.copy(body.position).addScaledVector(body.velocity, -dt);
  return body;
}

function prepareRoundHull(body) {
  body.invRoll = body.held ? 0 : 1 / (0.5 * body.mass * body.radius ** 2);
  body.invYaw = body.held ? 0 : 1 / (body.mass * (3 * body.radius ** 2 + 4 * body.halfLength ** 2) / 12);
  if (body.sphere) body.invRoll = body.invYaw = body.held ? 0 : 1 / (0.4 * body.mass * body.radius ** 2);
  body.bound = body.sphere ? body.radius : Math.hypot(body.halfLength, body.radius / Math.cos(Math.PI / 8));
  body.faces[0].copy(body.axis);
  for (let i = 0; i < 4; i++) {
    const angle = i * Math.PI / 4;
    body.faces[i + 1].copy(body.y).multiplyScalar(Math.cos(angle)).addScaledVector(body.z, Math.sin(angle));
  }
  const polyRadius = body.radius / Math.cos(Math.PI / 8);
  for (let i = 0; i < 8; i++) {
    const angle = Math.PI / 8 + i * Math.PI / 4;
    body.vertices[i].copy(body.axis).multiplyScalar(-body.halfLength)
      .addScaledVector(body.y, Math.cos(angle) * polyRadius).addScaledVector(body.z, Math.sin(angle) * polyRadius);
    body.vertices[i + 8].copy(body.vertices[i]).addScaledVector(body.axis, body.halfLength * 2);
  }
}

function readVelocity(body) {
  const item = body.item;
  if (body.held) {
    body.velocity.copy(item.gripVelocity || work.set(0, 0, 0));
    body.omega.set(0, 0, 0);
  } else {
    body.velocity.set(item.momentum?.x || 0, item.velocityY || 0, item.momentum?.y || 0);
    body.omega.copy(body.axis).multiplyScalar(item[body.rollField] || 0)
      .addScaledVector(UP, item.yawVelocity || 0);
  }
}

function addAxis(vector) {
  const lengthSq = vector.lengthSq();
  if (lengthSq < 1e-12) return;
  axisPool[axisCount++].copy(vector).multiplyScalar(1 / Math.sqrt(lengthSq));
}

function contactAxes(a, b) {
  axisCount = 0;
  if (a.sphere && b.sphere) {
    work.subVectors(b.position, a.position);
    if (work.lengthSq() < EPS) work.set(1, 0, 0);
    addAxis(work);
    return;
  }
  if (!a.sphere && !b.sphere) {
    a.faces.forEach(addAxis);
    b.faces.forEach(addAxis);
    for (const ax of a.faces) for (const bx of b.faces) addAxis(work.crossVectors(ax, bx));
    return;
  }
  const sphere = a.sphere ? a : b;
  const poly = a.sphere ? b : a;
  poly.faces.forEach(addAxis);
  work2.subVectors(sphere.position, poly.position);
  for (const vertex of poly.vertices) addAxis(work.subVectors(work2, vertex));
  for (const [i, j] of poly.edges) {
    const from = poly.vertices[i];
    const to = poly.vertices[j];
    work.subVectors(to, from);
    const fraction = THREE.MathUtils.clamp(
      ((work2.x - from.x) * work.x + (work2.y - from.y) * work.y + (work2.z - from.z) * work.z) / work.lengthSq(), 0, 1,
    );
    work.multiplyScalar(-fraction).add(work2).sub(from);
    addAxis(work);
  }
}

function projectedRadius(body, axis) {
  if (body.sphere) return body.radius;
  if (body.box) {
    const half = body.halfExtents;
    return half.x * Math.abs(body.axis.dot(axis)) + half.y * Math.abs(body.y.dot(axis))
      + half.z * Math.abs(body.z.dot(axis));
  }
  let radius = 0;
  for (const vertex of body.vertices) radius = Math.max(radius, Math.abs(vertex.dot(axis)));
  return radius;
}

function broadphase(a, b, sweep) {
  delta.subVectors(b.position, a.position);
  const limit = a.bound + b.bound + SKIN;
  if (delta.lengthSq() <= limit * limit) return true;
  if (!sweep) return false;
  oldDelta.subVectors(b.start, a.start);
  work.subVectors(delta, oldDelta);
  const t = THREE.MathUtils.clamp(-oldDelta.dot(work) / Math.max(EPS, work.lengthSq()), 0, 1);
  return work.multiplyScalar(t).add(oldDelta).lengthSq() <= limit * limit;
}

function findContact(a, b, allowSweep) {
  if (!broadphase(a, b, allowSweep)) return null;
  contactAxes(a, b);
  delta.subVectors(b.position, a.position);
  oldDelta.subVectors(b.start, a.start);
  let penetration = Infinity;
  let separated = false;
  let startedSeparated = false;
  let entry = -Infinity;
  let exit = Infinity;
  for (let i = 0; i < axisCount; i++) {
    const axis = axisPool[i];
    const radius = projectedRadius(a, axis) + projectedRadius(b, axis);
    const now = delta.dot(axis);
    const overlap = radius - Math.abs(now);
    if (overlap < -SKIN) separated = true;
    // Prefer a horizontal escape direction for a symmetric floating pile.
    if (overlap < penetration - 1e-7 || (Math.abs(overlap - penetration) < 1e-7 && Math.abs(axis.y) < Math.abs(discreteNormal.y))) {
      penetration = overlap;
      const relativeSpeed = b.velocity.dot(axis) - a.velocity.dot(axis);
      const sign = Math.abs(now) > 1e-8 ? Math.sign(now) : Math.abs(relativeSpeed) > 1e-8 ? -Math.sign(relativeSpeed) : 1;
      discreteNormal.copy(axis).multiplyScalar(sign);
    }
    if (!allowSweep) continue;
    const before = oldDelta.dot(axis);
    if (Math.abs(before) > radius + SKIN) startedSeparated = true;
    const travel = now - before;
    if (Math.abs(travel) < 1e-10) {
      if (Math.abs(before) > radius + SKIN) exit = -Infinity;
      continue;
    }
    let enterAt = (-radius - before) / travel;
    let leaveAt = (radius - before) / travel;
    if (enterAt > leaveAt) [enterAt, leaveAt] = [leaveAt, enterAt];
    if (enterAt > entry) {
      entry = enterAt;
      sweepNormal.copy(axis).multiplyScalar(travel > 0 ? -1 : 1);
    }
    exit = Math.min(exit, leaveAt);
  }
  // Swept entry preserves the incoming side even when one body has crossed a
  // thin can entirely during the substep. Orientations are frozen per substep.
  if (allowSweep && startedSeparated && entry >= 0 && entry <= 1 && entry <= exit) {
    normal.copy(sweepNormal);
    const radius = projectedRadius(a, normal) + projectedRadius(b, normal);
    return { depth: Math.max(0, radius - delta.dot(normal)), time: entry };
  }
  if (separated || penetration < -SKIN) return null;
  normal.copy(discreteNormal);
  return { depth: Math.max(0, penetration), time: 1 };
}

function supportOffset(body, direction, result) {
  if (body.sphere) return result.copy(direction).multiplyScalar(body.radius);
  let max = -Infinity;
  for (const vertex of body.vertices) max = Math.max(max, vertex.dot(direction));
  result.set(0, 0, 0);
  let count = 0;
  for (const vertex of body.vertices) {
    if (max - vertex.dot(direction) < 1e-6) {
      result.add(vertex);
      count++;
    }
  }
  return result.multiplyScalar(1 / count);
}

// A small object can land far from the centre of the board's broad face.
// Along that face, select the point closest to the other hull's support.
function supportOnBox(body, direction, towards, result) {
  const half = body.halfExtents;
  result.set(0, 0, 0);
  for (let i = 0; i < 3; i++) {
    const axis = body.faces[i];
    const distance = half.getComponent(i);
    const alignment = direction.dot(axis);
    const extent = Math.abs(alignment) > 1e-6 ? Math.sign(alignment) * distance
      : THREE.MathUtils.clamp(towards.dot(axis), -distance, distance);
    result.addScaledVector(axis, extent);
  }
}

function move(body, distance) {
  if (body.held) return;
  body.position.addScaledVector(normal, distance);
  const drift = body.item.drift;
  if (drift) {
    drift.x += normal.x * distance;
    drift.y += normal.z * distance;
  }
}

function effectiveMass(body, lever, direction) {
  torque.crossVectors(lever, direction);
  return body.invMass + torque.dot(body.axis) ** 2 * body.invRoll + torque.y ** 2 * body.invYaw;
}

function applyImpulse(body, lever, vector, sign) {
  if (body.held) return;
  const item = body.item;
  if (!item.momentum) item.momentum = new THREE.Vector2();
  item.momentum.x += vector.x * body.invMass * sign;
  item.momentum.y += vector.z * body.invMass * sign;
  item.velocityY = (item.velocityY || 0) + vector.y * body.invMass * sign;
  torque.crossVectors(lever, vector).multiplyScalar(sign);
  item[body.rollField] = (item[body.rollField] || 0) + torque.dot(body.axis) * body.invRoll;
  item.yawVelocity = (item.yawVelocity || 0) + torque.y * body.invYaw;
  readVelocity(body);
}

function relativeContactVelocity(a, b) {
  relative.copy(b.velocity).sub(a.velocity)
    .add(work.crossVectors(b.omega, leverB)).sub(work.crossVectors(a.omega, leverA));
}

function solvePair(a, b, allowSweep) {
  if (a.held && b.held) return 0;
  const hit = findContact(a, b, allowSweep);
  if (!hit) return 0;
  // Contact point at the time of entry, before depenetration. Averaging the
  // supporting face/edge vertices avoids spurious torque on a flat endcap.
  supportOffset(a, normal, leverA);
  work.copy(normal).negate();
  supportOffset(b, work, leverB);
  contactA.copy(a.position).sub(a.start).multiplyScalar(hit.time).add(a.start);
  contactB.copy(b.position).sub(b.start).multiplyScalar(hit.time).add(b.start);
  if (a.box) {
    work.copy(contactB).sub(contactA).add(leverB);
    supportOnBox(a, normal, work, leverA);
  }
  if (b.box) {
    work.copy(contactA).sub(contactB).add(leverA);
    supportOnBox(b, work2.copy(normal).negate(), work, leverB);
  }
  contactA.add(leverA);
  contactB.add(leverB);
  work.copy(contactA).add(contactB).multiplyScalar(0.5);
  leverA.add(work2.subVectors(work, contactA));
  leverB.add(work2.subVectors(work, contactB));
  const inverseSum = a.invMass + b.invMass;
  const correction = hit.depth + SKIN;
  move(a, -correction * a.invMass / inverseSum);
  move(b, correction * b.invMass / inverseSum);
  relativeContactVelocity(a, b);
  const closing = relative.dot(normal);
  if (closing >= -1e-5) return hit.depth;
  const denominator = effectiveMass(a, leverA, normal) + effectiveMass(b, leverB, normal);
  const restitution = closing < -0.28 ? 0.22 : 0;
  const amount = -(1 + restitution) * closing / Math.max(EPS, denominator);
  impulse.copy(normal).multiplyScalar(amount);
  applyImpulse(a, leverA, impulse, -1);
  applyImpulse(b, leverB, impulse, 1);
  relativeContactVelocity(a, b);
  tangent.copy(relative).addScaledVector(normal, -relative.dot(normal));
  const tangentSpeed = tangent.length();
  if (tangentSpeed < 1e-6) return hit.depth;
  tangent.multiplyScalar(1 / tangentSpeed);
  const frictionMass = effectiveMass(a, leverA, tangent) + effectiveMass(b, leverB, tangent);
  const friction = Math.min(tangentSpeed / Math.max(EPS, frictionMass), amount * 0.24);
  impulse.copy(tangent).multiplyScalar(-friction);
  applyImpulse(a, leverA, impulse, -1);
  applyImpulse(b, leverB, impulse, 1);
  return hit.depth;
}

/**
 * Call after advancing every float's position/orientation, before copying the
 * submerged meshes or contact uniforms. Use the caller's physics substep dt
 * (1/60s or smaller). This function resolves contact; it never advances time.
 * Held items are kinematic and use gripVelocity in world metres/second.
 * Collision yaw is written to yawVelocity (world Y, rad/s); integrate/damp that
 * in the caller. Barrel and plaque roll use rollVelocity; other kinds use spin.
 */
export function resolveFloatCollisions(floats, heldItem = null, dt = 1 / 60) {
  const step = THREE.MathUtils.clamp(Number(dt) || 0, 0, 0.12);
  const active = floats.filter(item => item?.object?.position && (item.radius > 0 || hasBoxHull(item)))
    .map(item => prepare(item, heldItem, step));
  for (let pass = 0; pass < PASSES; pass++) {
    let deepest = 0;
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        deepest = Math.max(deepest, solvePair(active[i], active[j], pass === 0 && step > 0));
      }
    }
    // Ordinary two-body hits finish in two passes. Extra iterations are only
    // spent on a tightly packed chain, so heavy barrels cannot crush a can.
    if (deepest < SKIN * 0.15) break;
  }
}
