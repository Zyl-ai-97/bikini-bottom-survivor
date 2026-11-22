import * as THREE from './vendor/three.module.js';

// Every prop is centered on its volume, with the cylinder axis along local X.
// Floating, water contact, and world placement are handled by the scene.
function randomGenerator(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function canvasTexture(canvas, color = true) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = 4;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function surfaceCanvases(width, height, color, roughness) {
  const surfaces = {};
  for (const [name, fill] of Object.entries({ color, bump: '#808080', roughness })) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = fill;
    context.fillRect(0, 0, width, height);
    surfaces[name] = { canvas, context };
  }
  return surfaces;
}

function finishSurface(surfaces) {
  return Object.fromEntries(Object.entries(surfaces).map(([name, surface]) => [
    name,
    canvasTexture(surface.canvas, name === 'color'),
  ]));
}

function irregularPatch(context, x, y, width, height, random) {
  context.beginPath();
  for (let point = 0; point < 15; point += 1) {
    const angle = point / 15 * Math.PI * 2;
    const edge = 0.62 + random() * 0.38;
    const px = x + Math.cos(angle) * width * edge;
    const py = y + Math.sin(angle) * height * edge;
    context.lineTo(px, py);
  }
  context.closePath();
  context.fill();
}

function paintEndJoints(color, bump) {
  // The caps remap the circular face to V=0.05…0.95. Paint the millimetre
  // joints here so the same mip filter that resolves the grain also resolves
  // the grooves and their narrow exposed edges.
  const width = color.canvas.width;
  const height = color.canvas.height;
  for (const boardHeight of [-0.56, -0.19, 0.19, 0.56]) {
    const y = (0.5 + boardHeight * 0.45) * height;
    color.fillStyle = 'rgba(74, 46, 25, 0.34)';
    color.fillRect(0, y - 2.4, width, 4.8);
    color.fillStyle = 'rgba(54, 33, 19, 0.78)';
    color.fillRect(0, y - 1.4, width, 2.8);
    color.fillStyle = 'rgba(205, 153, 93, 0.42)';
    color.fillRect(0, y - 2.6, width, 1.0);
    bump.fillStyle = 'rgba(33, 33, 33, 0.52)';
    bump.fillRect(0, y - 1.6, width, 3.2);
  }
}

function woodSurface(seed, endGrain, loadingManager) {
  const random = randomGenerator(seed);
  const surfaces = surfaceCanvases(1024, 512, endGrain ? '#c59054' : '#bd8a4e', '#c6c6c6');
  const color = surfaces.color.context;
  const bump = surfaces.bump.context;
  const roughness = surfaces.roughness.context;

  for (let patch = 0; patch < 52; patch += 1) {
    const x = random() * 1024;
    const y = random() * 512;
    const wash = color.createRadialGradient(x, y, 2, x, y, 42 + random() * 150);
    wash.addColorStop(0, patch % 3 === 0 ? 'rgba(84, 43, 18, 0.24)' : 'rgba(241, 185, 105, 0.23)');
    wash.addColorStop(1, 'rgba(120, 100, 72, 0)');
    color.fillStyle = wash;
    color.fillRect(0, 0, 1024, 512);
  }

  for (let grain = 0; grain < 1400; grain += 1) {
    const y = random() * 512;
    const wave = 1 + random() * 7;
    const start = random() * 160 - 80;
    color.strokeStyle = grain % 3 === 0
      ? `rgba(240, 215, 172, ${0.06 + random() * 0.21})`
      : `rgba(59, 36, 18, ${0.04 + random() * 0.20})`;
    bump.strokeStyle = grain % 3 === 0 ? 'rgba(215, 215, 215, 0.3)' : 'rgba(30, 30, 30, 0.25)';
    roughness.strokeStyle = 'rgba(255, 255, 255, 0.11)';
    for (const context of [color, bump, roughness]) {
      context.lineWidth = 0.4 + random() * 1.25;
      context.beginPath();
      context.moveTo(start, y);
      context.bezierCurveTo(270, y + wave, 720, y - wave, 1080, y + wave * 0.3);
      context.stroke();
    }
  }

  // Long, forked cracks and short crushed fibers survive at the scene's viewing distance.
  for (let split = 0; split < 23; split += 1) {
    const x = random() * 1024;
    const y = random() * 512;
    const length = 20 + random() * 190;
    for (const [context, stroke] of [[color, 'rgba(44, 28, 15, 0.63)'], [bump, '#292929']]) {
      context.strokeStyle = stroke;
      context.lineWidth = 0.65 + random() * 1.2;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + length * 0.43, y + 1.8);
      context.lineTo(x + length, y - 0.9);
      context.moveTo(x + length * 0.43, y + 1.8);
      context.lineTo(x + length * 0.70, y + 5);
      context.stroke();
    }
  }

  for (let knot = 0; knot < 5; knot += 1) {
    const x = 85 + random() * 850;
    const y = 25 + random() * 462;
    for (let ring = 1; ring < 20; ring += 1) {
      for (const [context, stroke] of [[color, 'rgba(57, 34, 17, 0.17)'], [bump, 'rgba(45, 45, 45, 0.15)']]) {
        context.strokeStyle = stroke;
        context.lineWidth = 0.85;
        context.beginPath();
        context.ellipse(x, y, 5 + ring * 3.3, 1.8 + ring * 0.79, 0, 0, Math.PI * 2);
        context.stroke();
      }
    }
    color.fillStyle = '#5e4027';
    irregularPatch(color, x, y, 11, 3.7, random);
    bump.fillStyle = '#383838';
    irregularPatch(bump, x, y, 11, 3.7, random);
  }

  for (let pore = 0; pore < 5200; pore += 1) {
    const x = random() * 1024;
    const y = random() * 512;
    color.fillStyle = `rgba(47, 33, 20, ${random() * 0.2})`;
    color.fillRect(x, y, 0.6 + random() * 7, 0.4 + random());
    bump.fillStyle = 'rgba(34, 34, 34, 0.3)';
    bump.fillRect(x, y, 0.8 + random() * 6, 0.7);
  }
  const textures = finishSurface(surfaces);
  const proceduralColor = document.createElement('canvas');
  proceduralColor.width = 1024;
  proceduralColor.height = 512;
  proceduralColor.getContext('2d').drawImage(surfaces.color.canvas, 0, 0);
  const proceduralBump = document.createElement('canvas');
  proceduralBump.width = 1024;
  proceduralBump.height = 512;
  proceduralBump.getContext('2d').drawImage(surfaces.bump.canvas, 0, 0);
  if (endGrain) paintEndJoints(color, bump);

  // Perspective-free oak generated from the reference's dry honey-colored boards.
  // Canvas textures retain the procedural fallback while this generated albedo loads.
  new THREE.TextureLoader(loadingManager).load(new URL('./assets/barrel-wood-albedo.webp', import.meta.url).href, (source) => {
    color.save();
    color.filter = 'saturate(0.64) brightness(1.10)';
    color.drawImage(source.image, 0, 0, 1024, 512);
    color.restore();
    color.save();
    color.globalCompositeOperation = 'soft-light';
    color.globalAlpha = 0.16;
    color.drawImage(proceduralColor, 0, 0);
    color.restore();

    // The image's fine pores supply relief; longer procedural cracks add depth.
    bump.save();
    bump.filter = 'grayscale(1) contrast(0.82)';
    bump.drawImage(source.image, 0, 0, 1024, 512);
    bump.filter = 'none';
    bump.globalAlpha = 0.54;
    bump.drawImage(proceduralBump, 0, 0);
    bump.restore();

    const wear = randomGenerator(seed ^ 3907);
    for (let fiber = 0; fiber < 150; fiber += 1) {
      const x = wear() * 1024;
      const y = wear() * 512;
      const length = 3 + wear() ** 2 * 68;
      color.strokeStyle = `rgba(225, 219, 207, ${0.14 + wear() * 0.24})`;
      color.lineWidth = 0.4 + wear() * 1.15;
      color.beginPath();
      color.moveTo(x, y);
      color.bezierCurveTo(x + length * 0.28, y - 0.5, x + length * 0.73, y + 0.8, x + length, y);
      color.stroke();
    }
    for (let knot = 0; knot < 4; knot += 1) {
      const x = 110 + wear() * 800;
      const y = 30 + wear() * 452;
      const size = 0.65 + wear() * 0.7;
      for (let ring = 19; ring > 0; ring -= 1) {
        for (const [context, stroke] of [[color, 'rgba(76, 56, 38, 0.29)'], [bump, 'rgba(44, 44, 44, 0.26)']]) {
          context.strokeStyle = stroke;
          context.lineWidth = 0.8;
          context.beginPath();
          context.ellipse(x, y, (3 + ring * 1.95) * size, (0.8 + ring * 0.44) * size, 0, 0, Math.PI * 2);
          context.stroke();
        }
      }
      color.fillStyle = 'rgba(73, 50, 31, 0.62)';
      irregularPatch(color, x, y, 10 * size, 2.4 * size, wear);
      bump.fillStyle = '#393939';
      irregularPatch(bump, x, y, 10 * size, 2.4 * size, wear);
    }
    if (endGrain) paintEndJoints(color, bump);
    textures.color.needsUpdate = true;
    textures.bump.needsUpdate = true;
    source.dispose();
  }, undefined, () => {});
  return textures;
}

function paintedMetalSurface(color, seed, bareMetal) {
  const random = randomGenerator(seed);
  const surfaces = surfaceCanvases(768, 512, color, '#8e8e8e');
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 512;
  const metallic = canvas.getContext('2d');
  metallic.fillStyle = bareMetal ? '#c3c3c3' : '#303030';
  metallic.fillRect(0, 0, 768, 512);
  surfaces.metalness = { canvas, context: metallic };

  for (let stain = 0; stain < 36; stain += 1) {
    const x = random() * 768;
    const y = random() * 512;
    const wash = surfaces.color.context.createRadialGradient(x, y, 0, x, y, 22 + random() * 78);
    wash.addColorStop(0, stain % 3 === 0 ? 'rgba(37, 42, 35, 0.26)' : 'rgba(231, 224, 195, 0.18)');
    wash.addColorStop(1, 'rgba(92, 93, 79, 0)');
    surfaces.color.context.fillStyle = wash;
    surfaces.color.context.fillRect(0, 0, 768, 512);
  }

  // The same chipped mask controls color, shallow paint relief, roughness and metal exposure.
  for (let chip = 0; chip < 195; chip += 1) {
    const x = chip < 50 ? (chip % 2 === 0 ? random() * 36 : 732 + random() * 36) : random() * 768;
    const y = random() * 512;
    const width = 3 + random() ** 2 * 43;
    const height = 2 + random() ** 2 * 25;
    const patchSeed = Math.floor(random() * 100000);
    const flake = bareMetal ? (chip % 3 === 0 ? '#52584d' : '#e0d8c6')
      : (chip % 4 === 0 ? '#8e8677' : '#ddd4bf');
    for (const [name, fill] of Object.entries({ color: flake, bump: '#696969', roughness: '#969696', metalness: '#e0e0e0' })) {
      const context = surfaces[name].context;
      context.fillStyle = fill;
      irregularPatch(context, x, y, width, height, randomGenerator(patchSeed));
    }
  }

  for (let scratch = 0; scratch < 620; scratch += 1) {
    const x = random() * 768;
    const y = random() * 512;
    const length = 2 + random() ** 2 * 64;
    for (const [name, stroke] of Object.entries({ color: 'rgba(220, 224, 211, 0.55)', bump: '#707070', roughness: '#b5b5b5', metalness: '#dddddd' })) {
      const context = surfaces[name].context;
      context.strokeStyle = stroke;
      context.lineWidth = 0.35 + random() * 0.9;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + length, y + length * 0.15);
      context.stroke();
    }
  }
  return finishSurface(surfaces);
}

function ironSurface() {
  const random = randomGenerator(4907);
  const surfaces = surfaceCanvases(512, 256, '#514f45', '#b0b0b0');
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const metallic = canvas.getContext('2d');
  metallic.fillStyle = '#c9c9c9';
  metallic.fillRect(0, 0, 512, 256);
  surfaces.metalness = { canvas, context: metallic };
  for (let patch = 0; patch < 135; patch += 1) {
    const x = random() * 512;
    const y = random() * 256;
    const width = 2 + random() * 35;
    const height = 1 + random() * 31;
    const patchSeed = Math.floor(random() * 100000);
    for (const [name, fill] of Object.entries({ color: patch % 3 === 0 ? '#8e5834' : '#6b4b32', roughness: '#ededed', bump: '#9c9c9c', metalness: '#242424' })) {
      surfaces[name].context.fillStyle = fill;
      irregularPatch(surfaces[name].context, x, y, width, height, randomGenerator(patchSeed));
    }
  }
  for (let pit = 0; pit < 3000; pit += 1) {
    const x = random() * 512;
    const y = random() * 256;
    surfaces.color.context.fillStyle = pit % 4 === 0 ? 'rgba(192, 184, 160, 0.5)' : 'rgba(31, 28, 22, 0.4)';
    surfaces.color.context.fillRect(x, y, 0.7 + random() * 2.5, 0.7 + random() * 1.5);
    surfaces.bump.context.fillStyle = '#484848';
    surfaces.bump.context.fillRect(x, y, 1.3, 1.3);
  }
  return finishSurface(surfaces);
}

function aluminumSurface() {
  const random = randomGenerator(1003);
  const surfaces = surfaceCanvases(512, 512, '#babcb3', '#7c7c7c');
  for (let ring = 0; ring < 390; ring += 1) {
    const radius = 1 + ring * 0.7;
    const start = random() * Math.PI * 2;
    surfaces.color.context.strokeStyle = ring % 2 === 0 ? 'rgba(237, 235, 218, 0.24)' : 'rgba(52, 59, 51, 0.14)';
    surfaces.bump.context.strokeStyle = 'rgba(42, 42, 42, 0.17)';
    for (const context of [surfaces.color.context, surfaces.bump.context]) {
      context.lineWidth = 0.65;
      context.beginPath();
      context.arc(256, 256, radius, start, start + 2.4 + random() * 3.8);
      context.stroke();
    }
  }
  for (let spot = 0; spot < 38; spot += 1) {
    const x = random() * 512;
    const y = random() * 512;
    surfaces.color.context.fillStyle = spot % 3 === 0 ? 'rgba(78, 84, 70, 0.22)' : 'rgba(231, 229, 210, 0.3)';
    irregularPatch(surfaces.color.context, x, y, 3 + random() * 25, 2 + random() * 14, random);
  }
  return finishSurface(surfaces);
}

function barrelRadius(radius, position) {
  return radius * (0.865 + 0.135 * Math.sin(Math.PI * position));
}

function staveGeometry(radius, length, angleStart, angleEnd, grainOffset, compactGeometry) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const rows = compactGeometry ? 8 : 12;
  const columns = compactGeometry ? 3 : 4;

  for (let row = 0; row <= rows; row += 1) {
    const fraction = row / rows;
    const x = (fraction - 0.5) * length;
    const profile = barrelRadius(radius, fraction);
    for (let column = 0; column <= columns; column += 1) {
      const side = column / columns;
      const angle = THREE.MathUtils.lerp(angleStart, angleEnd, side);
      const edgeBevel = (column === 0 || column === columns) ? 0.002 : 0;
      const r = profile - edgeBevel + Math.sin(angleStart * 17.7) * 0.0012;
      positions.push(x, Math.cos(angle) * r, Math.sin(angle) * r);
      uvs.push(fraction * 0.82 + grainOffset, side * 0.16 + grainOffset * 1.7);
    }
  }

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * (columns + 1) + column;
      const b = a + columns + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function orientAlongX(mesh) {
  mesh.rotation.z = Math.PI * 0.5;
  return mesh;
}

function addRing(group, x, radius, thickness, material, compactGeometry) {
  // The fine rolled lips and hoop edges are only a few pixels thick.
  const fine = thickness < 0.008;
  const sectionSegments = compactGeometry ? 4 : (fine ? 5 : 8);
  const circleSegments = compactGeometry ? (radius > 0.2 ? 40 : 32) : (fine ? 48 : 64);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, thickness, sectionSegments, circleSegments), material);
  ring.rotation.y = Math.PI * 0.5;
  ring.position.x = x;
  group.add(ring);
  return ring;
}

function mergeStaticMeshes(group) {
  const batches = new Map();
  const sources = group.children.filter((mesh) => mesh.isMesh);
  for (const mesh of sources) {
    // These props contain single-material static meshes with complete draw ranges.
    const geometry = mesh.geometry;
    if (Array.isArray(mesh.material) || mesh.isSkinnedMesh || geometry.morphAttributes.position) continue;
    if (geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) continue;
    const attributes = Object.keys(geometry.attributes).sort();
    const signature = attributes.map((name) => `${name}:${geometry.attributes[name].itemSize}`).join('|')
      + `/${mesh.castShadow}/${mesh.receiveShadow}/${mesh.renderOrder}/${mesh.layers.mask}/${mesh.visible}`;
    if (!batches.has(mesh.material)) batches.set(mesh.material, new Map());
    const byShape = batches.get(mesh.material);
    if (!byShape.has(signature)) byShape.set(signature, []);
    byShape.get(signature).push(mesh);
  }

  for (const [material, byShape] of batches) {
    for (const meshes of byShape.values()) {
      if (meshes.length < 2) continue;
      const transformed = meshes.map((mesh) => {
        mesh.updateMatrix();
        return mesh.geometry.clone().applyMatrix4(mesh.matrix);
      });
      const vertexCount = transformed.reduce((total, geometry) => total + geometry.attributes.position.count, 0);
      const indexCount = transformed.reduce((total, geometry) => total + (geometry.index?.count ?? geometry.attributes.position.count), 0);
      const merged = new THREE.BufferGeometry();
      for (const name of Object.keys(transformed[0].attributes)) {
        const itemSize = transformed[0].attributes[name].itemSize;
        const values = new Float32Array(vertexCount * itemSize);
        let offset = 0;
        for (const geometry of transformed) {
          const attribute = geometry.attributes[name];
          if (!attribute.isInterleavedBufferAttribute && !attribute.normalized && attribute.array instanceof Float32Array) {
            values.set(attribute.array, offset);
            offset += attribute.array.length;
          } else {
            for (let vertex = 0; vertex < attribute.count; vertex += 1) {
              for (let component = 0; component < itemSize; component += 1) {
                values[offset++] = attribute.getComponent(vertex, component);
              }
            }
          }
        }
        merged.setAttribute(name, new THREE.BufferAttribute(values, itemSize));
      }
      const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
      let vertexOffset = 0;
      let indexOffset = 0;
      transformed.forEach((geometry, meshIndex) => {
        const count = geometry.index?.count ?? geometry.attributes.position.count;
        const mirrored = meshes[meshIndex].matrix.determinant() < 0;
        for (let index = 0; index < count; index += 3) {
          // Sequential indices make nonindexed extrusions compatible with the batch.
          const a = geometry.index ? geometry.index.getX(index) : index;
          const b = geometry.index ? geometry.index.getX(index + 1) : index + 1;
          const c = geometry.index ? geometry.index.getX(index + 2) : index + 2;
          indices[indexOffset++] = vertexOffset + a;
          indices[indexOffset++] = vertexOffset + (mirrored ? c : b);
          indices[indexOffset++] = vertexOffset + (mirrored ? b : c);
        }
        vertexOffset += geometry.attributes.position.count;
        geometry.dispose();
      });
      merged.setIndex(new THREE.BufferAttribute(indices, 1));
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      const exemplar = meshes[0];
      const batch = new THREE.Mesh(merged, material);
      batch.name = `${group.name} / static material batch`;
      batch.castShadow = exemplar.castShadow;
      batch.receiveShadow = exemplar.receiveShadow;
      batch.renderOrder = exemplar.renderOrder;
      batch.layers.mask = exemplar.layers.mask;
      batch.visible = exemplar.visible;
      batch.userData.sourceMeshes = meshes.length;
      group.remove(...meshes);
      group.add(batch);
    }
  }
  group.userData.meshBatching = {
    before: sources.length,
    after: group.children.filter((mesh) => mesh.isMesh).length,
  };
  return group;
}

function createBarrel(radius, length, seed, textures, metal, compactGeometry) {
  const group = new THREE.Group();
  group.name = 'Weathered floating barrel';
  group.userData.kind = 'barrel';
  const random = randomGenerator(seed);
  const darkWood = new THREE.MeshStandardMaterial({ color: '#4d2e18', roughness: 0.96 });
  const hoopMetal = metal.clone();
  hoopMetal.color.set('#f3d6b5');
  hoopMetal.metalness = 0.72;
  hoopMetal.roughness = 0.73;
  hoopMetal.bumpScale = 0.0014;
  const rivetMetal = new THREE.MeshStandardMaterial({
    color: '#b7773e', metalness: 0.48, roughness: 0.64,
    bumpMap: metal.bumpMap, bumpScale: 0.0008,
  });
  const rustMetal = new THREE.MeshStandardMaterial({
    color: '#8e492b', metalness: 0.16, roughness: 0.93,
    bumpMap: metal.bumpMap, bumpScale: 0.0017,
  });
  const core = orientAlongX(new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.86, radius * 0.86, length * 0.98, compactGeometry ? 32 : 48),
    darkWood,
  ));
  group.add(core);

  const staveCount = 20;
  const angleWidth = Math.PI * 2 / staveCount;
  const staveMaterial = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    vertexColors: true,
    map: textures.side.color,
    bumpMap: textures.side.bump,
    roughnessMap: textures.side.roughness,
    bumpScale: 0.0028,
    roughness: 0.86,
    clearcoat: 0.055,
    clearcoatRoughness: 0.45,
    side: THREE.DoubleSide,
  });
  staveMaterial.userData.barrelWood = true;
  for (let stave = 0; stave < staveCount; stave += 1) {
    const color = new THREE.Color('#fff7ec').multiplyScalar(1.07 + random() * 0.16);
    const geometry = staveGeometry(
      radius,
      length,
      stave * angleWidth + 0.004,
      (stave + 1) * angleWidth - 0.004,
      random(),
      compactGeometry,
    );
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let vertex = 0; vertex < geometry.attributes.position.count; vertex += 1) {
      color.toArray(colors, vertex * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    group.add(new THREE.Mesh(geometry, staveMaterial));
  }

  const endRadius = barrelRadius(radius, 0) * 0.965;
  const endMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#fff5ee').multiplyScalar(1.17),
    map: textures.end.color,
    bumpMap: textures.end.bump,
    roughnessMap: textures.end.roughness,
    bumpScale: 0.0030,
    roughness: 0.86,
    clearcoat: 0.045,
    clearcoatRoughness: 0.49,
  });
  endMaterial.userData.barrelWood = true;
  const nailGeometry = new THREE.SphereGeometry(0.006, compactGeometry ? 5 : 8, compactGeometry ? 4 : 6);
  for (const end of [-1, 1]) {
    const endX = end * (length * 0.5 - 0.011);
    const disk = orientAlongX(new THREE.Mesh(
      new THREE.CylinderGeometry(endRadius, endRadius, 0.026, compactGeometry ? 40 : 64),
      endMaterial,
    ));
    // Three's cylinder-cap U follows local Z; turn it so fibers follow local Y.
    const capUvs = disk.geometry.attributes.uv;
    for (let vertex = 0; vertex < capUvs.count; vertex += 1) {
      const u = capUvs.getX(vertex);
      const v = capUvs.getY(vertex);
      capUvs.setXY(vertex, v * 0.90 + 0.05, (1.0 - u) * 0.90 + 0.05);
    }
    disk.position.x = endX;
    group.add(disk);
    addRing(group, end * (length * 0.5 - 0.005), endRadius + 0.005, 0.013, darkWood, compactGeometry);

    for (const angle of [0.7, 2.45, 3.85, 5.55]) {
      const nail = new THREE.Mesh(nailGeometry, rivetMetal);
      nail.scale.x = 0.34;
      nail.position.set(
        endX + end * 0.014,
        Math.cos(angle) * endRadius * 0.75,
        Math.sin(angle) * endRadius * 0.75,
      );
      group.add(nail);
    }
  }

  for (const position of [0.11, 0.50, 0.89]) {
    const hoopRadius = barrelRadius(radius, position) + 0.003;
    const hoopWidth = length * (position === 0.5 ? 0.064 : 0.071);
    const hoopProfile = [
      new THREE.Vector2(hoopRadius - 0.002, -hoopWidth * 0.5),
      new THREE.Vector2(hoopRadius + 0.004, -hoopWidth * 0.5),
      new THREE.Vector2(hoopRadius + 0.006, -hoopWidth * 0.5 + 0.003),
      new THREE.Vector2(hoopRadius + 0.006, hoopWidth * 0.5 - 0.003),
      new THREE.Vector2(hoopRadius + 0.004, hoopWidth * 0.5),
      new THREE.Vector2(hoopRadius - 0.002, hoopWidth * 0.5),
      new THREE.Vector2(hoopRadius - 0.002, -hoopWidth * 0.5),
    ];
    const hoop = orientAlongX(new THREE.Mesh(new THREE.LatheGeometry(hoopProfile, compactGeometry ? 40 : 64), hoopMetal));
    hoop.position.x = (position - 0.5) * length;
    group.add(hoop);
    addRing(group, hoop.position.x - hoopWidth * 0.5, hoopRadius + 0.003, 0.0022, hoopMetal, compactGeometry);
    addRing(group, hoop.position.x + hoopWidth * 0.5, hoopRadius + 0.003, 0.0022, hoopMetal, compactGeometry);

    const overlap = new THREE.Mesh(new THREE.BoxGeometry(hoopWidth * 0.88, 0.004, 0.052), hoopMetal);
    const overlapNormal = new THREE.Vector3(0, Math.cos(0.85), Math.sin(0.85));
    overlap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), overlapNormal);
    overlap.position.set(hoop.position.x, overlapNormal.y * (hoopRadius + 0.007), overlapNormal.z * (hoopRadius + 0.007));
    group.add(overlap);

    // Low irregular oxide crusts break the hoop's continuous metallic highlight.
    for (let patch = 0; patch < 8; patch += 1) {
      const angle = random() * Math.PI * 2;
      const normal = new THREE.Vector3(0, Math.cos(angle), Math.sin(angle));
      const rust = new THREE.Mesh(new THREE.SphereGeometry(1, compactGeometry ? 4 : 6, compactGeometry ? 3 : 4), rustMetal);
      rust.scale.set(hoopWidth * (0.13 + random() * 0.22), 0.0010, 0.006 + random() * 0.013);
      rust.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      rust.position.set(hoop.position.x + (random() - 0.5) * hoopWidth * 0.7,
        normal.y * (hoopRadius + 0.0067), normal.z * (hoopRadius + 0.0067));
      group.add(rust);
    }

    for (let index = 0; index < 10; index += 1) {
      const angle = index / 10 * Math.PI * 2 + 0.18;
      const normal = new THREE.Vector3(0, Math.cos(angle), Math.sin(angle));
      const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.0090, compactGeometry ? 5 : 8, compactGeometry ? 4 : 5), rivetMetal);
      rivet.scale.set(1.0, 0.43, 1.0);
      rivet.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      rivet.position.set(hoop.position.x, normal.y * (hoopRadius + 0.010), normal.z * (hoopRadius + 0.010));
      group.add(rivet);
    }
  }

  group.traverse((object) => {
    object.castShadow = object.material !== rustMetal && object.material !== rivetMetal;
    object.receiveShadow = true;
  });
  return mergeStaticMeshes(group);
}

function canBodyGeometry(radius, length, seed, compactGeometry) {
  const random = randomGenerator(seed);
  const positions = [];
  const uvs = [];
  const indices = [];
  const segments = compactGeometry ? 36 : 64;
  const rows = compactGeometry ? 9 : 14;
  const dentAngle = random() * Math.PI * 2;
  const dentPosition = 0.32 + random() * 0.35;

  for (let row = 0; row <= rows; row += 1) {
    const fraction = row / rows;
    const x = (fraction - 0.5) * length;
    const endTaper = 0.93 + 0.07 * Math.sin(Math.PI * fraction) ** 0.18;
    for (let segment = 0; segment <= segments; segment += 1) {
      const angle = segment / segments * Math.PI * 2;
      const angleDistance = Math.atan2(Math.sin(angle - dentAngle), Math.cos(angle - dentAngle));
      const dent = Math.exp(-angleDistance * angleDistance * 13 - (fraction - dentPosition) ** 2 * 42) * 0.018;
      const r = radius * endTaper - dent;
      positions.push(x, Math.cos(angle) * r, Math.sin(angle) * r);
      uvs.push(fraction, segment / segments);
    }
  }

  for (let row = 0; row < rows; row += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const a = row * (segments + 1) + segment;
      const b = a + segments + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createCan(radius, length, color, seed, aluminum, lidMaterial, compactGeometry, bareMetal = false) {
  const group = new THREE.Group();
  group.name = 'Unlabeled floating metal can';
  group.userData.kind = 'can';
  const surface = paintedMetalSurface(color, seed, bareMetal);
  const paint = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    map: surface.color,
    bumpMap: surface.bump,
    roughnessMap: surface.roughness,
    metalnessMap: surface.metalness,
    bumpScale: 0.00065,
    metalness: 1,
    roughness: 0.88,
    clearcoat: 0.16,
    clearcoatRoughness: 0.32,
  });
  group.add(new THREE.Mesh(canBodyGeometry(radius, length, seed, compactGeometry), paint));

  for (const end of [-1, 1]) {
    const endX = end * length * 0.5;
    const cap = orientAlongX(new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.925, radius * 0.925, 0.005, compactGeometry ? 36 : 64),
      lidMaterial,
    ));
    cap.position.x = endX;
    group.add(cap);
    addRing(group, endX, radius * 0.94, 0.006, aluminum, compactGeometry);
    addRing(group, endX + end * 0.003, radius * 0.82, 0.0014, aluminum, compactGeometry);
    addRing(group, endX + end * 0.003, radius * 0.69, 0.0010, aluminum, compactGeometry);
  }

  const tabShape = new THREE.Shape();
  tabShape.absellipse(0, 0, radius * 0.21, radius * 0.36, 0, Math.PI * 2, false);
  const tabHole = new THREE.Path();
  tabHole.absellipse(0, radius * 0.05, radius * 0.115, radius * 0.20, 0, Math.PI * 2, true);
  tabShape.holes.push(tabHole);
  const tab = new THREE.Mesh(new THREE.ExtrudeGeometry(tabShape, {
    depth: 0.0025,
    bevelEnabled: true,
    bevelThickness: 0.001,
    bevelSize: 0.001,
    bevelSegments: 1,
    curveSegments: compactGeometry ? 12 : 20,
  }), aluminum);
  tab.rotation.y = Math.PI * 0.5;
  tab.position.set(length * 0.5 + 0.005, radius * 0.23, 0);
  group.add(tab);

  const opening = new THREE.Mesh(
    new THREE.CircleGeometry(1, 24),
    new THREE.MeshStandardMaterial({ color: '#171d19', metalness: 0.08, roughness: 0.94 }),
  );
  opening.rotation.y = Math.PI * 0.5;
  opening.scale.set(radius * 0.31, radius * 0.32, 1);
  opening.position.set(length * 0.5 + 0.004, radius * 0.48, 0);
  const punchedLip = new THREE.Mesh(new THREE.TorusGeometry(1, 0.045,
    compactGeometry ? 4 : 6, compactGeometry ? 24 : 32), lidMaterial);
  punchedLip.rotation.copy(opening.rotation);
  punchedLip.scale.set(radius * 0.32, radius * 0.33, radius * 0.15);
  punchedLip.position.copy(opening.position);
  group.add(punchedLip);
  group.add(opening);

  const rivet = orientAlongX(new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.005, 12), aluminum));
  rivet.position.set(length * 0.5 + 0.010, radius * 0.04, 0);
  group.add(rivet);

  group.traverse((object) => {
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return mergeStaticMeshes(group);
}

export function createProps(loadingManager, { compactGeometry = false } = {}) {
  const textures = { side: woodSurface(104, false, loadingManager), end: woodSurface(702, true, loadingManager) };
  const iron = ironSurface();
  const hoopMetal = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    map: iron.color,
    bumpMap: iron.bump,
    bumpScale: 0.0013,
    roughnessMap: iron.roughness,
    metalnessMap: iron.metalness,
    metalness: 0.92,
    roughness: 0.9,
  });
  const aluminum = new THREE.MeshStandardMaterial({
    color: '#d0d1c6',
    metalness: 0.9,
    roughness: 0.29,
  });
  const brushedAluminum = aluminumSurface();
  const lidMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    map: brushedAluminum.color,
    bumpMap: brushedAluminum.bump,
    bumpScale: 0.0003,
    roughnessMap: brushedAluminum.roughness,
    metalness: 0.9,
    roughness: 0.75,
  });

  return [
    { object: createBarrel(0.402, 1.10, 112, textures, hoopMetal, compactGeometry), x: -2.6, z: 4.2, radius: 0.402, length: 1.10, yaw: -0.85, floatOffset: 0.028, response: 0.60 },
    { object: createBarrel(0.39, 0.99, 341, textures, hoopMetal, compactGeometry), x: 2.8, z: 5.6, radius: 0.39, length: 0.99, yaw: 0.48, floatOffset: 0.027, response: 0.68 },
    { object: createBarrel(0.38, 1.02, 916, textures, hoopMetal, compactGeometry), x: -0.8, z: 8.0, radius: 0.38, length: 1.02, yaw: 0.73, floatOffset: 0.015, response: 0.53 },
    { object: createCan(0.147, 0.47, '#c74632', 82, aluminum, lidMaterial, compactGeometry), x: -1.4, z: 3.0, radius: 0.147, length: 0.47, yaw: -0.49, floatOffset: 0.011, response: 1.06 },
    { object: createCan(0.142, 0.415, '#b7bdb2', 193, aluminum, lidMaterial, compactGeometry, true), x: 1.6, z: 4.4, radius: 0.142, length: 0.415, yaw: -0.91, floatOffset: 0.005, response: 1.14 },
    { object: createCan(0.155, 0.47, '#2c8f7c', 631, aluminum, lidMaterial, compactGeometry), x: 3.5, z: 7.8, radius: 0.155, length: 0.47, yaw: -2.96, floatOffset: 0.008, response: 0.98 },
  ];
}
