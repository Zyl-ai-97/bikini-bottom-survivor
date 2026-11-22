import * as THREE from './vendor/three.module.js';
import { waveHeight, waveNormal } from './ocean.js';

// The attachment stays in model space as the object swings beneath the pointer.
export function createFloatGrab({ canvas, camera, floats, getTime, enabled, onWater, onRelease }) {
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const samplePointer = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1));
  const target = new THREE.Vector3();
  const lever = new THREE.Vector3();
  const center = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const step = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const waterNormal = new THREE.Vector3();
  const waveTilt = new THREE.Quaternion();
  const twist = new THREE.Quaternion();
  const toHang = new THREE.Quaternion();
  const roots = [];
  const owners = new Map();
  let grip = null;

  function addItem(item) {
    roots.push(item.object);
    item.object.traverse(mesh => owners.set(mesh, item));
    if (grip) grip.others.push(item.object);
  }
  floats.forEach(addItem);

  function setRay(event) {
    const bounds = canvas.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1,
      1 - (event.clientY - bounds.top) / bounds.height * 2);
    ray.setFromCamera(pointer, camera);
  }

  function pick(candidates = roots, raycaster = ray) {
    for (const hit of raycaster.intersectObjects(candidates, true)) {
      if (hit.point.y < waveHeight(hit.point.x, hit.point.z, getTime()) - 0.025) continue;
      const item = owners.get(hit.object);
      return { item, point: hit.point };
    }
    return null;
  }

  function pickPoint(item) {
    if (!roots.includes(item.object)) return null;
    const bounds = canvas.getBoundingClientRect();
    const probe = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const position = item.object.position;
    const center = position.clone().project(camera);
    // A hull's center is often below water. Aim at the exposed geometry using
    // the same ray test as the real pointer handler, without touching its state.
    const halfFov = Math.tan(camera.fov * Math.PI / 360);
    const radius = item.radius / ((camera.position.z - position.z) * halfFov);
    for (const y of [0.45, 0.65, 0.25, 0.85, 0.05, -0.15]) {
      for (const x of [0, -0.30, 0.30, -0.65, 0.65]) {
        ndc.set(center.x + radius * x / camera.aspect, center.y + radius * y);
        if (Math.abs(ndc.x) >= 1 || Math.abs(ndc.y) >= 1) continue;
        probe.setFromCamera(ndc, camera);
        if (pick(roots, probe)?.item !== item) continue;
        return {
          x: bounds.left + (ndc.x + 1) * bounds.width / 2,
          y: bounds.top + (1 - ndc.y) * bounds.height / 2,
        };
      }
    }
    return null;
  }

  function pickForTouch() {
    const bounds = canvas.getBoundingClientRect();
    // Small cans can expose only a thin strip of metal on a narrow screen.
    for (const [x, y] of [[0, -7], [0, 7], [-7, 0], [7, 0]]) {
      samplePointer.set(pointer.x + 2 * x / bounds.width, pointer.y - 2 * y / bounds.height);
      ray.setFromCamera(samplePointer, camera);
      const hit = pick();
      if (hit) {
        ray.setFromCamera(pointer, camera);
        return hit;
      }
    }
    ray.setFromCamera(pointer, camera);
    return null;
  }

  function dropTargetBelow() {
    // From above, the projected width of a nearby hull also acts as a drop target.
    // Only change layers after a sideways drag; a straight lift stays in its plane.
    if (Math.abs(pointer.x - grip.startX) < 0.045) return null;
    const halfFov = Math.tan(camera.fov * Math.PI / 360);
    let best = null;
    let lowestScore = 1;
    for (const item of floats) {
      const p = item.object.position;
      if (item === grip.item || Math.abs(p.z - grip.item.object.position.z) > 3.5) continue;
      projected.copy(p).project(camera);
      const height = pointer.y - projected.y;
      if (height <= 0 || height > 1.05) continue;
      const width = (item.length * 0.35 + item.radius * 0.48)
        / ((camera.position.z - p.z) * halfFov * camera.aspect);
      const score = Math.abs(pointer.x - projected.x) / width + height * 0.16;
      if (score < lowestScore) { best = item; lowestScore = score; }
    }
    return best;
  }

  function trackGesture(event) {
    const dx = event.clientX - grip.startPixelX;
    const rise = grip.startPixelY - event.clientY;
    const now = performance.now();
    const advance = event.clientX - grip.lastPixelX;
    if (advance !== 0) {
      const seconds = THREE.MathUtils.clamp((now - grip.lastMotion) / 1000, 1 / 120, 0.15);
      const metersPerPixel = 2 * (camera.position.z - grip.item.object.position.z)
        * Math.tan(camera.fov * Math.PI / 360) / canvas.clientHeight;
      const sample = THREE.MathUtils.clamp(advance * metersPerPixel / seconds, -3.6, 3.6);
      grip.pointerSpeed = THREE.MathUtils.lerp(grip.pointerSpeed, sample, 0.68);
      grip.lastPixelX = event.clientX;
      grip.lastMotion = now;
    }
    if (grip.mode === 'pending' && Math.hypot(dx, rise) > grip.slop) {
      grip.mode = rise > Math.abs(dx) * 0.72 ? 'lift' : 'surface';
    } else if (grip.mode === 'surface' && rise > Math.max(13, canvas.clientHeight * 0.036)) {
      // A horizontal push can turn into a lift without letting go.
      grip.mode = 'lift';
      grip.startRotation.copy(grip.item.object.quaternion);
      grip.startY = lever.copy(grip.offset).applyQuaternion(grip.startRotation).y + grip.item.object.position.y;
    }
  }

  function turnRate(item, speedX, speedZ) {
    // The same lateral pull has a different moment about the hull's center
    // depending on which side the hand touches. Use the actual surface lever.
    lever.copy(grip.offset).applyQuaternion(item.object.quaternion);
    const inertiaPerMass = item.length * item.length / 12 + item.radius * item.radius / 4;
    const angular = (lever.z * speedX - lever.x * speedZ) / inertiaPerMass;
    const limit = item.kind === 'can' ? 5.4 : 3.1;
    return THREE.MathUtils.clamp(angular * 0.72, -limit, limit);
  }

  function follow(item, dt, finish = false) {
    if (grip?.item !== item) return false;
    ray.setFromCamera(pointer, camera);
    // Move in depth only when the user aims at another floating object.
    // Ease toward its layer, so items several meters apart don't collide on sight.
    const depthStep = THREE.MathUtils.clamp(grip.planeZ + plane.constant, -dt * 3.6, dt * 3.6);
    plane.constant -= depthStep;
    if (!ray.ray.intersectPlane(plane, target)) return true;
    const rotation = item.object.quaternion;
    const position = item.object.position;
    const depth = camera.position.z - position.z;
    const maxLift = Math.min(4.3, depth * 0.62);
    const surface = waveHeight(position.x, position.z, getTime());
    const lift = THREE.MathUtils.clamp((target.y - grip.startY) / (item.radius * 1.9), 0, 1);
    const afloat = grip.mode !== 'lift';
    if (afloat) {
      const desired = grip.mode === 'surface' ? turnRate(item, item.gripVelocity.x, item.gripVelocity.z) : 0;
      item.yawVelocity = THREE.MathUtils.lerp(item.yawVelocity, desired, 1 - Math.exp(-dt * 12));
      item.yaw += item.yawVelocity * dt;
      waveNormal(position.x, position.z, getTime(), waterNormal);
      waveTilt.setFromUnitVectors(up, waterNormal);
      twist.setFromAxisAngle(up, item.yaw - grip.startYaw).premultiply(waveTilt).multiply(grip.levelRotation);
      rotation.slerp(twist, 1 - Math.exp(-dt * 15));
    } else {
      lever.copy(grip.offset).applyQuaternion(grip.startRotation).normalize();
      twist.setFromUnitVectors(lever, up);
      toHang.copy(grip.startRotation).premultiply(twist);
      twist.copy(grip.startRotation).slerp(toHang, lift * 0.73);
      rotation.slerp(twist, 1 - Math.exp(-dt * 9));
      item.yawVelocity *= Math.exp(-dt * 3);
    }
    lever.copy(grip.offset).applyQuaternion(rotation);
    center.copy(target).sub(lever);
    const side = depth * Math.tan(camera.fov * Math.PI / 360) * camera.aspect;
    const limit = Math.max(0.05, side - item.radius * 0.9);
    center.x = THREE.MathUtils.clamp(center.x, camera.position.x - limit, camera.position.x + limit);
    center.y = afloat ? waveHeight(center.x, center.z, getTime()) + item.floatOffset
      : THREE.MathUtils.clamp(center.y, surface + item.floatOffset - 0.045, surface + maxLift);
    const blend = finish ? 1 : 1 - Math.exp(-dt * 37);
    // Limit travel per physics step so a fast pointer cannot tunnel through a can.
    step.copy(center).sub(position).multiplyScalar(blend).clampLength(0, dt * (5.1 + item.radius * 5.2));
    if (!finish) {
      const velocityBlend = 1 - Math.exp(-dt * 16);
      item.gripVelocity.lerp(center.copy(step).multiplyScalar(1 / dt), velocityBlend);
    }
    position.add(step);
    item.velocityY = THREE.MathUtils.clamp(item.gripVelocity.y, -4.5, 2);
    return true;
  }

  function end(event, cancelled = false) {
    if (!grip || (event?.pointerId != null && event.pointerId !== grip.pointerId)) return;
    if (!cancelled && event) {
      setRay(event);
      trackGesture(event);
      follow(grip.item, 1 / 60, true);
    }
    if (!cancelled && grip.mode === 'surface') {
      const age = (performance.now() - grip.lastMotion) / 1000;
      const fresh = 1 - THREE.MathUtils.smoothstep(age, 0.07, 0.24);
      const releaseTurn = turnRate(grip.item, grip.pointerSpeed, grip.item.gripVelocity.z);
      grip.item.yawVelocity = THREE.MathUtils.lerp(grip.item.yawVelocity, releaseTurn, fresh * 0.65);
    }
    const { item, pointerId } = grip;
    grip = null;
    if (cancelled) item.gripVelocity.set(0, 0, 0);
    onRelease(item, THREE.MathUtils.clamp(item.gripVelocity.x, -2.3, 2.3),
      THREE.MathUtils.clamp(item.gripVelocity.y, -3, 1.8), THREE.MathUtils.clamp(item.gripVelocity.z, -2.3, 2.3));
    item.gripVelocity.set(0, 0, 0);
    if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    canvas.style.cursor = !cancelled && event?.pointerType === 'mouse' && pick() ? 'grab' : '';
  }

  canvas.addEventListener('pointerdown', event => {
    if (!enabled() || grip || !event.isPrimary || event.button !== 0) return;
    setRay(event);
    const hit = pick() ?? (event.pointerType === 'touch' ? pickForTouch() : null);
    if (!hit) {
      onWater(ray);
      return;
    }
    const { item, point } = hit;
    const inverse = item.object.quaternion.clone().invert();
    waveNormal(item.object.position.x, item.object.position.z, getTime(), waterNormal);
    grip = {
      item, pointerId: event.pointerId, startY: point.y, startX: pointer.x,
      mode: item.splash.immersion > 0.55 ? 'pending' : 'lift', startYaw: item.yaw,
      startPixelX: event.clientX, startPixelY: event.clientY, lastPixelX: event.clientX,
      lastMotion: performance.now(), pointerSpeed: 0, slop: event.pointerType === 'touch' ? 7 : 4,
      levelRotation: new THREE.Quaternion().setFromUnitVectors(up, waterNormal).invert().multiply(item.object.quaternion),
      startRotation: item.object.quaternion.clone(),
      offset: point.clone().sub(item.object.position).applyQuaternion(inverse),
      planeZ: point.z, others: roots.filter(root => root !== item.object),
    };
    item.gripVelocity.set(0, 0, 0);
    plane.constant = -point.z;
    if (item.film && item.splash.immersion > 0.55) {
      item.film.localUp.copy(up).applyQuaternion(inverse);
      item.film.level = waveHeight(item.object.position.x, item.object.position.z, getTime()) - item.object.position.y;
      item.film.strength.value = 1;
    }
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = 'grabbing';
    event.preventDefault();
  });
  canvas.addEventListener('pointermove', event => {
    if (!enabled() || !event.isPrimary || (grip && grip.pointerId !== event.pointerId)) return;
    setRay(event);
    if (grip) {
      trackGesture(event);
      const destination = pick(grip.others)?.item ?? (grip.mode === 'lift' ? dropTargetBelow() : null);
      if (destination) grip.planeZ = destination.object.position.z
        + lever.copy(grip.offset).applyQuaternion(grip.item.object.quaternion).z;
    } else if (event.pointerType === 'mouse') {
      canvas.style.cursor = pick() ? 'grab' : '';
    }
  });
  canvas.addEventListener('pointerleave', () => { if (!grip) canvas.style.cursor = ''; });
  canvas.addEventListener('pointerup', event => end(event));
  for (const type of ['pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(type, event => end(event, true));
  }
  const cancel = () => end(null, true);
  window.addEventListener('blur', cancel);
  window.addEventListener('keydown', event => { if (event.key === 'Escape') cancel(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
  return { follow, cancel, addItem, pickPoint, get heldItem() { return grip?.item ?? null; } };
}
