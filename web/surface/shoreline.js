import * as THREE from './vendor/three.module.js';
import { waveFunctions } from './ocean.js';
import { makeShoreWrack } from './shore-life.js';

const SHORE_SEGMENTS = 96;
const RIBBON_ROWS = 7;

function readSandContour(texture) {
  const image = texture.image;
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = Math.round(canvas.width * image.height / image.width);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const samples = [];

  // Search only the bottom of the framed image, below the palm canopy.
  const bottomRow = Math.min(canvas.height - 3,
    Math.floor((1 - texture.offset.y) * canvas.height));
  const topRow = Math.max(0,
    Math.floor((1 - texture.offset.y - texture.repeat.y * 0.22) * canvas.height));
  for (let column = 0; column <= SHORE_SEGMENTS; column += 1) {
    const u = column / SHORE_SEGMENTS;
    const sourceX = Math.min(canvas.width - 1,
      Math.max(0, Math.round((texture.offset.x + u * texture.repeat.x) * canvas.width)));
    let bottom = null;
    for (let row = bottomRow; row >= topRow; row -= 1) {
      const pixel = (row * canvas.width + sourceX) * 4;
      const red = pixels[pixel];
      const green = pixels[pixel + 1];
      const blue = pixels[pixel + 2];
      const opaque = pixels[pixel + 3] > 96;
      const sand = red > green * 0.9 && green > blue * 1.10 && green > red * 0.58;
      const solidAbove = pixels[pixel - canvas.width * 4 + 3] > 96
        && pixels[pixel - canvas.width * 8 + 3] > 96;
      if (opaque && sand && solidAbove) {
        bottom = ((1 - (row + 0.5) / canvas.height) - texture.offset.y) / texture.repeat.y;
        break;
      }
    }
    if (bottom !== null) samples.push({ u, bottom });
  }

  // The fallback still follows the visible sand base if an alternate image
  // uses a different sand palette or cannot supply a continuous contour.
  if (samples.length < 8) {
    return [{ u: 0.13, bottom: 0 }, { u: 0.87, bottom: 0 }];
  }
  return samples.map((sample, index) => ({
    u: sample.u,
    bottom: (samples[Math.max(0, index - 1)].bottom + sample.bottom * 2
      + samples[Math.min(samples.length - 1, index + 1)].bottom) / 4,
  }));
}

function softenIslandEdge(island, time) {
  const material = island.material;
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = function onBeforeCompile(shader, renderer) {
    previousCompile.call(this, shader, renderer);
    shader.uniforms.uIslandShoreTime = time;
    shader.vertexShader = `varying vec3 vIslandShorePoint;\n${shader.vertexShader}`.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\nvIslandShorePoint = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    );
    shader.fragmentShader = `uniform float uIslandShoreTime;\nvarying vec3 vIslandShorePoint;\n${waveFunctions}\n${shader.fragmentShader}`.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
       float shoreCameraDistance = distance(cameraPosition.xz, vIslandShorePoint.xz);
       float shoreWaterHeight = surfaceHeightAtDistance(vIslandShorePoint.xz,
         uIslandShoreTime, shoreCameraDistance);
       float shoreLap = sin(vIslandShorePoint.x * 0.84 - uIslandShoreTime * 1.23)
         * sin(vIslandShorePoint.x * 1.37 + uIslandShoreTime * 0.68) * 0.052;
       float shoreHeight = vIslandShorePoint.y - shoreWaterHeight - shoreLap;
       float shoreWet = 1.0 - smoothstep(0.02, 0.23, shoreHeight);
       diffuseColor.rgb *= mix(vec3(1.0), vec3(0.74, 0.86, 0.89), shoreWet * 0.48);
       diffuseColor.a *= smoothstep(-0.065, 0.075, shoreHeight);`,
    );
  };
  material.customProgramCacheKey = () => `${previousKey}|soft-island-shore`;
  material.needsUpdate = true;
}

const vertexShader = /* glsl */ `
  uniform float uShoreTime;
  varying vec3 vShoreWorld;
  varying float vShoreDistance;
  varying float vAlongShore;
  varying float vShoreEndFade;
  attribute vec3 shoreData;

  ${waveFunctions}

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    float cameraDistance = distance(cameraPosition.xz, world.xz);
    float surgePhase = uShoreTime * 1.17 + shoreData.y * 0.48;
    float lip = (shoreData.x - 0.14 - 0.13 * sin(surgePhase)) / 0.19;
    float arrival = smoothstep(0.06, 0.89, cos(surgePhase));
    float washHeight = exp(-lip * lip) * arrival * shoreData.z * 0.095;
    world.y = surfaceHeightAtDistance(world.xz, uShoreTime, cameraDistance) + 0.012 + washHeight;
    vShoreWorld = world.xyz;
    vShoreDistance = shoreData.x;
    vAlongShore = shoreData.y;
    vShoreEndFade = shoreData.z;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform float uShoreTime;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform float uSunStrength;
  uniform vec3 uSkyHorizon;
  uniform float uNightMix;
  varying vec3 vShoreWorld;
  varying float vShoreDistance;
  varying float vAlongShore;
  varying float vShoreEndFade;

  float shorelineHash(vec2 p) {
    vec3 seed = fract(p.xyx * 0.1031);
    seed += dot(seed, seed.yzx + 33.33);
    return fract((seed.x + seed.y) * seed.z);
  }

  float shorelineNoise(vec2 p) {
    vec2 cell = floor(p);
    vec2 local = fract(p);
    local = local * local * (3.0 - 2.0 * local);
    return mix(
      mix(shorelineHash(cell), shorelineHash(cell + vec2(1.0, 0.0)), local.x),
      mix(shorelineHash(cell + vec2(0.0, 1.0)), shorelineHash(cell + vec2(1.0)), local.x),
      local.y
    );
  }

  void main() {
    float t = uShoreTime;
    float localSwell = shorelineNoise(vec2(vAlongShore * 1.9, t * 0.24));
    float fine = shorelineNoise(vShoreWorld.xz * 6.7 + vec2(t * 0.16, -t * 0.21));
    float phase = t * 1.17 + vAlongShore * 0.48 + localSwell * 0.64;
    float surge = 0.13 + 0.14 * sin(phase) + 0.035 * sin(phase * 1.71 + 0.8);
    float rippleEdge = vShoreDistance - surge - (fine - 0.5) * 0.044;
    float edgeWidth = max(fwidth(vShoreDistance) * 0.85, 0.021);
    float foamEdge = rippleEdge / edgeWidth;
    float wetEdge = (rippleEdge - 0.075) / (edgeWidth * 1.8);
    float fineArc = exp(-foamEdge * foamEdge);
    float broken = smoothstep(0.42, 0.73, localSwell * 0.71 + fine * 0.29);
    float arriving = smoothstep(0.02, 0.76, cos(phase));
    float foam = fineArc * broken * arriving * vShoreEndFade;

    float wash = smoothstep(-0.12, 0.02, vShoreDistance)
      * (1.0 - smoothstep(0.23, 0.65, vShoreDistance));
    wash *= (0.5 + 0.5 * sin(phase - 0.5)) * vShoreEndFade;
    float sheen = exp(-wetEdge * wetEdge) * (0.3 + fine * 0.7) * arriving;
    float daylight = 1.0 - uNightMix * 0.90;
    float sunlit = 0.6 + 0.4 * clamp(uSunDirection.y, 0.0, 1.0);
    vec3 water = (vec3(0.004, 0.065, 0.085) + uSkyHorizon * 0.12) * daylight;
    vec3 foamColor = mix(vec3(0.55, 0.72, 0.75), uSunColor * 0.82, 0.30)
      * daylight * sunlit;
    vec3 color = mix(water, foamColor, clamp(foam * 1.9, 0.0, 1.0));
    color += uSunColor * sheen * 0.028 * uSunStrength;
    float alpha = max(wash * 0.17, foam * 0.60) + sheen * 0.052;
    alpha *= smoothstep(-0.12, -0.025, vShoreDistance)
      * (1.0 - smoothstep(0.50, 0.70, vShoreDistance));
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color, min(alpha, 0.62));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createShoreline(island, environment) {
  const time = { value: 0 };
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.ShaderMaterial({
    uniforms: { ...environment.uniforms, uShoreTime: time },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Island shoreline wash';
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  mesh.visible = false;
  const wrack = makeShoreWrack(environment, time, waveFunctions);
  mesh.add(wrack.mesh);
  softenIslandEdge(island, time);

  const worldPosition = new THREE.Vector3();
  const worldScale = new THREE.Vector3();
  let texture = null;
  let contour = null;
  let sizeX = 0;
  let sizeY = 0;

  function rebuildRibbon() {
    const left = contour[0].u;
    const right = contour[contour.length - 1].u;
    const beachWidth = (right - left) * worldScale.x;
    const frontDepth = THREE.MathUtils.clamp(beachWidth * 0.055, 0.25, 0.85);
    const minimumEdge = Math.min(...contour.map(sample => sample.bottom));
    const points = [];
    let sampleIndex = 0;
    for (let column = 0; column <= SHORE_SEGMENTS; column += 1) {
      const along = column / SHORE_SEGMENTS;
      const u = THREE.MathUtils.lerp(left, right, along);
      while (sampleIndex < contour.length - 2 && contour[sampleIndex + 1].u < u) sampleIndex += 1;
      const a = contour[sampleIndex];
      const b = contour[Math.min(sampleIndex + 1, contour.length - 1)];
      const blend = (u - a.u) / Math.max(b.u - a.u, 0.0001);
      const edge = THREE.MathUtils.lerp(a.bottom, b.bottom, blend);
      const arch = Math.sqrt(Math.max(0, 1 - Math.pow(along * 2 - 1, 2)));
      const rise = Math.min((edge - minimumEdge) * worldScale.y * 0.5, 0.28);
      points.push(new THREE.Vector2((u - 0.5) * worldScale.x, 0.08 + frontDepth * arch - rise));
    }

    const positions = [];
    const shoreData = [];
    const indices = [];
    for (let column = 0; column <= SHORE_SEGMENTS; column += 1) {
      const point = points[column];
      const before = points[Math.max(0, column - 1)];
      const after = points[Math.min(SHORE_SEGMENTS, column + 1)];
      const normal = new THREE.Vector2(-(after.y - before.y), after.x - before.x).normalize();
      const along = column / SHORE_SEGMENTS;
      const endFade = THREE.MathUtils.smoothstep(along, 0, 0.09)
        * (1 - THREE.MathUtils.smoothstep(along, 0.91, 1));
      for (let row = 0; row <= RIBBON_ROWS; row += 1) {
        const distance = THREE.MathUtils.lerp(-0.12, 0.70, row / RIBBON_ROWS);
        positions.push(point.x + normal.x * distance, 0, point.y + normal.y * distance);
        shoreData.push(distance, point.x, endFade);
        if (column < SHORE_SEGMENTS && row < RIBBON_ROWS) {
          const a = column * (RIBBON_ROWS + 1) + row;
          const b = a + RIBBON_ROWS + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('shoreData', new THREE.Float32BufferAttribute(shoreData, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    sizeX = worldScale.x;
    sizeY = worldScale.y;
    wrack.islandWidth.value = sizeX;
  }

  function update(seconds) {
    time.value = seconds;
    const nextTexture = island.material.map;
    mesh.visible = island.visible && Boolean(nextTexture?.image);
    if (!mesh.visible) return;
    island.getWorldPosition(worldPosition);
    island.getWorldScale(worldScale);
    mesh.position.set(worldPosition.x, 0, worldPosition.z);
    if (texture !== nextTexture) {
      texture = nextTexture;
      contour = readSandContour(texture);
      sizeX = 0;
    }
    if (Math.abs(sizeX - worldScale.x) > 0.001 || Math.abs(sizeY - worldScale.y) > 0.001) {
      rebuildRibbon();
    }
  }

  return { mesh, update };
}
