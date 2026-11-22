import * as THREE from './vendor/three.module.js';
import { windWaveGLSL } from './wind-waves.js';
import { islandShadowFunctions } from './island.js';

// These coefficients are shared by the CPU sampler and the rendered surface.
const WAVES = [
  [0.092, 0.43, 0.15, 0.95, 1.4],
  [0.057, -0.37, 0.62, 1.34, 2.1],
  [0.034, 0.85, 0.36, 1.8, 4.0],
  [0.019, -1.35, 0.94, 2.35, 0.7],
  [0.011, 2.1, 1.68, 3.15, 1.8],
  [0.011, 6.2, 2.8, 3.4, 0.6],
  [0.007, -5.4, 9.6, 4.7, 2.3],
];

const MAX_FLOATS = 12;
const MAX_RIPPLES = 8;

// Surface buoyancy and each splash curtain sample this in the same frame.
// The intermediate packet data is private to these synchronous samplers.
const sampledSettings = { radius: 0, strength: 0, speed: 0 };
const leadingPacket = new THREE.Vector2();
const trailingPacket = new THREE.Vector2();

function impactRippleParameters(ripple) {
  sampledSettings.radius = Number.isFinite(ripple.impactRadius)
    ? THREE.MathUtils.clamp(ripple.impactRadius, 0, 2) : 0;
  sampledSettings.strength = Number.isFinite(ripple.strength)
    ? THREE.MathUtils.clamp(ripple.strength, 0, 2.4) : 1;
  sampledSettings.speed = Number.isFinite(ripple.speed)
    ? THREE.MathUtils.clamp(ripple.speed, 1.15, 2.1)
    : THREE.MathUtils.clamp(1.15 + Math.sqrt(sampledSettings.strength) * 0.55, 1.15, 2.1);
  return sampledSettings;
}

function impactPacket(radius, age, settings, target) {
  if (age < 0 || age > 5) return target.set(0, 0);
  const crestRadius = settings.radius + settings.speed * age;
  const width = 0.12 + settings.radius * 0.32 + Math.sqrt(settings.strength) * 0.035 + age * 0.055;
  const profile = (radius - crestRadius) / width;
  if (Math.abs(profile) > 4) return target.set(0, 0);
  const amplitude = 0.185 * settings.strength
    * THREE.MathUtils.smoothstep(age, 0, 0.12)
    * (1 - THREE.MathUtils.smoothstep(age, 3.8, 5))
    * Math.exp(-age * 0.34) * Math.sqrt((settings.radius + 0.15) / (crestRadius + 0.15));
  const gaussian = Math.exp(-0.5 * profile * profile);
  return target.set(amplitude * (1 - profile * profile) * gaussian,
    amplitude * (profile * profile * profile - 3 * profile) * gaussian / width);
}

// A broadside barrel displaces a strip of water. The shortest distance to
// that strip gives an elongated first crest and almost round distant swells.
function distanceFromKeel(ripple, x, z, target) {
  const dx = x - ripple.x, dz = z - ripple.z;
  const hx = ripple.keelX ?? 0, hz = ripple.keelZ ?? 0;
  const along = THREE.MathUtils.clamp((dx * hx + dz * hz) / Math.max(hx * hx + hz * hz, 0.000001), -1, 1);
  target.set(dx - hx * along, dz - hz * along);
  return target.length();
}
const keelOffset = new THREE.Vector2();

// target.x is height, target.y is d(height)/dx, and target.z is d(height)/dz.
export function sampleImpactRipple(ripple, x, z, time, target = new THREE.Vector3()) {
  const settings = impactRippleParameters(ripple);
  if (settings.radius <= 0) return target.set(0, 0, 0);
  const offsetX = x - ripple.x;
  const offsetZ = z - ripple.z;
  const radius = distanceFromKeel(ripple, x, z, keelOffset);
  const age = time - ripple.time;
  const primary = impactPacket(radius, age, settings, leadingPacket);
  const secondary = impactPacket(radius, age - 0.32, settings, trailingPacket);
  const height = primary.x + secondary.x * 0.46;
  const radialSlope = primary.y + secondary.y * 0.46;
  if (Math.abs(height) + Math.abs(radialSlope) < 0.00001) return target.set(0, 0, 0);
  const angle = Math.atan2(offsetZ + 0.000001, offsetX + 0.000001);
  const phase = ripple.x * 1.73 + ripple.z * 2.41;
  const angularShape = 1 + 0.08 * Math.sin(angle * 3 + phase)
    + 0.045 * Math.cos(angle * 5 - phase);
  const angularSlope = 0.24 * Math.cos(angle * 3 + phase)
    - 0.225 * Math.sin(angle * 5 - phase);
  const safeRadius = Math.max(radius, 0.05);
  const radialX = keelOffset.x / safeRadius;
  const radialZ = keelOffset.y / safeRadius;
  const centerDistanceSq = Math.max(offsetX * offsetX + offsetZ * offsetZ, 0.0025);
  return target.set(height * angularShape,
    radialSlope * angularShape * radialX - height * angularSlope * offsetZ / centerDistanceSq,
    radialSlope * angularShape * radialZ + height * angularSlope * offsetX / centerDistanceSq);
}

export function impactRippleArrivalTime(ripple, x, z, secondary = false) {
  const settings = impactRippleParameters(ripple);
  if (settings.radius <= 0) return Infinity;
  return ripple.time + Math.max(0, distanceFromKeel(ripple, x, z, keelOffset) - settings.radius)
    / settings.speed + (secondary ? 0.32 : 0);
}

export function waveHeight(x, z, time) {
  let height = 0;
  for (const [amplitude, kx, kz, speed, phase] of WAVES) {
    height += amplitude * Math.sin(kx * x + kz * z - speed * time + phase);
  }
  const phase = 0.43 * x + 0.15 * z - 0.95 * time + 1.4;
  const modulation = Math.sin(0.19 * x - 0.23 * z - 0.16 * time + 0.7);
  height += 0.013 * (0.45 + 0.55 * modulation * modulation)
    * Math.sin(phase * 2 + 0.65);
  return height;
}

export function waveNormal(x, z, time, target = new THREE.Vector3()) {
  let dx = 0;
  let dz = 0;
  for (const [amplitude, kx, kz, speed, phase] of WAVES) {
    const slope = amplitude * Math.cos(kx * x + kz * z - speed * time + phase);
    dx += slope * kx;
    dz += slope * kz;
  }
  const phase = 0.43 * x + 0.15 * z - 0.95 * time + 1.4;
  const modulationPhase = 0.19 * x - 0.23 * z - 0.16 * time + 0.7;
  const modulation = Math.sin(modulationPhase);
  const envelope = 0.45 + 0.55 * modulation * modulation;
  const envelopeDerivative = 1.1 * modulation * Math.cos(modulationPhase);
  const harmonic = Math.sin(phase * 2 + 0.65);
  const harmonicDerivative = Math.cos(phase * 2 + 0.65);
  dx += 0.013 * (envelopeDerivative * 0.19 * harmonic
    + envelope * 0.86 * harmonicDerivative);
  dz += 0.013 * (envelopeDerivative * -0.23 * harmonic
    + envelope * 0.30 * harmonicDerivative);
  return target.set(-dx, 1, -dz).normalize();
}

export const waveFunctions = `
  const vec2 farSwellDirection = vec2(0.15, 0.041);
  const vec2 crossingSwellDirection = vec2(-0.061, 0.086);

  vec4 waveBands(float distanceToCamera) {
    return 1.0 - smoothstep(vec4(100.0, 38.0, 23.0, 13.0),
      vec4(285.0, 110.0, 67.0, 36.0), vec4(distanceToCamera));
  }

  float farSwellWeight(float distanceToCamera) {
    return smoothstep(29.0, 93.0, distanceToCamera)
      * (1.0 - smoothstep(190.0, 490.0, distanceToCamera));
  }

  float crestHarmonic(vec2 p, float t) {
    float phase = dot(p, vec2(0.43, 0.15)) - t * 0.95 + 1.4;
    float modulation = sin(dot(p, vec2(0.19, -0.23)) - t * 0.16 + 0.7);
    return 0.013 * (0.45 + 0.55 * modulation * modulation)
      * sin(phase * 2.0 + 0.65);
  }

  vec2 crestHarmonicSlope(vec2 p, float t) {
    float phase = dot(p, vec2(0.43, 0.15)) - t * 0.95 + 1.4;
    float modulationPhase = dot(p, vec2(0.19, -0.23)) - t * 0.16 + 0.7;
    float modulation = sin(modulationPhase);
    float envelope = 0.45 + 0.55 * modulation * modulation;
    float envelopeDerivative = 1.1 * modulation * cos(modulationPhase);
    return 0.013 * (envelopeDerivative * vec2(0.19, -0.23)
      * sin(phase * 2.0 + 0.65) + envelope * vec2(0.86, 0.30)
      * cos(phase * 2.0 + 0.65));
  }

  float surfaceHeightAtDistance(vec2 p, float t, float distanceToCamera) {
    vec4 bands = waveBands(distanceToCamera);
    return bands.x * 0.092 * sin(dot(p, vec2(0.43, 0.15)) - t * 0.95 + 1.4)
      + bands.y * (0.057 * sin(dot(p, vec2(-0.37, 0.62)) - t * 1.34 + 2.1)
        + 0.034 * sin(dot(p, vec2(0.85, 0.36)) - t * 1.8 + 4.0)
        + crestHarmonic(p, t))
      + bands.z * (0.019 * sin(dot(p, vec2(-1.35, 0.94)) - t * 2.35 + 0.7)
        + 0.011 * sin(dot(p, vec2(2.1, 1.68)) - t * 3.15 + 1.8))
      + bands.w * (0.011 * sin(dot(p, vec2(6.2, 2.8)) - t * 3.4 + 0.6)
        + 0.007 * sin(dot(p, vec2(-5.4, 9.6)) - t * 4.7 + 2.3))
      + farSwellWeight(distanceToCamera)
        * (0.137 * sin(dot(p, farSwellDirection) - t * 0.57 + 0.3)
        + 0.086 * sin(dot(p, crossingSwellDirection) - t * 0.40 + 2.5));
  }

  float surfaceHeight(vec2 p, float t) {
    return surfaceHeightAtDistance(p, t, 0.0);
  }
`;

const impactWaveFunctions = /* glsl */ `
  vec2 impactWavePacket(float radius, float age, float impactRadius,
    float speed, float strength) {
    if (age < 0.0 || age > 5.0) return vec2(0.0);
    float crestRadius = impactRadius + speed * age;
    float width = 0.12 + impactRadius * 0.32 + sqrt(strength) * 0.035 + age * 0.055;
    float profile = (radius - crestRadius) / width;
    if (abs(profile) > 4.0) return vec2(0.0);
    float amplitude = 0.185 * strength * smoothstep(0.0, 0.12, age)
      * (1.0 - smoothstep(3.8, 5.0, age)) * exp(-age * 0.34)
      * sqrt((impactRadius + 0.15) / (crestRadius + 0.15));
    float gaussian = exp(-0.5 * profile * profile);
    return amplitude * gaussian * vec2(1.0 - profile * profile,
      (profile * profile * profile - 3.0 * profile) / width);
  }

  vec3 impactRippleSurface(vec2 p, float time, vec4 rippleEvent, vec4 settings) {
    vec2 offset = p - rippleEvent.xy;
    vec2 keel = settings.zw;
    vec2 keelOffset = offset - keel * clamp(dot(offset, keel) / max(dot(keel, keel), 0.000001), -1.0, 1.0);
    float radius = length(keelOffset);
    float age = time - rippleEvent.z;
    vec2 packet = impactWavePacket(radius, age, settings.x, settings.y, rippleEvent.w)
      + 0.46 * impactWavePacket(radius, age - 0.32, settings.x, settings.y, rippleEvent.w);
    if (abs(packet.x) + abs(packet.y) < 0.00001) return vec3(0.0);
    float angle = atan(offset.y + 0.000001, offset.x + 0.000001);
    float phase = dot(rippleEvent.xy, vec2(1.73, 2.41));
    float angularShape = 1.0 + 0.08 * sin(angle * 3.0 + phase)
      + 0.045 * cos(angle * 5.0 - phase);
    float angularSlope = 0.24 * cos(angle * 3.0 + phase)
      - 0.225 * sin(angle * 5.0 - phase);
    float safeRadius = max(radius, 0.05);
    vec2 radial = keelOffset / safeRadius;
    vec2 slope = packet.y * angularShape * radial
      + packet.x * angularSlope * vec2(-offset.y, offset.x) / max(dot(offset, offset), 0.0025);
    return vec3(packet.x * angularShape, slope);
  }
`;

const vertexShader = `
  uniform float uTime;
  uniform mat4 uReflectionMatrix;
  uniform int uRippleCount;
  uniform vec4 uRipples[${MAX_RIPPLES}];
  uniform vec4 uRippleImpact[${MAX_RIPPLES}];

  varying vec3 vWorldPosition;
  varying vec4 vReflectionPosition;
  varying float vImpactHeight;
  varying vec2 vOrbitalMotion;

  ${waveFunctions}
  ${impactWaveFunctions}

  void main() {
    // Mesh X is a fraction of the visible row; Z is distance in front of the camera.
    // The margin includes camera yaw, pitch and the displaced edges of the surface.
    float rowWidth = position.z * (1.08 / projectionMatrix[0][0] + 0.018) + 0.32;
    vec3 displaced = vec3(cameraPosition.x + position.x * rowWidth, 0.0,
      cameraPosition.z - position.z);
    float distanceToCamera = length(cameraPosition.xz - displaced.xz);
    displaced.y = surfaceHeightAtDistance(displaced.xz, uTime, distanceToCamera);
    vOrbitalMotion = vec2(0.085, 0.030)
      * cos(dot(displaced.xz, vec2(0.43, 0.15)) - uTime * 0.95 + 1.4)
      + vec2(-0.029, 0.049)
      * cos(dot(displaced.xz, vec2(-0.37, 0.62)) - uTime * 1.34 + 2.1);
    vImpactHeight = 0.0;
    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      if (i >= uRippleCount) break;
      if (uRippleImpact[i].x <= 0.0) continue;
      vImpactHeight += impactRippleSurface(displaced.xz, uTime,
        uRipples[i], uRippleImpact[i]).x;
    }
    displaced.y += vImpactHeight;
    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
    vWorldPosition = worldPosition.xyz;
    vReflectionPosition = uReflectionMatrix * vec4(worldPosition.x, 0.0, worldPosition.z, 1.0);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = `
  precision highp float;

  uniform float uTime;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform float uSunStrength;
  uniform vec3 uSkyZenith;
  uniform vec3 uSkyHorizon;
  uniform float uNightMix;
  uniform sampler2D uReflectionMap;
  uniform sampler2D uTransmissionMap;
  uniform sampler2D uTransmissionDepth;
  uniform vec2 uTransmissionTexelSize;
  uniform mat4 uTransmissionInvProjection;
  uniform mat4 uTransmissionCameraWorld;
  uniform mat4 uTransmissionViewProjection;
  uniform float uTransmissionEnabled;
  uniform int uFloatCount;
  uniform vec4 uFloats[${MAX_FLOATS}];
  uniform vec4 uFloatAxis[${MAX_FLOATS}];
  uniform int uRippleCount;
  uniform vec4 uRipples[${MAX_RIPPLES}];
  uniform vec4 uRippleImpact[${MAX_RIPPLES}];

  varying vec3 vWorldPosition;
  varying vec4 vReflectionPosition;
  varying float vImpactHeight;
  varying vec2 vOrbitalMotion;

  ${waveFunctions}
  ${impactWaveFunctions}

  ${islandShadowFunctions}

  float waveResolution(vec2 k, vec2 pixelX, vec2 pixelY) {
    float phaseChange = length(vec2(dot(k, pixelX), dot(k, pixelY)));
    return 1.0 - smoothstep(0.62, 2.4, phaseChange);
  }

  vec2 waveSlope(vec2 p, vec2 k, float phaseShift, float amplitude,
      vec2 pixelX, vec2 pixelY) {
    return amplitude * k * cos(dot(p, k) + phaseShift) * waveResolution(k, pixelX, pixelY);
  }

  vec2 surfaceSlope(vec2 p, float t, float distanceToCamera, vec2 pixelX, vec2 pixelY) {
    vec4 bands = waveBands(distanceToCamera);
    vec2 swell = waveSlope(p, vec2(0.43, 0.15), 1.4 - t * 0.95, 0.092, pixelX, pixelY);
    vec2 crossing = waveSlope(p, vec2(-0.37, 0.62), 2.1 - t * 1.34, 0.057, pixelX, pixelY)
      + waveSlope(p, vec2(0.85, 0.36), 4.0 - t * 1.8, 0.034, pixelX, pixelY)
      + crestHarmonicSlope(p, t) * waveResolution(vec2(0.86, 0.30), pixelX, pixelY);
    vec2 medium = waveSlope(p, vec2(-1.35, 0.94), 0.7 - t * 2.35, 0.019, pixelX, pixelY)
      + waveSlope(p, vec2(2.1, 1.68), 1.8 - t * 3.15, 0.011, pixelX, pixelY);
    vec2 shortWaves = waveSlope(p, vec2(6.2, 2.8), 0.6 - t * 3.4, 0.011, pixelX, pixelY)
      + waveSlope(p, vec2(-5.4, 9.6), 2.3 - t * 4.7, 0.007, pixelX, pixelY);
    vec2 farSwells = waveSlope(p, farSwellDirection, 0.3 - t * 0.57, 0.137, pixelX, pixelY)
      + waveSlope(p, crossingSwellDirection, 2.5 - t * 0.40, 0.086, pixelX, pixelY);
    return swell * bands.x + crossing * bands.y + medium * bands.z
      + shortWaves * bands.w + farSwells * farSwellWeight(distanceToCamera);
  }

  float noiseResolution(float cellFootprint) {
    return 1.0 - smoothstep(0.42, 1.35, cellFootprint);
  }

  vec3 skyReflection(vec3 direction) {
    float altitude = pow(clamp(direction.y, 0.0, 1.0), 0.48);
    return mix(uSkyHorizon, uSkyZenith, altitude);
  }

  float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec3 noiseDerivative(vec2 p) {
    vec2 cell = floor(p);
    vec2 fraction = fract(p);
    vec2 blend = fraction * fraction * fraction * (fraction * (fraction * 6.0 - 15.0) + 10.0);
    vec2 edge = fraction * (1.0 - fraction);
    vec2 derivative = 30.0 * edge * edge;
    float a = hash21(cell);
    float b = hash21(cell + vec2(1.0, 0.0));
    float c = hash21(cell + vec2(0.0, 1.0));
    float d = hash21(cell + vec2(1.0, 1.0));
    return vec3(
      mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y),
      derivative.x * mix(b - a, d - c, blend.y),
      derivative.y * mix(c - a, d - b, blend.x)
    );
  }

  ${windWaveGLSL}

  vec2 missingWaveVariance(vec2 k, float amplitude, float band,
    vec2 wind, vec2 pixelX, vec2 pixelY) {
    float unresolved = 1.0 - band * waveResolution(k, pixelX, pixelY);
    vec2 gradient = amplitude * k;
    vec2 axisSlope = vec2(dot(gradient, wind),
      dot(gradient, vec2(-wind.y, wind.x)));
    return 0.5 * axisSlope * axisSlope * unresolved * unresolved;
  }

  // An elliptical slope distribution retains the light carried by capillary
  // waves as their individual normals become smaller than a pixel. This is a
  // compact approximation to the geometry/normal/BRDF transition in BNH 2010.
  vec2 filteredSlopeVariance(float distanceToCamera, vec2 pixelX, vec2 pixelY,
    vec2 windVariance) {
    vec2 wind = normalize(vec2(0.86, 0.30));
    vec4 bands = waveBands(distanceToCamera);
    vec2 variance = vec2(0.0015, 0.0010)
      + vec2(dot(wind * wind, windVariance), dot(wind.yx * wind.yx, windVariance));
    variance += missingWaveVariance(vec2(6.2, 2.8), 0.011,
      bands.w, wind, pixelX, pixelY);
    variance += missingWaveVariance(vec2(-5.4, 9.6), 0.007,
      bands.w, wind, pixelX, pixelY);
    return clamp(variance * 0.30, vec2(0.00024), vec2(0.0078));
  }

  float sunFacetReflection(vec3 viewDirection, vec3 normal, vec2 slope,
    vec2 variance) {
    vec3 lightDirection = normalize(uSunDirection);
    vec3 halfVector = normalize(viewDirection + lightDirection);
    vec2 wind = normalize(vec2(0.86, 0.30));
    vec3 tangent = normalize(vec3(wind.x, dot(slope, wind), wind.y));
    vec3 bitangent = normalize(cross(normal, tangent));
    float normalHalf = max(dot(normal, halfVector), 0.001);
    vec2 halfSlope = vec2(dot(halfVector, tangent),
      dot(halfVector, bitangent)) / normalHalf;
    vec2 slopeDx = dFdx(halfSlope);
    vec2 slopeDy = dFdy(halfSlope);
    variance += 0.12 * (slopeDx * slopeDx + slopeDy * slopeDy);
    float slopeDistance = dot(halfSlope * halfSlope, 1.0 / variance);
    if (slopeDistance > 16.0) return 0.0;
    float slopeDensity = exp(-0.5 * slopeDistance - 0.055 * slopeDistance * slopeDistance)
      / (6.2831853 * sqrt(variance.x * variance.y));
    float distribution = slopeDensity / pow(normalHalf, 4.0);
    float viewCosine = max(dot(normal, viewDirection), 0.035);
    float lightCosine = max(dot(normal, lightDirection), 0.001);
    float meanVariance = (variance.x + variance.y) * 0.5;
    float viewMask = 2.0 / (1.0 + sqrt(1.0 + 2.0 * meanVariance
      * (1.0 - viewCosine * viewCosine) / (viewCosine * viewCosine)));
    float lightMask = 2.0 / (1.0 + sqrt(1.0 + 2.0 * meanVariance
      * (1.0 - lightCosine * lightCosine) / (lightCosine * lightCosine)));
    float fresnel = 0.0204 + 0.9796 * pow(1.0
      - max(dot(viewDirection, halfVector), 0.0), 5.0);
    return fresnel * distribution * viewMask * lightMask
      / (4.0 * viewCosine) * step(0.0, dot(normal, lightDirection));
  }

  // All samples are on the same camera ray as their depth-buffer texel.
  // Clip W is its axial distance, so a scalar comparison replaces a world
  // unprojection and two vector lengths at every march and refinement step.
  float underwaterDepthGap(vec4 projected, float rayY, out vec2 sampleUv) {
    sampleUv = projected.xy / projected.w * 0.5 + 0.5;
    if (projected.w <= 0.0 || min(sampleUv.x, sampleUv.y) < 0.001
      || max(sampleUv.x, sampleUv.y) > 0.999) return -10000.0;
    float depth = texture2D(uTransmissionDepth,
      clamp(sampleUv, uTransmissionTexelSize, 1.0 - uTransmissionTexelSize)).r;
    if (depth >= 0.999995) return -10000.0;
    float sceneW = 1.0 / (uTransmissionInvProjection[2][3] * (depth * 2.0 - 1.0)
      + uTransmissionInvProjection[3][3]);
    float eyeY = uTransmissionCameraWorld[3].y;
    float sceneY = eyeY + (rayY - eyeY) * sceneW / projected.w;
    return sceneY < vWorldPosition.y + 0.025 ? projected.w - sceneW : -10000.0;
  }

  vec3 underwaterRadiance(vec3 viewDirection, vec3 normal, vec3 baseWater,
    float daylight, float distanceToCamera, bool nearFloat, out float reefWindow) {
    reefWindow = 0.0;
    float viewCosine = clamp(dot(normal, viewDirection), 0.0, 1.0);
    float clearFacet = smoothstep(0.11, 0.51, viewCosine);
    vec3 waterRay = refract(-viewDirection, normal, 0.7501875);
    vec3 origin = vWorldPosition + waterRay * 0.018;
    vec3 volumePoint = origin + waterRay * 2.4;
    float volumeNoise = noiseDerivative(volumePoint.xz * 0.33
      + vec2(volumePoint.y * 0.09, uTime * 0.018)).x;
    vec3 volume = baseWater * (0.94 + volumeNoise * 0.24);
    vec3 nearLightPoint = origin + waterRay * (1.25 / max(-waterRay.y, 0.22));
    float volumeVisibility = 1.0 - smoothstep(16.0, 55.0, distanceToCamera);
    float ribbonVisibility = 1.0 - smoothstep(7.0, 26.0, distanceToCamera);
    float sunFacing = max(dot(normal, normalize(uSunDirection)), 0.0);
    float litRibbonSlope = 0.48 + 0.52 * smoothstep(0.28, 0.69, sunFacing);
    float ribbonWindow = ribbonVisibility * litRibbonSlope * 0.78;
    float nearSunFocus = sampleWindCaustic(nearLightPoint.xz, uTime);
    #ifdef OCEAN_FAST_OPTICS
      // Retain the moving near caustic with one sample through the water.
      volume += vec3(0.095, 0.30, 0.13) * nearSunFocus
        * ribbonWindow * uSunStrength * (1.0 - uNightMix);
    #else
    vec3 farVolumePoint = origin + waterRay * 7.0;
    float deepNoise = noiseDerivative(farVolumePoint.xz * 0.14
      + vec2(-uTime * 0.011, farVolumePoint.y * 0.07)).x;
    float lightBand = sin(dot(volumePoint, vec3(1.7, 0.63, 0.72))
      - uTime * 0.42 + sin(volumePoint.z * 1.16 + uTime * 0.25));
    lightBand = pow(max(lightBand, 0.0), 10.0);
    vec3 deepGradient = vec3(0.002, 0.018, 0.029) * daylight;
    volume += deepGradient * (deepNoise * 0.13);
    volume += vec3(0.001, 0.009, 0.013) * lightBand
      * uSunStrength * (1.0 - uNightMix);
    vec3 lowerLightPoint = origin + waterRay * (2.65 / max(-waterRay.y, 0.22));
    float nearWarp = noiseDerivative(nearLightPoint.xz * 0.53
      + vec2(uTime * 0.035, nearLightPoint.y * 0.18)).x;
    float nearRibbonField = sin(dot(nearLightPoint, vec3(1.46, 0.72, 0.58))
      + nearWarp * 3.7 - uTime * 0.31)
      + 0.43 * sin(dot(nearLightPoint, vec3(-0.71, 0.32, 1.89)) + uTime * 0.23);
    float nearWidth = max(0.105, fwidth(nearRibbonField) * 1.25);
    float ribbonDistance = nearRibbonField / nearWidth;
    float nearRibbon = exp(-ribbonDistance * ribbonDistance);
    float lowerSunFocus = sampleWindCaustic(lowerLightPoint.xz, uTime);
    volume += vec3(0.011, 0.148, 0.119)
      * (nearRibbon * 0.24 + lowerSunFocus * 0.35)
      * ribbonWindow * uSunStrength * (1.0 - uNightMix);
    volume += vec3(0.093, 0.28, 0.112) * nearSunFocus
      * ribbonWindow * uSunStrength * (1.0 - uNightMix);
    #endif
    float transmittedSun = sunFacing * (0.46 + 0.54 * volumeNoise) * volumeVisibility;
    volume += vec3(0.0025, 0.031, 0.022) * transmittedSun
      * uSunStrength * (1.0 - uNightMix);

    // The reef has already blended completely into scattering offshore. A
    // submerged hull can still be visible at that distance after being dragged.
    if (distanceToCamera > 25.0 && !nearFloat) return volume;

    // March the bent ray against the actual underlay depth, then refine the
    // first crossing. The underlay has its own overscanned view projection.
    vec4 clipStart = uTransmissionViewProjection * vec4(origin, 1.0);
    vec4 clipRay = uTransmissionViewProjection * vec4(waterRay, 0.0);
    float travel = nearFloat ? 0.12 : 0.56;
    float lower = 0.0;
    float upper = 0.0;
    float lowerGap = -10000.0;
    float upperGap = 0.0;
    vec2 hitUv = vec2(0.5);
    bool hit = false;
    #ifdef OCEAN_FAST_OPTICS
      const int marchSteps = 5;
      const int refineSteps = 2;
      const float marchGrowth = 2.55;
    #else
      const int marchSteps = 7;
      const int refineSteps = 4;
      const float marchGrowth = 2.15;
    #endif
    for (int stepIndex = 0; stepIndex < marchSteps; stepIndex++) {
      vec2 sampleUv;
      float gap = underwaterDepthGap(clipStart + clipRay * travel,
        origin.y + waterRay.y * travel, sampleUv);
      if (gap >= -0.001) {
        upper = travel;
        upperGap = gap;
        hitUv = sampleUv;
        hit = true;
        break;
      }
      lower = travel;
      lowerGap = gap;
      travel *= marchGrowth;
    }
    if (!hit) return volume;

    // The crossing moves continuously across a sloping reef. Interpolating
    // axial depth also eliminates the visible stepping of a fixed binary grid.
    for (int refineIndex = 0; refineIndex < refineSteps; refineIndex++) {
      if (upperGap < 0.002) break;
      float fraction = lowerGap < -9999.0 ? 0.5
        : clamp(-lowerGap / (upperGap - lowerGap), 0.12, 0.88);
      float midpoint = mix(lower, upper, fraction);
      vec2 sampleUv;
      float gap = underwaterDepthGap(clipStart + clipRay * midpoint,
        origin.y + waterRay.y * midpoint, sampleUv);
      if (gap >= -0.001) {
        upper = midpoint;
        upperGap = gap;
        hitUv = sampleUv;
      } else {
        lower = midpoint;
        lowerGap = gap;
      }
    }
    float pathLength = upper;
    float depthBelowSurface = max(0.0, -waterRay.y * pathLength);
    #ifdef OCEAN_FAST_OPTICS
      vec4 submergedColor = texture2D(uTransmissionMap, hitUv);
    #else
    // A wave face tilted toward the eye resolves the reef more clearly.
    // Grazing faces retain a little refractive spread beneath their sky film.
    vec2 depthBlur = uTransmissionTexelSize
      * (0.36 + 0.32 * min(depthBelowSurface, 5.0))
      * mix(1.65, 0.72, clearFacet);
    vec4 submergedColor = texture2D(uTransmissionMap, hitUv) * 0.60;
    submergedColor += texture2D(uTransmissionMap, hitUv + depthBlur) * 0.20;
    submergedColor += texture2D(uTransmissionMap, hitUv - depthBlur) * 0.20;
    #endif
    vec3 sourceRadiance = submergedColor.rgb
      + volume * (1.0 - submergedColor.a);
    vec3 transmittance = exp(-vec3(0.16, 0.055, 0.026) * pathLength);
    vec3 scattering = vec3(0.009, 0.047, 0.053) * daylight;
    vec3 attenuated = sourceRadiance * transmittance
      + scattering * (1.0 - transmittance);
    attenuated += sourceRadiance * vec3(0.39, 0.20, 0.09)
      * exp(-pathLength * 3.2) * daylight;
    float screenEdge = min(min(hitUv.x, hitUv.y), min(1.0 - hitUv.x, 1.0 - hitUv.y));
    float confidence = smoothstep(0.002, 0.028, screenEdge);
    float seabed = smoothstep(0.62, 1.04, depthBelowSurface);
    float rockVisibility = (1.0 - smoothstep(2.35, 5.60, depthBelowSurface))
      * (1.0 - smoothstep(8.0, 25.0, distanceToCamera));
    reefWindow = confidence * seabed * rockVisibility;
    rockVisibility *= mix(0.69, 1.04, clearFacet);
    vec3 underwaterFog = exp(-vec3(0.43, 0.125, 0.115) * pathLength);
    vec3 floorLight = mix(volume, sourceRadiance, underwaterFog);
    float hullVisibility = 0.83 * exp(-pathLength * 0.93);
    return mix(volume, mix(attenuated, floorLight, seabed),
      confidence * mix(hullVisibility, rockVisibility * 0.94, seabed));
  }

  void main() {
    vec2 p = vWorldPosition.xz;
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float distanceToCamera = length(cameraPosition.xz - p);
    vec2 pixelX = dFdx(p);
    vec2 pixelY = dFdy(p);
    vec2 swellSlope = surfaceSlope(p, uTime, distanceToCamera, pixelX, pixelY);
    vec2 slope = swellSlope;

    // Small crossed capillary waves break the light into moving facets.
    // Distance attenuation keeps sub-pixel details calm at the horizon.
    float microFade = 1.0 / (1.0 + distanceToCamera * 0.033);
    float pixelFootprint = max(length(pixelX), length(pixelY));
    float swellDetail = noiseResolution(pixelFootprint * 1.37);
    float waveDetail = noiseResolution(pixelFootprint * 4.3);
    float fineDetail = noiseResolution(pixelFootprint * 10.3);
    vec2 drift = vec2(uTime * 0.14, -uTime * 0.09);
    // The short wind waves ride the orbital motion of the long swells. Their
    // crests gather on the front of a swell and spread out along its back.
    vec2 carried = p - vOrbitalMotion * (1.0 - smoothstep(13.0, 42.0, distanceToCamera));
    vec2 rotated = mat2(0.8, -0.6, 0.6, 0.8) * carried;
    vec3 neutralNoise = vec3(0.5, 0.0, 0.0);
    vec3 swellNoise = mix(neutralNoise,
      noiseDerivative(rotated * vec2(0.93, 1.37) + drift), swellDetail);
    vec3 waveNoise = mix(neutralNoise,
      noiseDerivative(carried * vec2(3.7, 4.3) - drift * 1.7 + swellNoise.yz * 0.56), waveDetail);
    vec3 fineNoise = mix(neutralNoise,
      noiseDerivative(rotated * vec2(10.3, 8.6) + drift * 2.5), fineDetail);
    WindWaveDetail windDetail = sampleWindWaves(carried, uTime);
    slope += swellNoise.yz * 0.118 * microFade + windDetail.slope;
    float crestTip = smoothstep(0.065, 0.155, vWorldPosition.y - vImpactHeight)
      * smoothstep(0.52, 0.79, swellNoise.x * 0.6 + waveNoise.x * 0.4);
    vec2 waveWind = normalize(vec2(0.43, 0.15));
    float steepFront = max(dot(swellSlope, waveWind), 0.0);
    slope += waveWind * steepFront * steepFront * 2.4 * crestTip * microFade;

    float contactShade = 0.0;
    float contactFoam = 0.0;
    float contactRipple = 0.0;
    float impactBubbles = 0.0;
    vec2 impactSlope = vec2(0.0);
    float contactSheen = 0.0;
    float nearestFloatSq = 10000.0;
    for (int i = 0; i < ${MAX_FLOATS}; i++) {
      if (i >= uFloatCount) break;
      vec4 floatingObject = uFloats[i];
      vec2 offset = p - floatingObject.xy;
      float distanceSq = dot(offset, offset);
      nearestFloatSq = min(nearestFloatSq, distanceSq);
      if (distanceSq > 4.0) continue;
      float radius = max(floatingObject.z, 0.05);
      vec4 contactAxis = uFloatAxis[i];
      vec2 along = normalize(contactAxis.xy);
      vec2 across = vec2(-along.y, along.x);
      vec2 halfSize = max(contactAxis.zw, vec2(0.025));
      vec2 local = vec2(dot(offset, along), dot(offset, across));
      float profileWidth = halfSize.y * (0.865 + 0.135
        * cos(clamp(local.x / halfSize.x, -1.0, 1.0) * 1.5707963));
      float cornerRadius = min(0.035, halfSize.y * 0.18);
      vec2 boxDistance = abs(local) - vec2(halfSize.x, profileWidth)
        + cornerRadius;
      float footprintDistance = length(max(boxDistance, vec2(0.0)))
        + min(max(boxDistance.x, boxDistance.y), 0.0) - cornerRadius;
      float edgeDistance = footprintDistance - 0.045
        - (waveNoise.x - 0.5) * radius * 0.035;
      float endWeight = smoothstep(boxDistance.y - 0.025,
        boxDistance.y + 0.025, boxDistance.x);
      vec2 contactNormal = normalize(along * sign(local.x) * endWeight
        + across * sign(local.y) * (1.0 - endWeight) + vec2(0.00001));
      float width = clamp(pixelFootprint * 0.70, 0.014, 0.034);
      float profile = edgeDistance / width;
      float envelope = exp(-profile * profile);
      float variation = sin(edgeDistance * 23.0 - uTime * 3.0
        + offset.x * 2.3 + offset.y * 1.7);
      slope += contactNormal * envelope * variation * 0.16 * floatingObject.w;
      float innerEdge = (footprintDistance - 0.005) / 0.017;
      contactShade += exp(-innerEdge * innerEdge) * 0.11 * floatingObject.w;
      vec2 around = local / halfSize;
      float segment = sin(atan(around.y, around.x) * 4.0 - uTime * 1.4 + float(i));
      float shortArcs = smoothstep(0.36, 0.70,
        waveNoise.x * 0.52 + fineNoise.x * 0.25 + segment * 0.23);
      float sunlitEdge = 0.5 + 0.5 * smoothstep(-0.5, 0.75,
        dot(contactNormal, normalize(uSunDirection.xz)));
      float shorelet = (footprintDistance - 0.073 - (fineNoise.x - 0.5) * 0.039)
        / max(0.0075, pixelFootprint * 0.42);
      float beads = smoothstep(0.39, 0.68, noiseDerivative(local * 28.0 + drift * 2.5).x);
      contactFoam += (envelope * 0.85 + exp(-shorelet * shorelet) * beads * 1.95)
        * shortArcs * sunlitEdge * (0.65 + 0.35 * variation) * floatingObject.w;
      float sheenArcs = smoothstep(0.49, 0.75,
        fineNoise.x * 0.68 + 0.32 * sin(atan(around.y, around.x)
        * 7.0 + uTime * 0.9 + float(i)));
      contactSheen += (envelope + exp(-shorelet * shorelet) * beads) * sheenArcs * sunlitEdge
        * (0.32 + 0.68 * abs(variation)) * floatingObject.w;
      float wakePhase = fract(uTime * 0.26 + float(i) * 0.173);
      float secondPhase = fract(wakePhase + 0.5);
      float wakeEdge = (footprintDistance - 0.09 - wakePhase * 0.54) / 0.045;
      float secondEdge = (footprintDistance - 0.09 - secondPhase * 0.54) / 0.045;
      contactRipple += (exp(-wakeEdge * wakeEdge) * sin(wakePhase * 3.1415926)
        * (1.0 - wakePhase) + exp(-secondEdge * secondEdge)
        * sin(secondPhase * 3.1415926) * (1.0 - secondPhase))
        * (0.35 + 0.65 * waveNoise.x) * floatingObject.w;
    }

    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      if (i >= uRippleCount) break;
      vec4 ripple = uRipples[i];
      if (uRippleImpact[i].x > 0.0) {
        vec3 displacement = impactRippleSurface(p, uTime, ripple, uRippleImpact[i]);
        slope += displacement.yz;
        impactSlope += displacement.yz;
        // Only a young, steep, breaking shoulder traps a little air. Moving
        // refraction and the changed surface normal carry the longer-lived wake.
        float lip = smoothstep(0.028, 0.095, displacement.x)
          * smoothstep(0.12, 0.43, length(displacement.yz));
        impactBubbles += lip * (1.0 - smoothstep(0.25, 1.15, uTime - ripple.z))
          * smoothstep(0.46, 0.77, fineNoise.x * 0.62 + waveNoise.x * 0.38);
        continue;
      }
      float age = uTime - ripple.z;
      if (age < 0.0 || age > 5.0) continue;
      vec2 offset = p - ripple.xy;
      float radius = length(offset);
      float width = 0.10 + age * 0.055;
      float edge = radius - age * 0.78;
      float profile = edge / width;
      float envelope = exp(-profile * profile - age * 1.05);
      slope += offset / max(radius, 0.001) * envelope
        * sin(edge * 22.0) * ripple.w * 0.07;
    }

    vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));
    float facing = clamp(dot(normal, viewDirection), 0.0, 1.0);
    float fresnel = 0.0204 + 0.9796 * pow(1.0 - facing, 5.0);
    vec3 reflectedDirection = reflect(-viewDirection, normal);
    vec3 reflectedSky = skyReflection(reflectedDirection);

    vec2 reflectionUv = vReflectionPosition.xy / vReflectionPosition.w;
    float distortion = mix(0.070, 0.009, smoothstep(5.0, 110.0, distanceToCamera));
    reflectionUv += normal.xz * distortion
      + (waveNoise.yz + fineNoise.yz * 0.3) * 0.0035 * microFade;
    float reflectionBorder = min(min(reflectionUv.x, reflectionUv.y),
      min(1.0 - reflectionUv.x, 1.0 - reflectionUv.y));
    float validReflection = smoothstep(0.0, 0.095, reflectionBorder)
      * step(0.0, vReflectionPosition.w);
    reflectionUv = clamp(reflectionUv, vec2(0.003), vec2(0.997));
    #ifdef OCEAN_FAST_OPTICS
      vec4 planar = texture2D(uReflectionMap, reflectionUv);
    #else
    float blur = mix(0.0011, 0.0023, smoothstep(1.0, 70.0, distanceToCamera));
    vec2 blurOffset = normalize(waveNoise.yz + vec2(0.37, 0.51)) * blur;
    vec4 planar = texture2D(uReflectionMap, reflectionUv) * 0.40;
    planar += texture2D(uReflectionMap, reflectionUv + blurOffset) * 0.30;
    planar += texture2D(uReflectionMap, reflectionUv - blurOffset) * 0.30;
    #endif
    float silhouette = planar.a * validReflection;
    reflectedSky = mix(reflectedSky, planar.rgb, validReflection * mix(0.74, 0.98, silhouette));
    // Towards the horizon, unresolved facets reflect a broad area of blue sky.
    // Keep the sand and palm silhouettes in the planar reflection.
    float openSea = smoothstep(12.0, 37.0, distanceToCamera)
      * (1.0 - uNightMix) * smoothstep(0.14, 0.41, uSunDirection.y);
    reflectedSky *= mix(vec3(1.0), vec3(0.41, 0.67, 0.74), openSea * (1.0 - silhouette));

    float daylight = 1.0 - uNightMix * 0.87;
    float palmShadow = sampleIslandSunShadow(vWorldPosition.xz);
    float directSun = 1.0 - palmShadow;
    float crest = smoothstep(-0.12, 0.15, vWorldPosition.y);
    float litFacet = dot(windDetail.slope, -normalize(uSunDirection.xz));
    float waveFace = clamp(crest * 0.78 + swellSlope.y * 1.3 + litFacet * 0.98
      + (swellNoise.x - 0.5) * 0.24, 0.0, 1.0);
    vec3 deepWater = vec3(0.0015, 0.020, 0.036);
    vec3 waveWater = vec3(0.013, 0.292, 0.278);
    vec3 bodyColor = mix(deepWater, waveWater, pow(waveFace, 1.38)) * daylight;
    float sunFacing = max(dot(normal, normalize(uSunDirection)), 0.0);
    bodyColor += vec3(0.004, 0.045, 0.030) * sunFacing * crest * uSunStrength * directSun;
    bodyColor *= 1.0 - min(contactShade, 0.24);
    float reefWindow = 0.0;
    if (uTransmissionEnabled > 0.5) {
      bodyColor = underwaterRadiance(viewDirection, normal, bodyColor,
        daylight, distanceToCamera, nearestFloatSq < 12.25, reefWindow);
    }
    float objectResponse = mix(0.076, 0.24, smoothstep(6.5, 14.0, distanceToCamera));
    bodyColor *= mix(vec3(1.0), vec3(0.43, 0.60, 0.69), palmShadow);
    float objectReflection = fresnel + (1.0 - fresnel) * silhouette * objectResponse;
    vec3 color = mix(bodyColor, reflectedSky, objectReflection);
    // The side of a pushed swell facing the sun catches sky light, while its
    // hollow stays deep blue. Apply this only to a displaced crest or trough.
    float liftedFace = smoothstep(0.009, 0.088, vImpactHeight);
    float hollow = smoothstep(0.004, 0.045, -vImpactHeight);
    float crestLight = clamp(0.50 - 1.30 * dot(impactSlope, normalize(uSunDirection.xz)), 0.0, 1.0);
    float waterLuma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(color, waterLuma * vec3(0.69, 1.04, 1.14),
      liftedFace * (0.12 + 0.19 * crestLight) * (1.0 - uNightMix));
    color *= 1.0 + (liftedFace * crestLight * 0.10 - hollow * 0.14) * daylight;
    float reefSkyFilm = reefWindow * (1.0 - silhouette)
      * (1.0 - smoothstep(0.13, 0.48, facing)) * 0.08 * (1.0 - uNightMix);
    color = mix(color, skyReflection(reflectedDirection), reefSkyFilm);
    color = mix(color, vec3(0.29, 0.57, 0.60) * daylight, min(0.48, impactBubbles * 0.62));
    color += vec3(0.73, 0.85, 0.79) * min(contactFoam, 0.86) * daylight;
    color += vec3(0.024, 0.105, 0.091) * min(contactRipple, 0.7) * daylight;
    color += uSunColor * vec3(0.80, 0.80, 0.64)
      * min(contactSheen, 0.88) * uSunStrength * daylight * directSun;
    float breakingTips = crestTip * smoothstep(0.055, 0.135, length(swellSlope))
      * smoothstep(0.67, 0.86, fineNoise.x) * microFade;
    color += vec3(0.38, 0.57, 0.61) * breakingTips * daylight;
    float crossCrestPhase = dot(p, vec2(6.2, 2.8)) - uTime * 3.4
      + swellNoise.x * 2.6 + waveNoise.x * 0.85;
    float crestSeam = smoothstep(0.83, 0.98, sin(crossCrestPhase));
    float seamPatch = smoothstep(0.77, 0.90, swellNoise.x * 0.62
      + waveNoise.x * 0.38);
    float brokenSeam = crestSeam * seamPatch
      * smoothstep(0.36, 0.75, fineNoise.x)
      * smoothstep(-0.015, 0.085, vWorldPosition.y - vImpactHeight)
      * (1.0 - smoothstep(13.0, 33.0, distanceToCamera));
    color += vec3(0.62, 0.78, 0.82) * brokenSeam * daylight;

    vec2 slopeVariance = filteredSlopeVariance(distanceToCamera, pixelX, pixelY,
      windDetail.variance);
    float distantLight = smoothstep(12.0, 34.0, distanceToCamera);
    slopeVariance *= mix(1.0, 2.40, distantLight);
    float sunGlints = sunFacetReflection(viewDirection, normal, slope,
      slopeVariance);
    float nearFacetVariation = mix(1.0, 0.68 + fineNoise.x * 0.68, fineDetail);
    float glitterDistance = 1.0 - smoothstep(55.0, 155.0, distanceToCamera);
    color += uSunColor * uSunStrength * directSun * min(sunGlints * 0.34, 2.6)
      * nearFacetVariation * glitterDistance;

    float horizonHaze = smoothstep(160.0, 2600.0, distanceToCamera);
    vec3 distantWater = uSkyHorizon * mix(vec3(0.22, 0.47, 0.59), vec3(0.72), uNightMix);
    color = mix(color, distantWater, horizonHaze * 0.98);

    gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function createSurfaceGeometry(softwareRenderer) {
  const columns = softwareRenderer ? 64 : 128;
  const nearRows = softwareRenderer ? 56 : 96;
  const rows = softwareRenderer ? 118 : 218;
  const positions = new Float32Array((columns + 1) * (rows + 1) * 3);
  const indices = new Uint16Array(columns * rows * 6);
  let positionOffset = 0;
  let indexOffset = 0;

  // Keep rows 12–21 cm apart around the floating objects. Continue with
  // exponentially wider rows as the projected surface approaches the horizon.
  for (let row = 0; row <= rows; row++) {
    const near = row / nearRows;
    const z = row <= nearRows ? 16 * (0.72 * near + 0.28 * near * near)
      : 16 + 3.7 * Math.expm1(7.05 * (row - nearRows) / (rows - nearRows));
    for (let column = 0; column <= columns; column++) {
      positions[positionOffset++] = column / columns * 2 - 1;
      positions[positionOffset++] = 0;
      positions[positionOffset++] = z;

      if (row < rows && column < columns) {
        const a = row * (columns + 1) + column;
        const b = a + 1;
        const c = a + columns + 1;
        const d = c + 1;
        indices[indexOffset++] = a;
        indices[indexOffset++] = b;
        indices[indexOffset++] = c;
        indices[indexOffset++] = b;
        indices[indexOffset++] = d;
        indices[indexOffset++] = c;
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6000);
  return geometry;
}

export function createOcean(environment, reflection, transmission, windUniforms, { softwareRenderer = false } = {}) {
  const optical = { ...reflection, ...transmission };
  const uniforms = {
    ...environment,
    ...reflection,
    ...transmission,
    ...windUniforms,
    uTransmissionMap: optical.uTransmissionMap ?? { value: null },
    uTransmissionDepth: optical.uTransmissionDepth ?? { value: null },
    uTransmissionTexelSize: optical.uTransmissionTexelSize ?? { value: new THREE.Vector2(1, 1) },
    uTransmissionInvProjection: optical.uTransmissionInvProjection ?? { value: new THREE.Matrix4() },
    uTransmissionCameraWorld: optical.uTransmissionCameraWorld ?? { value: new THREE.Matrix4() },
    uTransmissionViewProjection: optical.uTransmissionViewProjection ?? { value: new THREE.Matrix4() },
    uTransmissionEnabled: optical.uTransmissionEnabled ?? { value: optical.uTransmissionMap ? 1 : 0 },
    uTime: { value: 0 },
    uFloatCount: { value: 0 },
    uFloats: { value: Array.from({ length: MAX_FLOATS }, () => new THREE.Vector4()) },
    uFloatAxis: { value: Array.from({ length: MAX_FLOATS }, () => new THREE.Vector4(1, 0, 1, 1)) },
    uRippleCount: { value: 0 },
    uRipples: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4()) },
    uRippleImpact: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4()) },
  };

  const materialOptions = {
    uniforms,
    vertexShader,
    fragmentShader,
    depthWrite: true,
    depthTest: true,
    toneMapped: true,
  };
  const material = new THREE.ShaderMaterial(materialOptions);
  const fastMaterial = new THREE.ShaderMaterial({
    ...materialOptions,
    defines: { OCEAN_FAST_OPTICS: 1 },
  });
  const mesh = new THREE.Mesh(createSurfaceGeometry(softwareRenderer), material);
  mesh.name = 'Deep ocean surface';
  mesh.frustumCulled = false;

  function update(time, floats = [], ripples = []) {
    uniforms.uTime.value = time;
    const floatCount = Math.min(floats.length, MAX_FLOATS);
    uniforms.uFloatCount.value = floatCount;
    for (let i = 0; i < floatCount; i++) {
      const floatingObject = floats[i];
      uniforms.uFloats.value[i].set(
        floatingObject.x,
        floatingObject.z,
        floatingObject.radius,
        floatingObject.strength ?? 1,
      );
      uniforms.uFloatAxis.value[i].set(
        floatingObject.axisX ?? 1,
        floatingObject.axisZ ?? 0,
        floatingObject.halfLength ?? floatingObject.radius,
        floatingObject.halfWidth ?? floatingObject.radius,
      );
    }

    const recentRipples = ripples.filter(ripple => time - ripple.time < 5 && time >= ripple.time);
    const rippleCount = Math.min(recentRipples.length, MAX_RIPPLES);
    uniforms.uRippleCount.value = rippleCount;
    for (let i = 0; i < rippleCount; i++) {
      const ripple = recentRipples[recentRipples.length - rippleCount + i];
      const impact = impactRippleParameters(ripple);
      uniforms.uRipples.value[i].set(ripple.x, ripple.z, ripple.time,
        impact.radius > 0 ? impact.strength : (ripple.strength ?? 1));
      uniforms.uRippleImpact.value[i].set(impact.radius, impact.speed, ripple.keelX ?? 0, ripple.keelZ ?? 0);
    }
  }

  function setFastOptics(enabled) {
    mesh.material = enabled ? fastMaterial : material;
  }

  return { mesh, setFastOptics, update };
}
