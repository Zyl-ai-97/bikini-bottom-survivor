import * as THREE from './vendor/three.module.js';

// The two periodic fields use different world-space extents and directions.
// Slopes are dimensionless height derivatives, and lengths/velocities use meters.
const CASCADES = [
  {
    tileLength: 10.24,
    minimumWavelength: 0.24,
    maximumWavelength: 1.10,
    peaks: [[0.29, 0.22, 0.22], [0.57, 0.30, 0.55], [0.91, 0.18, 0.23]],
    direction: 0.22,
    crossingDirection: 1.68,
    slopeRms: 0.098,
  },
  {
    tileLength: 6.40,
    minimumWavelength: 0.08,
    maximumWavelength: 0.34,
    peaks: [[0.115, 0.22, 0.38], [0.225, 0.28, 0.62]],
    direction: -0.43,
    crossingDirection: 1.20,
    slopeRms: 0.052,
  },
];

function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return (state + 0.5) / 4294967296;
  };
}

function inverseFftLine(real, imaginary) {
  const size = real.length;
  for (let index = 1, reversed = 0; index < size; index += 1) {
    let bit = size >> 1;
    while (reversed & bit) {
      reversed ^= bit;
      bit >>= 1;
    }
    reversed ^= bit;
    if (index < reversed) {
      [real[index], real[reversed]] = [real[reversed], real[index]];
      [imaginary[index], imaginary[reversed]] = [imaginary[reversed], imaginary[index]];
    }
  }

  for (let blockSize = 2; blockSize <= size; blockSize *= 2) {
    const angle = Math.PI * 2 / blockSize;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);
    const halfBlock = blockSize >> 1;
    for (let block = 0; block < size; block += blockSize) {
      let twiddleReal = 1;
      let twiddleImaginary = 0;
      for (let offset = 0; offset < halfBlock; offset += 1) {
        const first = block + offset;
        const second = first + halfBlock;
        const productReal = real[second] * twiddleReal - imaginary[second] * twiddleImaginary;
        const productImaginary = real[second] * twiddleImaginary + imaginary[second] * twiddleReal;
        real[second] = real[first] - productReal;
        imaginary[second] = imaginary[first] - productImaginary;
        real[first] += productReal;
        imaginary[first] += productImaginary;
        const nextReal = twiddleReal * stepReal - twiddleImaginary * stepImaginary;
        twiddleImaginary = twiddleReal * stepImaginary + twiddleImaginary * stepReal;
        twiddleReal = nextReal;
      }
    }
  }

  for (let index = 0; index < size; index += 1) {
    real[index] /= size;
    imaginary[index] /= size;
  }
}

function inverseFft2D(real, imaginary, size) {
  const lineReal = new Float64Array(size);
  const lineImaginary = new Float64Array(size);
  for (let row = 0; row < size; row += 1) {
    const start = row * size;
    lineReal.set(real.subarray(start, start + size));
    lineImaginary.set(imaginary.subarray(start, start + size));
    inverseFftLine(lineReal, lineImaginary);
    real.set(lineReal, start);
    imaginary.set(lineImaginary, start);
  }
  for (let column = 0; column < size; column += 1) {
    for (let row = 0; row < size; row += 1) {
      const index = row * size + column;
      lineReal[row] = real[index];
      lineImaginary[row] = imaginary[index];
    }
    inverseFftLine(lineReal, lineImaginary);
    for (let row = 0; row < size; row += 1) {
      const index = row * size + column;
      real[index] = lineReal[row];
      imaginary[index] = lineImaginary[row];
    }
  }
}

function spectrumPower(wavelength, direction, cascade) {
  let radialPower = 0;
  for (const [peak, width, weight] of cascade.peaks) {
    const frequencyOffset = Math.log(wavelength / peak) / width;
    radialPower += weight * Math.exp(-0.5 * frequencyOffset * frequencyOffset);
  }
  const mainAlignment = Math.abs(Math.cos(direction - cascade.direction));
  const crossingAlignment = Math.abs(Math.cos(direction - cascade.crossingDirection));
  const directionalPower = 0.055 + 0.76 * mainAlignment ** 8
    + 0.23 * crossingAlignment ** 12;
  return radialPower * directionalPower;
}

function createSlopeField(size, cascade, seed) {
  const random = randomGenerator(seed);
  const sampleCount = size * size;
  const heightReal = new Float32Array(sampleCount);
  const heightImaginary = new Float32Array(sampleCount);
  const slopeXReal = new Float32Array(sampleCount);
  const slopeXImaginary = new Float32Array(sampleCount);
  const slopeZReal = new Float32Array(sampleCount);
  const slopeZImaginary = new Float32Array(sampleCount);
  const waveNumberUnit = Math.PI * 2 / cascade.tileLength;
  let activeModes = 0;

  for (let row = 0; row < size; row += 1) {
    const frequencyZ = row <= size / 2 ? row : row - size;
    for (let column = 0; column < size; column += 1) {
      const frequencyX = column <= size / 2 ? column : column - size;
      const index = row * size + column;
      const opposite = ((size - row) % size) * size + (size - column) % size;
      if (index >= opposite) continue;
      const radialFrequency = Math.hypot(frequencyX, frequencyZ);
      const wavelength = cascade.tileLength / radialFrequency;
      if (wavelength < cascade.minimumWavelength || wavelength > cascade.maximumWavelength) continue;

      const direction = Math.atan2(frequencyZ, frequencyX);
      const waveNumber = waveNumberUnit * radialFrequency;
      // A k^-4 height spectrum gives the specified slope energy per log band.
      const amplitude = Math.sqrt(spectrumPower(wavelength, direction, cascade))
        / (waveNumber * waveNumber);
      const gaussianRadius = Math.sqrt(-2 * Math.log(random()));
      const phase = Math.PI * 2 * random();
      const real = amplitude * gaussianRadius * Math.cos(phase);
      const imaginary = amplitude * gaussianRadius * Math.sin(phase);
      heightReal[index] = real;
      heightImaginary[index] = imaginary;
      heightReal[opposite] = real;
      heightImaginary[opposite] = -imaginary;
      activeModes += 1;
    }
  }

  for (let row = 0; row < size; row += 1) {
    const waveNumberZ = (row <= size / 2 ? row : row - size) * waveNumberUnit;
    for (let column = 0; column < size; column += 1) {
      const waveNumberX = (column <= size / 2 ? column : column - size) * waveNumberUnit;
      const index = row * size + column;
      slopeXReal[index] = -waveNumberX * heightImaginary[index];
      slopeXImaginary[index] = waveNumberX * heightReal[index];
      slopeZReal[index] = -waveNumberZ * heightImaginary[index];
      slopeZImaginary[index] = waveNumberZ * heightReal[index];
    }
  }

  inverseFft2D(heightReal, heightImaginary, size);
  inverseFft2D(slopeXReal, slopeXImaginary, size);
  inverseFft2D(slopeZReal, slopeZImaginary, size);

  const groupPhase = Math.PI * 2 * random();
  const groupPhase2 = Math.PI * 2 * random();
  let squaredSlope = 0;
  let squaredHeight = 0;
  for (let row = 0; row < size; row += 1) {
    const v = row / size;
    for (let column = 0; column < size; column += 1) {
      const u = column / size;
      const index = row * size + column;
      const phaseA = Math.PI * 2 * (2 * u + v) + groupPhase;
      const phaseB = Math.PI * 2 * (-u + 3 * v) + groupPhase2;
      const phaseC = Math.PI * 2 * (4 * u - 2 * v) - groupPhase;
      const envelope = 1 + 0.24 * Math.sin(phaseA) + 0.17 * Math.sin(phaseB)
        + 0.12 * Math.sin(phaseC);
      const envelopeX = waveNumberUnit * (0.48 * Math.cos(phaseA)
        - 0.17 * Math.cos(phaseB) + 0.48 * Math.cos(phaseC));
      const envelopeZ = waveNumberUnit * (0.24 * Math.cos(phaseA)
        + 0.51 * Math.cos(phaseB) - 0.24 * Math.cos(phaseC));
      const height = heightReal[index];
      // Product-rule derivatives keep the wave groups a coherent height field.
      slopeXReal[index] = slopeXReal[index] * envelope + height * envelopeX;
      slopeZReal[index] = slopeZReal[index] * envelope + height * envelopeZ;
      heightReal[index] = height * envelope;
      squaredSlope += slopeXReal[index] ** 2 + slopeZReal[index] ** 2;
      squaredHeight += heightReal[index] ** 2;
    }
  }

  const normalization = cascade.slopeRms / Math.sqrt(squaredSlope / sampleCount);
  const moments = new Float32Array(sampleCount * 4);
  let varianceX = 0;
  let varianceZ = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const slopeX = slopeXReal[index] * normalization;
    const slopeZ = slopeZReal[index] * normalization;
    const offset = index * 4;
    moments[offset] = slopeX;
    moments[offset + 1] = slopeZ;
    moments[offset + 2] = slopeX * slopeX;
    moments[offset + 3] = slopeZ * slopeZ;
    varianceX += slopeX * slopeX;
    varianceZ += slopeZ * slopeZ;
  }
  return {
    moments,
    activeModes,
    variance: [varianceX / sampleCount, varianceZ / sampleCount],
    heightRms: Math.sqrt(squaredHeight / sampleCount) * normalization,
  };
}

function createMomentTexture(moments, size, name) {
  const mipmaps = [];
  let level = moments;
  let width = size;
  while (width >= 1) {
    const packed = new Uint16Array(level.length);
    for (let index = 0; index < level.length; index += 1) {
      packed[index] = THREE.DataUtils.toHalfFloat(level[index]);
    }
    mipmaps.push({ data: packed, width, height: width });
    if (width === 1) break;

    const nextWidth = width / 2;
    const next = new Float32Array(nextWidth * nextWidth * 4);
    for (let row = 0; row < nextWidth; row += 1) {
      for (let column = 0; column < nextWidth; column += 1) {
        const source = (row * 2 * width + column * 2) * 4;
        const destination = (row * nextWidth + column) * 4;
        for (let channel = 0; channel < 4; channel += 1) {
          next[destination + channel] = (level[source + channel]
            + level[source + 4 + channel]
            + level[source + width * 4 + channel]
            + level[source + width * 4 + 4 + channel]) * 0.25;
        }
      }
    }
    level = next;
    width = nextWidth;
  }

  const texture = new THREE.DataTexture(mipmaps[0].data, size, size,
    THREE.RGBAFormat, THREE.HalfFloatType);
  texture.name = name;
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.mipmaps = mipmaps;
  texture.generateMipmaps = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

function createCausticTexture(moments, sourceSize, tileLength, strength) {
  const size = Math.min(256, sourceSize / 2);
  const flux = new Float32Array(size * size);
  const sunlight = new THREE.Vector3(0.43, 0.53, -0.73).normalize().negate();
  const eta = 1 / 1.333;
  const flatY = -Math.sqrt(1 - eta * eta * (1 - sunlight.y * sunlight.y));
  const flatX = eta * sunlight.x / -flatY;
  const flatZ = eta * sunlight.z / -flatY;
  const depths = [0.65, 0.90, 1.15];
  const sourceFlux = size * size / (sourceSize * sourceSize * depths.length);

  // A bilinear splat integrates each ray over neighboring receiving pixels.
  // The large cascade is oversampled relative to this small flux texture.
  for (let row = 0; row < sourceSize; row += 1) {
    for (let column = 0; column < sourceSize; column += 1) {
      const index = (row * sourceSize + column) * 4;
      const slopeX = moments[index] * strength;
      const slopeZ = moments[index + 1] * strength;
      const normalY = 1 / Math.sqrt(1 + slopeX * slopeX + slopeZ * slopeZ);
      const normalX = -slopeX * normalY;
      const normalZ = -slopeZ * normalY;
      const incidentDot = sunlight.x * normalX + sunlight.y * normalY + sunlight.z * normalZ;
      const refraction = eta * incidentDot + Math.sqrt(1 - eta * eta * (1 - incidentDot * incidentDot));
      const rayY = eta * sunlight.y - refraction * normalY;
      const shiftX = (eta * sunlight.x - refraction * normalX) / -rayY - flatX;
      const shiftZ = (eta * sunlight.z - refraction * normalZ) / -rayY - flatZ;
      const projectedFlux = Math.max(0.2, -incidentDot / (normalY * -sunlight.y)) * sourceFlux;
      for (const depth of depths) {
        const hitX = (column + 0.5) / sourceSize * size + shiftX * depth / tileLength * size - 0.5;
        const hitZ = (row + 0.5) / sourceSize * size + shiftZ * depth / tileLength * size - 0.5;
        const floorX = Math.floor(hitX);
        const floorZ = Math.floor(hitZ);
        const fractionX = hitX - floorX;
        const fractionZ = hitZ - floorZ;
        const x0 = (floorX % size + size) % size;
        const z0 = (floorZ % size + size) % size;
        const x1 = (x0 + 1) % size;
        const z1 = (z0 + 1) % size;
        flux[z0 * size + x0] += projectedFlux * (1 - fractionX) * (1 - fractionZ);
        flux[z0 * size + x1] += projectedFlux * fractionX * (1 - fractionZ);
        flux[z1 * size + x0] += projectedFlux * (1 - fractionX) * fractionZ;
        flux[z1 * size + x1] += projectedFlux * fractionX * fractionZ;
      }
    }
  }

  const horizontal = new Float32Array(flux.length);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const index = row * size + column;
      horizontal[index] = flux[index] * 0.76
        + flux[row * size + (column + size - 1) % size] * 0.12
        + flux[row * size + (column + 1) % size] * 0.12;
    }
  }
  let totalFlux = 0;
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const index = row * size + column;
      flux[index] = horizontal[index] * 0.76
        + horizontal[((row + size - 1) % size) * size + column] * 0.12
        + horizontal[((row + 1) % size) * size + column] * 0.12;
      totalFlux += flux[index];
    }
  }

  const meanFlux = totalFlux / flux.length;
  const sortedFlux = Float32Array.from(flux, value => value / meanFlux).sort();
  const threshold = Math.max(1.15, sortedFlux[Math.floor(sortedFlux.length * 0.78)]);
  const whitePoint = Math.max(threshold + 0.35, sortedFlux[Math.floor(sortedFlux.length * 0.996)]);
  const pixels = Uint8Array.from(flux, value => {
    const focused = THREE.MathUtils.clamp((value / meanFlux - threshold) / (whitePoint - threshold), 0, 1);
    return Math.round(255 * focused ** 1.2);
  });
  const sortedIntensity = Uint8Array.from(pixels).sort();
  const quantiles = Object.fromEntries([0.5, 0.75, 0.90, 0.95, 0.99, 0.995].map(fraction => [
    `p${fraction * 100}`,
    sortedIntensity[Math.floor((sortedIntensity.length - 1) * fraction)] / 255,
  ]));
  const brightFraction = pixels.reduce((count, value) => count + Number(value > 127), 0) / pixels.length;
  const meanIntensity = pixels.reduce((sum, value) => sum + value, 0) / (255 * pixels.length);
  const mipmaps = [];
  let level = Float32Array.from(pixels);
  for (let width = size; width >= 1; width /= 2) {
    mipmaps.push({ data: Uint8Array.from(level, Math.round), width, height: width });
    if (width === 1) break;
    const nextWidth = width / 2;
    const next = new Float32Array(nextWidth * nextWidth);
    for (let row = 0; row < nextWidth; row += 1) {
      for (let column = 0; column < nextWidth; column += 1) {
        const source = row * 2 * width + column * 2;
        next[row * nextWidth + column] = (level[source] + level[source + 1]
          + level[source + width] + level[source + width + 1]) * 0.25;
      }
    }
    level = next;
  }

  const texture = new THREE.DataTexture(mipmaps[0].data, size, size,
    THREE.RedFormat, THREE.UnsignedByteType);
  texture.name = 'Focused sunlight flux';
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.mipmaps = mipmaps;
  texture.generateMipmaps = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return {
    texture,
    statistics: { resolution: size, depths, meanFlux, threshold, whitePoint,
      meanIntensity, brightFraction, quantiles },
  };
}

export const windWaveGLSL = /* glsl */ `
  uniform sampler2D uWindSlopeA;
  uniform sampler2D uWindSlopeB;
  uniform sampler2D uWindCaustic;
  uniform vec2 uWindTileLengths;
  uniform vec2 uWindDriftA;
  uniform vec2 uWindDriftB;
  uniform float uWindStrength;

  struct WindWaveDetail {
    vec2 slope;
    vec2 variance;
  };

  float sampleWindCaustic(vec2 worldXZ, float time) {
    vec2 uv = (worldXZ - uWindDriftA * time) / uWindTileLengths.x;
    return texture2D(uWindCaustic, uv).r;
  }

  WindWaveDetail sampleWindWaves(vec2 worldXZ, float time) {
    // A second rotated spectrum prevents the visible tile or grid alignment
    // produced by repeating one normal map. The transpose maps gradients back.
    mat2 rotateB = mat2(0.819152, 0.573576, -0.573576, 0.819152);
    mat2 unrotateB = mat2(0.819152, -0.573576, 0.573576, 0.819152);
    vec2 uvA = (worldXZ - uWindDriftA * time) / uWindTileLengths.x;
    vec2 uvB = (rotateB * worldXZ - uWindDriftB * time) / uWindTileLengths.y;
    vec4 fieldA = texture2D(uWindSlopeA, uvA);
    vec4 fieldB = texture2D(uWindSlopeB, uvB);
    vec2 unresolvedA = max(fieldA.ba - fieldA.rg * fieldA.rg, vec2(0.0));
    vec2 unresolvedB = max(fieldB.ba - fieldB.rg * fieldB.rg, vec2(0.0));
    vec2 rotatedVarianceB = vec2(
      0.671010 * unresolvedB.x + 0.328990 * unresolvedB.y,
      0.328990 * unresolvedB.x + 0.671010 * unresolvedB.y
    );
    WindWaveDetail detail;
    detail.slope = (fieldA.rg + unrotateB * fieldB.rg) * uWindStrength;
    detail.variance = (unresolvedA + rotatedVarianceB)
      * uWindStrength * uWindStrength;
    return detail;
  }
`;

/**
 * Generate immutable slope moments and focused sunlight once, before animation.
 * Merge `uniforms` into ShaderMaterial, interpolate `windWaveGLSL` into its
 * fragment shader, then call `sampleWindWaves(worldXZ, time)` once per fragment.
 * Add `.slope` to the resolved wave slopes. Feed `.variance` to the sun BRDF's
 * unresolved slope variance instead of attenuating or discarding this energy.
 * Existing analytic swell and CPU buoyancy can retain their current shapes.
 * The variance is diagonal in world X/Z, suitable for the current approximate
 * anisotropic BRDF. It should not be counted again as analytic noise variance.
 * `sampleWindCaustic(worldXZ, time)` returns sparse 0–1 sunlight concentration,
 * precomputed for the midday sun and averaged over 0.65/0.90/1.15m depths.
 * The caller supplies visibility, refracted view position and depth weighting.
 */
export function createWindWaves({ resolution = 512, seed = 9327, strength = 0.90 } = {}) {
  if (!Number.isInteger(resolution) || !THREE.MathUtils.isPowerOfTwo(resolution)
    || resolution < 256 || resolution > 1024) {
    throw new RangeError('Wind wave resolution must be a power of two from 256 to 1024.');
  }
  if (!Number.isFinite(seed) || !Number.isFinite(strength) || strength < 0) {
    throw new RangeError('Wind wave seed and nonnegative strength must be finite.');
  }
  const fields = CASCADES.map((cascade, index) => createSlopeField(resolution, cascade, seed + index * 7919));
  const textures = fields.map((field, index) => createMomentTexture(field.moments,
    resolution, `Directional wind slope moments ${index + 1}`));
  const caustic = createCausticTexture(fields[0].moments, resolution, CASCADES[0].tileLength, strength);
  const uniforms = {
    uWindSlopeA: { value: textures[0] },
    uWindSlopeB: { value: textures[1] },
    uWindCaustic: { value: caustic.texture },
    uWindTileLengths: { value: new THREE.Vector2(CASCADES[0].tileLength, CASCADES[1].tileLength) },
    uWindDriftA: { value: new THREE.Vector2(0.20, 0.055) },
    uWindDriftB: { value: new THREE.Vector2(0.12, -0.075) },
    uWindStrength: { value: strength },
  };
  return {
    uniforms,
    glsl: windWaveGLSL,
    statistics: fields.map((field, index) => ({
      tileLength: CASCADES[index].tileLength,
      minimumWavelength: CASCADES[index].minimumWavelength,
      maximumWavelength: CASCADES[index].maximumWavelength,
      activeModes: field.activeModes,
      slopeRms: CASCADES[index].slopeRms,
      heightRms: field.heightRms,
      varianceXZ: field.variance,
      mipLevels: textures[index].mipmaps.length,
    })),
    causticStatistics: caustic.statistics,
    dispose() {
      textures.forEach(texture => texture.dispose());
      caustic.texture.dispose();
    },
  };
}
