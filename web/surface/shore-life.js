import * as THREE from './vendor/three.module.js';

// A small mipmapped gait atlas keeps articulated legs visible at shoreline
// scale. The crab takes the beach's sun, palm shadow and moonlight in island.js.
export function makeCrabAtlas() {
  const sheet = document.createElement('canvas');
  sheet.width = 1024;
  sheet.height = 64;
  const ctx = sheet.getContext('2d');
  for (let frame = 0; frame < 8; frame++) {
    ctx.save();
    ctx.translate(frame * 128 + 64, 33);
    const angle = frame * Math.PI / 4;
    ctx.lineCap = 'round';
    ctx.fillStyle = 'rgba(53,45,31,.26)';
    ctx.beginPath(); ctx.ellipse(1, 9, 39, 7, 0, 0, Math.PI * 2); ctx.fill();
    for (const side of [-1, 1]) {
      for (let leg = 0; leg < 4; leg++) {
        const gait = Math.sin(angle + leg * Math.PI * 0.75 + side);
        const y = -5 + leg * 3;
        const kneeX = side * (30 + leg * 1.8) + gait * 1.8;
        const kneeY = y - 8 + leg * 2;
        const footX = side * (41 + leg * 2.8) + gait * 5;
        ctx.strokeStyle = '#884327'; ctx.lineWidth = 3.3;
        ctx.beginPath(); ctx.moveTo(side * 12, y); ctx.lineTo(kneeX, kneeY);
        ctx.lineTo(footX, kneeY + 8); ctx.stroke();
        ctx.strokeStyle = '#a06a40'; ctx.lineWidth = 1.7;
        ctx.beginPath(); ctx.moveTo(footX, kneeY + 8);
        ctx.lineTo(footX + side * 3, kneeY + 12 - Math.max(0, gait) * 4); ctx.stroke();
      }
      ctx.strokeStyle = '#8a4930'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(side * 12, -5); ctx.lineTo(side * 23, -13);
      ctx.lineTo(side * 29, -16); ctx.stroke();
      ctx.fillStyle = '#bb653b';
      ctx.beginPath(); ctx.ellipse(side * 29, -16, 6, 3.4, -side * 0.45, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#d59965'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(side * 32, -17); ctx.lineTo(side * 36, -22); ctx.stroke();
    }
    const shell = ctx.createRadialGradient(-4, -6, 1, 0, 0, 23);
    shell.addColorStop(0, '#bb7149'); shell.addColorStop(0.63, '#a54d30'); shell.addColorStop(1, '#643b2c');
    ctx.fillStyle = shell;
    ctx.beginPath(); ctx.moveTo(-20, -4);
    ctx.bezierCurveTo(-18, -12, 16, -13, 20, -4);
    ctx.bezierCurveTo(18, 11, -14, 15, -20, -4); ctx.fill();
    ctx.fillStyle = '#654230';
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(side * 10, -9, 2.4, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(sheet);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

// Split blades and raised midribs give the wet wrack an irregular, low profile.
// Each tuft shares the exact surface-height function used by the nearby sea.
export function makeShoreWrack(environment, time, waveFunctions) {
  const positions = [], colors = [], motion = [], indices = [];
  const olive = new THREE.Color();
  const clumps = [
    { along: 0.18, offset: 0.95, size: 0.82, blades: 6 },
    { along: 0.70, offset: 0.45, size: 1.0, blades: 8 },
    { along: 0.77, offset: 1.26, size: 0.56, blades: 4 },
  ];
  clumps.forEach(({ along, offset, size, blades }, patch) => {
    for (let blade = 0; blade < blades; blade++) {
      const seed = blade * 2.39996 + patch * 3.37;
      const heading = seed + 0.36 * Math.sin(seed * 2.7);
      const length = size * (0.45 + 0.44 * (0.5 + 0.5 * Math.sin(seed * 3.3 + 1)));
      const rootX = (along - 0.5) * 0.79 + Math.cos(seed * 1.6) * 0.003;
      const baseIndex = positions.length / 3;
      for (let step = 0; step <= 7; step++) {
        const s = step / 7;
        const bend = heading + 0.63 * Math.sin(s * 3.6 + seed * 0.7);
        const breadth = size * (0.006 + 0.068 * Math.sin(Math.PI * s) ** 0.75);
        for (const edge of [-1, 0, 1]) {
          const lateral = edge * breadth * (1 + 0.22 * Math.sin(s * 18 + seed));
          const dx = Math.cos(bend) * s * length - Math.sin(bend) * lateral;
          const dz = Math.sin(bend) * s * length + Math.cos(bend) * lateral;
          const arch = size * (0.028 + 0.13 * Math.sin(Math.PI * s) + 0.09 * s * Math.sin(seed + 1.2));
          positions.push(dx, arch + (edge === 0 ? breadth * 0.29 : -breadth * 0.18), offset + dz);
          motion.push(rootX, s, seed);
          olive.setRGB(0.055 + 0.021 * s, 0.073 + 0.027 * s, 0.020 + 0.007 * s);
          olive.multiplyScalar((edge === 0 ? 1.22 : 0.82) * (0.9 + 0.23 * Math.cos(seed)));
          colors.push(olive.r, olive.g, olive.b);
        }
        if (step < 7) for (let strip = 0; strip < 2; strip++) {
          const a = baseIndex + step * 3 + strip;
          indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
        }
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aBlade', new THREE.Float32BufferAttribute(motion, 3));
  geometry.setIndex(indices);
  const islandWidth = { value: 25.1 };
  const material = new THREE.ShaderMaterial({
    uniforms: { ...environment.uniforms, uTime: time, uBeachWidth: islandWidth },
    vertexColors: true,
    side: THREE.DoubleSide,
    vertexShader: `
      attribute vec3 aBlade;
      uniform float uTime, uBeachWidth;
      varying vec3 vWrackColor;
      varying float vBladeTip;
      ${waveFunctions}
      void main() {
        float scale = uBeachWidth / 25.1;
        vec3 p = position * scale;
        p.x += aBlade.x * uBeachWidth;
        vec3 world = (modelMatrix * vec4(p, 1.0)).xyz;
        float sway = sin(uTime * 0.95 + world.x * 0.43 + aBlade.z * 0.15);
        float twist = cos(uTime * 0.76 + aBlade.z + aBlade.y * 2.7);
        world.xz += scale * (vec2(0.12, 0.08) * sway + aBlade.y * vec2(0.13, 0.10) * twist);
        world.y += surfaceHeightAtDistance(world.xz, uTime, distance(cameraPosition.xz, world.xz))
          + scale * aBlade.y * 0.07 * twist;
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        vWrackColor = color;
        vBladeTip = aBlade.y;
      }`,
    fragmentShader: `
      uniform vec3 uSunColor, uSunDirection;
      uniform float uNightMix, uSunStrength;
      varying vec3 vWrackColor;
      varying float vBladeTip;
      void main() {
        vec3 ambient = mix(vec3(0.52, 0.62, 0.62), vec3(0.012, 0.027, 0.042), uNightMix);
        float light = max(0.0, 0.38 + uSunDirection.y * 0.65);
        vec3 lit = vWrackColor * (ambient + uSunColor * (light + 0.22 * vBladeTip) * uSunStrength);
        gl_FragColor = vec4(lit, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Drifting tide wrack';
  mesh.frustumCulled = false;
  return { mesh, islandWidth };
}
