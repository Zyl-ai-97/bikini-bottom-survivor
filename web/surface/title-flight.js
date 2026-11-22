import * as THREE from './vendor/three.module.js';
import { waveHeight, waveNormal } from './ocean.js';

const FIRST_FLIGHT_DELAY = 3.5;
const FLIGHT_SECONDS = 12;
const BETWEEN_FLIGHTS = 7;
const LOAD_CYCLE = 3.55;
const LOW_POINT = 0.42;
const FATIGUE_START = 2 * LOAD_CYCLE;
const FATIGUE_END = 3 * LOAD_CYCLE;
const GRAVITY = 9.81;
const PLAQUE_SCALE = 0.81;
const GULL_SCALE = 0.64;
const up = new THREE.Vector3(0, 1, 0);

// The carrier's origin is the shared contact between the toes and the top of the wire.
export function createTitleFlight(scene, camera, plaque, gull, onImpact, {
  firstDelay = FIRST_FLIGHT_DELAY, onAfloat,
} = {}) {
  const { grip: plaqueAtGrip, board, slab, wire, halfExtents } = plaque;
  const hangingOffset = board.position.y;
  const hangingPosition = board.position.clone();
  const hangingRotation = board.quaternion.clone();
  const hangingScale = board.scale.clone();
  const carrier = new THREE.Group();
  carrier.name = 'Flying gull and hanging sign';
  carrier.add(gull.object, plaqueAtGrip);
  gull.object.scale.setScalar(GULL_SCALE);
  plaqueAtGrip.scale.setScalar(PLAQUE_SCALE);
  carrier.visible = false;
  scene.add(carrier);
  const dropOrigin = new THREE.Vector3();
  const dropAttitude = new THREE.Quaternion();
  const uprightAttitude = new THREE.Quaternion();
  const spin = new THREE.Euler();
  const rotation = new THREE.Quaternion();
  const landingCenter = new THREE.Vector3();
  const landingAttitude = new THREE.Quaternion();
  const waterNormal = new THREE.Vector3();
  const widthAxis = new THREE.Vector3();
  const verticalAxis = new THREE.Vector3();
  const face = new THREE.Vector3();
  const corner = new THREE.Vector3();
  const contact = new THREE.Vector3();

  let startTime = null;
  let dropTime = null;
  let lastDropSample = 0;
  let landingTime = null;
  let landingWater = 0;
  let landingHeading = 0;
  let entrySpeed = 0;
  let sinking = false;
  let handedOff = false;
  let finished = false;
  let flightLayer = 0;

  function setFlightLayer(layer) {
    flightLayer = layer;
    carrier.traverse(object => object.layers.set(layer));
  }

  function fly(age, flightTime, escape) {
    const progress = THREE.MathUtils.clamp(age / FLIGHT_SECONDS, 0, 1);
    // Give up horizontal speed under the load and regain it on the way out.
    // The offset returns to zero at the exit, and its slope never reverses travel.
    const finalLeg = THREE.MathUtils.clamp((age - FATIGUE_START) / (FLIGHT_SECONDS - FATIGUE_START), 0, 1);
    const lag = 0.068 * Math.sin(Math.PI * finalLeg) ** 2;
    const leg = 2 * (progress - lag) - 1;
    // Keep the route just behind the right-hand barrel (10.2 m from camera).
    const depth = 11.8 + (leg < 0 ? 0.54 : 0.37) * leg * leg;
    const halfFov = Math.tan(camera.fov * Math.PI / 360);
    const halfHeight = depth * halfFov;
    const screenX = 0.72 * leg + 0.28 * leg ** 3;
    // The board pulls the gull down quickly. A longer burst of wingbeats
    // brings it back up, with the sling still swinging behind the motion.
    const phase = (flightTime % LOAD_CYCLE) / LOAD_CYCLE;
    const sink = THREE.MathUtils.smoothstep(phase, 0, LOW_POINT);
    const climb = THREE.MathUtils.smoothstep(phase, LOW_POINT, 1);
    const downstroke = THREE.MathUtils.smoothstep(phase, 0.32, 0.53)
      * (1 - THREE.MathUtils.smoothstep(phase, 0.83, 0.98));
    const load = 1 - THREE.MathUtils.smoothstep(escape, 0, 0.44);
    const fatigue = THREE.MathUtils.smoothstep(flightTime, FATIGUE_START, FATIGUE_START + 0.65)
      * (1 - THREE.MathUtils.smoothstep(flightTime, FATIGUE_END - 0.45, FATIGUE_END));
    const depthOfSink = halfHeight * (0.128 + 0.014 * Math.sin(flightTime * 0.54 + 0.28) + 0.145 * fatigue);
    const dip = sink * (1 - climb) * depthOfSink * load;
    const exertion = 0.2 + 0.8 * Math.max(downstroke * load, 1 - load);
    const recovery = THREE.MathUtils.smoothstep(flightTime, FATIGUE_START + 1.2, FATIGUE_END - 0.20);
    const wingTime = age + 0.62 * recovery;
    const swing = Math.sin(phase * Math.PI * 2 - 0.75);
    plaqueAtGrip.rotation.set(-0.045 + 0.14 * Math.sin(age * 1.82 - 1.1) + 0.11 * swing,
      -0.09 + 0.068 * Math.sin(age * 1.28), -0.027 - 0.043 * Math.cos(age * 1.82 - 0.75) - 0.05 * swing, 'YXZ');
    let elevation = halfHeight * 0.682 - hangingOffset * PLAQUE_SCALE
      + 0.017 * exertion * Math.sin(wingTime * 7.9 - 0.65);
    // The reference puts the board's upper edge 13% below the top of frame.
    // Check both corners and faces as it swings, including their depth.
    for (const side of [-1, 1]) for (const faceSide of [-1, 1]) {
      corner.set(side * halfExtents.x, hangingOffset + halfExtents.y, faceSide * halfExtents.z)
        .multiplyScalar(PLAQUE_SCALE).applyQuaternion(plaqueAtGrip.quaternion);
      elevation = Math.min(elevation, (depth - corner.z) * (0.74 * halfFov) - corner.y);
    }
    carrier.position.set(screenX * halfHeight * camera.aspect + 1.2 * leg ** 3,
      elevation - dip + Math.min(escape * escape * 1.1, 2.1), -depth);
    camera.localToWorld(carrier.position);
    carrier.quaternion.copy(camera.quaternion);
    const noseDown = 4 * sink * (1 - sink);
    gull.object.rotation.z = (0.16 * downstroke - 0.12 * noseDown) * load
      + 0.026 * Math.cos(age * 1.82) + Math.min(0.23, escape * 0.12);
    gull.update(wingTime, exertion);
  }

  function hitTest(raycaster) {
    if (!carrier.visible || dropTime !== null) return false;
    slab.updateWorldMatrix(true, false);
    return raycaster.intersectObject(slab, false).length > 0;
  }

  function release(time) {
    if (!carrier.visible || dropTime !== null) return false;
    scene.attach(board);
    board.traverse(object => object.layers.set(0));
    wire.removeFromParent();
    dropTime = lastDropSample = time;
    dropOrigin.copy(board.position);
    dropAttitude.copy(board.quaternion);
    widthAxis.set(1, 0, 0).applyQuaternion(dropAttitude);
    uprightAttitude.setFromAxisAngle(up, Math.atan2(-widthAxis.z, widthAxis.x));
    return true;
  }

  function airbornePose(time) {
    const age = time - dropTime;
    board.position.copy(dropOrigin);
    board.position.y -= 0.5 * GRAVITY * age * age;
    board.quaternion.copy(dropAttitude).slerp(uprightAttitude, 1 - Math.exp(-6 * age));
  }

  // Find the lowest immersed corner relative to the local wave, so an inclined
  // sign hits on its leading edge rather than waiting for its origin to submerge.
  function clearance(time) {
    widthAxis.set(1, 0, 0).applyQuaternion(board.quaternion);
    verticalAxis.set(0, 1, 0).applyQuaternion(board.quaternion);
    face.set(0, 0, 1).applyQuaternion(board.quaternion);
    const lowerFace = (face.y > 0 ? -halfExtents.z : halfExtents.z) * board.scale.z;
    let lowest = Infinity;
    for (let i = -1; i <= 1; i += 2) {
      for (let j = -1; j <= 1; j += 2) {
        corner.copy(board.position).addScaledVector(widthAxis, i * halfExtents.x * board.scale.x)
          .addScaledVector(verticalAxis, j * halfExtents.y * board.scale.y).addScaledVector(face, lowerFace);
        const gap = corner.y - waveHeight(corner.x, corner.z, time);
        if (gap < lowest) {
          lowest = gap;
          contact.copy(corner);
        }
      }
    }
    return lowest;
  }

  function land(time) {
    landingTime = time;
    entrySpeed = GRAVITY * (time - dropTime);
    landingCenter.copy(board.position);
    landingAttitude.copy(board.quaternion);
    landingHeading = Math.atan2(-widthAxis.z, widthAxis.x);
    landingWater = waveHeight(board.position.x, board.position.z, time);
    sinking = onImpact({ board, x: contact.x, z: contact.z, speed: entrySpeed,
      axisX: Math.cos(landingHeading), axisZ: -Math.sin(landingHeading), scale: board.scale.x, time }) === true;
  }

  function sink(time) {
    const age = time - landingTime;
    const travel = entrySpeed * 0.13 * (1 - Math.exp(-4 * age)) + 0.72 * age;
    board.position.copy(landingCenter);
    board.position.y -= travel;
    const tilt = 1 - Math.exp(-2.6 * age);
    spin.set(-0.92, landingHeading + 0.18 * tilt, 0.16, 'YXZ');
    rotation.setFromEuler(spin);
    board.quaternion.copy(landingAttitude).slerp(rotation, tilt);
  }

  function floatOnWater(time) {
    const age = time - landingTime;
    const { x, z } = landingCenter;
    const draft = 0.031 * board.scale.z;
    const height = waveHeight(x, z, time);
    board.position.set(x,
      height + draft + (landingCenter.y - landingWater - draft) * Math.exp(-3.3 * age)
        - Math.min(0.43, entrySpeed * 0.055) * Math.sin(age * 6.7) * Math.exp(-2.65 * age), z);
    waveNormal(x, z, time, waterNormal);
    const settle = THREE.MathUtils.smoothstep(age, 0.10, 0.96);
    const rock = 0.17 * Math.sin(age * 5) * Math.exp(-1.8 * age);
    spin.set(-Math.PI / 2 + rock, landingHeading + 0.055 * Math.sin(age * 0.51), 0, 'YXZ');
    rotation.setFromUnitVectors(up, waterNormal);
    board.quaternion.setFromEuler(spin).premultiply(rotation).slerp(landingAttitude, 1 - settle);
    if (age >= 0.96 && onAfloat) {
      handedOff = true;
      onAfloat(board, halfExtents.clone().multiply(board.scale), landingHeading, draft, landingTime);
    }
  }

  function update(time, ready) {
    if (startTime === null) {
      if (!ready) return;
      startTime = time + firstDelay;
    }
    if (!finished && time >= startTime) {
      const flightTime = time - startTime;
      const escape = dropTime === null ? 0 : Math.max(0, time - dropTime);
      const age = flightTime + 1.74 * escape + 0.72 * escape * escape;
      if (age >= FLIGHT_SECONDS) {
        carrier.visible = false;
        if (dropTime === null) startTime = time + BETWEEN_FLIGHTS;
        else finished = true;
      } else {
        fly(age, flightTime, escape);
        carrier.visible = true;
      }
    }
    if (dropTime === null) return;
    while (landingTime === null && lastDropSample < time) {
      lastDropSample = Math.min(time, lastDropSample + 1 / 45);
      airbornePose(lastDropSample);
      if (clearance(lastDropSample) <= 0) land(lastDropSample);
    }
    if (landingTime !== null && !handedOff) {
      if (sinking) sink(time);
      else floatOnWater(time);
    }
  }

  function reset(time) {
    plaqueAtGrip.add(board);
    board.position.copy(hangingPosition);
    board.quaternion.copy(hangingRotation);
    board.scale.copy(hangingScale);
    board.add(wire);
    board.traverse(object => object.layers.set(flightLayer));
    carrier.visible = false;
    startTime = time + FIRST_FLIGHT_DELAY;
    dropTime = landingTime = null;
    handedOff = false;
    finished = false;
  }

  function warmupMaterials(renderer, view = camera) {
    renderer.compile(carrier, view, scene);
    const textures = new Set();
    carrier.traverse(object => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (material.map) textures.add(material.map);
        if (material.bumpMap) textures.add(material.bumpMap);
      }
    });
    for (const texture of textures) renderer.initTexture(texture);
  }

  function warmupPose(paint) {
    fly(FLIGHT_SECONDS * 0.5, FLIGHT_SECONDS * 0.5, 0);
    carrier.visible = true;
    try {
      paint();
    } finally {
      carrier.visible = false;
    }
  }

  return { update, hitTest, release, reset, warmupMaterials, warmupPose, setFlightLayer,
    getBoardPosition: target => slab.getWorldPosition(target),
    progressAt: time => THREE.MathUtils.clamp((time - startTime) / FLIGHT_SECONDS, 0, 1),
    get position() { return carrier.position; },
    get flying() { return carrier.visible; },
    get carrying() { return carrier.visible && dropTime === null; },
  };
}
