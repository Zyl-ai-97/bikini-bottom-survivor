import * as THREE from './vendor/three.module.js';
import { sampleImpactRipple, waveHeight } from './ocean.js';

const MAX_IMPACTS = 8;
const DROPS_PER_IMPACT = 168;
const JETS_PER_IMPACT = 7;
const JET_SEGMENTS = 15;
const JET_VERTICES = (JET_SEGMENTS + 1) * 2;
const ARCS_PER_IMPACT = 5;
const ARC_COLUMNS = 18;
const ARC_ROWS = 5;
const GRAVITY = 9.81;
const ARC_VERTICES = (ARC_COLUMNS + 1) * (ARC_ROWS + 1);

function randomGenerator(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function dynamicAttribute(count, size) {
  return new THREE.BufferAttribute(new Float32Array(count * size), size).setUsage(THREE.DynamicDrawUsage);
}

// A barrel's waterline has straighter sides and shorter rounded shoulders
// than an ellipse. Starting at that contour keeps the spray out of its hull.
function footprint(angle, event) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const along = Math.sign(cos) * Math.abs(cos) ** 0.59;
  const across = Math.sign(sin) * Math.abs(sin) ** 0.59;
  const sideX = Math.sign(along) * Math.abs(along) ** 2.39 / event.halfLength;
  const sideZ = Math.sign(across) * Math.abs(across) ** 2.39 / event.halfWidth;
  const normal = Math.hypot(sideX, sideZ);
  return {
    x: event.x + along * event.halfLength * event.ax - across * event.halfWidth * event.az,
    z: event.z + along * event.halfLength * event.az + across * event.halfWidth * event.ax,
    nx: (sideX * event.ax - sideZ * event.az) / normal,
    nz: (sideX * event.az + sideZ * event.ax) / normal,
  };
}

function sheetProfile(event, arc, age) {
  const progress = THREE.MathUtils.clamp((age - arc.delay) / arc.duration, 0, 1);
  const rise = Math.sin(Math.PI * progress ** 0.73) ** 1.10;
  const collapse = THREE.MathUtils.smoothstep(progress, 0.39, 0.95);
  const root = Math.max(0, age - arc.delay) * (0.045 + event.punch * 0.29);
  const height = arc.height * rise;
  const lip = height * (0.38 + collapse * 0.89);
  return { progress, collapse, root, height, lip };
}

export function createImpactSpray(environment) {
  const object = new THREE.Group();
  object.name = 'Transient impact water';
  const events = Array.from({ length: MAX_IMPACTS }, () => ({ active: false, start: -Infinity }));
  const displacement = new THREE.Vector3();
  let serial = 0;

  function surfaceAt(event, x, z, time) {
    if (event.ripple) sampleImpactRipple(event.ripple, x, z, time, displacement);
    else displacement.set(0, 0, 0);
    return waveHeight(x, z, time) + displacement.x;
  }

  const dropCount = MAX_IMPACTS * DROPS_PER_IMPACT;
  const positions = dynamicAttribute(dropCount, 3);
  const velocities = dynamicAttribute(dropCount, 3);
  const appearance = dynamicAttribute(dropCount, 3);
  const dropGeometry = new THREE.BufferGeometry();
  dropGeometry.setAttribute('position', positions);
  dropGeometry.setAttribute('aVelocity', velocities);
  dropGeometry.setAttribute('aAppearance', appearance);
  const uPointScale = { value: 1200 };
  const dropMaterial = new THREE.ShaderMaterial({
    uniforms: { ...environment.uniforms, uPointScale },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec3 aVelocity;
      attribute vec3 aAppearance;
      uniform float uPointScale;
      uniform vec3 uSunDirection;
      varying float vOpacity;
      varying float vStretch;
      varying float vLarge;
      varying vec2 vAxis;
      varying vec3 vSun;
      void main() {
        vec4 viewPoint = modelViewMatrix * vec4(position, 1.0);
        vec4 nextPoint = viewPoint + vec4(mat3(modelViewMatrix) * aVelocity * 0.025, 0.0);
        vec4 clip = projectionMatrix * viewPoint;
        vec4 nextClip = projectionMatrix * nextPoint;
        vec2 motion = nextClip.xy / max(nextClip.w, 0.1) - clip.xy / max(clip.w, 0.1);
        motion.x *= projectionMatrix[1][1] / projectionMatrix[0][0];
        vAxis = length(motion) > 0.000001 ? normalize(vec2(motion.x, -motion.y)) : vec2(0.0, 1.0);
        vStretch = aAppearance.z;
        vOpacity = aAppearance.y;
        vLarge = smoothstep(0.010, 0.025, aAppearance.x);
        vSun = normalize(mat3(viewMatrix) * uSunDirection);
        gl_Position = clip;
        gl_PointSize = clamp(2.0 * aAppearance.x * uPointScale * vStretch / max(-viewPoint.z, 0.1), 0.8, 16.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunColor;
      uniform float uSunStrength;
      uniform vec3 uSkyHorizon;
      uniform float uNightMix;
      varying float vOpacity;
      varying float vStretch;
      varying float vLarge;
      varying vec2 vAxis;
      varying vec3 vSun;
      void main() {
        if (vOpacity < 0.002) discard;
        vec2 q = gl_PointCoord - 0.5;
        vec2 across = vec2(-vAxis.y, vAxis.x);
        vec2 p = vec2(dot(q, vAxis), dot(q, across) * vStretch) * 2.0;
        float r2 = dot(p, p);
        float radius = sqrt(r2);
        float edge = 1.0 - smoothstep(0.78, 1.0, radius);
        if (edge < 0.005) discard;
        vec2 facing = p.x * vAxis + p.y * across;
        vec3 normal = vec3(facing.x, -facing.y, sqrt(max(0.0, 1.0 - r2)));
        float rim = pow(1.0 - normal.z, 2.5);
        vec3 halfLight = normalize(vSun + vec3(0.0, 0.0, 1.0));
        float shine = pow(max(dot(normal, halfLight), 0.0), 47.0);
        float paleArc = smoothstep(0.15, 0.82, normal.y) * (0.45 + 0.55 * rim);
        float day = 1.0 - uNightMix;
        vec3 color = mix(vec3(0.056, 0.24, 0.30), uSkyHorizon * 0.78, 0.35 + 0.39 * rim)
          * (0.20 + day * 0.80);
        float pearlShine = vLarge * pow(max(dot(normal, halfLight), 0.0), 10.0) * 0.21;
        color += uSunColor * uSunStrength * (shine * 2.2 + paleArc * 0.68 + pearlShine);
        float alpha = edge * vOpacity * (0.34 + rim * 0.29 + shine * 0.37 + paleArc * 0.24 + vLarge * 0.16);
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const droplets = new THREE.Points(dropGeometry, dropMaterial);
  droplets.name = 'Ballistic impact droplets';
  droplets.frustumCulled = false;
  droplets.renderOrder = 6;
  object.add(droplets);

  const jetCount = MAX_IMPACTS * JETS_PER_IMPACT * JET_VERTICES;
  const jetPositions = dynamicAttribute(jetCount, 3);
  const jetVelocities = dynamicAttribute(jetCount, 3);
  const jetAppearance = dynamicAttribute(jetCount, 4);
  const jetUvs = new THREE.BufferAttribute(new Float32Array(jetCount * 2), 2);
  const jetIndices = [];
  for (let jet = 0; jet < MAX_IMPACTS * JETS_PER_IMPACT; jet += 1) {
    const offset = jet * JET_VERTICES;
    for (let segment = 0; segment <= JET_SEGMENTS; segment += 1) {
      const vertex = offset + segment * 2;
      jetUvs.setXY(vertex, -1, segment / JET_SEGMENTS);
      jetUvs.setXY(vertex + 1, 1, segment / JET_SEGMENTS);
      if (segment < JET_SEGMENTS) jetIndices.push(vertex, vertex + 2, vertex + 1, vertex + 1, vertex + 2, vertex + 3);
    }
  }
  const jetGeometry = new THREE.BufferGeometry();
  jetGeometry.setAttribute('position', jetPositions);
  jetGeometry.setAttribute('aVelocity', jetVelocities);
  jetGeometry.setAttribute('aAppearance', jetAppearance);
  jetGeometry.setAttribute('uv', jetUvs);
  jetGeometry.setIndex(jetIndices);
  const jetMaterial = new THREE.ShaderMaterial({
    uniforms: { ...environment.uniforms },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    vertexShader: /* glsl */ `
      attribute vec3 aVelocity;
      attribute vec4 aAppearance;
      uniform vec3 uSunDirection;
      varying vec2 vUv;
      varying vec3 vEye;
      varying vec3 vSide;
      varying vec3 vHalfLight;
      varying vec3 vWetness;
      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        vEye = normalize(-view.xyz);
        vec3 tangent = normalize(mat3(modelViewMatrix) * (aVelocity + vec3(0.0, 0.0001, 0.0)));
        vec3 transverse = cross(tangent, vEye);
        vSide = length(transverse) > 0.0001 ? normalize(transverse) : vec3(1.0, 0.0, 0.0);
        vHalfLight = normalize(mat3(viewMatrix) * uSunDirection + vEye);
        view.xyz += vSide * (aAppearance.x * uv.x);
        vUv = uv;
        vWetness = aAppearance.yzw;
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunColor;
      uniform vec3 uSkyHorizon;
      uniform float uSunStrength;
      uniform float uNightMix;
      varying vec2 vUv;
      varying vec3 vEye;
      varying vec3 vSide;
      varying vec3 vHalfLight;
      varying vec3 vWetness;
      void main() {
        if (vWetness.x < 0.002) discard;
        float u = abs(vUv.x);
        float edge = 1.0 - smoothstep(0.76, 1.0, u);
        float seed = vWetness.z;
        float breakup = vWetness.y;
        float pieces = 0.50 + sin(vUv.y * 25.4 + seed) * 0.32 + sin(vUv.y * 51.7 - seed * 1.6) * 0.18;
        float torn = smoothstep(0.25 + breakup * 0.16, 0.46 + breakup * 0.20, pieces);
        float continuity = mix(1.0, torn, breakup * (0.54 + 0.46 * smoothstep(0.14, 0.72, vUv.y)));
        vec3 normal = normalize(vSide * vUv.x + vEye * sqrt(max(0.0, 1.0 - u * u)));
        float lobe = pow(max(dot(normal, vHalfLight), 0.0), 35.0);
        float narrowEdge = smoothstep(0.38, 0.76, vUv.x) * (1.0 - smoothstep(0.85, 1.0, vUv.x));
        float thread = 0.50 + 0.50 * sin(vUv.y * 35.8 + seed);
        float light = (lobe * 1.38 + narrowEdge * (0.43 + 0.41 * thread)) * 0.86;
        vec3 tinted = mix(vec3(0.070, 0.28, 0.35), uSkyHorizon * 0.92, 0.52 + 0.18 * u);
        vec3 color = tinted * (1.0 - 0.81 * uNightMix) + uSunColor * uSunStrength * light;
        float alpha = (0.43 + 0.33 * lobe + narrowEdge * 0.20) * edge * continuity * vWetness.x * 0.94;
        gl_FragColor = vec4(color, min(alpha, 0.89));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const jets = new THREE.Mesh(jetGeometry, jetMaterial);
  jets.name = 'Airborne impact liquid jets';
  jets.frustumCulled = false;
  jets.renderOrder = 5;
  object.add(jets);

  const sheetCount = MAX_IMPACTS * ARCS_PER_IMPACT * ARC_VERTICES;
  const sheetPositions = dynamicAttribute(sheetCount, 3);
  const sheetNormals = dynamicAttribute(sheetCount, 3);
  const sheetAppearance = dynamicAttribute(sheetCount, 3);
  const sheetUvs = new THREE.BufferAttribute(new Float32Array(sheetCount * 2), 2);
  const sheetIndices = [];
  for (let arc = 0; arc < MAX_IMPACTS * ARCS_PER_IMPACT; arc += 1) {
    const offset = arc * ARC_VERTICES;
    for (let row = 0; row <= ARC_ROWS; row += 1) {
      for (let column = 0; column <= ARC_COLUMNS; column += 1) {
        sheetUvs.setXY(offset + row * (ARC_COLUMNS + 1) + column, column / ARC_COLUMNS, row / ARC_ROWS);
      }
    }
    for (let row = 0; row < ARC_ROWS; row += 1) {
      for (let column = 0; column < ARC_COLUMNS; column += 1) {
        const a = offset + row * (ARC_COLUMNS + 1) + column;
        const b = a + ARC_COLUMNS + 1;
        sheetIndices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const sheetGeometry = new THREE.BufferGeometry();
  sheetGeometry.setAttribute('position', sheetPositions);
  sheetGeometry.setAttribute('normal', sheetNormals);
  sheetGeometry.setAttribute('uv', sheetUvs);
  sheetGeometry.setAttribute('aAppearance', sheetAppearance);
  sheetGeometry.setIndex(sheetIndices);
  const sheetMaterial = new THREE.ShaderMaterial({
    uniforms: { ...environment.uniforms },
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    forceSinglePass: true,
    vertexShader: /* glsl */ `
      attribute vec3 aAppearance;
      varying vec2 vUv;
      varying vec3 vAppearance;
      varying vec3 vWorldPoint;
      varying vec3 vWorldNormal;
      void main() {
        vUv = uv;
        vAppearance = aAppearance;
        vec4 worldPoint = modelMatrix * vec4(position, 1.0);
        vWorldPoint = worldPoint.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPoint;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDirection;
      uniform vec3 uSunColor;
      uniform float uSunStrength;
      uniform vec3 uSkyHorizon;
      uniform float uNightMix;
      varying vec2 vUv;
      varying vec3 vAppearance;
      varying vec3 vWorldPoint;
      varying vec3 vWorldNormal;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), u.x), u.y);
      }
      void main() {
        if (vAppearance.x < 0.002) discard;
        float seed = vAppearance.y;
        float age = vAppearance.z;
        float thread = noise(vUv * vec2(14.0, 2.3) + vec2(seed, age * 1.9));
        float fine = noise(vUv * vec2(41.0, 9.0) + vec2(seed + 11.7, -age * 3.6));
        float membrane = thread * 0.73 + fine * 0.27;
        float tears = smoothstep(0.25 + age * 0.27, 0.42 + age * 0.24, membrane);
        float holes = mix(1.0, tears, smoothstep(0.24, 0.96, vUv.y));
        float sideFade = smoothstep(0.0, 0.13, vUv.x) * smoothstep(0.0, 0.13, 1.0 - vUv.x);
        vec3 normal = normalize(vWorldNormal + vec3((fine - 0.5) * 0.21,
          (thread - 0.5) * 0.20, (membrane - 0.5) * 0.19));
        vec3 eye = normalize(cameraPosition - vWorldPoint);
        float fresnel = pow(1.0 - abs(dot(normal, eye)), 3.8);
        vec3 reflected = reflect(-eye, normal);
        float glint = pow(max(dot(reflected, uSunDirection), 0.0), 80.0);
        float tip = exp(-pow((1.0 - vUv.y) * 16.0, 2.0)) * smoothstep(0.51, 0.71, membrane);
        float rootFade = smoothstep(0.015, 0.29, vUv.y);
        float daylight = 1.0 - uNightMix * 0.76;
        vec3 transmitted = vec3(0.028, 0.145, 0.18);
        vec3 reflectedSky = mix(uSkyHorizon * 0.56, vec3(0.14, 0.32, 0.40), 0.32);
        vec3 color = mix(transmitted, reflectedSky, 0.28 + 0.63 * fresnel) * daylight;
        color += uSunColor * uSunStrength * (glint * 1.56 + tip * (0.35 + 0.61 * fresnel));
        float alpha = (0.16 + fresnel * 0.31 + glint * 0.23 + tip * 0.28)
          * holes * rootFade * sideFade * vAppearance.x;
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const crown = new THREE.Mesh(sheetGeometry, sheetMaterial);
  crown.name = 'Broken transparent impact curtains';
  crown.frustumCulled = false;
  crown.renderOrder = 4;
  object.add(crown);

  function clearSlot(slot) {
    for (let drop = 0; drop < DROPS_PER_IMPACT; drop += 1) {
      appearance.setXYZ(slot * DROPS_PER_IMPACT + drop, 0, 0, 1);
    }
    const jetStart = slot * JETS_PER_IMPACT * JET_VERTICES;
    for (let vertex = jetStart; vertex < jetStart + JETS_PER_IMPACT * JET_VERTICES; vertex += 1) {
      jetAppearance.setXYZW(vertex, 0, 0, 0, 0);
    }
    const start = slot * ARCS_PER_IMPACT * ARC_VERTICES;
    for (let vertex = start; vertex < start + ARCS_PER_IMPACT * ARC_VERTICES; vertex += 1) {
      sheetAppearance.setXYZ(vertex, 0, 0, 0);
    }
  }

  function emit({ x, z, axisX = 1, axisZ = 0, radius = 0.35, length = 1, strength = 0.5, time = 0, ripple }) {
    if (![x, z, axisX, axisZ, radius, length, strength, time].every(Number.isFinite)) return;
    const power = THREE.MathUtils.clamp(strength, 0, 1);
    if (power <= 0.001) return;
    let slot = events.findIndex(event => !event.active);
    if (slot < 0) {
      slot = events.reduce((oldest, event, index) => event.start < events[oldest].start ? index : oldest, 0);
    }
    clearSlot(slot);
    const random = randomGenerator(++serial * 47017);
    const axisLength = Math.hypot(axisX, axisZ);
    const ax = axisLength > 0.0001 ? axisX / axisLength : 1;
    const az = axisLength > 0.0001 ? axisZ / axisLength : 0;
    const size = THREE.MathUtils.clamp(radius / 0.40, 0.20, 1.30);
    const punch = power ** 0.83 * Math.sqrt(size);
    const halfLength = Math.max(0.04, length * 0.495 + size * 0.012);
    const halfWidth = Math.max(0.025, radius * 1.055 + size * 0.014);
    const event = {
      active: true, start: time, x, z, ax, az, punch, halfLength, halfWidth, ripple,
      duration: 0.88 + punch * 0.56,
      drops: [], jets: [], arcs: [],
    };

    // Broadside curtains lift first. The shorter pieces at the shoulders
    // rise later, leaving irregular openings instead of a continuous ring.
    const broadside = Math.PI * 0.5 * (random() < 0.5 ? -1 : 1);
    const arcAngles = [broadside, broadside + Math.PI, broadside + 0.69,
      broadside + Math.PI - 0.74, broadside - 1.33];
    const arcCount = punch < 0.14 ? 2 : punch < 0.42 ? 3 : ARCS_PER_IMPACT;
    for (let arcIndex = 0; arcIndex < arcCount; arcIndex += 1) {
      const seed = random() * 73;
      const angle = arcAngles[arcIndex] + (random() - 0.5) * 0.29;
      const width = (arcIndex < 2 ? 0.77 : 0.50) * (0.77 + random() * 0.42);
      const weight = (arcIndex === 0 ? 1 : arcIndex === 1 ? 0.84 : 0.55) * (0.82 + random() * 0.26);
      const notch = 0.17 + random() * 0.65;
      const arc = {
        seed, weight,
        height: (0.014 + punch * 0.53) * weight,
        delay: arcIndex * 0.010 + random() * 0.016,
        duration: 0.23 + punch * 0.37 + random() * 0.040,
        columns: [],
      };
      for (let index = 0; index <= ARC_COLUMNS; index += 1) {
        const u = index / ARC_COLUMNS;
        const point = footprint(angle + (u - 0.5) * width, event);
        const taper = Math.sin(u * Math.PI) ** 0.48;
        const tear = 1 - (0.35 + 0.37 * punch) * Math.exp(-(((u - notch) / 0.065) ** 2));
        const fringe = 0.82 + Math.sin(u * 24 + seed) * 0.13 + Math.sin(u * 65 - seed) * 0.05;
        arc.columns.push({ ...point, height: taper * tear * fringe });
      }
      event.arcs.push(arc);

      const fragments = 2 + Math.round(punch * weight * 16);
      for (let bead = 0; bead < fragments; bead += 1) {
        const column = arc.columns[1 + Math.floor(random() * (ARC_COLUMNS - 1))];
        const delay = arc.delay + arc.duration * (0.19 + random() * 0.36);
        const profile = sheetProfile(event, arc, delay);
        const spread = profile.root + profile.lip;
        const bx = column.x + column.nx * spread;
        const bz = column.z + column.nz * spread;
        const speedOut = (0.24 + punch * 1.68) * (0.72 + random() * 0.67);
        const twist = (random() - 0.5) * (0.085 + punch * 0.34);
        event.drops.push({
          x: bx, z: bz,
          y: surfaceAt(event, bx, bz, time + delay) + profile.height * column.height * (1 - profile.collapse * 0.22),
          vx: column.nx * speedOut - column.nz * twist,
          vz: column.nz * speedOut + column.nx * twist,
          vy: (-0.12 + random() * 0.72) * (0.44 + punch),
          delay,
          radius: (0.0030 + random() ** 1.9 * 0.009) * (0.40 + Math.sqrt(size) * 0.83),
          opacity: 0.51 + random() * 0.43,
        });
      }
    }

    // The main impact ejects a few coherent streams. A stream is a short
    // supply of liquid along one ballistic arc, rather than a streak taped
    // to a particle. Released beads sample that same arc before diverging.
    const streams = punch < 0.24 ? 0 : Math.min(JETS_PER_IMPACT, 2 + Math.round(punch * 5));
    const sweep = random() * Math.PI * 2;
    for (let stream = 0; stream < streams; stream += 1) {
      const angle = sweep + stream / streams * Math.PI * 2 + (random() - 0.5) * 0.58;
      const nozzle = footprint(angle, event);
      const delay = 0.019 + random() * 0.054;
      const burst = 0.76 + random() * 0.37;
      const speedOut = (0.63 + punch * 2.38) * (0.72 + random() * 0.58) * 0.86;
      const tangential = (random() - 0.5) * (0.16 + 0.48 * punch);
      const x = nozzle.x + nozzle.nx * 0.018 * size;
      const z = nozzle.z + nozzle.nz * 0.018 * size;
      const plume = {
        x, z, delay,
        y: surfaceAt(event, x, z, time + delay) + 0.014 * size,
        vx: nozzle.nx * speedOut - nozzle.nz * tangential,
        vz: nozzle.nz * speedOut + nozzle.nx * tangential,
        vy: Math.min(3.78, (1.20 + punch * 2.70) * burst * 0.925),
        supply: 0.082 + 0.055 * punch + random() * 0.045,
        radius: (0.011 + punch * 0.026) * (0.58 + random() * 0.65) * Math.sqrt(size),
        seed: 5 + random() * 38,
      };
      event.jets.push(plume);

      const pearls = 3 + Math.round(punch * 3);
      for (let bead = 0; bead < pearls && event.drops.length < DROPS_PER_IMPACT; bead += 1) {
        // Break the leading water into independently visible droplets while
        // they are still in the air. They inherit the stream's velocity at
        // the split and pass its thinning tip rather than growing at its root.
        const traveled = 0.073 + random() * 0.069;
        const launch = delay + traveled + plume.supply * (bead * 0.13 + random() * 0.07);
        const skew = (random() - 0.5) * (0.16 + 0.28 * punch);
        const radial = 0.94 + random() * 0.30;
        const bx = x + plume.vx * traveled + (random() - 0.5) * 0.060 * size;
        const bz = z + plume.vz * traveled + (random() - 0.5) * 0.060 * size;
        const by = plume.y + plume.vy * traveled - 0.5 * GRAVITY * traveled * traveled;
        event.drops.push({
          x: bx, z: bz,
          y: by + (random() - 0.5) * 0.047 * size,
          vx: plume.vx * radial - nozzle.nz * skew,
          vz: plume.vz * radial + nozzle.nx * skew,
          vy: (plume.vy - GRAVITY * traveled) * (0.87 + random() * 0.21),
          delay: launch,
          radius: (bead < 2 ? 0.019 + random() * 0.014 : 0.009 + random() ** 1.35 * 0.015)
            * (0.52 + 0.55 * punch) * Math.sqrt(size),
          opacity: 0.82 + random() * 0.15,
        });
      }
    }

    const jets = 4 + Math.round(punch * 9);
    for (let jet = 0; jet < jets; jet += 1) {
      const angle = jet / jets * Math.PI * 2 + (random() - 0.5) * 0.88;
      const origin = footprint(angle, event);
      const speedOut = (0.13 + punch * 1.64) * (0.55 + random() * 0.91);
      const speedUp = (0.16 + punch * 3.28) * (0.57 + random() * 0.67);
      const tangent = (random() - 0.5) * (0.12 + punch * 0.39);
      const beads = 2 + Math.round(punch * 2.5);
      for (let bead = 0; bead < beads && event.drops.length < DROPS_PER_IMPACT; bead += 1) {
        const delay = random() * 0.037 + bead * 0.009;
        const bx = origin.x + (random() - 0.5) * size * 0.024;
        const bz = origin.z + (random() - 0.5) * size * 0.024;
        event.drops.push({
          x: bx, z: bz,
          y: surfaceAt(event, bx, bz, time + delay) + 0.010,
          vx: origin.nx * speedOut - origin.nz * tangent,
          vz: origin.nz * speedOut + origin.nx * tangent,
          vy: speedUp * (0.80 + random() * 0.38),
          delay,
          radius: (0.0028 + random() ** 1.8 * 0.0108) * (0.36 + punch * 0.62 + size * 0.35),
          opacity: 0.40 + random() * 0.45,
        });
      }
    }
    events[slot] = event;
    object.visible = true;
  }

  function update(time) {
    if (!Number.isFinite(time) || !object.visible) return;
    let active = false;
    for (let slot = 0; slot < MAX_IMPACTS; slot += 1) {
      const event = events[slot];
      if (!event.active) continue;
      const age = time - event.start;
      if (age > event.duration) {
        event.active = false;
        clearSlot(slot);
        continue;
      }
      active = true;
      for (let drop = 0; drop < event.drops.length; drop += 1) {
        const index = slot * DROPS_PER_IMPACT + drop;
        const bead = event.drops[drop];
        const flight = age - bead.delay;
        const elapsed = Math.max(0, flight);
        const x = bead.x + bead.vx * elapsed;
        const z = bead.z + bead.vz * elapsed;
        const y = bead.y + bead.vy * flight - 0.5 * GRAVITY * flight * flight;
        const surface = surfaceAt(event, x, z, time);
        if (flight > 0.025 && y <= surface + bead.radius * 0.40) bead.landed = true;
        const airborne = flight >= 0 && !bead.landed && y > surface + bead.radius * 0.20;
        const fadeIn = THREE.MathUtils.smoothstep(flight, 0, 0.022);
        const fadeOut = THREE.MathUtils.smoothstep(y - surface, 0.002, bead.radius * 1.6 + 0.010);
        const verticalSpeed = bead.vy - GRAVITY * elapsed;
        positions.setXYZ(index, x, Math.max(y, surface), z);
        velocities.setXYZ(index, bead.vx, verticalSpeed, bead.vz);
        const speed = Math.hypot(bead.vx, verticalSpeed, bead.vz);
        const stretch = bead.radius > 0.014 ? Math.min(1.05, speed * 0.27) : Math.min(1.8, speed * 0.40);
        appearance.setXYZ(index, bead.radius, airborne ? bead.opacity * fadeIn * fadeOut : 0, 1 + stretch);
      }

      for (let jet = 0; jet < event.jets.length; jet += 1) {
        const plume = event.jets[jet];
        const elapsed = Math.max(0, age - plume.delay);
        const breakup = THREE.MathUtils.smoothstep(elapsed, 0.084, 0.30);
        const head = elapsed - breakup * (0.014 + event.punch * 0.042);
        const tail = Math.max(0, elapsed - plume.supply);
        const opacity = THREE.MathUtils.smoothstep(elapsed, 0.015, 0.091)
          * (1 - THREE.MathUtils.smoothstep(elapsed, plume.supply + 0.16, plume.supply + 0.36))
          * (0.53 + 0.41 * event.punch);
        const offset = (slot * JETS_PER_IMPACT + jet) * JET_VERTICES;
        for (let segment = 0; segment <= JET_SEGMENTS; segment += 1) {
          const u = segment / JET_SEGMENTS;
          const flight = tail + (head - tail) * u;
          const x = plume.x + plume.vx * flight;
          const z = plume.z + plume.vz * flight;
          const y = plume.y + plume.vy * flight - 0.5 * GRAVITY * flight * flight;
          const vertical = plume.vy - GRAVITY * flight;
          const body = 0.46 + 0.54 * Math.sin(Math.PI * u) ** 0.51;
          const neck = 0.53 + 0.47 * (0.5 + 0.5 * Math.sin(u * 26 + plume.seed)) ** 1.3;
          const taper = 1 - THREE.MathUtils.smoothstep(u, 0.43, 1) * 0.65;
          const radius = plume.radius * body * neck * taper;
          // Most vertices are well above the wave. Only the portions close
          // to the surface need the more detailed impact crest sample.
          let above = y - waveHeight(x, z, time);
          if (above < 0.44 && event.ripple) above = y - surfaceAt(event, x, z, time);
          const emerging = THREE.MathUtils.smoothstep(above, 0.008, 0.075);
          const endpoints = THREE.MathUtils.smoothstep(u, 0, 0.075)
            * (1 - THREE.MathUtils.smoothstep(u, 0.87, 1));
          const point = offset + segment * 2;
          for (let side = 0; side < 2; side += 1) {
            jetPositions.setXYZ(point + side, x, y, z);
            jetVelocities.setXYZ(point + side, plume.vx, vertical, plume.vz);
            jetAppearance.setXYZW(point + side, radius, opacity * emerging * endpoints, breakup, plume.seed);
          }
        }
      }

      for (let arcIndex = 0; arcIndex < event.arcs.length; arcIndex += 1) {
        const arc = event.arcs[arcIndex];
        const profile = sheetProfile(event, arc, age);
        const crownOpacity = THREE.MathUtils.smoothstep(profile.progress, 0, 0.09)
          * (1 - THREE.MathUtils.smoothstep(profile.progress, 0.43, 0.95))
          * (0.31 + 0.57 * event.punch) * (0.73 + 0.27 * arc.weight);
        for (let column = 0; column <= ARC_COLUMNS; column += 1) {
          const point = arc.columns[column];
          const rootX = point.x + point.nx * profile.root;
          const rootZ = point.z + point.nz * profile.root;
          surfaceAt(event, rootX, rootZ, time);
          const rippleHeight = displacement.x;
          const rippleSlope = point.nx * displacement.y + point.nz * displacement.z;
          for (let row = 0; row <= ARC_ROWS; row += 1) {
            const v = row / ARC_ROWS;
            const spread = v ** 2.6 * profile.lip + Math.sin(v * Math.PI) * profile.height * 0.10;
            const x = rootX + point.nx * spread;
            const z = rootZ + point.nz * spread;
            const vertical = profile.height * point.height;
            // Apply the crest at the root and its local incline through the
            // short profile. This keeps the base joined without resampling
            // the same ripple throughout the curtain on every frame.
            const lift = rippleHeight + THREE.MathUtils.clamp(rippleSlope * spread, -0.16, 0.16);
            const y = waveHeight(x, z, time) + lift + 0.004 + vertical * v * (1 - v ** 3 * profile.collapse * 0.22);
            const outwardSlope = 2.6 * v ** 1.6 * profile.lip + Math.PI * Math.cos(v * Math.PI) * profile.height * 0.10;
            const elevationSlope = 0.005 + vertical * (1 - v ** 3 * profile.collapse * 0.88) + outwardSlope * rippleSlope;
            const index = (slot * ARCS_PER_IMPACT + arcIndex) * ARC_VERTICES + row * (ARC_COLUMNS + 1) + column;
            sheetPositions.setXYZ(index, x, y, z);
            sheetNormals.setXYZ(index, point.nx * elevationSlope, -outwardSlope, point.nz * elevationSlope);
            sheetAppearance.setXYZ(index, crownOpacity, arc.seed, profile.progress);
          }
        }
      }
    }
    object.visible = active;
    positions.needsUpdate = true;
    velocities.needsUpdate = true;
    appearance.needsUpdate = true;
    jetPositions.needsUpdate = true;
    jetVelocities.needsUpdate = true;
    jetAppearance.needsUpdate = true;
    sheetPositions.needsUpdate = true;
    sheetNormals.needsUpdate = true;
    sheetAppearance.needsUpdate = true;
  }

  function resize(height, fov) {
    if (Number.isFinite(height) && Number.isFinite(fov) && height > 0 && fov > 0 && fov < 180) {
      uPointScale.value = height / (2 * Math.tan(THREE.MathUtils.degToRad(fov * 0.5)));
    }
  }

  object.visible = false;
  return { object, emit, update, resize };
}
