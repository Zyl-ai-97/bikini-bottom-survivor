"use strict";

window.buildDiveEcology = function buildDiveEcology(mesh, floor, openTownSand, reserved) {
  const TAU = Math.PI * 2;
  const colliders = [];
  const rockFootprints = [];
  let seed = 890331;

  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  const range = (low, high) => low + (high - low) * random();
  const shadeColor = (color, amount) => color.map((component) => component * amount);
  const mixColor = (first, second, amount) => first.map((value, i) => value + amount * (second[i] - value));
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const subtract = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const times = (v, amount) => [v[0] * amount, v[1] * amount, v[2] * amount];
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
  const normalize = (v) => times(v, 1 / Math.hypot(...v));

  function quad(a, b, c, d, color, material, phase) {
    mesh.triangle(a, b, c, color, material, phase);
    mesh.triangle(a, c, d, color, material, phase);
  }

  const stoneColors = [
    [[0.41, 0.45, 0.46], [0.28, 0.32, 0.44], [0.52, 0.51, 0.39]],
    [[0.39, 0.43, 0.50], [0.32, 0.27, 0.45], [0.54, 0.53, 0.49]],
    [[0.47, 0.49, 0.45], [0.31, 0.40, 0.43], [0.59, 0.52, 0.39]],
    [[0.37, 0.44, 0.47], [0.29, 0.34, 0.43], [0.46, 0.50, 0.40]]
  ];
  const lookoutColors = {
    sandstone: [[0.57, 0.59, 0.52], [0.34, 0.43, 0.47], [0.71, 0.66, 0.50]],
    slate: [[0.15, 0.24, 0.33], [0.14, 0.20, 0.30], [0.29, 0.39, 0.45]],
    reef: [[0.28, 0.29, 0.42], [0.24, 0.20, 0.38], [0.41, 0.49, 0.51]]
  };
  const coralColors = [
    [[0.59, 0.30, 0.34], [0.88, 0.53, 0.52]],
    [[0.46, 0.36, 0.59], [0.72, 0.61, 0.82]],
    [[0.63, 0.43, 0.27], [0.91, 0.74, 0.51]],
    [[0.54, 0.43, 0.43], [0.84, 0.74, 0.62]]
  ];
  const grassColors = [
    [[0.10, 0.28, 0.24], [0.37, 0.60, 0.40]],
    [[0.16, 0.33, 0.23], [0.45, 0.62, 0.31]],
    [[0.12, 0.37, 0.35], [0.39, 0.64, 0.52]]
  ];

  function rock(x, z, baseWidth, baseHeight, baseLength, paletteIndex, solid = false) {
    const size = Math.max(baseWidth, baseLength);
    const distanceFromStart = Math.hypot(x, z - 9);
    const pebble = size < 0.45;
    let horizontalScale = 0.82;
    let verticalScale = 0.80;
    if (pebble) {
      horizontalScale = 0.94;
      verticalScale = 0.94;
    } else if (distanceFromStart < 14) {
      horizontalScale = 0.78;
      verticalScale = 0.76;
    } else {
      // Keep offshore silhouettes low and broken as the flats open toward the horizon.
      const distance = Math.min(1, Math.max(0, (distanceFromStart - 22) / 56));
      const recession = distance * distance * (3 - 2 * distance);
      horizontalScale *= 1 - 0.34 * recession;
      verticalScale *= 1 - 0.49 * recession;
    }
    const width = baseWidth * horizontalScale;
    const height = baseHeight * verticalScale;
    const length = baseLength * horizontalScale;
    const ground = floor(x, z);
    const palette = typeof paletteIndex === "number" ? stoneColors[paletteIndex] : paletteIndex;
    const direction = range(0, TAU);
    const cos = Math.cos(direction);
    const sin = Math.sin(direction);
    const offset = range(0, TAU);
    const slant = range(-0.26, 0.26);
    const near = distanceFromStart < 20;
    let sides = 11;
    let layers = 5;
    if (pebble) {
      sides = 8;
      layers = 4;
    } else if (near && size > 1.15) {
      sides = 22;
      layers = 9;
    } else if (near) {
      sides = 16;
      layers = 7;
    }
    const rows = [];
    for (let row = 0; row < layers; row += 1) {
      const t = row / layers;
      const ring = [];
      for (let side = 0; side < sides; side += 1) {
        const grid = side / sides * TAU;
        const theta = grid + (0.32 * (row % 2) + 0.30 * Math.sin(grid * 7 - row * 1.2 + offset)
          + 0.14 * Math.cos(grid * 4 + row * 1.7 - offset)) * TAU / sides;
        const ripple = Math.sin(theta * 5 + t * 10 + offset) * 0.045 * Math.sin(Math.PI * t);
        const latitude = -0.90 + t * (Math.PI * 0.5 + 0.90) + ripple;
        const lobes = 1 + 0.10 * Math.sin(theta * 3 + offset + latitude * 1.8)
          + 0.057 * Math.cos(theta * 4 - offset + latitude * 2.2)
          + 0.032 * Math.sin(theta * 7 + latitude * 4 + offset);
        const waist = Math.pow(Math.cos(latitude), 0.93);
        const localX = Math.cos(theta) * waist * lobes * width + t * t * slant * width;
        const localZ = Math.sin(theta) * waist * lobes * length;
        const y = ground + height * ((Math.sin(latitude) + 0.43) / 1.43
          + Math.sin(theta * 4 + latitude * 4 + offset) * 0.048 * waist);
        ring.push([x + localX * cos - localZ * sin, y, z + localX * sin + localZ * cos]);
      }
      rows.push(ring);
    }

    const summit = [x + slant * width * cos, ground + height, z + slant * width * sin];
    const occupied=reserved?.(x,z,Math.max(width,length)*1.22);
    for (let row = 0; row < layers; row += 1) {
      for (let side = 0; side < sides; side += 1) {
        const theta = (side + 0.5) / sides * TAU;
        const yPart = row / (layers - 1);
        const seam = Math.sin(theta * 2.0 + yPart * 5 + offset)
          + 0.28 * Math.cos(theta * 4 - yPart * 4 + offset);
        const fleck = Math.sin(theta * 4 + yPart * 8 - offset);
        const color = seam < -0.24
          ? mixColor(palette[0], palette[1], Math.min(0.42, -seam * 0.30))
          : mixColor(palette[0], palette[2], Math.max(0, fleck * 0.34));
        const tone = shadeColor(color, range(0.98, 1.02) * (0.75 + 0.25 * yPart));
        // Keep consuming the same seeded colour samples for the rest of the reef.
        if(occupied)continue;
        const next = (side + 1) % sides;
        if (row === layers - 1) {
          mesh.triangle(rows[row][side], summit, rows[row][next], tone, 0, 0);
        } else {
          quad(rows[row][side], rows[row + 1][side], rows[row + 1][next], rows[row][next], tone, 0, 0);
        }
      }
    }

    if (solid && !occupied) {
      colliders.push({ x, z, radius: Math.min(width, length) * 0.78, top: ground + height });
      rockFootprints.push({ x, z, cos, sin, width, length });
    }
    return summit;
  }

  function aroundRocks(x, z) {
    for (const rock of rockFootprints) {
      const dx = x - rock.x;
      const dz = z - rock.z;
      const localX = (dx * rock.cos + dz * rock.sin) / rock.width;
      const localZ = (-dx * rock.sin + dz * rock.cos) / rock.length;
      const hit = Math.hypot(localX, localZ);
      if (hit > 0 && hit < 1.1) {
        const scale = 1.1 / hit;
        x = rock.x + dx * scale;
        z = rock.z + dz * scale;
      }
    }
    return [x, z];
  }

  function tube(points, radii, colors, sides, material) {
    const rows = points.slice(0, -1).map((point, i) => {
      const tangent = normalize(subtract(points[i + 1], points[Math.max(0, i - 1)]));
      const ref = Math.abs(tangent[2]) > 0.91 ? [0, 1, 0] : [0, 0, 1];
      const u = normalize(cross(tangent, ref));
      const v = cross(tangent, u);
      return Array.from({ length: sides }, (_, j) => {
        const theta = j / sides * TAU;
        const offset = add(times(u, Math.cos(theta)), times(v, Math.sin(theta)));
        return add(point, times(offset, radii[i] * (1 + 0.07 * Math.sin(3 * theta + i * 0.65))));
      });
    });

    rows.forEach((row, i) => {
      for (let side = 0; side < sides; side += 1) {
        const next = (side + 1) % sides;
        const tone = shadeColor(colors[i], 0.97 + 0.043 * Math.cos(side / sides * TAU * 2 + i * 0.45));
        if (i === rows.length - 1) {
          mesh.triangle(row[side], row[next], points[points.length - 1], tone, material, 0);
        } else {
          quad(row[side], row[next], rows[i + 1][next], rows[i + 1][side], tone, material, 0);
        }
      }
    });
  }

  function branch(start, sideways, rise, radius, palette, tint, sides) {
    const bend = [-sideways[2] * 0.18, 0, sideways[0] * 0.18];
    const points = [];
    const profile = [[0, 1.09], [0.25, 0.93], [0.52, 0.77], [0.75, 0.66], [0.90, 0.54], [1, 0]];
    const colors = [];
    for (const [t] of profile) {
      const displacement = add(times(sideways, Math.sin(t * 1.32)), times(bend, Math.sin(t * Math.PI)));
      displacement[1] = rise * t;
      points.push(add(start, displacement));
      colors.push(mixColor(palette[0], palette[1], Math.min(0.96, t * 0.52 + tint)));
    }
    tube(points, profile.map(([, part]) => part * radius), colors, sides, 2);
    return points;
  }

  function treeCoral(x, z, scale, color, elevation = floor(x, z)) {
    const palette = coralColors[color];
    const ground = [x, elevation - 0.07, z];
    const trunk = branch(ground, times([range(-0.2, 0.2), 0, range(-0.22, 0.22)], scale),
      scale * 1.03, scale * 0.14, palette, 0.01, 8);
    const axis = range(0, TAU);
    const branches = scale < 1.42 ? 4 : 5;
    for (let i = 0; i < branches; i += 1) {
      const theta = axis + i * 2.39996 + range(-0.23, 0.23);
      const direction = [Math.cos(theta), 0, Math.sin(theta)];
      const rise = range(0.44, 0.65) * scale;
      const start = trunk[i < 3 ? 1 : 2];
      const limb = branch(start, times(direction, range(0.37, 0.57) * scale),
        rise, scale * range(0.085, 0.117), palette, 0.18, 6);
      const fork = [Math.cos(theta + 0.83), 0, Math.sin(theta + 0.83)];
      branch(limb[2], times(fork, scale * range(0.16, 0.23)), scale * range(0.27, 0.41),
        scale * 0.073, palette, 0.24, 5);
    }
  }

  function seaFan(x, z, scale, color, angle, elevation = floor(x, z)) {
    const palette = coralColors[color];
    const base = [x, elevation - 0.04, z];
    const axis = [Math.cos(angle), 0, Math.sin(angle)];
    const stem = branch(base, times(axis, scale * -0.08), scale * 0.96,
      scale * 0.067, palette, 0.12, 7);
    for (const sign of [-1, 1]) {
      for (let i = 0; i < 3; i += 1) {
        const width = sign * scale * (0.42 + i * 0.13);
        const stemPart = stem[i === 0 ? 2 : 1];
        const frond = branch(stemPart, times(axis, width), scale * (0.69 - i * 0.14),
          scale * 0.043, palette, 0.26 + 0.06 * i, 5);
        const branches = scale < 1.3 ? 3 : 4;
        for (let j = 1; j < branches; j += 1) {
          branch(frond[j], times(axis, sign * scale * range(0.085, 0.14)), scale * (0.25 - 0.035 * j),
            scale * 0.024, palette, 0.39, 4);
        }
      }
    }
  }

  function spongePatch(x, z, scale, color) {
    const palette = coralColors[color];
    const profile = [[-.09, .52], [.29, .73], [.64, .97], [.91, 1.04], [1, .83], [.91, .61], [.64, .47]];
    const shades = [0.60, 0.77, 0.88, 0.97, 1.08, 0.71, 0.32];
    const sides = 9;
    const count = scale < 1 ? 4 : 5;
    for (let cluster = 0; cluster < count; cluster += 1) {
      const angle = cluster * 2.39996 + range(-0.38, 0.38);
      const spread = scale * (cluster === 0 ? 0 : range(0.25, 0.42));
      const [startX, startZ] = aroundRocks(x + Math.cos(angle) * spread, z + Math.sin(angle) * spread);
      const ground = floor(startX, startZ);
      const height = scale * range(0.27, 0.65);
      const girth = scale * range(0.12, 0.19);
      const center = (t) => [startX + Math.cos(angle) * t * height * 0.29, ground + t * height,
        startZ + Math.sin(angle) * t * height * 0.29];
      const rows = profile.map(([t, radius]) => Array.from({ length: sides }, (_, i) => {
        const theta = i / sides * TAU;
        const bump = 1 + 0.085 * Math.cos(theta * 3 + angle) + 0.04 * Math.sin(theta * 4);
        const rim = Math.sin(theta * 3 + angle) * girth * 0.13 * t;
        return add(center(t), [Math.cos(theta) * girth * radius * bump, rim, Math.sin(theta) * girth * radius * bump]);
      }));
      const bottom = center(0.57);
      for (let ring = 0; ring < rows.length; ring += 1) {
        const pigment = shadeColor(mixColor(palette[0], palette[1], Math.min(0.55, ring * 0.13)), shades[ring]);
        for (let side = 0; side < sides; side += 1) {
          const next = (side + 1) % sides;
          if (ring === rows.length - 1) {
            mesh.triangle(rows[ring][side], bottom, rows[ring][next], pigment, 2, 0);
          } else {
            quad(rows[ring][side], rows[ring + 1][side], rows[ring + 1][next], rows[ring][next], pigment, 2, 0);
          }
        }
      }
    }
  }

  function meadow(x, z, height, count, paletteIndex, rootSpread = 0.28, bladeWidth = 1) {
    const colors = grassColors[paletteIndex];
    for (let blade = 0; blade < count; blade += 1) {
      const [bladeX, bladeZ] = aroundRocks(x + range(-rootSpread, rootSpread) * height,
        z + range(-rootSpread, rootSpread) * height);
      const origin = [bladeX, floor(bladeX, bladeZ) - 0.07, bladeZ];
      const length = height * range(0.48, 1.13);
      const width = length * range(0.045, 0.095) * bladeWidth;
      const wind = range(-0.55, 0.63);
      const heading = range(0, TAU);
      const phase = range(0, TAU);
      const rootedPhase = 32 + (Math.round(origin[1]*64)+512)*8 + phase;
      const axis = [Math.cos(heading), 0, Math.sin(heading)];
      const transverse = [axis[2], 0, -axis[0]];
      const rows = Array.from({ length: 8 }, (_, i) => {
        const t = i / 8;
        const curve = t * t * wind + 0.20 * Math.sin(t * 2.6 + phase) * t;
        const center = add(origin, add(times(axis, curve * length), [0, length * t * (1 - 0.16 * t), 0]));
        const spread = width * (0.20 + 0.80 * Math.sin(Math.PI * Math.pow(t, 0.70)));
        const twist = Math.cos(t * 2.8 + phase) * spread * 0.55;
        const edge = add(times(transverse, spread), [0, twist, 0]);
        return [subtract(center, edge), add(center, times(axis, spread * 0.34)), add(center, edge)];
      });
      const tip = add(origin, add(times(axis, length * (wind + 0.20 * Math.sin(2.6 + phase))), [0, length * 0.84, 0]));
      rows.forEach((row, i) => {
        const shade = mixColor(colors[0], colors[1], Math.pow(i / rows.length, 0.77) * 0.91);
        if (i === rows.length - 1) {
          mesh.triangle(row[0], row[1], tip, shade, 1, rootedPhase);
          mesh.triangle(row[1], row[2], tip, shadeColor(shade, 0.92), 1, rootedPhase);
        } else {
          quad(row[0], row[1], rows[i + 1][1], rows[i + 1][0], shade, 1, rootedPhase);
          quad(row[1], row[2], rows[i + 1][2], rows[i + 1][1], shadeColor(shade, 0.92), 1, rootedPhase);
        }
      });
    }
  }

  function scallop(x, z, size, ground = floor(x, z)) {
    const angle = range(0, TAU);
    const along = [Math.cos(angle), 0, Math.sin(angle)];
    const across = [along[2], 0, -along[0]];
    const base = [x, ground + 0.035, z];
    const rounds = 5;
    const ribs = 18;
    const rows = [];
    for (let ring = 1; ring <= rounds; ring += 1) {
      const t = ring / rounds;
      rows.push(Array.from({ length: ribs + 1 }, (_, i) => {
        const arc = (i / ribs - 0.5) * 2.28;
        const ridge = i % 2 ? 0.87 : 1;
        const arcLength = size * t * ridge;
        const position = add(times(along, Math.cos(arc) * arcLength), times(across, Math.sin(arc) * arcLength));
        position[1] = size * (0.27 * Math.sin(t * Math.PI * 0.83) + 0.065 * t * ridge);
        return add(base, position);
      }));
    }
    for (let i = 0; i < ribs; i += 1) {
      for (let ring = 0; ring < rounds; ring += 1) {
        const color = mixColor([0.52, 0.32, 0.31], [0.83, 0.67, 0.55], ring / rounds);
        const shade = shadeColor(color, i % 2 ? 0.9 : 1.06);
        if (ring === 0) {
          mesh.triangle(base, rows[0][i], rows[0][i + 1], shade, 0, 0);
        } else {
          quad(rows[ring - 1][i], rows[ring][i], rows[ring][i + 1], rows[ring - 1][i + 1], shade, 0, 0);
        }
      }
    }
  }

  // A dark lip sits in front of the sunlit slope on the left, with a more broken reef opposite.
  const slateCrest = rock(-4.38, 4.64, 2.92, 2.63, 1.57, lookoutColors.slate, true);
  const sandstoneCrest = rock(-4.12, 2.26, 2.62, 2.80, 1.91, lookoutColors.sandstone, true);
  const reefCrest = rock(4.72, 3.84, 2.39, 2.55, 1.81, lookoutColors.reef, true);
  rock(3.29, 4.60, 1.40, 1.71, 1.23, lookoutColors.reef, true);
  const outerCrest = rock(6.43, 2.70, 1.75, 1.67, 1.35, lookoutColors.slate, true);

  for (const [crest, size] of [[sandstoneCrest, 0.31], [reefCrest, 0.23]]) {
    const [x, y, z] = crest;
    scallop(x, z, size, y - 0.063);
  }

  const ledges = [
    [-6.58, 1.62, 1.56, 1.05, 1.28, 1], [-3.92, 0.33, 0.88, 0.52, 0.65, 0],
    [-6.65, -1.25, 1.46, 1.26, 1.12, 0], [-3.8, -1.4, 0.64, 0.35, 0.51, 2],
    [6.22, 0.73, 1.66, 1.12, 1.32, 3], [5.25, 0.3, 1.03, 0.68, 0.88, 1],
    [7.14, -2.7, 1.12, 0.95, 0.95, 1], [4.28, 0.95, 0.64, 0.46, 0.49, 2],
    [-4.80, -4.87, 0.6, 0.37, 0.48, 1], [-6.00, -5.95, 0.38, 0.23, 0.29, 2],
    [5.70, -7.45, 0.66, 0.32, 0.47, 0], [4.75, -5.45, 0.39, 0.22, 0.30, 2],
    // Low broken outcrops and uncovered sand give the middle distance a scale reference.
    [-9.20, -10.85, 1.02, 0.66, 0.86, 0], [-7.25, -8.7, 0.66, 0.40, 0.58, 3],
    [-12.24, -16.86, 1.04, 0.63, 0.84, 1], [-6.9, -12.9, 0.39, 0.28, 0.38, 2],
    [10.35, -11.40, 1.06, 0.63, 0.82, 1], [8.25, -11.96, 0.48, 0.31, 0.55, 2],
    [12.72, -15.50, 0.81, 0.68, 0.66, 0], [6.70, -16.05, 0.56, 0.34, 0.51, 3],
    [24.9, -41.1, 3.65, 2.94, 2.78, 1], [28.5, -38.5, 2.92, 2.33, 2.59, 3],
    [27.7, -42.4, 2.15, 2.44, 2.0, 2], [25.7, -34.3, 1.20, 0.87, 0.94, 1],
    [20.1, -40.1, 2.45, 1.63, 1.55, 0], [30.2, -33.4, 1.97, 1.82, 1.69, 1],
    [-25.0, -40.8, 3.64, 4.41, 3.01, 1], [-20.9, -47.4, 4.49, 4.75, 2.95, 0],
    [-16.5, -45.6, 2.35, 2.28, 1.94, 1], [-28.4, -45.8, 4.68, 3.32, 2.97, 3],
    [-24.3, -50.7, 3.44, 3.84, 2.29, 3], [-18.0, -36.9, 2.06, 1.50, 1.35, 2],
    [-29.1, -55.1, 4.16, 3.86, 2.65, 1], [-19.3, -57.6, 3.47, 2.98, 2.68, 3]
  ];
  ledges.forEach(([x, z, width, height, length, palette]) => {
    rock(x, z, width, height, length, palette, height > 0.65);
  });

  const gardens = [
    [-5.44, 2.25, 1.08, 0], [-4.30, -0.45, 0.87, 1], [-5.18, -2.90, 0.82, 2],
    [3.74, 1.41, 1.25, 0], [5.02, -3.63, 0.78, 1], [6.11, -1.34, 0.96, 2],
    [-6.70, -9.63, 0.61, 1], [-8.16, -12.6, 0.54, 0], [-9.07, -7.94, 0.58, 2],
    [7.02, -10.1, 0.55, 2], [10.32, -11.89, 0.57, 1],
    [22.0, -35.7, 1.59, 0], [26.12, -37.7, 1.85, 1], [27.0, -40.0, 1.30, 2],
    [22.4, -38.12, 1.32, 3], [24.82, -38.96, 1.21, 0], [28.29, -35.4, 1.19, 0],
    [24.73, -35.48, 1.45, 1], [19.98, -37.43, 1.12, 2], [32.12, -37.51, 1.68, 1],
    [-23.56, -44.64, 1.59, 1], [-17.86, -45.02, 1.10, 3]
  ];
  gardens.forEach(([x, z, scale, color], i) => {
    const [startX, startZ] = aroundRocks(x, z);
    if (i % 4 === 1) {
      seaFan(startX, startZ, scale, color, range(-0.64, 0.64));
    } else {
      treeCoral(startX, startZ, scale, color);
    }
  });

  [
    [-3.56, 1.74, 0.90, 2], [3.77, 3.74, 1.15, 2], [-4.23, -4.70, 0.96, 1],
    [24.31, -34.77, 1.23, 0], [28.08, -36.60, 1.34, 2], [-22.12, -43.60, 0.84, 1]
  ].forEach(([x, z, scale, color]) => spongePatch(x, z, scale, color));

  const seaweed = [
    [-5.03, 3.65, 2.30], [-3.72, -0.66, 0.91], [-5.68, -2.76, 1.35],
    [3.32, 2.13, 5.18, 0.10], [4.24, -2.17, 0.93], [5.30, -4.36, 0.99],
    [-6.60, -7.22, 0.61], [-8.35, -13.43, 0.58], [7.94, -13.37, 0.64],
    [20.81, -39.30, 1.74], [25.44, -36.38, 1.14], [26.27, -40.45, 1.50],
    [28.12, -35.31, 2.52], [-21.74, -39.52, 1.30], [-22.55, -45.16, 1.10]
  ];
  seaweed.forEach(([x, z, height, rootSpread], i) => meadow(x, z, height, 6 + i % 3, i % grassColors.length, rootSpread));

  // Move the three loose pebbles that fell inside the approach's sand corridor.
  const roadsidePebbleOffsets = new Map([[10,[1.45,-.42]], [11,[-1.22,-.04]], [45,[.93,.15]]]);
  for (let i = 0; i < 48; i += 1) {
    const [centerX, centerZ] = ledges[i % ledges.length];
    const [offsetX, offsetZ] = roadsidePebbleOffsets.get(i) || [0,0];
    const x = centerX + range(-2.84, 2.84) + offsetX;
    const z = centerZ + range(-2.20, 2.20) + offsetZ;
    const radius = range(0.12, 0.39);
    rock(x, z, radius, radius * range(0.44, 0.84), radius * range(0.63, 0.93), i % stoneColors.length);
  }

  [[-2.31, 0.65, 0.25], [2.53, -1.05, 0.36], [-3.71, -5.38, 0.34],
    [5.31, -8.62, 0.34], [21.38, -35.42, 0.33], [25.55, -39.16, 0.31],
    [26.16, -35.58, 0.35], [-19.7, -41.50, 0.29]]
    .forEach(([x, z, size]) => scallop(x, z, size));

  const distant = [
    [-18, -25, 1.05], [-13, -35, 0.69], [-4, -37, 0.49], [4, -29, 0.41],
    [9, -40, 1.02], [18.85, -46.9, 0.59], [31, -37, 1.22], [30, -14, 1.48],
    [22, 3, 1.36], [12, 14, 1.25], [-11, 17, 1.26], [-19, 8, 1.63],
    [-30, -13, 1.30], [-39, -25, 0.98], [-42, -52, 1.08], [-32, -64, 1.18],
    [-11, -62, 0.91], [6, -52, 0.64], [24, -57, 1.10], [43, -39, 1.22]
  ];
  distant.forEach(([x, z, size], i) => {
    const height = size * range(0.35, 0.67);
    rock(x, z, size, height, size * range(0.64, 0.9), i % stoneColors.length, height > 0.65);
    if (size > 0.9) {
      rock(x + 0.90 * size, z + 0.60 * size, 0.46 * size, 0.25 * size, 0.38 * size, (i + 1) % stoneColors.length);
    }
  });

  const offshoreOutcrops = [
    [-43, -68, 4.6, 1.9, 2.9], [39, -73, 4.2, 1.7, 2.7],
    [-32, -85, 2.9, 1.25, 2.1], [54, -88, 4.7, 1.6, 3.2],
    [-57, -105, 4.3, 1.52, 3.0], [30, -109, 3.0, 1.07, 1.9],
    [65, -122, 4.15, 1.37, 2.8], [-47, -131, 3.8, 1.18, 2.55],
    [44, -146, 3.9, 1.13, 2.8], [-71, -151, 4.15, 1.09, 2.7]
  ];
  offshoreOutcrops.forEach(([x, z, width, height, length], i) => {
    const east = i % 2 === 0 ? 1 : -1;
    rock(x, z, width, height, length, i % stoneColors.length, z > -82);
    rock(x + east * width * 0.9, z + length * 0.57,
      width * 0.53, height * 0.46, length * 0.62, (i + 1) % stoneColors.length);
    rock(x - east * width * 0.72, z - length * 0.8,
      width * 0.37, height * 0.33, length * 0.43, (i + 2) % stoneColors.length);
  });

  [[-14, -69, 0.63], [8, -76, 0.51], [18, -84, 0.78], [-12, -91, 0.42],
    [-24, -102, 0.73], [11, -105, 0.59], [23, -124, 0.59], [-18, -135, 0.43]]
    .forEach(([x, z, size], i) => rock(x, z, size, size * 0.46, size * 0.72, i % stoneColors.length));

  // Keep the near gardens independently seeded so offshore changes do not alter their silhouettes.
  seed = 673021;
  const [slateX, slateY, slateZ] = slateCrest;
  const [outerX, outerY, outerZ] = outerCrest;
  treeCoral(slateX + 0.23, slateZ - 0.24, 1.21, 0, slateY - 0.15);
  seaFan(outerX + 0.11, outerZ, 1.34, 0, 0.28, outerY - 0.12);

  [
    [-6.20, 0.12, 1.24, 2], [-5.88, -1.80, 0.82, 1], [-7.35, -3.18, 1.21, 0],
    [6.29, -0.64, 1.05, 2], [7.58, -2.46, 0.85, 0], [8.45, -5.30, 1.13, 1],
    [6.46, -7.05, 0.69, 2]
  ].forEach(([x, z, size, pigment]) => {
    const [startX, startZ] = aroundRocks(x, z);
    treeCoral(startX, startZ, size, pigment);
  });
  [
    [-6.75, 1.00, 1.46, 1, -0.19], [-8.34, -5.36, 0.92, 3, 0.19],
    [7.65, -3.83, 1.18, 0, -0.36]
  ].forEach(([x, z, size, pigment, bearing]) => {
    const [startX, startZ] = aroundRocks(x, z);
    seaFan(startX, startZ, size, pigment, bearing);
  });
  [
    [-5.72, 3.07, 0.98, 1], [-7.96, -4.43, 0.70, 2],
    [7.12, 1.45, 1.07, 2], [8.83, -5.61, 0.78, 1]
  ].forEach(([x, z, size, pigment]) => spongePatch(x, z, size, pigment));

  [
    [-6.52, 2.01, 3.35, 9, 1, 0.19], [-9.25, -5.35, 2.62, 8, 0, 0.26],
    [-4.70, -2.52, 1.24, 7, 2, 0.26], [-8.27, -6.29, 0.96, 7, 1, 0.29],
    [7.05, 1.68, 2.88, 8, 2, 0.24], [9.92, -5.95, 2.70, 8, 1, 0.27],
    [5.96, -5.51, 1.04, 7, 0, 0.27], [8.78, -7.24, 0.90, 6, 2, 0.24]
  ].forEach(([x, z, height, blades, pigment, spread]) => meadow(x, z, height, blades, pigment, spread, 0.72));

  // The south side is a sheltered eelgrass bed. The exposed outer banks carry
  // broad low stone shelves, so the view through either arch has a second shore.
  seed = 849731;
  const outerGardens = [
    [-7,39,1.9,.9,1.6], [11,42,3.3,2.0,2.4], [-20,46,5.0,2.7,3.7],
    [2,53,2.4,1.1,1.7], [22,57,4.1,1.9,3.0], [-11,62,6.4,3.8,3.3],
    [-32,66,7.3,4.1,4.6], [35,76,10.6,4.2,6.0], [-5,87,8.5,3.0,5.6],
    [8,109,11.8,4.4,6.2], [-52,47,8.3,3.7,5.2], [52,34,7.5,3.6,4.7],
    [66,12,7.4,4.5,5.5], [76,-17,10.8,3.3,5.8], [-69,8,7.0,3.9,4.9],
    [-84,-16,12.4,3.6,5.4], [-76,-76,11.8,3.8,6.0], [-82,-96,15,4,5.9],
    [70,-75,6.3,5.2,4.8], [84,-82,7.8,6.3,5.7], [65,-100,7.2,3.7,4.6]
  ];
  outerGardens.forEach(([x,z,width,height,depth],i)=>{
    const crest = rock(x,z,width,height,depth,i%4,true);
    const angle=range(0,TAU), dx=Math.cos(angle)*width*.7, dz=Math.sin(angle)*depth*.72;
    rock(x+dx,z+dz,width*.5,height*.63,depth*.58,(i+2)%4,true);
    rock(x-dx*.60,z-dz*.76,width*.31,height*.46,depth*.49,(i+1)%4);
    if (i%3===0) seaFan(crest[0],crest[2], Math.min(1.85,.55+height*.32),i%4,angle,crest[1]-.04);
    if (i%3===1) treeCoral(crest[0],crest[2],Math.min(2.1,.85+height*.33),i%4,crest[1]-.08);
    for (let j=0;j<3;j++) {
      const a=angle+j*1.2;
      const px=x+width*.85*Math.cos(a), pz=z+depth*.93*Math.sin(a);
      meadow(px,pz,range(1.25,3.5),5+j,i%3,.32,.68);
      if (j===1 && i<15) {
        const [sx,sz]=aroundRocks(px+1,pz-1.1);
        spongePatch(sx,sz,range(.6,1.25),i%4);
      }
    }
  });
  // Small colonies settle in pockets of sand between the streets and foundations.
  if (openTownSand) {
    seed = 630983;
    const beds = [[-3.6,-38],[-.2,-39.1],[2.6,-39.7],[-1.5,-42.4],[-4.8,-41.7],
      [3.4,-35.9],[6.3,-32.1],[6.8,-37.5],[10.8,-37.0],[8.9,-41.0],[13.4,-41.6],
      [-6.5,-45.5],[-10.1,-44.5],[-10.2,-48.9],[-6.0,-49.1],[-2.1,-48.1],
      [2.0,-45.7],[4.2,-48.3],[7.8,-48.7],[9.4,-53.6],[-4.9,-53.3],[2.8,-54.9]];
    for(const [i,[cx,cz]] of beds.entries()) {
      const size=range(.45,.78);
      for(let attempt=0;attempt<36;attempt++) {
        const x=cx+range(-1.1,1.1), z=cz+range(-.95,.95);
        const clear=openTownSand(x,z) && Array.from({length:10},(_,j)=>j*TAU/10)
          .every(a=>openTownSand(x+.64*Math.cos(a),z+.64*Math.sin(a)));
        if(!clear) continue;
        if(i%4===0) seaFan(x,z,size,i%3,range(-.9,.9));
        else if(i%4===3) treeCoral(x,z,size*.78,(i+1)%3);
        else spongePatch(x,z,size,i%3);
        meadow(x+.16,z-.17,size*.72,5,i%3,.12,.63);
        break;
      }
    }
  }
  return colliders;
};
