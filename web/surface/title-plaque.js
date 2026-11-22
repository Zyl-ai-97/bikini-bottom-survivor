import * as THREE from './vendor/three.module.js';

const width = 2.24;
const height = 0.75;
const depth = 0.135;
const faceWidth = 1152;
const faceHeight = 540;
const slingHeight = 0.64;

// Hand-cut silhouettes with irregular counters and stems. The small i and o
// give the two lines the alternating heights of a painted title card.
const glyphs = Object.fromEntries(Object.entries({
  B: 'M2 8 Q26 2 53 3 Q90 3 91 24 Q92 42 66 49 Q99 52 98 74 Q97 94 12 99 L17 25 L6 29 Z M39 22 L59 21 Q65 22 64 31 L61 40 L39 46 Z M38 62 Q60 59 69 62 Q76 68 72 77 Q61 84 36 87 Z',
  i: 'M19 38 L77 33 L87 97 L9 100 Z M24 4 L55 0 L84 10 L80 27 L46 31 L18 21 Z',
  K: 'M7 7 L34 1 L31 43 L87 2 L98 15 L48 51 L95 86 L70 100 L30 63 L26 98 L5 99 Z',
  N: 'M4 5 L31 2 L73 53 L68 4 L98 0 L93 95 L71 99 L27 47 L32 96 L3 100 Z',
  o: 'M18 8 Q45 -1 78 3 Q96 3 98 33 L97 70 Q94 95 68 98 L32 100 Q5 98 4 79 Q0 48 9 17 Z M35 31 Q55 28 67 32 L70 66 Q68 72 37 73 Q29 70 32 54 Z',
  T: 'M0 7 L100 0 L97 24 L63 30 L70 93 L29 100 L35 36 L3 42 Z',
  M: 'M4 96 L17 5 L37 0 L57 42 L76 3 L92 5 L100 93 L72 100 L71 50 L54 73 L34 53 L29 100 Z',
}).map(([letter, outline]) => [letter, new Path2D(outline)]));

const upperLine = [
  ['B', 184, 186, 45, -5], ['i', 47, 108, 120, 4],
  ['K', 144, 171, 56, 2], ['i', 48, 104, 132, -5],
  ['N', 171, 157, 67, -4], ['i', 45, 98, 124, 7],
];
const lowerLine = [
  ['B', 179, 191, 280, -4], ['o', 118, 111, 344, 5],
  ['T', 150, 167, 277, -4], ['T', 124, 114, 315, 3],
  ['o', 111, 110, 364, -6], ['M', 179, 180, 279, 5],
];

function randomSource(seed) {
  return () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
}

function drawLettering(context, line, gap, offset) {
  const lineWidth = line.reduce((sum, [, advance]) => sum + advance, 0) + gap * (line.length - 1);
  let x = (faceWidth - lineWidth) / 2 + offset;
  for (const [letter, advance, tall, y, turn] of line) {
    context.save();
    context.translate(x + advance * 0.5, y + tall * 0.5);
    context.rotate(THREE.MathUtils.degToRad(turn));
    context.scale(advance / 100, tall / 100);
    context.translate(-50, -50);
    context.fill(glyphs[letter], 'evenodd');
    context.restore();
    x += advance + gap;
  }
}

function drawPaint(context, timber) {
  const random = randomSource(1729);
  const sequence = (n, fn) => { for (let i = 0; i < n; i++) fn(i); };
  context.save();
  const ink = context.createLinearGradient(0, 0, faceWidth, faceHeight);
  ink.addColorStop(0, '#194a93');
  ink.addColorStop(0.52, '#10427f');
  ink.addColorStop(1, '#0a2a59');
  context.fillStyle = ink;
  context.fillRect(0, 0, faceWidth, faceHeight);

  // Alternate brushed blocks to evoke the woven ground of a painted title card.
  for (let row = 0; row < 6; row++) for (let column = 0; column < 12; column++) {
    const x = column * 98 + (row % 2) * 3;
    const y = row * 92;
    const vertical = (row + column) % 2 === 0;
    context.fillStyle = vertical ? 'rgba(65, 152, 186, .21)' : 'rgba(29, 40, 117, .40)';
    context.beginPath();
    context.moveTo(x - 2, y + 5);
    context.lineTo(x + 94, y - 3 + random() * 9);
    context.lineTo(x + 100 - random() * 7, y + 89);
    context.lineTo(x + 2 + random() * 7, y + 94);
    context.closePath();
    context.fill();
    sequence(10, index => {
      const along = 6 + index * 8;
      const start = 3 + random() * 15;
      const length = 46 + random() * 30;
      context.strokeStyle = `rgba(100, 182, 210, ${0.09 + random() * 0.21})`;
      context.lineWidth = 1.9 + random() * 3;
      context.beginPath();
      context.moveTo(x + (vertical ? along : start), y + (vertical ? start : along));
      context.lineTo(x + (vertical ? along + random() * 3 : start + length),
        y + (vertical ? start + length : along + random() * 3));
      context.stroke();
    });
  }
  context.strokeStyle = 'rgba(132, 213, 221, .66)';
  context.lineWidth = 3.5;
  for (const [x, y, radius] of [[106, 171, 19], [142, 115, 11], [1009, 98, 12],
    [1037, 146, 19], [94, 407, 15], [1026, 422, 17], [615, 456, 10]]) {
    context.beginPath();
    context.arc(x, y, radius, 0.1, Math.PI * 2 - 0.25);
    context.stroke();
    context.beginPath();
    context.arc(x, y, radius * 0.68, 3.95, 4.75);
    context.stroke();
  }

  context.fillStyle = '#ffda51';
  drawLettering(context, upperLine, 9, 19);
  drawLettering(context, lowerLine, 0, -5);
  if (timber) {
    context.globalCompositeOperation = 'soft-light';
    context.globalAlpha = 0.27;
    context.drawImage(timber, 0, 0, faceWidth, faceHeight);
    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = 1;
  }
  sequence(360, () => {
    const x = random() * faceWidth;
    const y = 10 + random() * (faceHeight - 20);
    context.fillStyle = `rgba(9, 32, 72, ${0.04 + random() * 0.12})`;
    context.fillRect(x, y, 0.8 + random() * 13, 0.35 + random() * 1.35);
  });
  context.restore();
}

function makePlaqueGeometry() {
  const left = -width * 0.5;
  const right = width * 0.5;
  const bottom = -height * 0.5;
  const top = height * 0.5;
  const outline = new THREE.Shape();
  outline.moveTo(left + 0.02, bottom + 0.12);
  outline.quadraticCurveTo(left - 0.01, bottom + 0.018, left + 0.13, bottom + 0.012);
  outline.bezierCurveTo(-0.6, bottom - 0.022, 0.49, bottom + 0.015, right - 0.1, bottom);
  outline.quadraticCurveTo(right + 0.006, bottom + 0.012, right, bottom + 0.135);
  outline.lineTo(right - 0.025, top - 0.14);
  outline.quadraticCurveTo(right - 0.03, top - 0.005, right - 0.14, top);
  outline.bezierCurveTo(0.63, top + 0.009, -0.38, top - 0.017, left + 0.17, top - 0.004);
  outline.quadraticCurveTo(left + 0.03, top - 0.014, left + 0.026, top - 0.14);
  outline.closePath();

  const bevel = 0.03;
  function faceUv(vertices, index) {
    return new THREE.Vector2(0.5 + vertices[index * 3] / width, 0.5 + vertices[index * 3 + 1] / height);
  }
  const geometry = new THREE.ExtrudeGeometry(outline, {
    depth, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 4, curveSegments: 9,
    UVGenerator: {
      generateTopUV: (_geometry, vertices, a, b, c) => [a, b, c].map(index => faceUv(vertices, index)),
      generateSideWallUV(_geometry, vertices, a, b, c, d) {
        const alongX = Math.abs(vertices[a * 3] - vertices[b * 3])
          >= Math.abs(vertices[a * 3 + 1] - vertices[b * 3 + 1]);
        return [a, b, c, d].map(index => new THREE.Vector2(
          0.5 + vertices[index * 3 + (alongX ? 0 : 1)] / (alongX ? width : height),
          (vertices[index * 3 + 2] + bevel) / (depth + 2 * bevel) * 0.52,
        ));
      },
    },
  });
  geometry.translate(0, 0, -depth * 0.5);
  return geometry;
}

export function createTitlePlaque(loadingManager) {
  const painting = document.createElement('canvas');
  painting.width = faceWidth;
  painting.height = faceHeight;
  const context = painting.getContext('2d');
  drawPaint(context);
  const face = new THREE.CanvasTexture(painting);
  face.colorSpace = THREE.SRGBColorSpace;
  face.anisotropy = 8;
  const timber = new THREE.TextureLoader(loadingManager).load(new URL('./assets/barrel-wood-albedo.webp', import.meta.url).href, texture => {
    drawPaint(context, texture.image);
    face.needsUpdate = true;
  });
  timber.colorSpace = THREE.SRGBColorSpace;
  timber.anisotropy = 4;
  const paintedWood = new THREE.MeshStandardMaterial({
    map: face, bumpMap: timber, bumpScale: 0.0018, roughness: 0.88,
    emissive: 0xffffff, emissiveMap: face, emissiveIntensity: 0.11,
  });
  const exposedWood = new THREE.MeshStandardMaterial({
    map: timber, bumpMap: timber, bumpScale: 0.0032, color: '#b48552', roughness: 0.91,
    emissive: '#8a582e', emissiveIntensity: 0.10,
  });
  const metal = new THREE.MeshStandardMaterial({ color: '#4c514b', metalness: 0.72, roughness: 0.57 });
  const cord = new THREE.MeshStandardMaterial({ color: '#45362b', roughness: 0.95 });
  const bronze = new THREE.MeshStandardMaterial({ color: '#958454', metalness: 0.61, roughness: 0.63 });

  const grip = new THREE.Group();
  grip.name = 'Title plaque at wire grip';
  const board = new THREE.Group();
  board.name = 'Bikini Bottom title plaque';
  board.userData.kind = 'plaque';
  board.position.y = -slingHeight;
  const slab = new THREE.Mesh(makePlaqueGeometry(), [paintedWood, exposedWood]);
  board.add(slab);

  const tackGeometry = new THREE.SphereGeometry(0.052, 16, 10);
  const eyeGeometry = new THREE.TorusGeometry(0.034, 0.011, 7, 18);
  for (const side of [-1, 1]) {
    const tack = new THREE.Mesh(tackGeometry, bronze);
    tack.position.set(side * 0.94, -0.025, depth / 2 + 0.009);
    tack.scale.z = 0.44;
    board.add(tack);
    const eye = new THREE.Mesh(eyeGeometry, metal);
    eye.position.set(side * 0.88, height * 0.5 + 0.018, 0.027);
    board.add(eye);
  }

  const tieHeight = height * 0.5 + 0.018;
  const sling = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.88, tieHeight, 0.03),
    new THREE.Vector3(-0.66, tieHeight + 0.052, 0.024),
    new THREE.Vector3(-0.235, slingHeight - 0.074, 0.01),
    new THREE.Vector3(0, slingHeight, 0),
    new THREE.Vector3(0.235, slingHeight - 0.074, 0.01),
    new THREE.Vector3(0.66, tieHeight + 0.052, 0.024),
    new THREE.Vector3(0.88, tieHeight, 0.03),
  ], false, 'catmullrom', 0.18);
  const wire = new THREE.Mesh(new THREE.TubeGeometry(sling, 32, 0.0085, 6, false), cord);
  wire.name = 'Two-point plaque cord';
  board.add(wire);
  grip.add(board);
  return { grip, board, slab, wire, halfExtents: new THREE.Vector3(width / 2 + 0.03, height / 2 + 0.035, depth / 2 + 0.03) };
}
