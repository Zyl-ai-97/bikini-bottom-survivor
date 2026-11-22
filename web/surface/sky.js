import * as THREE from './vendor/three.module.js';

// Colors are stored in linear space by THREE.Color and can also light the scene.
const atmosphereKeys = [
  { phase: 0.00, sun: '#ff8c39', strength: 0.32, zenith: '#527aa3', horizon: '#efc29f', night: 0.12 },
  { phase: 0.08, sun: '#ffe0b5', strength: 0.85, zenith: '#2683d0', horizon: '#9bd3ec', night: 0.00 },
  { phase: 0.22, sun: '#fff4df', strength: 1.00, zenith: '#1472c8', horizon: '#82c9eb', night: 0.00 },
  { phase: 0.32, sun: '#fff8e9', strength: 1.02, zenith: '#126dc2', horizon: '#88ccec', night: 0.00 },
  { phase: 0.45, sun: '#ffedcf', strength: 0.95, zenith: '#1b79c7', horizon: '#90c8e5', night: 0.00 },
  { phase: 0.62, sun: '#ffb16b', strength: 0.64, zenith: '#6487af', horizon: '#e2b497', night: 0.03 },
  { phase: 0.657, sun: '#d0a19e', strength: 0.035, zenith: '#435478', horizon: '#aa8a93', night: 0.34 },
  { phase: 0.70, direction: [0.72, 0.11, -0.68], sun: '#e6bfbe', strength: 0.13, zenith: '#223d69', horizon: '#7d7891', night: 0.65 },
  { phase: 0.80, direction: [0.34, 0.39, -0.86], sun: '#b4cef1', strength: 0.075, zenith: '#07162f', horizon: '#1d3552', night: 1.00 },
  { phase: 0.93, direction: [-0.57, 0.22, -0.79], sun: '#b8c9e7', strength: 0.065, zenith: '#102342', horizon: '#445269', night: 0.84 },
  { phase: 0.975, sun: '#ae97a3', strength: 0.032, zenith: '#354b71', horizon: '#958e9e', night: 0.47 },
  { phase: 1.00, sun: '#ff8c39', strength: 0.32, zenith: '#527aa3', horizon: '#efc29f', night: 0.12 },
].map((key) => ({
  ...key,
  direction: key.direction ? new THREE.Vector3(...key.direction).normalize() : null,
  sun: new THREE.Color(key.sun),
  zenith: new THREE.Color(key.zenith),
  horizon: new THREE.Color(key.horizon),
}));

export function createEnvironment() {
  let sunriseBearing = Math.atan(0.30);
  const handoff = new THREE.Vector3();
  const uniforms = {
    uSunDirection: { value: new THREE.Vector3() },
    uSunColor: { value: new THREE.Color() },
    uSunStrength: { value: 1 },
    uSkyZenith: { value: new THREE.Color() },
    uSkyHorizon: { value: new THREE.Color() },
    uNightMix: { value: 0 },
  };

  function update(phase = 0.22) {
    const wrappedPhase = Number.isFinite(phase) ? ((phase % 1) + 1) % 1 : 0.22;
    let segment = 0;
    while (segment < atmosphereKeys.length - 2 && wrappedPhase > atmosphereKeys[segment + 1].phase) {
      segment += 1;
    }
    const from = atmosphereKeys[segment];
    const to = atmosphereKeys[segment + 1];
    const fraction = (wrappedPhase - from.phase) / (to.phase - from.phase);
    const blend = fraction * fraction * (3 - 2 * fraction);

    const direction = uniforms.uSunDirection.value;
    if (wrappedPhase <= 0.62) {
      // In camera coordinates +X is screen right and +Z faces the beach.
      // Start on the island bearing, climb out to the right and finish the
      // afternoon lighting the palms from the camera side of the island.
      const day = wrappedPhase / 0.62;
      const turn = (1 - (1 - day) ** 1.65) * THREE.MathUtils.smoothstep(day, 0, 0.12);
      const azimuth = sunriseBearing + Math.PI * turn;
      const altitude = 0.024 + 0.85 * Math.sin(Math.PI * day);
      direction.setFromSphericalCoords(1, Math.PI / 2 - altitude, Math.PI - azimuth);
    } else if (from.direction && to.direction) {
      direction.lerpVectors(from.direction, to.direction, blend).normalize();
    } else {
      // Hand off at the horizon during civil twilight, when both lights are dim.
      // This keeps the moon's established night arc independent of screen layout.
      const setting = to.phase <= 0.70;
      const bearing = sunriseBearing + (setting ? Math.PI : 0);
      handoff.setFromSphericalCoords(1, Math.PI / 2 - 0.024, Math.PI - bearing);
      if (from.phase === 0.62 || to.phase === 1.00) {
        direction.copy(handoff);
        direction.y = THREE.MathUtils.lerp(setting ? 0.024 : -0.08, setting ? -0.08 : 0.024, blend);
        direction.normalize();
      } else {
        handoff.y = -0.08;
        if (setting) direction.lerpVectors(handoff, to.direction, blend);
        else direction.lerpVectors(from.direction, handoff, blend);
        direction.normalize();
      }
    }
    uniforms.uSunColor.value.copy(from.sun).lerp(to.sun, blend);
    uniforms.uSkyZenith.value.copy(from.zenith).lerp(to.zenith, blend);
    uniforms.uSkyHorizon.value.copy(from.horizon).lerp(to.horizon, blend);
    uniforms.uSunStrength.value = THREE.MathUtils.lerp(from.strength, to.strength, blend);
    uniforms.uNightMix.value = THREE.MathUtils.lerp(from.night, to.night, blend);
  }

  update();
  function setIslandBearing(islandX, distance) {
    sunriseBearing = Math.atan2(islandX, distance);
  }
  return { uniforms, update, setIslandBearing };
}

const vertexShader = /* glsl */ `
  varying vec2 vScreenPosition;

  void main() {
    vScreenPosition = position.xy;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform mat4 uInverseProjection;
  uniform mat4 uCameraWorld;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform float uSunStrength;
  uniform vec3 uSkyZenith;
  uniform vec3 uSkyHorizon;
  uniform float uNightMix;
  uniform bool uReflectionPass;
  uniform sampler2D uCloudMap;
  uniform float uCloudMapReady;
  uniform sampler2D uSkyReference;
  uniform float uSkyReferenceReady;
  varying vec2 vScreenPosition;

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float noise(vec2 p) {
    vec2 cell = floor(p);
    vec2 local = fract(p);
    vec2 blend = local * local * (3.0 - 2.0 * local);
    return mix(
      mix(hash(cell), hash(cell + vec2(1.0, 0.0)), blend.x),
      mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0)), blend.x),
      blend.y
    );
  }

  float cloudNoise(vec2 p) {
    float result = 0.0;
    float amplitude = 0.52;
    mat2 rotation = mat2(0.80, -0.60, 0.60, 0.80);
    for (int octave = 0; octave < 5; octave++) {
      result += amplitude * noise(p);
      p = rotation * p * 2.13 + vec2(12.7, 8.3);
      amplitude *= 0.49;
    }
    return result;
  }

  float cloudLobe(vec2 p, vec2 center, vec2 size) {
    return 1.0 - length((p - center) / size);
  }

  // The distant cloud banks sit just above the horizon.
  float cloudShape(vec2 p) {
    float left = cloudLobe(p, vec2(-0.19, 0.089), vec2(0.060, 0.014));
    left = max(left, cloudLobe(p, vec2(-0.20, 0.097), vec2(0.031, 0.017)));
    float right = cloudLobe(p, vec2(0.46, 0.079), vec2(0.064, 0.012));
    right = max(right, cloudLobe(p, vec2(0.48, 0.088), vec2(0.028, 0.016)));
    float remote = cloudLobe(p, vec2(0.085, 0.039), vec2(0.041, 0.007));
    return max(max(left, right), remote);
  }

  vec4 cumulus(vec3 direction, vec2 skyPosition, vec3 skyColor) {
    float shape = cloudShape(skyPosition);
    if (shape < -0.28 || direction.y < 0.025) return vec4(0.0);

    vec2 detailPosition = skyPosition * vec2(43.0, 71.0);
    float detail = cloudNoise(detailPosition);
    float fine = noise(detailPosition * 4.4);
    float body = shape + (detail - 0.50) * 0.74 + (fine - 0.50) * 0.070;
    float opacity = smoothstep(0.015, 0.15, body);
    opacity *= smoothstep(0.025, 0.105, direction.y);

    float topLight = smoothstep(0.15, 0.29, skyPosition.y);
    float displacedDetail = cloudNoise(detailPosition + vec2(-1.2, -0.95));
    float silverLining = pow(1.0 - smoothstep(0.01, 0.30, body), 2.0);
    float volume = clamp(0.42 + topLight * 0.20 + (detail - displacedDetail) * 1.9 + detail * 0.18 + silverLining * 0.10, 0.0, 1.0);
    vec3 shadow = mix(uSkyHorizon * 0.69, vec3(0.40, 0.48, 0.58), 0.28);
    vec3 sunlight = mix(vec3(1.0), uSunColor, 0.24) * 1.09;
    vec3 color = mix(shadow, sunlight, volume);
    color += uSunColor * silverLining * 0.085 * uSunStrength;

    vec3 moonlit = mix(uSkyHorizon * 0.34, vec3(0.11, 0.16, 0.25), volume * 0.72);
    color = mix(color, moonlit, uNightMix);
    color = mix(skyColor, color, smoothstep(0.035, 0.16, direction.y));
    return vec4(color, opacity * mix(0.94, 0.78, uNightMix));
  }

  vec4 sampleCloudBank(vec2 skyPosition, vec2 center, vec2 size, vec4 atlasBounds) {
    vec2 uv = (skyPosition - center) / size + 0.5;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0);
    vec4 cloud = texture2D(uCloudMap, mix(atlasBounds.xy, atlasBounds.zw, uv));
    vec2 margin = min(uv, 1.0 - uv);
    cloud.a *= smoothstep(0.0, 0.11, min(margin.x, margin.y));
    return cloud;
  }

  vec4 texturedCumulus(vec3 direction, vec2 skyPosition, vec3 skyColor) {
    vec4 cloud = sampleCloudBank(skyPosition, vec2(-0.19, 0.089), vec2(0.149, 0.031),
      vec4(0.002, 0.151, 0.306, 0.506));
    vec4 right = sampleCloudBank(skyPosition, vec2(0.46, 0.079), vec2(0.152, 0.030),
      vec4(0.34, 0.177, 0.99, 0.999));
    vec4 remote = sampleCloudBank(skyPosition, vec2(0.085, 0.039), vec2(0.090, 0.014),
      vec4(0.249, 0.01, 0.380, 0.146));
    cloud += right * vec4(1.0, 1.0, 1.0, 0.84) + remote * vec4(1.0, 1.0, 1.0, 0.78);

    float warmLight = clamp(1.0 - uSunDirection.y * 1.65, 0.0, 1.0) * 0.36;
    vec3 color = mix(cloud.rgb, vec3(1.0), 0.16) * 1.08;
    color *= mix(vec3(1.0), uSunColor, max(warmLight, 0.07));
    float cloudLight = dot(cloud.rgb, vec3(0.2126, 0.7152, 0.0722));
    vec3 nightColor = mix(uSkyHorizon * 0.21, uSunColor * 0.14, cloudLight);
    color = mix(color, nightColor, uNightMix);
    float aerialPerspective = smoothstep(0.008, 0.096, direction.y);
    color = mix(skyColor, color, aerialPerspective);
    float opacity = cloud.a * smoothstep(0.014, 0.053, direction.y);
    return vec4(color, opacity * mix(0.98, 0.72, uNightMix));
  }

  float stars(vec2 skyPosition) {
    vec2 grid = skyPosition * vec2(235.0, 185.0);
    vec2 cell = floor(grid);
    vec2 local = fract(grid);
    float seed = hash(cell);
    vec2 center = vec2(hash(cell + 8.71), hash(cell - 19.23)) * 0.72 + 0.14;
    float radius = mix(0.022, 0.063, pow(seed, 6.0));
    float distanceToStar = length(local - center);
    float core = 1.0 - smoothstep(radius * 0.15, radius, distanceToStar);
    float glow = exp(-distanceToStar * distanceToStar / (radius * radius * 3.5));
    return (core + glow * 0.13) * step(0.976, seed) * mix(0.28, 0.95, seed);
  }

  vec4 referenceSky(vec3 direction, float daylight) {
    if (uReflectionPass || uSkyReferenceReady < 0.5 || direction.y < 0.0) return vec4(0.0);

    // Reproject the supplied 45-degree, 16:9 photograph into world directions.
    // Its sea horizon sits at row 1276 of 2160, so camera motion stays natural.
    const float sinPitch = 0.074960594;
    const float cosPitch = 0.997186497;
    const float tanHalfFov = 0.414213562;
    const float originalAspect = 1.777777778;
    const float cropHeight = 0.590740741;
    float depth = direction.y * sinPitch - direction.z * cosPitch;
    if (depth <= 0.0) return vec4(0.0);
    float vertical = direction.y * cosPitch + direction.z * sinPitch;
    vec2 originalUv = vec2(
      0.5 + 0.5 * direction.x / (depth * tanHalfFov * originalAspect),
      0.5 - 0.5 * vertical / (depth * tanHalfFov)
    );
    vec2 uv = vec2(originalUv.x, 1.0 - originalUv.y / cropHeight);
    vec2 outside = max(max(-uv, uv - 1.0), vec2(0.0));
    float boundary = 1.0 - smoothstep(0.0, 0.16, max(outside.x, outside.y));
    vec3 photograph = texture2D(uSkyReference, clamp(uv, vec2(0.0002), vec2(0.9998))).rgb;
    return vec4(photograph, daylight * boundary);
  }

  void main() {
    vec4 viewPosition = uInverseProjection * vec4(vScreenPosition, 1.0, 1.0);
    vec3 direction = normalize(mat3(uCameraWorld) * normalize(viewPosition.xyz));
    float altitude = max(direction.y, 0.0);
    float dayMix = 1.0 - uNightMix;
    // After sunset the tracked light is the moon. Its altitude must not
    // reintroduce the daytime cloud photograph or the bright solar haze.
    float solarVisibility = dayMix * (1.0 - smoothstep(0.45, 0.82, uNightMix));
    float clearDay = solarVisibility * smoothstep(0.15, 0.38, uSunDirection.y);
    vec4 photograph = referenceSky(direction, clearDay);
    float dayGradient = 1.0 - exp(-altitude * 8.0);
    float gradient = mix(dayGradient, pow(altitude, 0.43), uNightMix);
    vec3 color = mix(uSkyHorizon, uSkyZenith, gradient);

    // The narrow haze band is tangent to the same world Y=0 horizon as the sea.
    float haze = exp(-altitude * 29.0) * 0.16 * solarVisibility;
    color = mix(color, uSkyHorizon * 1.10, haze);
    if (direction.y < 0.0) color = uSkyHorizon * mix(0.88, 0.45, uNightMix);

    if (!uReflectionPass && direction.y >= 0.0) {
      // Low-angle daylight scattering forms a thin bright veil above the sea.
      vec2 sunBearing = normalize(uSunDirection.xz);
      vec2 viewBearing = normalize(direction.xz + vec2(0.00001));
      float sunward = pow(max(dot(viewBearing, sunBearing), 0.0), 4.0);
      vec3 clearBlue = mix(vec3(0.006, 0.124, 0.535), vec3(0.020, 0.207, 0.575), sunward);
      float visibleGradient = 1.0 - exp(-altitude * 6.8);
      vec3 visibleSky = mix(uSkyHorizon, clearBlue, visibleGradient);
      float horizonAir = exp(-altitude * 36.0);
      visibleSky = mix(visibleSky, vec3(0.91, 0.965, 1.0), horizonAir);
      color = mix(color, visibleSky, clearDay);
    }

    float lightAlignment = max(dot(direction, uSunDirection), 0.0);
    float sunlight = uSunStrength * solarVisibility;
    float broadGlow = pow(lightAlignment, 24.0) * 0.045;
    float nearGlow = pow(lightAlignment, 340.0) * 0.12;
    // A small, warm aerosol aureole reads through the gaps in the backlit palms.
    // At a higher solar elevation only the usual tight daylight glow remains.
    float lowSun = (1.0 - smoothstep(0.08, 0.26, uSunDirection.y))
      * smoothstep(-0.03, 0.025, uSunDirection.y);
    nearGlow += lowSun * (0.20 * pow(lightAlignment, 120.0) + 0.48 * pow(lightAlignment, 720.0));
    color += uSunColor * (broadGlow + nearGlow) * sunlight;
    float sunDisk = smoothstep(cos(0.0058), cos(0.0044), lightAlignment);
    if (!uReflectionPass) color += uSunColor * sunDisk * 7.5 * sunlight;

    vec2 skyPosition = vec2(atan(direction.x, -direction.z), asin(clamp(direction.y, -1.0, 1.0)));
    vec4 cloud = vec4(0.0);
    if (!uReflectionPass) {
      cloud = uCloudMapReady > 0.5
        ? texturedCumulus(direction, skyPosition, color)
        : cumulus(direction, skyPosition, color);
      cloud.a *= 1.0 - photograph.a;
    }

    float visibility = smoothstep(0.025, 0.20, altitude) * uNightMix * uNightMix;
    color += vec3(0.70, 0.82, 1.0) * stars(skyPosition) * visibility * (1.0 - cloud.a);

    vec3 lightRight = normalize(cross(uSunDirection, vec3(0.0, 1.0, 0.0)));
    vec3 lightUp = cross(lightRight, uSunDirection);
    vec2 moonPosition = vec2(dot(direction, lightRight), dot(direction, lightUp)) / 0.0058;
    float moonRadius = length(moonPosition);
    float moonDisk = (1.0 - smoothstep(0.94, 1.02, moonRadius)) * step(0.0, dot(direction, uSunDirection));
    float moonSurface = 0.78 + noise(moonPosition * 12.0) * 0.12;
    float moonShading = smoothstep(-0.83, 0.55, moonPosition.x);
    float moonHalo = pow(lightAlignment, 700.0) * 0.035;
    color += vec3(0.69, 0.79, 0.95) * (moonDisk * moonSurface * moonShading * 1.4 + moonHalo) * uNightMix;

    color = mix(color, cloud.rgb, cloud.a);
    gl_FragColor = vec4(max(color, vec3(0.0)), uReflectionPass ? 0.0 : 1.0);
    #include <tonemapping_fragment>
    // Preserve the photograph's calibrated blues and white cloud highlights.
    // Both values are linear here; display encoding happens in the next chunk.
    vec3 referenceLight = uSunColor * (broadGlow + nearGlow + sunDisk * 7.5) * sunlight;
    #if defined(TONE_MAPPING)
      referenceLight = toneMapping(referenceLight);
    #endif
    gl_FragColor.rgb = mix(gl_FragColor.rgb, photograph.rgb + referenceLight, photograph.a);
    #include <colorspace_fragment>
  }
`;

export function createSky(environment, reflectionCamera, loadingManager) {
  const uniforms = {
    ...environment.uniforms,
    uInverseProjection: { value: new THREE.Matrix4() },
    uCameraWorld: { value: new THREE.Matrix4() },
    uReflectionPass: { value: false },
    uCloudMap: { value: null },
    uCloudMapReady: { value: 0 },
    uSkyReference: { value: null },
    uSkyReferenceReady: { value: 0 },
  };
  const textures = new THREE.TextureLoader(loadingManager);
  textures.load(new URL('./assets/clouds.webp', import.meta.url).href, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    uniforms.uCloudMap.value = texture;
    uniforms.uCloudMapReady.value = 1;
  }, undefined, () => {});
  textures.load(new URL('./assets/sky-reference.webp', import.meta.url).href, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    uniforms.uSkyReference.value = texture;
    uniforms.uSkyReferenceReady.value = 1;
  }, undefined, () => {});
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    depthTest: true,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  sky.name = 'Ocean sky';
  sky.frustumCulled = false;
  // Draw the far-plane sky only in pixels left clear by opaque land, props and water.
  sky.renderOrder = 1000;
  sky.onBeforeRender = (renderer, scene, camera) => {
    uniforms.uInverseProjection.value.copy(camera.projectionMatrixInverse);
    uniforms.uCameraWorld.value.copy(camera.matrixWorld);
    uniforms.uReflectionPass.value = camera === reflectionCamera;
    material.uniformsNeedUpdate = true;
  };
  return sky;
}
