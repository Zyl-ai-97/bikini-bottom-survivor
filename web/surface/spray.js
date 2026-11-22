import * as THREE from './vendor/three.module.js';
import { waveHeight } from './ocean.js';

function random(value) {
  const hash = Math.sin(value * 91.3458 + 28.531) * 43758.5453;
  return hash - Math.floor(hash);
}

export function createSpray(floats, environment) {
  const droplets = floats.flatMap((item, objectIndex) => {
    const count = item.distance > 12 ? 0 : item.radius > 0.2 ? 52 : 20;
    const clusters = count === 0 ? 0 : item.radius > 0.2 ? 14 : 7;
    return Array.from({ length: count + clusters * 6 }, (_, slot) => {
      const seed = objectIndex * 47 + slot;
      const bubble = slot >= count;
      const cluster = Math.floor((slot - count) / 6) + objectIndex * 31;
      const angle = bubble
        ? Math.PI * 2 * random(cluster + 21.2) + (random(seed + 2.2) - 0.5) * 0.27
        : Math.PI * 2 * random(seed + 2.5);
      const along = Math.cos(angle);
      const across = Math.sin(angle);
      const boundary = Math.max(Math.abs(along), Math.abs(across));
      const edgeX = along / boundary;
      return {
        item, bubble,
        phase: random(seed + 5.1),
        period: 0.96 + random(seed + 2.4) * 1.35,
        edgeX,
        edgeZ: across / boundary * (0.865 + 0.135 * Math.cos(edgeX * Math.PI * 0.5)),
        height: 0.009 + random(seed + 3.6) ** 2 * 0.057,
        radius: 0.005 + random(seed + 4.7) ** 2 * (bubble ? 0.015 : 0.021),
      };
    });
  });
  const positions = new THREE.Float32BufferAttribute(new Float32Array(droplets.length * 3), 3)
    .setUsage(THREE.DynamicDrawUsage);
  const appearance = new THREE.Float32BufferAttribute(new Float32Array(droplets.length * 2), 2)
    .setUsage(THREE.DynamicDrawUsage);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', positions);
  geometry.setAttribute('aRadiusOpacity', appearance);
  geometry.setDrawRange(0, 0);

  const uPointScale = { value: 1 };
  const material = new THREE.ShaderMaterial({
    uniforms: { ...environment.uniforms, uPointScale },
    transparent: true,
    depthWrite: false,
    vertexShader: `
      uniform float uPointScale;
      attribute vec2 aRadiusOpacity;
      varying float vOpacity;
      void main() {
        vec4 viewPoint = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPoint;
        gl_PointSize = clamp(aRadiusOpacity.x * uPointScale / max(-viewPoint.z, 0.1), 1.0, 9.0);
        vOpacity = aRadiusOpacity.y;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDirection;
      uniform vec3 uSunColor;
      uniform float uSunStrength;
      uniform float uNightMix;
      varying float vOpacity;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float shape = 1.0 - smoothstep(0.32, 0.50, length(uv));
        vec2 lightSide = normalize(vec2(uSunDirection.x, -max(0.1, uSunDirection.y)));
        float shine = pow(clamp(1.0 - length(uv - lightSide * 0.17) * 2.3, 0.0, 1.0), 2.4);
        vec3 color = vec3(0.38, 0.60, 0.64) + uSunColor * (0.34 + shine * 2.5) * uSunStrength;
        color *= 1.0 - uNightMix * 0.88;
        gl_FragColor = vec4(color, shape * vOpacity * (0.8 + 0.2 * shine));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 3;

  function update(time) {
    let count = 0;
    for (const { item, phase, period, edgeX, edgeZ, height, radius, bubble } of droplets) {
      const contact = item.splash;
      if (contact.immersion <= 0) continue;
      const clock = time / period + phase;
      const age = (clock - Math.floor(clock)) * (bubble ? 1 : 2.55);
      const airborne = 4 * age * (1 - age);
      if (airborne <= 0) continue;
      const outerX = edgeX * (contact.halfLength + 0.012 + age * 0.085);
      const outerZ = edgeZ * (contact.halfWidth + 0.020 + age * 0.096);
      const x = contact.x + outerX * contact.axisX - outerZ * contact.axisZ;
      const z = contact.z + outerX * contact.axisZ + outerZ * contact.axisX;
      const y = waveHeight(x, z, time) + 0.013 + airborne * (bubble ? 0.004 : height);
      positions.setXYZ(count, x, y, z);
      appearance.setXY(count, radius * (1 - age * 0.35),
        contact.immersion * airborne * Math.min(0.93, 0.25 + contact.strength * 1.45));
      count++;
    }
    geometry.setDrawRange(0, count);
    if (!count) return;
    for (const attribute of [positions, appearance]) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, count * attribute.itemSize);
      attribute.needsUpdate = true;
    }
  }

  function warmupPose(draw) {
    const count = geometry.drawRange.count;
    // Submit the initial transparent point so the first visible spray uses an
    // already linked program and initialized vertex buffers.
    if (droplets.length && !count) geometry.setDrawRange(0, 1);
    try {
      draw();
    } finally {
      geometry.setDrawRange(0, count);
    }
  }

  function resize(height, fieldOfView) {
    uPointScale.value = height / (2 * Math.tan(THREE.MathUtils.degToRad(fieldOfView / 2)));
  }

  return { points, update, resize, warmupPose };
}
