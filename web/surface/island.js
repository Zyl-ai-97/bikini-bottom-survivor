import * as THREE from './vendor/three.module.js';
import { makeCrabAtlas } from './shore-life.js';

const ROOT_V = 0.153;
const GROUND_UV_PER_METRE = 0.014;
// Trace a point on the beach or water back to the palms along the light ray.
// The alpha silhouette and its mipmaps are already in GPU memory as our albedo.
export const islandShadowFunctions = /* glsl */ `
  uniform sampler2D uIslandShadowMap;
  uniform vec2 uIslandShadowOrigin;
  uniform float uIslandShadowStrength;
  uniform vec4 uPalmFrontProjection;
  uniform vec4 uPalmSideProjection;
  uniform vec3 uPalmShadowFilter;

  float palmSilhouette(vec2 p, vec4 projection, float heightCoordinate) {
    vec2 uv = vec2(dot(p, projection.xy) + projection.w,
      heightCoordinate * projection.z + ${ROOT_V});
    if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= ${ROOT_V} || uv.y >= 1.0) return 0.0;
    // A higher frond casts a softer shadow. Include the projected screen pixel
    // in the filter footprint so the tips also stay quiet on the distant water.
    float penumbra = (uv.y - ${ROOT_V}) * uPalmShadowFilter.y;
    float footprint = max(uPalmShadowFilter.z, penumbra);
    return textureLod(uIslandShadowMap, uv, log2(footprint)).a;
  }

  float sampleIslandSunShadow(vec2 worldXZ) {
    vec2 p = worldXZ - uIslandShadowOrigin;
    float edge = max(abs(p.x), abs(p.y));
    if (edge >= 96.0 || uIslandShadowStrength < 0.002) return 0.0;
    float sideMix = uPalmShadowFilter.x;
    float front = 0.0;
    float side = 0.0;
    if (sideMix < 1.0) front = palmSilhouette(p, uPalmFrontProjection, p.y);
    // The palms have some depth. Use their narrower side silhouette when the
    // sun is abeam; a single camera-facing card would then cast a zero-width line.
    if (sideMix > 0.0) side = palmSilhouette(p, uPalmSideProjection, p.x);
    return mix(front, side, sideMix) * uIslandShadowStrength * (1.0 - smoothstep(91.2, 96.0, edge));
  }
`;

function frameTexture(texture) {
  const image = texture.image;
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(image.width, 512);
  canvas.height = Math.round(image.height * canvas.width / image.width);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let left = canvas.width, top = canvas.height, right = 0, bottom = 0;
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    if (pixels[(y * canvas.width + x) * 4 + 3] < 32) continue;
    left = Math.min(left, x); right = Math.max(right, x + 1);
    top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
  }
  left = Math.max(0, left - 2); right = Math.min(canvas.width, right + 2);
  top = Math.max(0, top - 2); bottom = Math.min(canvas.height, bottom + 2);
  texture.offset.set(left / canvas.width, 1 - bottom / canvas.height);
  texture.repeat.set((right - left) / canvas.width, (bottom - top) / canvas.height);
  return (right - left) / (bottom - top);
}

export function createIsland(renderer, environment, loadingManager) {
  const shadowUniforms = {
    uIslandShadowMap: { value: null },
    uIslandShadowOrigin: { value: new THREE.Vector2() },
    uIslandShadowStrength: { value: 0 },
    uPalmFrontProjection: { value: new THREE.Vector4() },
    uPalmSideProjection: { value: new THREE.Vector4() },
    uPalmShadowFilter: { value: new THREE.Vector3() },
  };
  const flatNormal = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
  flatNormal.needsUpdate = true;
  const emptyMaterial = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  emptyMaterial.needsUpdate = true;
  const uniforms = {
    ...shadowUniforms,
    uCrabAtlas: { value: makeCrabAtlas() },
    uCrabA: { value: new THREE.Vector3() },
    uCrabB: { value: new THREE.Vector3() },
    uIslandPhotoTexel: { value: new THREE.Vector2(1 / 1444, 1 / 1089) },
    uIslandRawCentre: { value: new THREE.Vector2(0.5, 0.5) },
    uIslandRawWorldSize: { value: new THREE.Vector2(25.1, 19.5) },
    uIslandScale: { value: 1 },
    uIslandSharpness: { value: 0.16 },
    uIslandNormalMap: { value: flatNormal },
    uIslandMaterialMap: { value: emptyMaterial },
    uIslandNormalsReady: { value: 0 },
    uIslandSunColour: environment.uniforms.uSunColor,
    uIslandSunStrength: environment.uniforms.uSunStrength,
    uIslandSunDirection: environment.uniforms.uSunDirection,
    uIslandSkyHorizon: environment.uniforms.uSkyHorizon,
    uIslandNight: environment.uniforms.uNightMix,
  };
  const material = new THREE.MeshBasicMaterial({
    color: '#ffffff', alphaTest: 0.08, transparent: true, side: THREE.DoubleSide, toneMapped: false,
  });
  material.customProgramCacheKey = () => 'island-directional-light-v3';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec3 vIslandPosition;\n' + shader.vertexShader.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\nvIslandPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    );
    shader.fragmentShader = /* glsl */ `
      varying vec3 vIslandPosition;
      uniform vec2 uIslandPhotoTexel;
      uniform vec2 uIslandRawCentre;
      uniform vec2 uIslandRawWorldSize;
      uniform float uIslandScale;
      uniform float uIslandSharpness;
      uniform sampler2D uIslandNormalMap;
      uniform sampler2D uIslandMaterialMap;
      uniform float uIslandNormalsReady;
      uniform vec3 uIslandSunColour;
      uniform float uIslandSunStrength;
      uniform vec3 uIslandSunDirection;
      uniform vec3 uIslandSkyHorizon;
      uniform float uIslandNight;
      uniform sampler2D uCrabAtlas;
      uniform vec3 uCrabA, uCrabB;
      float sandHash(vec2 p) {
        vec3 h = fract(vec3(p.xyx) * vec3(0.1031, 0.11369, 0.13787));
        h += dot(h, h.yzx + 19.19);
        return fract((h.x + h.y) * h.z);
      }
      float sandVariation(vec2 p) {
        vec2 c = floor(p), f = fract(p);
        f = f*f*(3.0-2.0*f);
        return mix(mix(sandHash(c), sandHash(c+vec2(1,0)), f.x),
          mix(sandHash(c+vec2(0,1)), sandHash(c+1.0), f.x), f.y);
      }
      vec3 beachCrab(vec3 sandColor, vec2 uv, vec3 pose, float size, vec3 shellTint) {
        vec2 local = (uv - pose.xy) / (size * vec2(1.0, 0.66)) + 0.5;
        if (min(local.x, local.y) < 0.0 || max(local.x, local.y) > 1.0) return sandColor;
        vec2 spriteUv = vec2((local.x + pose.z) / 8.0, local.y);
        vec4 crab = texture2D(uCrabAtlas, spriteUv);
        return mix(sandColor, crab.rgb * shellTint, crab.a);
      }
      ${islandShadowFunctions}
      ${shader.fragmentShader}
    `.replace('#include <map_fragment>', /* glsl */ `
      #include <map_fragment>
      #ifdef USE_MAP
        vec2 photoUv = vMapUv;
        vec4 north = texture2D(map, photoUv + vec2(0.0, uIslandPhotoTexel.y));
        vec4 south = texture2D(map, photoUv - vec2(0.0, uIslandPhotoTexel.y));
        vec4 east = texture2D(map, photoUv + vec2(uIslandPhotoTexel.x, 0.0));
        vec4 west = texture2D(map, photoUv - vec2(uIslandPhotoTexel.x, 0.0));
        // Only sharpen opaque interior colour. The transparent leaf fringes
        // retain their original alpha coverage and cannot acquire bright halos.
        float opaqueInterior = smoothstep(0.94, 0.995, min(min(north.a, south.a), min(east.a, west.a)));
        vec3 detail = sampledDiffuseColor.rgb - (north.rgb + south.rgb + east.rgb + west.rgb) * 0.25;
        diffuseColor.rgb = max(vec3(0.0), diffuseColor.rgb + clamp(detail, vec3(-0.10), vec3(0.10))
          * uIslandSharpness * opaqueInterior);

        // The photograph supplies albedo; registered normals and material
        // weights distinguish each frond, curved trunk and sand slope.
        vec3 original = sampledDiffuseColor.rgb;
        float warmSand = smoothstep(0.94, 1.14, original.r / max(original.g, 0.005))
          * smoothstep(1.10, 1.45, original.g / max(original.b, 0.005));
        float fallbackSand = warmSand * (1.0 - smoothstep(0.108, 0.132, photoUv.y));
        vec3 duneNormal = normalize(vec3(clamp((photoUv.x - uIslandRawCentre.x) * 1.8, -0.65, 0.65),
          1.0, 0.16 + 0.15 * (1.0 - smoothstep(0.005, 0.10, photoUv.y))));
        vec3 materialWeights = texture2D(uIslandMaterialMap, photoUv).rgb;
        float materialCoverage = dot(materialWeights, vec3(1.0));
        materialWeights /= max(0.001, materialCoverage);
        float mappedNormal = uIslandNormalsReady * smoothstep(0.02, 0.08, materialCoverage);
        materialWeights = mix(vec3(0.0, 1.0-fallbackSand, fallbackSand), materialWeights, mappedNormal);
        float sand = materialWeights.b;
        if (sand > 0.015) {
          // Damp seams collect a little darker mineral sand along the swash,
          // with a few irregular deposits farther up the sunlit slope.
          vec2 dune = photoUv * vec2(21.0, 45.0);
          float drift = sandVariation(dune * 0.48 + vec2(4.0, 17.0));
          float sandPatch = sandVariation(dune + vec2(drift, -2.7 * drift));
          float streak = sandVariation(dune * vec2(2.3, 3.9) + sandPatch * 1.6);
          float deposit = smoothstep(0.57, 0.78, 0.56 * sandPatch + 0.27 * drift + 0.17 * streak);
          float tide = 1.0 - smoothstep(0.012, 0.039, photoUv.y + (sandPatch - 0.5) * 0.023);
          vec3 grain = mix(vec3(0.92, 0.90, 0.86), vec3(0.60, 0.63, 0.64), deposit * 0.83);
          grain *= mix(vec3(1.0), vec3(0.72, 0.77, 0.78), tide * 0.67);
          diffuseColor.rgb *= mix(vec3(1.0), grain, sand);
          diffuseColor.rgb = beachCrab(diffuseColor.rgb, photoUv, uCrabA, 0.021, vec3(1.0, 0.95, 0.90));
          diffuseColor.rgb = beachCrab(diffuseColor.rgb, photoUv, uCrabB, 0.0175, vec3(0.78, 0.91, 0.78));
        }
        vec3 surfaceNormal = normalize(mix(mix(vec3(0.0, 0.55, 0.83), duneNormal, fallbackSand),
          texture2D(uIslandNormalMap, photoUv).rgb * 2.0 - 1.0, mappedNormal));
        // The original front-view map flattens the visible sides of each
        // cylindrical trunk and the folds of the leaves. Recover their grazing
        // angles, where a backlit island actually catches direct sunlight.
        surfaceNormal.z *= dot(materialWeights, vec3(0.52, 0.73, 0.83));
        surfaceNormal = normalize(surfaceNormal);
        float nDotSun = dot(surfaceNormal, uIslandSunDirection);
        float frontSun = max(0.0, nDotSun);
        float backSun = max(0.0, -nDotSun);
        float ambient = dot(materialWeights, vec3(0.47, 0.46, 0.61));
        // At dawn the narrow, grazing facets need a strong rim. Once the
        // broad front surfaces enter full sun, retain the bark and sand grain.
        float frontKey = smoothstep(-0.16, 0.38, uIslandSunDirection.z);
        vec3 directResponse = mix(vec3(2.65, 2.20, 1.16), vec3(1.46, 1.38, 0.65), frontKey);
        float direct = dot(materialWeights, directResponse)
          * mix(frontSun, frontSun * frontSun, frontKey * (0.32 + 0.54 * sand));
        vec3 skyTint = uIslandSkyHorizon / max(0.01, max(max(uIslandSkyHorizon.r, uIslandSkyHorizon.g), uIslandSkyHorizon.b));
        vec3 sunLight = uIslandSunStrength * uIslandSunColour;
        vec3 skyLight = mix(vec3(1.0), skyTint, 0.18);
        // Thin leaflets transmit a warmer green in backlight. The denser
        // centre of a crown remains dark, giving the sunlit leaves separation.
        float thinLeaf = smoothstep(0.045, 0.33, original.g);
        float crown = smoothstep(0.17, 0.32, photoUv.y);
        vec3 viewDirection = normalize(cameraPosition - vIslandPosition);
        float forwardScatter = smoothstep(0.65, 0.98, -dot(viewDirection, uIslandSunDirection));
        float litFringe = crown * forwardScatter * thinLeaf * thinLeaf;
        float transmission = materialWeights.g * pow(backSun, 1.35)
          * (0.32 + 0.78 * thinLeaf + 1.95 * litFringe);
        vec3 sunlight = diffuseColor.rgb * (ambient * skyLight + sunLight *
          (direct + transmission * vec3(1.10, 0.97, 0.50)));

        // Reflections of the solar disk broaden over the waxy leaflet folds.
        // Bark has a matte sun-facing rim; sand grains scatter diffusely.
        vec3 halfVector = normalize(viewDirection + uIslandSunDirection);
        float nDotHalf = max(0.0, dot(surfaceNormal, halfVector));
        float veinSheen = 0.21 * pow(nDotHalf, 13.0) + 0.81 * pow(nDotHalf, 43.0);
        veinSheen *= (1.0 - 0.30 * frontKey) * materialWeights.g * smoothstep(-0.07, 0.39, nDotSun)
          * (0.40 + 0.60 * thinLeaf) * (0.12 + 0.88 * crown);
        float barkRim = materialWeights.r * smoothstep(0.04, 0.62, nDotSun) * smoothstep(0.12, 0.62, original.r);
        sunlight += sunLight * (veinSheen * vec3(1.0, 0.90, 0.56) + barkRim * vec3(0.19, 0.15, 0.10));
        vec2 groundXZ = uIslandShadowOrigin + vec2(
          (photoUv.x - uIslandRawCentre.x) * uIslandRawWorldSize.x,
          (${ROOT_V} - photoUv.y) / ${GROUND_UV_PER_METRE} * uIslandScale);
        float palmShade = sampleIslandSunShadow(groundXZ) * sand;
        sunlight *= mix(vec3(1.0), vec3(0.40, 0.48, 0.60), palmShade);

        float night = uIslandNight;
        vec3 tint = vec3(1.0 - night * 0.93, 1.0 - night * 0.86, 1.0 - night * 0.76);
        tint *= 0.70 + min(0.30, uIslandSunStrength * 0.34);
        tint = mix(tint, uIslandSunColour, 0.18 * (1.0 - night));
        sunlight *= tint;

        // Under moonlight most of the colour is lost to the eye. Low blue
        // skylight fills the cast shadows; only the directional term is occluded.
        // The scene-wide light vector points at the visible moon after sunset.
        float value = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        vec3 nightAlbedo = mix(vec3(value), diffuseColor.rgb, 0.30);
        vec3 nightSky = vec3(0.005, 0.009, 0.015) * (0.80 + 0.20 * max(surfaceNormal.y, 0.0));
        float moonFace = max(0.0, (nDotSun + 0.12) / 1.12);
        float moonScattering = moonFace * dot(materialWeights, vec3(1.14, 0.96, 1.12));
        moonScattering += materialWeights.g * thinLeaf * pow(backSun, 1.7) * 0.085;
        // At this camera angle the visible beach slopes away from the low
        // moon. Rough sand also receives lunar light through diffuse scatter.
        moonScattering += sand * (0.10 + 0.12 * clamp(uIslandSunDirection.y, 0.0, 1.0));
        vec3 lunarColour = mix(vec3(0.56, 0.73, 1.00), uIslandSunColour, 0.32);
        float moonEdge = materialWeights.g * crown * thinLeaf * pow(nDotHalf, 31.0)
          * smoothstep(-0.05, 0.26, nDotSun) * 0.16;
        vec3 moonlit = nightAlbedo * nightSky + (nightAlbedo * moonScattering + moonEdge)
          * lunarColour * min(uIslandSunStrength, 0.13) * (1.0 - palmShade);
        diffuseColor.rgb = mix(sunlight, moonlit, smoothstep(0.12, 0.96, night));
        // Retain grain and hue in the brightest part of the pale sand.
        vec3 shoulder = max(diffuseColor.rgb - 0.78, vec3(0.0));
        diffuseColor.rgb = min(diffuseColor.rgb, vec3(0.78))
          + 0.22 * (1.0 - exp(-shoulder / 0.22));
      #endif
    `);
  };
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.position.z = -67;
  mesh.visible = false;
  let texture;
  let aspect = 1.35;

  function updateLighting(time = 0) {
    const gaitA = time * 0.28 + 0.56;
    const gaitB = time * 0.23 + 2.73;
    const stepA = Math.sin(gaitA + 0.54 * Math.sin(gaitA));
    const stepB = Math.sin(gaitB + 0.62 * Math.sin(gaitB));
    uniforms.uCrabA.value.set(0.34 + stepA * 0.041, 0.048 + stepA * 0.007,
      Math.floor((stepA + 1) * 29) % 8);
    uniforms.uCrabB.value.set(0.62 + stepB * 0.036, 0.065 - stepB * 0.008,
      Math.floor((stepB + 1) * 24) % 8);
    shadowUniforms.uIslandShadowOrigin.value.set(mesh.position.x, mesh.position.z);
    const { uSunDirection, uSunStrength, uNightMix } = environment.uniforms;
    const direction = uSunDirection.value;
    const night = uNightMix.value;
    const solarContrast = 0.78 * uSunStrength.value * (1 - night) ** 2;
    // Cast-shadow opacity expresses key-to-fill contrast, not absolute lux:
    // a moonlit patch of pale sand can be faint and still cast a clear shadow.
    const lunarContrast = 0.88 * THREE.MathUtils.smoothstep(night, 0.50, 0.94)
      * THREE.MathUtils.smoothstep(uSunStrength.value, 0.008, 0.070);
    shadowUniforms.uIslandShadowStrength.value = (solarContrast + lunarContrast)
      * THREE.MathUtils.smoothstep(direction.y, 0.006, 0.095);
    if (!texture) {
      shadowUniforms.uIslandShadowStrength.value = 0;
      return;
    }
    const width = mesh.scale.x / texture.repeat.x;
    const height = mesh.scale.y / texture.repeat.y;
    uniforms.uIslandRawWorldSize.value.set(width, height);
    uniforms.uIslandScale.value = mesh.scale.x / 25.1;
    if (shadowUniforms.uIslandShadowStrength.value < 0.002) return;
    if (width <= 0 || height <= 0) return;
    const elevation = Math.max(0.035, direction.y);
    const x = direction.x;
    const z = direction.z;
    const safeX = Math.abs(x) < 0.0001 ? 0.0001 : x;
    const safeZ = Math.abs(z) < 0.0001 ? 0.0001 : z;
    const rawCentre = uniforms.uIslandRawCentre.value.x;
    const depth = width * 0.32;
    shadowUniforms.uPalmFrontProjection.value.set(1 / width, -x / (safeZ * width),
      -elevation / (safeZ * height), rawCentre);
    shadowUniforms.uPalmSideProjection.value.set(-z / (safeX * depth), 1 / depth,
      -elevation / (safeX * height), rawCentre);
    shadowUniforms.uPalmShadowFilter.value.set(
      THREE.MathUtils.smoothstep(Math.abs(x) / Math.max(0.001, Math.hypot(x, z)), 0.76, 0.98),
      texture.image.height * 0.006 / elevation, 4.5,
    );
  }

  function load(onLoad) {
    const loader = new THREE.TextureLoader(loadingManager);
    let normalReady = false;
    let materialReady = false;
    const markNormalsReady = () => {
      uniforms.uIslandNormalsReady.value = normalReady && materialReady ? 1 : 0;
    };
    loader.load(new URL('./assets/island-normal.png', import.meta.url).href, data => {
      data.colorSpace = THREE.NoColorSpace;
      data.minFilter = THREE.LinearMipmapLinearFilter;
      data.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
      uniforms.uIslandNormalMap.value = data;
      normalReady = true; markNormalsReady();
    }, undefined, error => console.error('Island normal asset unavailable', error));
    loader.load(new URL('./assets/island-material.png', import.meta.url).href, data => {
      data.colorSpace = THREE.NoColorSpace;
      data.minFilter = THREE.LinearMipmapLinearFilter;
      data.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
      uniforms.uIslandMaterialMap.value = data;
      materialReady = true; markNormalsReady();
    }, undefined, error => console.error('Island material asset unavailable', error));
    loader.load(new URL('./assets/island.webp', import.meta.url).href, loaded => {
      texture = loaded;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
      aspect = frameTexture(texture);
      uniforms.uIslandPhotoTexel.value.set(1 / texture.image.width, 1 / texture.image.height);
      uniforms.uIslandRawCentre.value.copy(texture.offset).addScaledVector(texture.repeat, 0.5);
      shadowUniforms.uIslandShadowMap.value = texture;
      material.map = texture; material.needsUpdate = true; mesh.visible = true;
      onLoad?.();
      updateLighting();
    }, undefined, error => console.error('Island asset unavailable', error));
  }

  return { mesh, shadowUniforms, updateLighting, load, get aspect() { return aspect; } };
}
