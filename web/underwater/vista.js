(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const WOOD = 10;
  const PAINT = 13;
  const FLOWER = 14;
  const ACCENT = 15;
  const FLOATING_SHELL = 26;
  const add = (a, b) => a.map((value, i) => value + b[i]);
  const sub = (a, b) => a.map((value, i) => value - b[i]);
  const scale = (v, s) => v.map(value => value * s);
  const unit = v => scale(v, 1 / Math.max(0.00001, Math.hypot(...v)));
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
  const mix = (a, b, amount) => a.map((value, i) => value + (b[i] - value) * amount);

  const shellCenter = [-14.65, 17.55, -35];
  const shellSize = 2.78;
  const shellHinge = [-17.2, 17.7];
  const shellRoll = [.032, .55];
  const shellBob = [.15, .72];
  const shellPlacement = ([x,y,z]) => add(shellCenter, scale([.967*x - .255*z, y - .062*x, .255*x + .967*z], shellSize));

  function shellPoint(sign, u, v, exterior) {
    const lateral = 2 * v - 1;
    const width = .81 * u ** .74;
    const pleats = (.017 + .027 * u) * Math.cos(5 * TAU * v + .26 * u);
    const join = Math.cos(lateral * Math.PI * .5);
    const archedLip = .44 + .12 * join + pleats * .64;
    const dome = (sign > 0 ? .42 : .21) * Math.sin(Math.PI * u) * join ** .73;
    const thickness = exterior * (.043 + .088 * Math.sin(Math.PI * u)) * join;
    return shellPlacement([
      -.99 + u * (1.91 + .28 * join) + u * pleats * .75,
      sign * (u ** .86 * archedLip + dome + thickness + u * pleats) + .045 * u * lateral,
      lateral * width + .13 * Math.sin(u * Math.PI)
    ]);
  }

  // The crown of the upper lid, sampled on the same grid as the visible mesh.
  const crown = shellPoint(1, 9 / 16, 22 / 36, 1);
  window.diveOpeningShell = {
    hinge: shellHinge, roll: shellRoll, bob: shellBob,
    crownAt(time) {
      const roll = shellRoll[0] * Math.sin(time * shellRoll[1]);
      const sin = Math.sin(roll), cos = Math.cos(roll);
      const dx = crown[0] - shellHinge[0], dy = crown[1] - shellHinge[1];
      return { roll, position: [shellHinge[0] + cos * dx - sin * dy,
        shellHinge[1] + sin * dx + cos * dy + shellBob[0] * Math.sin(time * shellBob[1]), crown[2]] };
    },
  };

  // Normalized strokes, with Y increasing upwards.
  const letters = {
    B: [[[0,0],[0,1],[.61,1],[.84,.87],[.84,.68],[.62,.53],[0,.53]],
        [[.62,.53],[.88,.39],[.88,.16],[.64,0],[0,0]]],
    I: [[[.5,0],[.5,1]], [[.19,1],[.81,1]], [[.19,0],[.81,0]]],
    K: [[[0,0],[0,1]], [[.87,1],[0,.45],[.92,0]]],
    N: [[[0,0],[0,1],[.87,0],[.87,1]]],
    O: [[[.24,0],[0,.19],[0,.81],[.23,1],[.65,1],[.88,.81],[.88,.19],[.65,0],[.24,0]]],
    T: [[[.44,0],[.44,1]], [[0,1],[.88,1]]],
    M: [[[0,0],[0,1],[.44,.43],[.90,1],[.90,0]]]
  };

  window.buildDiveVista = function buildDiveVista(mesh, floor, reserved) {
    const colliders = [];
    const rockSurfaces = [];

    function quad(a, b, c, d, color, material, phase = 0) {
      mesh.triangle(a, b, c, color, material, phase);
      mesh.triangle(a, c, d, color, material, phase);
    }

    function surface(rows, columns, point, pigment, material, wrap = false, reverse = false, faces) {
      const grid = Array.from({ length: rows + 1 }, (_, row) =>
        Array.from({ length: columns + Number(!wrap) }, (_, column) =>
          point(row / rows, column / columns)
        )
      );
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const next = (column + 1) % grid[row].length;
          const a = grid[row][column];
          const b = grid[row + 1][column];
          const c = grid[row + 1][next];
          const d = grid[row][next];
          const color = pigment((row + 0.5) / rows, (column + 0.5) / columns);
          if (reverse) quad(a, d, c, b, color, material);
          else quad(a, b, c, d, color, material);
          if (faces) faces.push([a,b,c], [a,c,d]);
        }
      }
    }

    function tube(points, radius, pigment, material, sides = 8) {
      const frames = points.map((point, i) => {
        const direction = unit(sub(points[Math.min(i + 1, points.length - 1)], points[Math.max(i - 1, 0)]));
        const reference = Math.abs(direction[2]) < 0.92 ? [0,0,1] : [0,1,0];
        const across = unit(cross(reference, direction));
        return [across, cross(across, direction)];
      });
      surface(points.length - 1, sides, (u, v) => {
        const i = Math.round(u * (points.length - 1));
        const [across, normal] = frames[i];
        const thickness = radius(u, v);
        const angle = v * TAU;
        return add(points[i], add(scale(across, thickness * Math.cos(angle)), scale(normal, thickness * Math.sin(angle))));
      }, pigment, material, true);
    }

    function ellipsoid(center, radii, color, material, relief = 0, seed = 0, compact = false, faces) {
      const extent = Math.max(...radii);
      const rings = compact ? (extent > .65 ? 7 : 4) : (extent > .65 ? 11 : extent > .20 ? 8 : 5);
      const sides = compact ? (extent > .65 ? 15 : 7) : (extent > .65 ? 22 : extent > .20 ? 14 : 8);
      surface(rings, sides, (u, v) => {
        const theta = v * TAU;
        const latitude = (u - 0.5) * Math.PI;
        const height = Math.sin(latitude);
        const waist = Math.cos(latitude);
        const roughness = 1 + relief * (0.6 * Math.sin(3 * theta + latitude * 3 + seed)
          + 0.28 * Math.cos(7 * theta - latitude * 5 + seed));
        return add(center, [
          radii[0] * waist * Math.cos(theta) * roughness,
          radii[1] * height * (1 + (roughness - 1) * waist),
          radii[2] * waist * Math.sin(theta) * roughness
        ]);
      }, (u, v) => scale(color, 0.74 + 0.29 * u + 0.10 * Math.sin(v * TAU * 3 + seed + 8 * u)), material, true, false, faces);
    }

    function boulder(x, z, width, height, depth, color, seed, solid = true, compact = false) {
      const base = floor(x, z) - 0.12;
      const faces = width > .65 ? [] : undefined;
      ellipsoid([x, base, z], [width, height, depth], color, 0, 0.31, seed, compact, faces);
      if (faces) rockSurfaces.push({ x, z, width:width * 1.28, depth:depth * 1.28, faces });
      if (solid) colliders.push({ x, z, radius: Math.min(width, depth) * 0.80, top: base + height });
      return base + height;
    }

    function surfaceHeight(x, z) {
      let y = floor(x,z);
      for (const rock of rockSurfaces) {
        if (Math.abs(rock.x - x) > rock.width || Math.abs(rock.z - z) > rock.depth) continue;
        for (const [a,b,c] of rock.faces) {
          const dx = x - a[0], dz = z - a[2];
          const bx = b[0] - a[0], bz = b[2] - a[2];
          const cx = c[0] - a[0], cz = c[2] - a[2];
          const det = bx * cz - bz * cx;
          if (Math.abs(det) < 1e-10) continue;
          const u = (dx * cz - dz * cx) / det;
          const v = (bx * dz - bz * dx) / det;
          if (u >= -1e-8 && v >= -1e-8 && u + v <= 1 + 1e-8) y = Math.max(y,a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1]));
        }
      }
      return y;
    }

    function welcomeSign() {
      const x = -5.25;
      const z = 11.7;
      const platform = boulder(x - 0.98, z + 0.18, 3.65, 2.95, 2.55, [.62,.61,.49], 1.8);
      const center = [x, platform + 3.78, z];
      const radius = 1.69;
      const thickness = 0.50;
      const ringWidth = angle => thickness * (1 + 0.04 * Math.cos(angle * 7) - 0.022 * Math.cos(angle * 11));
      const ring = (u, v) => {
        const angle = u * TAU;
        const turn = v * TAU;
        const width = ringWidth(angle);
        return add(center, [
          (radius + width * Math.cos(turn)) * Math.cos(angle),
          (radius + width * Math.cos(turn)) * Math.sin(angle),
          width * Math.sin(turn)
        ]);
      };
      const foot = [x - .64 * 1.91, 0, z - .505];
      foot[1] = surfaceHeight(foot[0],foot[2]) - .18;
      const finial = add(center, [.36 * 1.91,2.41,-.015]);
      const post = t => mix(foot,finial,t);
      tube(Array.from({ length: 14 }, (_, i) => post(i / 13)), u => 0.165 + 0.024 * Math.sin(u * 13),
        (u, v) => mix([.45,.25,.11], [.86,.59,.30], 0.50 + 0.37 * Math.sin(TAU * (v * 3 + u * 0.22))), WOOD, 12);
      ellipsoid(post(1), [.178,.166,.169], [.74,.49,.24], WOOD);
      for (const t of [0.16, 0.39, 0.58, 0.90]) {
        tube([post(t - .016), post(t), post(t + .016)], u => 0.192 + .02 * Math.sin(u * Math.PI),
          () => [.29,.17,.09], WOOD, 12);
      }

      function paint(u, v) {
        const angle = u * TAU;
        const band = Math.abs(Math.sin(2 * (angle - .07))) > .968;
        if (band) {
          const centerStripe = Math.abs(Math.sin(2 * (angle - .07))) > .994;
          return scale(centerStripe ? [.14,.42,.66] : [.10,.30,.53], .95 + .085 * Math.sin(v * TAU));
        }
        const enamel = mix([.91,.41,.125], [.79,.255,.075], Math.abs(Math.sin(angle)) ** 4);
        const grains = Math.sin(u * 159 + Math.sin(v * 61) * 1.7) * Math.sin(v * 95 + 13 * u);
        const broadWear = .10 * Math.cos(angle * 11 + 2 * Math.sin(v * TAU));
        const ivoryMask = Math.max(0, Math.min(1, (Math.abs(Math.cos(angle)) - .685 + broadWear * .18) * 11));
        const ivory = mix([.90,.83,.64], [.71,.49,.28], Math.max(0, broadWear + grains * .14));
        const tinted = mix(enamel, [1,.61,.29], Math.max(0, broadWear + grains * .085));
        return mix(tinted, ivory, ivoryMask * (.94 + .06 * grains));
      }
      surface(124, 22, ring, paint, PAINT, true);

      for (let quarter = 0; quarter < 4; quarter++) {
        const start = .855 + quarter * Math.PI / 2;
        const points = Array.from({ length: 44 }, (_, i) => {
          const t = i / 43;
          const angle = start + t * Math.PI / 2;
          const distance = radius + .39 + .38 * Math.sin(Math.PI * t);
          return add(center, [distance * Math.cos(angle), distance * Math.sin(angle), -.03 + .11 * Math.cos(TAU * t)]);
        });
        tube(points, () => .053, (u,v) =>
          mix([.14,.27,.38], [.34,.48,.54], .52 + .30 * Math.sin(TAU * (u * 10 - v))), PAINT, 8);
      }

      function label(word, angle, direction, face) {
        const width = .255;
        const height = .34;
        const ink = [1,.96,.82];
        function onRing([lx, ly]) {
          const tubeWidth = ringWidth(Math.atan2(ly,lx));
          const depth = Math.sqrt(Math.max(0,tubeWidth ** 2 - (Math.hypot(lx,ly) - radius) ** 2));
          return add(center,[lx,ly,face * (depth + .006)]);
        }
        function inkTriangle(a, b, c) {
          if (face > 0) mesh.triangle(a, b, c, ink, PAINT);
          else mesh.triangle(a, c, b, ink, PAINT);
        }
        for (let i = 0; i < word.length; i++) {
          const position = angle + direction * (i - (word.length - 1) / 2) * .198;
          const tx = -Math.sin(position) * direction;
          const ty = Math.cos(position) * direction;
          const rx = Math.cos(position) * -direction;
          const ry = Math.sin(position) * -direction;
          for (const stroke of letters[word[i]]) {
            const corners = stroke.map(([u, v]) => {
              const lx = face * (radius * Math.cos(position) + tx * (u - .44) * width + rx * (v - .50) * height);
              const ly = radius * Math.sin(position) + ty * (u - .44) * width + ry * (v - .50) * height;
              return [lx, ly, 0];
            });
            const strokeRadius = .027;
            // Sample along each stroke so the paint follows the curved ring.
            for (let j = 1; j < corners.length; j++) {
              const from = corners[j - 1], to = corners[j];
              const segment = sub(to, from);
              const offset = scale(unit([-segment[1], segment[0], 0]), strokeRadius);
              const steps = Math.ceil(Math.hypot(...segment) / .04);
              let left = onRing(add(from, offset)), right = onRing(sub(from, offset));
              for (let step = 1; step <= steps; step++) {
                const point = mix(from, to, step / steps);
                const nextLeft = onRing(add(point, offset)), nextRight = onRing(sub(point, offset));
                inkTriangle(left, right, nextRight);
                inkTriangle(left, nextRight, nextLeft);
                left = nextLeft;
                right = nextRight;
              }
            }
            // A small ink disk joins the segments and rounds the stroke ends.
            for (const corner of corners) {
              const middle = onRing(corner);
              for (let step = 0; step < 8; step++) {
                const a = step * TAU / 8, b = (step + 1) * TAU / 8;
                const edge = angle => onRing([corner[0] + Math.cos(angle) * strokeRadius, corner[1] + Math.sin(angle) * strokeRadius]);
                inkTriangle(middle, edge(a), edge(b));
              }
            }
          }
        }
      }
      for (const face of [1,-1]) {
        label('BIKINI', Math.PI / 2 - .027, -1, face);
        label('BOTTOM', -Math.PI / 2 - .044, 1, face);
      }
      return { x: x - .38, z };
    }

    function flower(x, y, z, radius, tilt, color, phase = 0) {
      const bearing = .17 + .13 * Math.cos(phase * 2.4);
      const world = (dx,dy,dz = 0) => [
        x + dx * Math.cos(bearing),
        y + dy,
        z + dx * Math.sin(bearing) + dz
      ];
      const points = [];
      for (let i = 0; i <= 90; i++) {
        const angle = tilt + i / 90 * TAU;
        const petal = .235 + .765 * Math.pow((1 + Math.cos(5 * (angle - tilt))) / 2, .61);
        const waviness = 1 + .08 * Math.sin(2 * angle + phase) + .052 * Math.sin(7 * angle);
        points.push(world(radius * petal * waviness * Math.cos(angle),
          radius * petal * waviness * Math.sin(angle), .55 * Math.cos(2 * angle + phase)));
      }
      tube(points, u => radius * (.035 + .006 * Math.sin(u * TAU * 5)), (u,v) =>
        scale(color, .87 + .18 * Math.sin(v * TAU)), FLOWER, 8);
      const center = Array.from({ length: 27 }, (_, i) => {
        const angle = i * TAU / 26;
        return world(radius * .085 * Math.cos(angle), radius * .085 * Math.sin(angle));
      });
      tube(center, () => radius * .022, () => color, FLOWER, 6);
    }

    function floatingShell() {
      for (const sign of [-1, 1]) {
        const shell = (u, v, exterior) => shellPoint(sign, u, v, exterior);
        for (const exterior of [0, 1]) {
          const pigment = (u, v) => {
            const base = exterior ? [.35,.17,.64] : [.59,.31,.76];
            const crest = exterior ? [.74,.49,.94] : [.89,.62,.95];
            return mix(base, crest, .48 + .22 * Math.cos(5 * TAU * v + u * .26) + .08 * Math.sin(u * 16));
          };
          surface(16, 36, (u, v) => shell(u, v, exterior), pigment, FLOATING_SHELL, false,
            (sign > 0) === (exterior > 0));
        }
        const lip = Array.from({ length: 41 }, (_, i) => shell(1, i / 40, .45));
        tube(lip, u => shellSize * (.036 + .016 * Math.sin(Math.PI * u)), (u,v) =>
          mix([.53,.29,.76], [.87,.67,.99], .56 + .33 * Math.cos(v * TAU)), FLOATING_SHELL);
        for (const ridge of [.10,.30,.50,.70,.90]) {
          const growthLine = Array.from({ length: 15 }, (_, i) => shell(.21 + .77 * i / 14, ridge, 1.03));
          tube(growthLine, t => shellSize * (.009 + .009 * t), () => [.67,.45,.91], FLOATING_SHELL, 5);
        }
      }
      ellipsoid(shellPlacement([.02,-.415,.22]), scale([.53,.135,.30], shellSize), [.96,.24,.44], FLOATING_SHELL, .045);
      ellipsoid(shellPlacement([-.12,-.19,.22]), scale([.15,.15,.15], shellSize), [1,.88,.92], FLOATING_SHELL, .025);
      ellipsoid(shellPlacement([-.84,-.012,.027]), scale([.29,.102,.17], shellSize), [.43,.21,.69], FLOATING_SHELL);
    }

    function reefArch(x, z, width, height, bearing, seed, color) {
      const ground = floor(x, z) - .45;
      const transform = (localX, localY, localZ) => [
        x + localX * Math.cos(bearing) - localZ * Math.sin(bearing),
        ground + localY,
        z + localX * Math.sin(bearing) + localZ * Math.cos(bearing)
      ];
      surface(48, 18, (u, v) => {
        const angle = u * Math.PI;
        const section = v * TAU;
        const innerRadius = (width * .23 + .23 * Math.sin(8 * angle + seed)) *
          (1 + .13 * Math.sin(5 * section + 9 * angle + seed) + .10 * Math.cos(3 * section - 6 * angle));
        const outerRadius = innerRadius * (1.10 - .19 * Math.sin(angle) + .11 * Math.sin(6 * angle + seed));
        return transform(
          (width + innerRadius * Math.cos(section)) * Math.cos(angle) + .45 * Math.sin(4 * angle),
          (height + innerRadius * Math.cos(section)) * Math.sin(angle) + .16 * Math.sin(9 * angle),
          outerRadius * Math.sin(section) + .52 * Math.sin(2.5 * angle + seed)
        );
      }, (u, v) => {
        const seam = Math.sin(TAU * (u * 4.2 + .25 * Math.sin(v * TAU * 3)) + seed);
        const speckle = .23 + .15 * Math.sin(u * 186 + v * 73);
        return mix(scale(color, .73 + .23 * Math.cos(v * TAU)), [.37,.36,.43], Math.max(0, seam) * speckle);
      }, 0, true);

      for (const side of [-1, 1]) {
        const foot = transform(side * width, 0, 0);
        boulder(foot[0], foot[2], width * .48, height * .36, width * .39, color, seed + side);
        const toe = transform(side * width * 1.40, 0, 1.0);
        boulder(toe[0], toe[2], width * .33, height * .22, width * .28, scale(color, .88), seed + side * 2, false);
        colliders.push({ x: foot[0], z: foot[2], radius: width * .23, top: ground + height * .59 });
      }
      return transform(0, height + width * .21, 0);
    }

    function coral(x, y, z, size, body, tip, seed) {
      const base = [x,y,z];
      const position = p => add(base, scale(p, size));
      const stem = position([.12,.87,0]);
      tube([base, position([-.06,.34,0]), stem], u => size * (.115 - u * .063), () => body, 2);
      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        const angle = -1.15 + 2.28 * t;
        const spread = .72 + .17 * Math.sin(i * 3.1 + seed);
        const root = position([-.03 + .16 * t,.33 + .54 * Math.sin(t * Math.PI),.03 * Math.sin(i)]);
        const elbow = position([spread * Math.sin(angle),.69 + .37 * Math.cos(angle),.15 * Math.sin(i * 3 + seed)]);
        const end = add(elbow, scale([.17 * Math.sin(angle),.29 + .045 * i,.04 * Math.cos(i)], size));
        tube([root,mix(root,elbow,.55),elbow,end], u => size * (.072 - .031 * u), u => mix(body, tip, u ** 3 * .9), 2);
        const fork = add(elbow, scale([-.20 * Math.cos(angle),.11,.11 * Math.cos(i)], size));
        tube([mix(root,elbow,.82),fork], u => size * (.043 - .017 * u), u => mix(body, tip, u * .8), 2, 7);
        ellipsoid(end, scale([.062,.078,.064], size), tip, 2);
      }
    }

    function kelp(x, z, height, seed) {
      if (height > 7) {
        ellipsoid([x,surfaceHeight(x,z) + .025,z],[.28,.12,.31],[.16,.23,.09],0,.13,seed);
      }
      for (let blade = 0; blade < 6; blade++) {
        const offset = blade * 1.56 + seed;
        const length = height * (.51 + .49 * (.5 + .5 * Math.sin(4 * offset)));
        const lean = (.19 + .10 * Math.cos(offset)) * length;
        const rx = x + .17 * Math.sin(offset), rz = z + .20 * Math.cos(offset);
        const root = [rx,surfaceHeight(rx,rz) - .035,rz];
        const phase = 32 + (Math.round(root[1] * 64) + 512) * 8 + offset % TAU;
        const pigment = mix([.15,.25,.075], [.37,.49,.14], .50 + .47 * Math.sin(offset * 3));
        const rows = [];
        for (let i = 0; i <= 20; i++) {
          const t = i / 20;
          const spine = add(root, [
            lean * t * (Math.sin(offset) + .52 * Math.sin(t * 7.1 + offset)),
            t * length,
            .55 * lean * t * Math.cos(offset + t * 5.1)
          ]);
          const twist = offset * .43 + .39 * Math.sin(t * 7 + offset);
          const across = [Math.cos(twist),.22 * Math.sin(t * 7.2 + offset),Math.sin(twist)];
          const normal = [-across[2],0,across[0]];
          const shoulder = Math.max(0, Math.sin(Math.PI * t ** 1.35));
          const width = .009 + Math.min(.245,length * .043) * shoulder ** .92 *
            (.88 + .12 * Math.sin(t * 20 + offset));
          rows.push([add(spine, scale(across,-width)), add(spine,scale(normal,width * .35)), add(spine,scale(across,width * .88))]);
        }
        for (let i = 0; i < rows.length - 1; i++) {
          const a = rows[i], b = rows[i + 1];
          const tint = scale(pigment, .63 + .48 * i / rows.length);
          quad(a[0], b[0], b[1], a[1], tint, 1, phase);
          quad(a[1], b[1], b[2], a[2], scale(tint, 1.12), 1, phase);
        }
      }
    }

    function sponge(x, y, z, size, color, seed) {
      for (let branch = 0; branch < 5; branch++) {
        const angle = seed + branch * 2.40;
        const height = size * (.65 + .34 * Math.sin(angle * .84) + (branch === 0 ? .31 : 0));
        const foot = [x + .11 * size * Math.cos(angle), y, z + .11 * size * Math.sin(angle)];
        const axis = t => add(foot, [
          t * height * .38 * Math.cos(angle), t * height, t * height * .38 * Math.sin(angle)
        ]);
        const points = Array.from({ length: 9 }, (_, i) => axis(i / 8));
        const radius = u => size * (.102 + .089 * u);
        tube(points, radius, u => scale(color, .62 + .44 * u), 2, 14);
        const top = axis(1);
        const direction = unit(sub(top, foot));
        const across = unit(cross([0,0,1], direction));
        const normal = cross(across, direction);
        const rim = (distance, a) => add(top, add(scale(across, distance * Math.cos(a)), scale(normal, distance * Math.sin(a))));
        for (let i = 0; i < 14; i++) {
          const a = TAU * i / 14;
          const b = TAU * (i + 1) / 14;
          const outer = radius(1);
          const inner = outer * .66;
          const p = rim(inner, a), q = rim(inner, b);
          quad(rim(outer, a),rim(outer, b),q,p,scale(color,1.41),2);
          const drop = scale(direction, -size * .22);
          quad(p,q,add(q,drop),add(p,drop),scale(color,.43),2);
          mesh.triangle(add(top,drop),add(q,drop),add(p,drop),[.065,.036,.12],ACCENT);
        }
      }
    }

    function seaStar(x, y, z, size, color, seed) {
      const middle = [x,y + size * .16,z];
      const points = Array.from({ length: 20 }, (_, i) => {
        const a = seed + i * TAU / 20;
        const radii = [1,.59,.37,.59];
        const r = size * radii[i % 4];
        return [x + Math.cos(a) * r, y + size * (.025 + .024 * Math.sin(a * 6)), z + Math.sin(a) * r];
      });
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        mesh.triangle(middle,points[(i + 1) % points.length],point,scale(color,.78 + .23 * (i % 4) / 3),2);
      }
      for (let i = 0; i < 5; i++) {
        const angle = i * TAU / 5 + seed;
        for (const t of [.20,.33,.48,.64]) {
          const point = [x + size * t * Math.cos(angle), y + size * .17 * (1 - t), z + size * t * Math.sin(angle)];
          ellipsoid(point, scale([.033,.024,.033],size),scale(color,1.25),2);
        }
      }
    }

    function urchin(x, y, z, size, seed) {
      const center = [x,y + size * .33,z];
      const color = [.048,.068,.115];
      ellipsoid(center,scale([.40,.34,.40],size),color,0);
      for (let i = 0; i < 25; i++) {
        const angle = i * 2.39996 + seed;
        const top = .79 - i / 22;
        const spread = Math.sqrt(1 - top * top);
        const vector = [Math.cos(angle) * spread, top, Math.sin(angle) * spread];
        const a = add(center,scale(vector,size * .28));
        const b = add(center,scale(vector,size * (.75 + .15 * Math.cos(i * 4.1))));
        tube([a,b], u => size * (.043 - .04 * u), () => color, 0, 5);
      }
    }

    function flowerAnemone(x, y, z, size, spin) {
      const center = [x, y + size * .25, z];
      ellipsoid(center, scale([.59,.43,.57], size), [.67,.72,.83], 2, .08);
      for (let i = 0; i < 7; i++) {
        const a = i * TAU / 7 + spin;
        const coralSpot = add(center, scale([.55 * Math.cos(a), -.06, .54 * Math.sin(a)], size));
        ellipsoid(coralSpot, scale([.106,.122,.105], size), [.59,.08,.15], ACCENT);
      }
      const crown = add(center, [0,size * .40,0]);
      for (let i = 0; i < 5; i++) {
        const a = i * TAU / 5 + spin;
        const reach = .58 + .15 * Math.sin(i * 3.7);
        const petal = t => add(crown, scale([reach * Math.cos(a) * t,.12 * Math.sin(t * 3) + .24 * t,
          reach * Math.sin(a) * t], size));
        const color = mix([.61,.68,.88], [.91,.90,.98], .57 + .37 * Math.sin(i * 2.2));
        tube([petal(0),petal(.24),petal(.56),petal(.84),petal(1)],
          t => size * (.12 + .087 * Math.sin(t * Math.PI * .72)), () => color, 2, 10);
        ellipsoid(petal(1),scale([.18,.17,.18],size),color,2);
      }
      ellipsoid(crown,scale([.24,.135,.23],size),[.40,.42,.68],2);
    }

    function seaFan(x, y, z, size, bearing, body, tip) {
      const point = (across, up, t) => [
        x + Math.cos(bearing) * across * size,
        y + up * size,
        z + (Math.sin(bearing) * across + .17 * t * t) * size
      ];
      for (let ray = 0; ray < 7; ray++) {
        const angle = (ray - 3) * .33;
        const length = (.87 + .19 * Math.cos(ray * 4.8)) * (1 - .12 * Math.abs(angle));
        const rib = t => {
          const sweep = angle + .21 * t * Math.sin(ray * 1.8);
          return point(Math.sin(sweep) * length * t ** 1.27, Math.cos(sweep) * length * t, t);
        };
        const frame = Array.from({ length: 5 }, (_, i) => rib(i / 4));
        tube(frame, t => size * (.045 - .028 * t), t => mix(body,tip,t * .72), 2, 5);
        for (let twig = 0; twig < 2; twig++) {
          const t = .43 + twig * .26;
          const root = rib(t);
          const split = .082 * size * (ray < 3 ? -1 : 1);
          const top = add(rib(t + .14), [split * Math.cos(bearing), .08 * size, split * Math.sin(bearing)]);
          const elbow = add(mix(root,top,.61), [split * .27,0,0]);
          tube([root,elbow,top], u => size * (.025 - .013 * u), u => mix(body,tip,.45 + u * .5), 2, 4);
        }
      }
    }

    function scallop(x, y, z, size, rotation) {
      const apex = [x,y,z];
      const ridges = 13;
      const pigment = [.49,.34,.68];
      const ribs = [];
      for (let i = 0; i <= ridges; i++) {
        const t = i / ridges;
        const angle = rotation + (t - .5) * 2.1;
        const length = size * (.74 + .32 * Math.sin(t * Math.PI));
        const fold = (i % 2) * size * .08;
        ribs.push([
          [x + Math.cos(angle) * length * .50, y + size * .21 + fold, z + Math.sin(angle) * length * .50],
          [x + Math.cos(angle) * length, y + size * .038 + fold, z + Math.sin(angle) * length]
        ]);
      }
      for (let i = 0; i < ridges; i++) {
        const [a,b] = ribs[i], [c,d] = ribs[i + 1];
        const color = scale(pigment, .95 + .28 * (i % 2));
        mesh.triangle(apex, c, a, color, 2);
        quad(a,c,d,b,color,2);
      }
    }

    const sign = welcomeSign();
    seaStar(sign.x - 1.19, surfaceHeight(sign.x - 1.19,sign.z + .96), sign.z + .96, .40, [.89,.34,.25], .49);
    urchin(sign.x + .98, surfaceHeight(sign.x + .98,sign.z + .54), sign.z + .54, .41, .9);
    flowerAnemone(sign.x - .38, surfaceHeight(sign.x - .38,sign.z + 1.05), sign.z + 1.05, .37, 1.3);

    const blue = [.22,.32,.51];
    const violet = [.29,.22,.46];
    const slate = [.25,.33,.42];
    const pink = [[.70,.19,.39],[.99,.63,.49]];
    const amber = [[.80,.34,.095],[1,.71,.25]];
    const lilac = [[.42,.24,.68],[.88,.52,.91]];

    const leftArch = reefArch(-57.5, -56, 6.20, 7.61, .37, 1.4, [.24,.40,.54]);
    const rightArch = reefArch(57.5, -53, 7.16, 8.76, -.26, 4.1, [.22,.33,.54]);
    coral(leftArch[0] + 1.30, leftArch[1] - .38, leftArch[2] + .24, .83, ...lilac, 2.5);
    coral(rightArch[0] - 1.32, rightArch[1] - .44, rightArch[2] + .30, 1.20, ...amber, 1.9);
    coral(rightArch[0] + 2.56, rightArch[1] - .88, rightArch[2] + .45, 1.20, ...pink, 4);

    // Broad foreground shelves carry the detail, with sand opening immediately beyond them.
    boulder(-6.9, 19.15, 7.2, 2.62, 3.65, [.17,.28,.45], 6);
    boulder(-13.95, 13.9, 4.25, 3.63, 3.31, violet, 2);
    boulder(-11.38, 16.55, 3.58, 1.99, 2.51, blue, 8.1);
    sponge(-11.45, surfaceHeight(-11.45,14.43) - .10, 14.43, 1.31, [.58,.31,.79], .8);
    kelp(-13.15, 12.91, 4.13, 1.3);
    coral(-10.7, surfaceHeight(-10.7,13.4) - .07,13.4,1.10,...amber,3);
    scallop(-8.3, surfaceHeight(-8.3,16.26) - .01,16.26,.39,.53);

    boulder(5.85, 16.4, 3.35, 3.47, 3.18, [.39,.43,.45], 1.2);
    boulder(9.66, 13.54, 4.45, 3.98, 3.53, violet, 4);
    boulder(13.5, 15.3, 4.79, 4.27, 3.78, blue, 5.8);
    boulder(10.89, 19.0, 5.60, 4.15, 3.19, [.31,.24,.48], 5);
    boulder(17.15, 13.0, 4.65, 2.49, 3.76, [.25,.25,.43], 6.2);
    coral(11.62, surfaceHeight(11.62,13.23) - .07, 13.23, 1.64, ...pink, 1.6);
    sponge(10.25, surfaceHeight(10.25,14.67) - .10, 14.67, 1.31, [.88,.52,.14], 2.7);
    sponge(14.35, surfaceHeight(14.35,16.06) - .08, 16.06, .96, [.59,.30,.78], 4.8);
    coral(8.11, surfaceHeight(8.11,13.79) - .06, 13.79, .94, ...lilac, 2.4);
    seaStar(7.67, surfaceHeight(7.67,16.2), 16.2, .39, [.76,.31,.50], 2);
    urchin(6.46, surfaceHeight(6.46,16.58), 16.58, .58, .4);
    urchin(8.56, surfaceHeight(8.56,18.94), 18.94, .48, .9);
    flowerAnemone(5.38, surfaceHeight(5.38,16.51), 16.51, .71, 2.7);
    flowerAnemone(6.82, surfaceHeight(6.82,17.25), 17.25, .65, 1.9);
    kelp(6.35, 9.88, 9.3, 5.2);
    kelp(12.69, 14.23, 2.23, 7.4);

    const range = (i, salt) => {
      const offset = Math.sin(i * 127.1 + salt * 79.43) * 43758.5453;
      return offset - Math.floor(offset);
    };

    // Each patch stands on its own. Spacing and shapes differ across the bay.
    const gardens = [
      [-11, 6, 2.10, 1.28, 1.72, slate, lilac, 'fan'],
      [-21.0, 3.8, 4.67, 2.72, 3.19, blue, amber, 'coral'],
      [-17.4, 1.1, 2.01, 1.51, 1.85, violet, lilac, 'kelp'],
      [-30.8, -6.7, 5.51, 3.33, 3.95, slate, pink, 'sponge'],
      [-37.9, -11.3, 5.75, 4.58, 4.12, blue, amber, 'kelp'],
      [-19.55, -18.9, 2.22, 1.36, 1.68, violet, lilac, 'kelp'],
      [-28.5, -33.0, 3.53, 2.75, 3.11, blue, amber, 'fan'],
      [-23.6, -37.2, 4.33, 4.18, 3.44, slate, pink, 'coral'],
      [-19.4, -32.2, 2.89, 1.61, 2.46, violet, lilac, 'fan'],
      [8.67, -8.2, 2.75, 1.39, 2.04, violet, lilac, 'fan'],
      [11.54, -11.64, 1.93, .87, 1.36, slate, amber, 'coral'],
      [17.65, -19.55, 2.85, 1.74, 2.80, blue, pink, 'kelp'],
      [29.43, -4.98, 4.87, 2.42, 3.45, slate, amber, 'coral'],
      [35.4, -10.4, 5.98, 3.20, 4.25, violet, pink, 'sponge'],
      [31.15, -14.95, 2.55, 1.26, 1.74, blue, lilac, 'fan'],
      [31.98, -34.1, 4.42, 1.89, 3.19, slate, pink, 'coral'],
      [37.0, -36.86, 3.05, 1.64, 2.34, blue, lilac, 'fan'],
      [44.08, -50.18, 4.98, 2.08, 2.72, violet, amber, 'kelp'],
      [-52.15, -39.78, 3.23, 1.30, 2.74, violet, pink, 'fan']
    ];
    gardens.forEach(([x,z,width,height,depth,pigment,accent,plant], i) => {
      if(reserved?.(x,z,Math.max(width,depth)*1.36))return;
      boulder(x,z,width,height,depth,pigment,i * 1.37,true,z < -11);
      const side = Math.sign(x);
      const shoulderX = x - side * width * .27;
      const shoulderZ = z + depth * .30;
      const shoulder = surfaceHeight(shoulderX,shoulderZ);
      if (plant === 'coral') coral(shoulderX,shoulder - .07,shoulderZ,.71 + width * .22,...accent,i * 1.17);
      if (plant === 'sponge') sponge(shoulderX,shoulder - .10,shoulderZ,.65 + width * .23,
        side > 0 ? [.91,.63,.13] : [.63,.39,.83],i);
      if (plant === 'fan') seaFan(shoulderX,shoulder - .06,shoulderZ,.70 + width * .18,-.59 + range(i,8) * 1.20,...accent);
      if (plant === 'kelp') {
        const px = x + side * width * .54;
        const pz = z + depth * .45;
        kelp(px,pz,1.16 + width * .84,i * .62);
      }
      if (i % 3 === 1) {
        const offsetX = side * (width * .93 + .23);
        boulder(x + offsetX,z + depth * .64,width * .42,height * .57,depth * .54,slate,i + 2,false,true);
      }
    });

    // Small outcrops and shell grit leave broad, uninterrupted expanses of lit sand.
    const scatteredRocks = [
      [-8.9,2.6,.86,.47], [-11.55,-1.2,1.42,.71], [-15.3,-3.6,1.62,.93], [-7.9,-5.9,.88,.44],
      [-23,-13,1.22,.68], [-28.5,-23,2.38,1.04], [-37,-25.3,1.71,.83], [-34,-39.2,2.81,1.31],
      [-16.3,-40,2.32,1.27], [-11.8,-30.8,1.04,.68], [-14.5,-51,3.61,1.41], [-26,-54,3.27,1.45],
      [6.3,3.2,.84,.40], [14.5,2.0,1.62,.84], [11.42,-2.0,1.11,.57], [21.1,-4.0,2.05,1.11],
      [23.73,-18.0,1.57,.80], [22.2,-29.2,2.01,.93], [11.35,-26.8,1.04,.63], [19.3,-37.8,1.49,.75],
      [40.3,-22.5,2.93,1.33], [47.5,-34.1,3.14,1.50], [38.1,-46.3,2.58,1.45], [28.4,-48.2,3.11,1.52],
      [-69,-62,5.7,3.05], [-65.3,-56.8,3.8,1.65], [-51.9,-66,6.4,1.93], [-43.4,-53.4,3.5,1.12],
      [-34.1,-65.2,5.15,1.57], [-24.4,-73.6,5.1,1.88], [-18.1,-63,3.31,1.40],
      [69.1,-56.5,7.0,3.11], [61.7,-64,5.11,2.13], [47.6,-59.6,4.75,1.65],
      [34.7,-62.6,5.32,1.58], [23.9,-74.1,4.88,1.58], [13.5,-69,3.22,1.35]
    ];
    const stones = [blue,violet,slate,[.35,.35,.42]];
    scatteredRocks.forEach(([x,z,width,height], i) => {
      const color = stones[i % stones.length];
      if(!reserved?.(x,z,width*1.17))
        boulder(x,z,width,height,width * (.66 + .22 * range(i,4)),color,i * .81,width > 2.4,true);
      for (let pebble = 0; pebble < 3; pebble++) {
        const key = i * 3 + pebble;
        const angle = range(key,2) * TAU;
        const gap = width + .66 + 3 * range(key,3);
        const px = x + Math.cos(angle) * gap;
        const pz = z + Math.sin(angle) * gap;
        const radius = .085 + range(key,9) ** 2 * .41;
        if(reserved?.(px,pz,radius*1.3+.25))continue;
        boulder(px,pz,radius * 1.30,radius * .72,radius,color,angle,false,true);
        if (pebble === 0 && z > -37 && i % 2 === 0) {
          scallop(px + .52,floor(px + .52,pz + .31) + .015,pz + .31,.17 + .13 * range(key,8),angle);
        }
      }
    });

    flower(-70, 31, -71, 4.85, .17, [.11,.65,.72], 1);
    flower(-29, 32, -67, 6.25, 1.68, [.82,.45,.30], 3);
    flower(-.4, 25, -87, 3.95, 1.75, [.46,.64,.22], .2);
    flower(25, 23, -68, 11.65, 1.08, [.45,.32,.75], 2.7);
    flower(67, 26, -71, 6.25, 1.08, [.62,.68,.32], 2.7);
    flower(101, 28, -82, 3.85, 1.43, [.69,.34,.69], 2.3);
    floatingShell();

    return colliders;
  };
})();
