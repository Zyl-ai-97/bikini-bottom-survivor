import * as THREE from './vendor/three.module.js';

function terrainNoise(x, z) {
  const cellX = Math.floor(x);
  const cellZ = Math.floor(z);
  let u = x - cellX;
  let v = z - cellZ;
  u = u * u * (3 - 2 * u);
  v = v * v * (3 - 2 * v);
  const hash = (a, b) => {
    const value = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return value - Math.floor(value);
  };
  const low = THREE.MathUtils.lerp(hash(cellX, cellZ), hash(cellX + 1, cellZ), u);
  const high = THREE.MathUtils.lerp(hash(cellX, cellZ + 1), hash(cellX + 1, cellZ + 1), u);
  return THREE.MathUtils.lerp(low, high, v);
}

// Low overlapping rock ledges, in meters relative to the mean waterline.
const ledges = [
  [-3.22, 1.55, 0.99, 0.64, 0.43], [-2.18, 0.68, 0.73, 0.56, 0.32],
  [-1.36, 1.25, 0.90, 0.47, 0.25], [-0.54, -0.63, 0.75, 0.57, 0.38],
  [0.92, 1.13, 0.87, 0.52, 0.32], [1.91, -0.14, 1.20, 0.59, 0.43],
  [2.81, 0.81, 0.78, 0.72, 0.37], [-3.79, -1.0, 1.17, 0.57, 0.34],
];

function reefHeight(x, z) {
  const broad = terrainNoise(x * 0.19 + 8.2, z * 0.17 - 3.6);
  const folds = terrainNoise(x * 0.43 + broad * 1.3, z * 0.36 + 1.7);
  const ridgeCenter = 1.45 * Math.sin(z * 0.14 + 0.8) - 0.65;
  const ridge = Math.exp(-(((x - ridgeCenter) / 1.8) ** 2));
  const grooveField = terrainNoise(x * 0.48 + 19.1, z * 0.39 - 7.3);
  const grooves = Math.exp(-(((grooveField - 0.51) / 0.065) ** 2));
  const relief = (broad - 0.5) * 0.70 + (folds - 0.5) * 0.16
    + ridge * 0.20 - grooves * 0.12;
  const offshore = 2.10 * THREE.MathUtils.smoothstep(-z, 4, 17)
    + 3.20 * THREE.MathUtils.smoothstep(-z, 17, 44);
  let ledgeHeight = 0;
  if (z > -3.0 && z < 3.4 && Math.abs(x) < 5.5) {
    for (const [cx, cz, width, length, height] of ledges) {
      const dx = x - cx, dz = z - cz;
      const a = (dx * 0.89 - dz * 0.45) / width;
      const b = (dz * 0.89 + dx * 0.45) / length;
      const edge = a * a + b * b + (folds - 0.5) * 0.63;
      ledgeHeight = Math.max(ledgeHeight, height * (1 - THREE.MathUtils.smoothstep(edge, 0.37, 1.28)));
    }
  }
  return -1.60 + relief + ledgeHeight - offshore;
}

function makeReefGeometry(fastOptics) {
  const columns = fastOptics ? 96 : 168;
  const rows = fastOptics ? 104 : 176;
  const positions = new Float32Array((columns + 1) * (rows + 1) * 3);
  const indices = new Uint16Array(columns * rows * 6);
  const xDenominator = Math.sinh(2.3);
  let vertex = 0;
  let triangle = 0;
  for (let row = 0; row <= rows; row += 1) {
    const z = 16 - 106 * (row / rows) ** 1.65;
    for (let column = 0; column <= columns; column += 1) {
      const x = 45 * Math.sinh((column / columns * 2 - 1) * 2.3) / xDenominator;
      positions[vertex++] = x;
      positions[vertex++] = reefHeight(x, z);
      positions[vertex++] = z;
      if (row < rows && column < columns) {
        const a = row * (columns + 1) + column;
        const b = a + 1;
        const c = a + columns + 1;
        const d = c + 1;
        indices[triangle++] = a;
        indices[triangle++] = b;
        indices[triangle++] = c;
        indices[triangle++] = b;
        indices[triangle++] = d;
        indices[triangle++] = c;
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

const reefMaterialFunctions = /* glsl */ `
  varying vec3 vReefWorld;
  varying vec3 vReefWorldNormal;
  uniform float uReefTime;
  uniform sampler2D uReefCaustic;
  uniform vec2 uReefCausticDrift;
  uniform float uReefCausticTile;
  uniform float uReefCausticEnabled;
  uniform vec3 uReefSunDirection;
  uniform vec3 uReefSunColor;
  uniform float uReefSunStrength;
  uniform float uReefNightMix;

  float reefHash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }

  float reefNoise(vec2 p) {
    vec2 cell = floor(p);
    vec2 blend = fract(p);
    blend = blend * blend * (3.0 - 2.0 * blend);
    return mix(mix(reefHash(cell), reefHash(cell + vec2(1.0, 0.0)), blend.x),
      mix(reefHash(cell + vec2(0.0, 1.0)), reefHash(cell + 1.0), blend.x), blend.y);
  }

  float reefMineral(vec2 p) {
    mat2 rotate = mat2(0.81, 0.59, -0.59, 0.81);
    #ifdef REEF_FAST_OPTICS
      return reefNoise(p) * 0.67 + reefNoise(rotate * p * 2.13 + 7.3) * 0.33;
    #else
    return reefNoise(p) * 0.57 + reefNoise(rotate * p * 2.13 + 7.3) * 0.28
      + reefNoise(rotate * p * 4.71 - 11.6) * 0.15;
    #endif
  }

  vec3 reefBumpNormal(vec3 surfacePosition, vec3 surfaceNormal, float height) {
    vec3 derivativeX = dFdx(surfacePosition);
    vec3 derivativeY = dFdy(surfacePosition);
    vec3 basisX = cross(derivativeY, surfaceNormal);
    vec3 basisY = cross(surfaceNormal, derivativeX);
    float determinant = dot(derivativeX, basisX);
    vec3 gradient = sign(determinant) * (dFdx(height) * basisX + dFdy(height) * basisY);
    return normalize(abs(determinant) * surfaceNormal - gradient);
  }
`;

function makeReefMaterial(uniforms, fastOptics) {
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.96 });
  material.customProgramCacheKey = () => fastOptics ? 'mineral-reef-fast' : 'continuous-mineral-reef-caustic';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec3 vReefWorld;\nvarying vec3 vReefWorldNormal;\n'
      + shader.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
         vReefWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
         vReefWorldNormal = normalize(mat3(modelMatrix) * normal);`);
    shader.fragmentShader = (fastOptics ? '#define REEF_FAST_OPTICS 1\n' : '')
      + reefMaterialFunctions + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>',
      `#include <color_fragment>
       vec2 reefCoordinate = vReefWorld.xz + vReefWorld.y * vec2(0.27, -0.21);
       vec2 mineralWarp = vec2(reefNoise(reefCoordinate * 0.23),
         reefNoise(reefCoordinate * 0.21 + 17.8)) * 0.85;
       float mineral = reefMineral(reefCoordinate * 0.66 + mineralWarp);
       float broadMineral = reefNoise(reefCoordinate * 0.19 - 13.7);
       #ifdef REEF_FAST_OPTICS
         float grain = reefNoise(reefCoordinate * 39.0);
         float localCracks = 0.0;
       #else
       float grain = reefNoise(reefCoordinate * 39.0) * 0.56
         + reefNoise(reefCoordinate * 73.0 + 9.2) * 0.44;
       float crackField = reefNoise(reefCoordinate * 1.75 + mineralWarp * 1.8);
       float crackWidth = max(0.009, fwidth(crackField) * 0.85);
       float localCracks = (1.0 - smoothstep(crackWidth, crackWidth * 2.2,
         abs(crackField - 0.49))) * smoothstep(0.57, 0.77, broadMineral);
       #endif
       float mineralLight = smoothstep(0.31, 0.69, mineral);
       vec3 reefAlbedo = mix(vec3(0.022, 0.068, 0.061), vec3(0.282, 0.35, 0.213),
         mineralLight);
       reefAlbedo = mix(reefAlbedo, vec3(0.056, 0.105, 0.083),
         smoothstep(0.62, 0.83, broadMineral) * 0.30);
       reefAlbedo *= 0.96 + grain * 0.075;
       reefAlbedo *= 1.0 - localCracks * 0.24;
       diffuseColor.rgb *= reefAlbedo;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
       float mineralRelief = (grain - 0.5) * 0.0038
         + (mineral - 0.5) * 0.012 - localCracks * 0.004;
       normal = reefBumpNormal(-vViewPosition, normal, mineralRelief);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>',
      `#include <lights_fragment_end>
       float reefDepth = max(0.0, -vReefWorld.y);
       vec3 downwardSun = refract(-normalize(uReefSunDirection), vec3(0.0, 1.0, 0.0), 0.7501875);
       vec2 lightEntry = vReefWorld.xz - downwardSun.xz
         * (reefDepth / max(-downwardSun.y, 0.24));
       vec2 causticUv = (lightEntry - uReefCausticDrift * uReefTime) / uReefCausticTile;
       float focusedSun = texture2D(uReefCaustic, causticUv).r;
       float reefSunFacing = max(dot(normalize(vReefWorldNormal), -downwardSun), 0.0);
       float focalVisibility = exp(-max(reefDepth - 1.15, 0.0) * 0.72);
       float daylightCaustic = uReefCausticEnabled * uReefSunStrength
         * (1.0 - uReefNightMix) * reefSunFacing * focalVisibility;
       vec3 sunTransmission = exp(-vec3(0.20, 0.060, 0.043)
         * reefDepth / max(-downwardSun.y, 0.24));
       reflectedLight.directDiffuse *= sunTransmission;
       vec3 concentratedLight = diffuseColor.rgb * 7.8 + vec3(0.10, 0.44, 0.19);
       reflectedLight.directDiffuse += concentratedLight * uReefSunColor
         * sunTransmission * focusedSun * daylightCaustic;`);
  };
  return material;
}

export function createUnderwater(renderer, environment, floatTarget, { fastOptics = false } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#062539');
  const camera = new THREE.PerspectiveCamera();
  const depth = new THREE.DepthTexture(2, 2, THREE.UnsignedIntType);
  const target = new THREE.WebGLRenderTarget(2, 2, {
    type: floatTarget ? THREE.HalfFloatType : THREE.UnsignedByteType,
    depthTexture: depth,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });

  const skylight = new THREE.HemisphereLight('#b1d7dd', '#29454c', 1.05);
  const sunlight = new THREE.DirectionalLight('#a9daf0', 1.3);
  const filteredSun = new THREE.Color('#5bc8e7');
  scene.add(skylight, sunlight);

  const emptyCaustic = new THREE.DataTexture(new Uint8Array([0]), 1, 1,
    THREE.RedFormat, THREE.UnsignedByteType);
  emptyCaustic.needsUpdate = true;
  const reefUniforms = {
    uReefTime: { value: 0 },
    uReefCaustic: { value: emptyCaustic },
    uReefCausticDrift: { value: new THREE.Vector2(0.20, 0.055) },
    uReefCausticTile: { value: 10.24 },
    uReefCausticEnabled: { value: 0 },
    uReefSunDirection: environment.uniforms.uSunDirection,
    uReefSunColor: environment.uniforms.uSunColor,
    uReefSunStrength: environment.uniforms.uSunStrength,
    uReefNightMix: environment.uniforms.uNightMix,
  };
  const reef = new THREE.Mesh(makeReefGeometry(fastOptics), makeReefMaterial(reefUniforms, fastOptics));
  reef.name = 'Continuous submerged mineral reef';
  reef.receiveShadow = true;
  scene.add(reef);
  let sharedCaustics = null;

  const texelSize = new THREE.Vector2(0.5, 0.5);
  const viewProjection = new THREE.Matrix4();
  const uniforms = {
    uTransmissionEnabled: { value: 0 },
    uTransmissionMap: { value: target.texture },
    uTransmissionDepth: { value: depth },
    uTransmissionTexelSize: { value: texelSize },
    uTransmissionInvProjection: { value: camera.projectionMatrixInverse },
    uTransmissionCameraWorld: { value: camera.matrixWorld },
    uTransmissionViewProjection: { value: viewProjection },
  };

  function resize(width, height, resolutionScale = 1) {
    const scale = Math.min(0.62, 1024 / width, 650 / height) * resolutionScale;
    const pixelsX = Math.max(2, Math.round(width * scale));
    const pixelsY = Math.max(2, Math.round(height * scale));
    if (target.width === pixelsX && target.height === pixelsY) return;
    target.setSize(pixelsX, pixelsY);
    texelSize.set(1 / pixelsX, 1 / pixelsY);
    uniforms.uTransmissionEnabled.value = 0;
  }

  function update(time = reefUniforms.uReefTime.value) {
    reefUniforms.uReefTime.value = Number.isFinite(time) ? time : 0;
    if (!sharedCaustics) return;
    reefUniforms.uReefCaustic.value = sharedCaustics.uWindCaustic.value;
    reefUniforms.uReefCausticDrift.value = sharedCaustics.uWindDriftA.value;
    reefUniforms.uReefCausticTile.value = sharedCaustics.uWindTileLengths.value.x;
  }

  function setSunCaustics(windUniforms) {
    sharedCaustics = windUniforms?.uWindCaustic ? windUniforms : null;
    reefUniforms.uReefCausticEnabled.value = sharedCaustics ? 1 : 0;
    if (!sharedCaustics) reefUniforms.uReefCaustic.value = emptyCaustic;
    update();
  }

  function render(mainCamera) {
    // Overscan captures the refracted ray after it bends outside the main frame.
    camera.copy(mainCamera, false);
    camera.fov = mainCamera.fov + 32;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

    const { uSunDirection, uSunColor, uSunStrength, uNightMix } = environment.uniforms;
    const night = uNightMix.value;
    sunlight.position.copy(uSunDirection.value).multiplyScalar(24);
    sunlight.color.copy(uSunColor.value).lerp(filteredSun, 0.25 + night * 0.38);
    sunlight.intensity = uSunStrength.value * 1.38;
    skylight.intensity = 1.15 - night * 0.88;
    update();

    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    uniforms.uTransmissionEnabled.value = 1;
  }

  return { scene, uniforms, resize, render, setSunCaustics, update };
}
