(() => {
  'use strict';

  const channels = 3;
  const maxQuantized = 65535;
  const vertexStride = 16;
  const skinInfluences = 4;
  const skinBoneLimit = 32;
  const depthBins = 96;
  // The five landmark exteriors have individual pigments. The main cast share
  // a soft skin finish, with a separate green pigment for Plankton.
  const heroFinishes = {h01:1, h02:2, h03:3, h04:4, h05:5,
    c01:6, c02:6, c03:6, c04:6, c05:7, c06:6, c07:6};
  // Hue offsets in degrees for the body, roof/leaves, trim and painted accents.
  const houseHues = {
    h01: [-7, 4, -8, 4],     // Tangerine rind and fresh green leaves
    h02: [-3, 0, -9, 0],     // Reef stone with marine-blue portholes
    h03: [-10, 0, 0, 0],     // A rose-coral cast to the iron-rich rock
    h04: [-5, 23, -12, 5],   // Weathered staves and warm teak framing
    h05: [-13, 0, -12, 4],   // Lagoon enamel, blue glove and red lettering
    h06: [-15, -15, -7, 0],  // Golden thatch against sea-green walls
    h07: [-11, 0, -8, 0],    // Orchid plaster and brass
    h08: [17, 0, -10, 0]     // Raspberry-coral paint and walnut
  };
  const principalCharacters = new Set(['c01','c02','c03','c04','c05']);
  const ordinaryResidents = new Set(['c14','c15','c16','c17','c18','c19']);
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const pendantDiffuser = 14;
  // Shade center and inner roof height, in the authored Krusty Krab mesh.
  const krustyPendants = [
    {x:-4.65, y:2.89, z:4.38, roof:6.66},
    {x:-1.90, y:2.66, z:3.15, roof:7.85},
    {x:4.90, y:2.69, z:2.65, roof:8.17}
  ];

  function makeKrustyPendants({min, extent}) {
    const positions = [], normals = [], colors = [], materials = [], indices = [];
    const sides = 12;
    function lathe({x,y,z}, profile, pigment, material) {
      for (let ring = 1; ring < profile.length; ring++) {
        const [lowY, lowR] = profile[ring - 1];
        const [highY, highR] = profile[ring];
        const dy = highY-lowY, dr = highR-lowR;
        const scale = 127/Math.hypot(dy,dr);
        const start = materials.length;
        for (const [height, radius] of [profile[ring - 1], profile[ring]]) {
          for (let i = 0; i < sides; i++) {
            const angle = i * 2 * Math.PI / sides;
            const c = Math.cos(angle), s = Math.sin(angle);
            const point = [x+c*radius,y+height,z+s*radius];
            point.forEach((value, axis) =>
              positions.push(Math.round((value-min[axis])*maxQuantized/extent[axis])));
            normals.push(Math.round(c*dy*scale),Math.round(-dr*scale),Math.round(s*dy*scale));
            colors.push(...pigment);
            materials.push(material);
          }
        }
        for (let i = 0; i < sides; i++) {
          const a = start+i, b = start+(i+1)%sides;
          indices.push(a,a+sides,b,b,a+sides,b+sides);
        }
      }
    }
    for (const lamp of krustyPendants) {
      lathe(lamp,[[.22,.024],[lamp.roof-lamp.y-.045,.024]],[76,54,36],1);
      lathe(lamp,[[lamp.roof-lamp.y-.19,.057],[lamp.roof-lamp.y-.135,.10]],[102,67,38],1);
      lathe(lamp,[[-.028,.334],[.038,.367],[.093,.356],[.31,.143],[.34,.071]],[154,89,45],1);
      lathe(lamp,[[-.310,.004],[-.290,.167],[-.224,.292],[-.135,.343],[-.030,.331]],[255,169,71],pendantDiffuser);
    }
    function encode(values) {
      return btoa(String.fromCharCode(...new Uint8Array(values.buffer)));
    }
    return decodeMesh({
      min, extent, p:encode(new Uint16Array(positions)), n:encode(new Int8Array(normals)),
      c:encode(new Uint8Array(colors)), m:encode(new Uint8Array(materials)),
      i:encode(new Uint16Array(indices))
    });
  }

  function decodeBase64(encoded) {
    const raw = atob(encoded);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }

  function decodeMesh(source) {
    const positionBytes = decodeBase64(source.p);
    const positions = new Uint16Array(positionBytes.buffer);
    const normals = decodeBase64(source.n);
    const colors = decodeBase64(source.c);
    const alphas = source.a && decodeBase64(source.a);
    const materials = source.m && decodeBase64(source.m);
    const accessibility = source.ao && decodeBase64(source.ao);
    const joints = source.j && decodeBase64(source.j);
    const uvBytes = source.t && source.tex && decodeBase64(source.t);
    const indexBytes = decodeBase64(source.i);
    const IndexArray = source.wide ? Uint32Array : Uint16Array;
    let indices = new IndexArray(indexBytes.buffer);
    let opaqueCount = source.opaqueCount ?? indices.length;
    if (alphas && source.opaqueCount === undefined) {
      const opaque = [], transparent = [];
      for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i], b = indices[i + 1], c = indices[i + 2];
        const low = Math.min(alphas[a], alphas[b], alphas[c]);
        const high = Math.max(alphas[a], alphas[b], alphas[c]);
        if (low === 255) opaque.push(a, b, c);
        else if (high > 0) transparent.push(a, b, c);
      }
      opaqueCount = opaque.length;
      indices = new IndexArray(opaqueCount + transparent.length);
      indices.set(opaque);
      indices.set(transparent, opaqueCount);
    }

    const vertices = new Uint8Array(positions.length * vertexStride / channels);
    const words = new Uint16Array(vertices.buffer);
    for (let i = 0; i < positions.length; i += channels) {
      const vertex = i / channels;
      const start = vertex * vertexStride;
      words[start / 2] = positions[i];
      words[start / 2 + 1] = positions[i + 1];
      words[start / 2 + 2] = positions[i + 2];
      vertices[start + 6] = normals[i];
      vertices[start + 7] = normals[i + 1];
      vertices[start + 8] = normals[i + 2];
      vertices[start + 9] = colors[i];
      vertices[start + 10] = colors[i + 1];
      vertices[start + 11] = colors[i + 2];
      vertices[start + 12] = alphas ? alphas[vertex] : 255;
      vertices[start + 13] = materials ? materials[vertex] : 0;
      if (joints) vertices[start + 14] = joints[vertex];
      vertices[start + 15] = accessibility ? accessibility[vertex] : 255;
    }
    const pivots = joints && new Float32Array(12);
    if (pivots) {
      for (const [index, pivot] of (source.pivots ?? []).slice(0, 4).entries()) {
        if (pivot) pivots.set(pivot, index * 3);
      }
    }
    let skinAttributes;
    if (source.skin) {
      const joints = decodeBase64(source.skin.j);
      const weights = decodeBase64(source.skin.w);
      skinAttributes = new Uint8Array(joints.length + weights.length);
      skinAttributes.set(joints);
      skinAttributes.set(weights,joints.length);
    }
    return {
      vertices, positions, indices, opaqueCount, pivots, uvBytes, alphas,
      min: source.min, extent: source.extent, skinAttributes
    };
  }

  function readSkinTrack({walk,idle,idleFrame=0,bones,frames,duration,greet,head,headPivot}) {
    const elements = bones * 12;
    const poses = new Float32Array(decodeBase64(walk).buffer);
    const resting = idle ? new Float32Array(decodeBase64(idle).buffer)
      : poses.subarray(idleFrame*elements,(idleFrame+1)*elements);
    const wave = greet && {...greet,poses:new Float32Array(decodeBase64(greet.poses).buffer)};
    return {poses,resting,frames,duration,wave,head,headPivot,matrix:new Float32Array(elements)};
  }

  function samplePalette(clip,frame,resting,matrix,pace) {
    const low = Math.min(clip.frames-2,Math.floor(frame));
    const fraction = frame - low;
    const {poses} = clip;
    const stride = matrix.length;
    const start = low * stride, next = start + stride;
    for (let i = 0; i < stride; i++) {
      const a = poses[start+i], b = poses[next+i];
      matrix[i] = resting[i] + pace * ((a + (b - a) * fraction) - resting[i]);
    }
    return matrix;
  }

  function characterPalette(track,instance) {
    const {standing,pace,walkTime} = instance;
    const {wave,resting,matrix,head,headPivot} = track;
    const {waveTime = -Infinity,lookYaw = 0,lookPitch = 0} = standing ?? {};
    const waving = wave && waveTime >= 0 && waveTime < wave.duration;
    const looking = head && Math.abs(lookYaw)+Math.abs(lookPitch) >= .001;
    if (waving) {
      samplePalette(wave,waveTime/wave.duration*(wave.frames-1),resting,matrix,1);
    } else if (pace > 0) {
      const frame = (Math.max(0,walkTime) % track.duration) / track.duration * (track.frames - 1);
      samplePalette(track,frame,resting,matrix,pace);
    } else if (looking) {
      matrix.set(resting);
    } else {
      return resting;
    }
    if (looking) {
      const sy = Math.sin(lookYaw), cy = Math.cos(lookYaw);
      const sp = Math.sin(lookPitch), cp = Math.cos(lookPitch);
      for (const bone of head) {
        const start = bone * 12;
        // Rotate each head matrix around the shared pivot in model space.
        for (let col = 0; col < 4; col++) {
          const axis = start+3*col;
          const [px,py,pz] = col === 3 ? headPivot : zeroPivot;
          const x = matrix[axis]-px, y = matrix[axis+1]-py, z = matrix[axis+2]-pz;
          const pitched = cp*z-sp*y;
          matrix[axis] = cy*x+sy*pitched+px;
          matrix[axis+1] = cp*y+sp*z+py;
          matrix[axis+2] = cy*pitched-sy*x+pz;
        }
      }
    }
    return matrix;
  }

  const zeroPivot = [0,0,0];
  const wrapAngle = angle => Math.atan2(Math.sin(angle),Math.cos(angle));

  function makeTransparency(mesh) {
    const {indices, positions, opaqueCount, extent} = mesh;
    const source = indices.subarray(opaqueCount).slice();
    const count = source.length / 3;
    if (!count) return null;
    const centers = new Float32Array(source.length);
    const scales = extent.map(length => length / (3 * maxQuantized));
    for (let i = 0; i < source.length; i += 3) {
      const a = 3 * source[i], b = 3 * source[i + 1], c = 3 * source[i + 2];
      for (let axis = 0; axis < 3; axis++) {
        centers[i + axis] = (positions[a + axis] + positions[b + axis] + positions[c + axis]) * scales[axis];
      }
    }
    return {
      source, centers, order: source.slice(), keys: new Uint8Array(count), bins: new Uint32Array(depthBins),
      depths: new Float32Array(count), direction: [0, 0, 0]
    };
  }

  function reduceIndices(mesh, density) {
    const {positions, vertices, indices, opaqueCount, extent, uvBytes, skinAttributes} = mesh;
    if (opaqueCount < 1800) return null;
    const longest = Math.max(...extent);
    const counts = extent.map(length => Math.max(1, Math.round(length * density / longest)));
    const scales = counts.map(count => count / maxQuantized);
    const uv = uvBytes && new Uint16Array(uvBytes.buffer);
    const xStride = counts[0] + 1, yStride = counts[1] + 1;
    const remapped = new indices.constructor(positions.length / 3);
    const cells = new Map();
    const groups = [];
    const jointsLength = remapped.length * skinInfluences;
    const rigSize = skinAttributes ? skinBoneLimit : 5;
    // Choose a source vertex for each cell while protecting color and UV seams.
    for (let i = 0; i < remapped.length; i++) {
      const x = positions[3 * i] * scales[0], y = positions[3 * i + 1] * scales[1];
      const z = positions[3 * i + 2] * scales[2];
      const gx = Math.round(x), gy = Math.round(y), gz = Math.round(z);
      const cell = gx + (gy + gz * yStride) * xStride;
      const offset = i * vertexStride;
      const normal = (vertices[offset + 6] >> 7) * 4 +
        (vertices[offset + 7] >> 7) * 2 + (vertices[offset + 8] >> 7);
      const pigment = (vertices[offset + 9] >> 6) * 16 +
        (vertices[offset + 10] >> 6) * 4 + (vertices[offset + 11] >> 6);
      const material = vertices[offset + 13];
      const chart = uv ? (uv[2 * i] >> 13) + (uv[2 * i + 1] >> 13) * 8 : 0;
      let rig = vertices[offset + 14];
      if (skinAttributes) {
        const start = i * skinInfluences;
        let strongest = start;
        for (let j = start+1; j < start+skinInfluences; j++) {
          if (skinAttributes[jointsLength+j] > skinAttributes[jointsLength+strongest]) strongest = j;
        }
        rig = skinAttributes[strongest];
      }
      const opaque = Number(vertices[offset + 12] === 255);
      const colorAndNormal = cell * 512 + normal * 64 + pigment;
      const chartAndMaterial = material * 64 + chart;
      const key = ((colorAndNormal * 1024 + chartAndMaterial) * rigSize + rig) * 2 + opaque;
      const distance = (x - gx) ** 2 + (y - gy) ** 2 + (z - gz) ** 2;
      let group = cells.get(key);
      if (!group) {
        group = {id: groups.length, vertex: i, distance};
        cells.set(key, group);
        groups.push(group);
      } else if (distance < group.distance) {
        group.vertex = i;
        group.distance = distance;
      }
      remapped[i] = group.id;
    }
    for (let i = 0; i < remapped.length; i++) {
      remapped[i] = groups[remapped[i]].vertex;
    }
    const reduced = new indices.constructor(opaqueCount);
    const visited = new Set();
    let count = 0;
    const verticesCount = remapped.length;
    for (let i = 0; i < opaqueCount; i += 3) {
      const a = remapped[indices[i]], b = remapped[indices[i + 1]], c = remapped[indices[i + 2]];
      if (a === b || a === c || b === c) continue;
      const first = Math.min(a, b, c), last = Math.max(a, b, c);
      const middle = a + b + c - first - last;
      const key = (first * verticesCount + middle) * verticesCount + last;
      if (visited.has(key)) continue;
      visited.add(key);
      reduced[count++] = a;
      reduced[count++] = b;
      reduced[count++] = c;
    }
    return count > 0 && count < opaqueCount * .82 ? reduced.subarray(0, count) : null;
  }

  function uploadMesh(gl, mesh, {preserveTopology = false, smallResidentLOD = false} = {}) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
    const attributes = [
      [3, gl.UNSIGNED_SHORT, true, 0], [3, gl.BYTE, true, 6],
      [4, gl.UNSIGNED_BYTE, true, 9], [1, gl.UNSIGNED_BYTE, false, 13],
      [1, gl.UNSIGNED_BYTE, false, 14]
    ];
    for (const [slot, [components, type, normalized, offset]] of attributes.entries()) {
      gl.enableVertexAttribArray(slot);
      gl.vertexAttribPointer(slot, components, type, normalized, vertexStride, offset);
    }
    gl.enableVertexAttribArray(6);
    gl.vertexAttribPointer(6, 1, gl.UNSIGNED_BYTE, true, vertexStride, 15);
    if (mesh.uvBytes) {
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, mesh.uvBytes, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(5);
      gl.vertexAttribPointer(5, 2, gl.UNSIGNED_SHORT, true, 0, 0);
    }
    if (mesh.skinAttributes) {
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER,mesh.skinAttributes,gl.STATIC_DRAW);
      gl.enableVertexAttribArray(7);
      gl.vertexAttribPointer(7,skinInfluences,gl.UNSIGNED_BYTE,false,0,0);
      gl.enableVertexAttribArray(8);
      gl.vertexAttribPointer(8,skinInfluences,gl.UNSIGNED_BYTE,true,0,mesh.skinAttributes.length/2);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    const transparency = makeTransparency(mesh);
    const wide = mesh.indices instanceof Uint32Array;
    // Independently remapped UV and skinning seams can pull apart in a pose.
    // Keep the principal characters' authored indices at every screen size.
    const variants = preserveTopology ? [] : [reduceIndices(mesh, 36), reduceIndices(mesh, 19)];
    if (smallResidentLOD) variants.push(reduceIndices(mesh, 8));
    let count = mesh.indices.length;
    for (const variant of variants) if (variant) count += variant.length;
    const indices = new mesh.indices.constructor(count);
    indices.set(mesh.indices);
    let start = mesh.indices.length;
    const lods = variants.map(variant => {
      if (!variant) return null;
      indices.set(variant, start);
      const lod = {count: variant.length, offset: start * indices.BYTES_PER_ELEMENT};
      start += variant.length;
      return lod;
    });
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, transparency ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return {
      vao, transparency, lods, opaqueCount: mesh.opaqueCount,
      offset: mesh.opaqueCount * mesh.indices.BYTES_PER_ELEMENT,
      type: wide ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT
    };
  }

  function createTexture(gl, unit = gl.TEXTURE7, neutral = 255) {
    const texture = gl.createTexture();
    gl.activeTexture(unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([neutral, neutral, neutral, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.activeTexture(gl.TEXTURE0);
    return texture;
  }

  function loadTexture(gl, url, anisotropy, surfaceMap = false) {
    const unit = surfaceMap ? gl.TEXTURE8 : gl.TEXTURE7;
    const texture = createTexture(gl, unit, surfaceMap ? 128 : 255);
    const result = {texture, ready: false};
    let settle;
    result.settled = new Promise(resolve => { settle = resolve; });
    if (!url) {
      settle(false);
      return result;
    }
    const image = new Image();
    image.onload = () => {
      if (gl.isContextLost() || !gl.isTexture(texture)) {
        settle(false);
        return;
      }
      try {
        gl.activeTexture(unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, surfaceMap ? gl.RGBA8 : gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, surfaceMap ? gl.REPEAT : gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, surfaceMap ? gl.REPEAT : gl.CLAMP_TO_EDGE);
        if (anisotropy) {
          const maximum = gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
          gl.texParameterf(gl.TEXTURE_2D, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(4, maximum));
        }
        gl.generateMipmap(gl.TEXTURE_2D);
        result.ready = true;
      } catch (error) {
        console.warn(error);
      } finally {
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.activeTexture(gl.TEXTURE0);
        settle(result.ready);
      }
    };
    image.onerror = () => settle(false);
    image.src = url;
    return result;
  }

  function sortTransparency(gl, geometry, x, y, z) {
    const {source, centers, order, keys, bins, depths, direction} = geometry.transparency;
    const length = Math.hypot(x, y, z);
    if (length < .005) return;
    x /= length;
    y /= length;
    z /= length;
    if (x * direction[0] + y * direction[1] + z * direction[2] > .9987) return;
    direction[0] = x;
    direction[1] = y;
    direction[2] = z;

    let low = Infinity, high = -Infinity;
    for (let i = 0; i < depths.length; i++) {
      const j = i * 3;
      const depth = centers[j] * x + centers[j + 1] * y + centers[j + 2] * z;
      depths[i] = depth;
      low = Math.min(low, depth);
      high = Math.max(high, depth);
    }
    const scale = (depthBins - 1) / Math.max(.001, high - low);
    bins.fill(0);
    for (let i = 0; i < depths.length; i++) {
      const bin = clamp(Math.floor((high - depths[i]) * scale), 0, depthBins - 1);
      keys[i] = bin;
      bins[bin]++;
    }
    let start = 0;
    for (let i = 0; i < bins.length; i++) {
      const count = bins[i];
      bins[i] = start;
      start += count * 3;
    }
    for (let i = 0; i < depths.length; i++) {
      const bin = keys[i];
      const j = bins[bin];
      order[j] = source[3 * i];
      order[j + 1] = source[3 * i + 1];
      order[j + 2] = source[3 * i + 2];
      bins[bin] += 3;
    }
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, geometry.offset, order);
  }

  function houseProxy(mesh, house, values) {
    const {x, y, z, sin, cos, scale} = house;
    const {indices, positions, opaqueCount, min, extent, alphas} = mesh;
    const cell = clamp(extent[1] * scale / 29, .10, .26);
    const steps = extent.map(length => Math.max(1, Math.ceil(length * scale / cell)));
    const strideX = steps[0] + 1, strideY = steps[1] + 1;
    const groups = new Map();
    const nodes = [];
    const membership = new Uint32Array(positions.length / 3);
    for (let i = 0; i < positions.length; i += 3) {
      const px = positions[i] / maxQuantized;
      const py = positions[i + 1] / maxQuantized;
      const pz = positions[i + 2] / maxQuantized;
      const key = Math.round(px * steps[0]) +
        (Math.round(py * steps[1]) + Math.round(pz * steps[2]) * strideY) * strideX;
      let group = groups.get(key);
      if (!group) {
        group = {id: nodes.length, x: 0, y: 0, z: 0, count: 0};
        groups.set(key, group);
        nodes.push(group);
      }
      group.x += px;
      group.y += py;
      group.z += pz;
      group.count++;
      membership[i / 3] = group.id;
    }
    for (const node of nodes) {
      const px = (min[0] + node.x / node.count * extent[0]) * scale;
      const pz = (min[2] + node.z / node.count * extent[2]) * scale;
      node.x = x + cos * px + sin * pz;
      node.y = y + (min[1] + node.y / node.count * extent[1]) * scale;
      node.z = z - sin * px + cos * pz;
    }
    const visited = new Set();
    // Collapse flat decals and duplicate material seams while keeping doors and overhangs.
    for (let i = 0; i < indices.length; i += 3) {
      const glass = i >= opaqueCount;
      if (glass && alphas && Math.max(alphas[indices[i]], alphas[indices[i + 1]], alphas[indices[i + 2]]) < 24) continue;
      const a = membership[indices[i]], b = membership[indices[i + 1]], c = membership[indices[i + 2]];
      const first = Math.min(a, b, c), last = Math.max(a, b, c);
      const middle = a + b + c - first - last;
      if (first === middle || middle === last) continue;
      const key = (first * nodes.length + middle) * nodes.length + last;
      if (visited.has(key)) continue;
      visited.add(key);
      for (const node of [nodes[a], nodes[b], nodes[c]]) {
        // Position and static material are the fields read by the contact and collision passes.
        values.push(node.x, node.y, node.z, 0, 1, 0, 0, 0, 0, glass ? 23 : 13, 0);
      }
    }
  }

  function fitHouseFooting(mesh, placement, scale, seabedFloor) {
    const {id, x, z, yaw} = placement;
    if (id !== 'h02' && id !== 'h03' && id !== 'h04' && id !== 'h06' && id !== 'h07') return;
    const {positions, vertices, min, extent} = mesh;
    const grade = seabedFloor(x,z);
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    const heights = new Float64Array(positions.length / 3);
    let low = min[1], high = low + extent[1];
    for (let i = 0; i < heights.length; i++) {
      const offset = i * 3;
      const material = vertices[i * vertexStride + 13];
      const u = (min[0] + positions[offset] * extent[0] / maxQuantized) * scale;
      const y = (min[1] + positions[offset + 1] * extent[1] / maxQuantized) * scale;
      const v = (min[2] + positions[offset + 2] * extent[2] / maxQuantized) * scale;
      let delta = 0;
      // Select complete stones in scaled local metres, including their buried faces.
      const stoneLift = id === 'h02' && material === 4 && v > 1.79 && y < .09 ? .052
        : id === 'h06' && material === 4 ? .040
        : id === 'h07' && material === 0 && u > -.41 && u < -.04 && v > .76 && y < .05 ? .040
        : 0;
      if (stoneLift) {
        delta = stoneLift + seabedFloor(x + cos*u + sin*v, z - sin*u + cos*v) - grade;
      } else if (id === 'h03' && material === 4 && y < .01) {
        delta = -.052;
      } else if (id === 'h04' && material === 3 && y < .036) {
        delta = -.043;
      }
      heights[i] = (y + delta) / scale;
      low = Math.min(low,heights[i]);
      high = Math.max(high,heights[i]);
    }
    const words = new Uint16Array(vertices.buffer);
    const height = high - low;
    for (let i = 0; i < heights.length; i++) {
      const packed = Math.round(maxQuantized * (heights[i] - low) / height);
      positions[i * 3 + 1] = packed;
      words[i * vertexStride / 2 + 1] = packed;
    }
    mesh.min = [min[0],low,min[2]];
    mesh.extent = [extent[0],height,extent[2]];
  }

  function visitFootingTriangles(mesh, house, seabedFloor, visit) {
    const {x, y, z, sin, cos, scale} = house;
    const {positions, min, extent, indices, opaqueCount} = mesh;
    const points = new Array(positions.length / 3);
    function point(index) {
      if (!points[index]) {
        const i = index * 3;
        const u = (min[0] + positions[i] * extent[0] / maxQuantized) * scale;
        const v = (min[2] + positions[i + 2] * extent[2] / maxQuantized) * scale;
        const worldX = x + cos*u + sin*v, worldZ = z - sin*u + cos*v;
        const worldY = y + (min[1] + positions[i + 1] * extent[1] / maxQuantized) * scale;
        points[index] = [worldX,worldZ,worldY - seabedFloor(worldX,worldZ)];
      }
      return points[index];
    }
    for (let i = 0; i < opaqueCount; i += 3) {
      const a = point(indices[i]), b = point(indices[i+1]), c = point(indices[i+2]);
      if (Math.min(a[2],b[2],c[2]) <= .26) visit(a,b,c);
    }
  }

  window.createDiveImports = function createDiveImports(gl, assets, layout, seabedFloor, shader) {
    const {
      createProgram, depthScale, depthOffset, lightProjection, shadowFragment,
      sunlight, water, volumeSampling, nearClip, reefMaterial
    } = shader;
    const transform = `
      layout(location=0) in vec3 a_position;
      uniform vec3 u_min, u_extent, u_origin;
      uniform vec4 u_pose;
      vec3 bank(vec3 p) {
        float roll=u_pose.w;
        return vec3(p.x-roll*p.y,p.y+roll*p.x,p.z)*vec3(inversesqrt(1.0+roll*roll),inversesqrt(1.0+roll*roll),1.0);
      }
      vec3 turn(vec3 p) {
        return vec3(u_pose.y*p.x+u_pose.x*p.z,p.y,u_pose.y*p.z-u_pose.x*p.x);
      }
      vec3 modelPosition(vec3 local) {
        return u_origin+turn(bank(local))*u_pose.z;
      }
    `;
    const pass = createProgram(gl, `#version 300 es
      precision highp float;
      ${transform}
      layout(location=1) in vec3 a_normal;
      layout(location=2) in vec4 a_color;
      layout(location=3) in float a_material;
      layout(location=4) in float a_joint;
      layout(location=5) in vec2 a_uv;
      layout(location=6) in float a_access;
      layout(location=7) in vec4 a_skinJoints;
      layout(location=8) in vec4 a_skinWeights;
      uniform vec3 u_eye, u_right, u_up, u_forward;
      uniform vec2 u_lens;
      uniform vec3 u_pivots[4];
      uniform vec4 u_jointAngles;
      uniform vec2 u_residentLook;
      uniform bool u_skinned;
      uniform mat4x3 u_skin[${skinBoneLimit}];
      out vec3 v_position, v_normal, v_local, v_restNormal;
      out float v_access;
      out vec4 v_color;
      out vec2 v_uv;
      flat out float v_material;
      void main() {
        vec3 local=u_min+a_position*u_extent;
        v_local=local*u_pose.z;
        v_restNormal=a_normal;
        v_access=a_access;
        vec3 normal=a_normal;
        if (u_skinned) {
          ivec4 joints=ivec4(a_skinJoints);
          mat4x3 skin = a_skinWeights.x * u_skin[joints.x]
                      + a_skinWeights.y * u_skin[joints.y]
                      + a_skinWeights.z * u_skin[joints.z]
                      + a_skinWeights.w * u_skin[joints.w];
          local=skin*vec4(local,1.);
          normal=mat3(skin)*normal;
        } else if (a_joint>.5) {
          int joint=clamp(int(a_joint)-1,0,3);
          float angle=u_jointAngles[joint];
          float s=sin(angle), c=cos(angle);
          mat2 swing=mat2(c,s,-s,c);
          vec3 pivot=u_pivots[joint];
          local.yz=pivot.yz+swing*(local.yz-pivot.yz);
          normal.yz=swing*normal.yz;
        }
        if (!u_skinned && a_joint<2.5 && abs(u_residentLook.x)+abs(u_residentLook.y)>.001) {
          // The body and legs keep their street pose while the upper head turns.
          vec3 pivot=u_min+u_extent*vec3(.5,.61,.5);
          float weight=smoothstep(.55,.78,a_position.y);
          vec2 angle=weight*u_residentLook;
          vec2 s=sin(angle), c=cos(angle);
          mat2 tilt=mat2(c.y,-s.y,s.y,c.y);
          mat2 swivel=mat2(c.x,-s.x,s.x,c.x);
          local-=pivot;
          local.yz=tilt*local.yz;
          local.xz=swivel*local.xz;
          local+=pivot;
          normal.yz=tilt*normal.yz;
          normal.xz=swivel*normal.xz;
        }
        vec3 p=modelPosition(local);
        vec3 fromEye=p-u_eye;
        float z=dot(fromEye,u_forward);
        gl_Position=vec4(dot(fromEye,u_right)*u_lens.x,dot(fromEye,u_up)*u_lens.y,
                         z*${depthScale}-${depthOffset},z);
        v_position=p;
        v_normal=turn(bank(normal));
        v_color=a_color;
        v_uv=a_uv;
        v_material=a_material;
      }
    `, `#version 300 es
      precision highp float;
      in vec3 v_position, v_normal, v_local, v_restNormal;
      in float v_access;
      in vec4 v_color;
      in vec2 v_uv;
      flat in float v_material;
      uniform bool u_character;
      uniform int u_heroFinish;
      uniform vec4 u_houseHues;
      uniform vec4 u_pose;
      uniform int u_textureMode;
      uniform sampler2D u_modelColor, u_surfaceFinish;
      out vec4 outColor;
      ${lightProjection}
      ${water}
      ${volumeSampling}
      ${sunlight}
      ${reefMaterial}

      vec3 toLinear(vec3 color) {
        return mix(color/12.92,pow((color+.055)/1.055,vec3(2.4)),step(vec3(.04045),color));
      }
      vec3 toSrgb(vec3 color) {
        return mix(color*12.92,1.055*pow(color,vec3(1.0/2.4))-.055,step(vec3(.0031308),color));
      }

      // The profiles live in authored model coordinates so they stay aligned
      // with the exported panes when a house is rotated or resized.
      float lampPool(vec2 point, vec2 center, vec2 radius) {
        vec2 offset=(point-center)/radius;
        return exp2(-dot(offset,offset));
      }

      vec4 interiorLamp() {
        bool pane=v_material==2.;
        if (!pane && (u_heroFinish!=5 || v_material!=0.)) return vec4(0.);
        vec3 p=v_local/u_pose.z;
        if (u_heroFinish==1 && v_color.a<.24) {
          // Three pineapple portholes, lit at different levels on each floor.
          vec2 center=p.z<0.?vec2(-1.04,6.54):p.y>4.?vec2(-1.72,6.70):vec2(2.30,2.15);
          float pool=lampPool(p.xy,center,vec2(.64,.73));
          vec3 ember=vec3(1.,.23,.041)*.72;
          vec3 core=vec3(.70,.65,.24)*pow(pool,1.45);
          return vec4((ember+core)*(p.y>4.?1.:.86),.55+.20*pool);
        }
        if (u_heroFinish==2) {
          // The eyebrow shades the top of the paired front windows.
          vec2 center=p.z<0.?vec2(-.12,4.67):vec2(2.19,8.81);
          vec2 point=vec2(p.z<0.?p.x:abs(p.x),p.y);
          float pool=lampPool(point,center,vec2(.67,.76));
          float warmRoom=p.z<0.||p.x<0.? .78:1.;
          vec3 ember=vec3(1.,.25,.047)*.73;
          vec3 core=vec3(.61,.71,.26)*pow(pool,1.34);
          return vec4((ember+core)*warmRoom,.58+.16*pool);
        }
        if (u_heroFinish==5 && p.z>4.46) {
          // The opaque convex covers sit just in front of the recessed panes.
          // Restrict both layers to the two door portholes and leave the bolts,
          // lettering, bucket rim and glove out of the lighting mask.
          vec2 point=vec2(abs(p.x),p.y);
          float edge=1.-smoothstep(.19,.228,length(point-vec2(.81,2.754)));
          float pool=lampPool(point,vec2(.78,2.80),vec2(.172,.149));
          float strength=p.x<0.? .89:1.;
          vec3 ember=vec3(.97,.25,.037)*.76;
          vec3 core=vec3(.54,.60,.21)*pool;
          return vec4((ember+core)*strength*edge,0.);
        }
        return vec4(0.);
      }

      float portholeBounce(vec3 p) {
        float radius;
        if (u_heroFinish==1 && v_material==1. && p.z>2.65 && p.z<3.68) {
          vec2 center=p.y>4.?vec2(-1.75,6.76):vec2(2.33,2.12);
          radius=length((p.xy-center)*vec2(1.,.84));
          return smoothstep(.38,.54,radius)*(1.-smoothstep(.65,.82,radius));
        }
        if (u_heroFinish==2 && v_material==7. && p.z>3.18 && p.z<3.62) {
          radius=length(vec2(abs(p.x),p.y)-vec2(2.073,8.91));
          return smoothstep(.58,.71,radius)*(1.-smoothstep(.79,.94,radius));
        }
        if (u_heroFinish==5 && v_material==1. && p.z>4.48 && p.z<4.78) {
          radius=length(vec2(abs(p.x),p.y)-vec2(.81,2.754));
          return smoothstep(.23,.28,radius)*(1.-smoothstep(.31,.35,radius));
        }
        return 0.;
      }

      float pendantLight(vec3 p,vec3 n,vec3 light) {
        vec3 ray=light-p;
        float d2=dot(ray,ray);
        vec3 toLamp=ray*inversesqrt(max(.001,d2));
        float cone=smoothstep(.51,.83,toLamp.y);
        return max(0.,dot(n,toLamp))*cone/(1.+d2*.17);
      }

      float diningRoomBounce(vec3 p,vec3 direction) {
        // The room stops at the service partition. Its gray facing and the
        // brown ceiling liner share materials with exterior parts.
        vec3 pigment=v_color.rgb*255.;
        bool diningFixtures=abs(p.x)<7.21 && p.z<5.34 && p.y>=.216 && p.y<3.77
          && (p.z> -1.62 || (p.z> -1.75 && p.y<.27))
          && (v_material==0. || v_material==3.);
        float serviceWall=0.;
        if (v_material==0. && p.z> -1.955 && p.z< -1.755) {
          // Vertex colors vary across this wall's gray plaster and bevels.
          float gray=smoothstep(108.,145.,pigment.r)*(1.-smoothstep(37.,53.,pigment.b-pigment.r));
          serviceWall=gray*smoothstep(.18,.88,v_restNormal.z);
        }
        // The thin barrel roof is visible from below through the seams in the
        // liner. Both meshes have outward-facing normals.
        bool roofBoard=(v_material==3. && length(pigment-vec3(101.,85.,63.))<1.)
          || (v_material==13. && abs(p.x)<7.145);
        bool ceilingLiner=roofBoard && p.y>4.08 && dot(v_normal,direction)>.06;
        if (!diningFixtures && serviceWall<=0. && !ceilingLiner) return 0.;

        float dining=lampPool(p.xz,vec2(-2.4,2.1),vec2(5.8,4.7));
        float counter=lampPool(p.xz,vec2(.1,-.8),vec2(3.1,2.6));
        float fill=.49+.31*dining+.20*counter;
        if (ceilingLiner) return fill*.96;
        if (!diningFixtures) return fill*serviceWall;

        // Reflected light lifts the top of the floorboards without lighting
        // their edges or carrying onto the wood sill outside the dining room.
        float floorBounce=v_material==0. && p.y<.242 ? smoothstep(.52,.96,v_restNormal.y) : 0.;
        return fill*(1.+.64*floorBounce);
      }
      // Sample an asymmetric part of the reef atlas. A large, flat cut through
      // the rock would otherwise reveal the mirrored seams of the boulder tiles.
      vec3 reefFacet(vec2 cell,vec2 offset,vec2 dx,vec2 dy) {
        float seed=hash21(cell);
        float angle=6.28318*seed;
        mat2 rotate=mat2(cos(angle),sin(angle),-sin(angle),cos(angle));
        vec2 center=vec2(.25)+.042*(fract(seed*vec2(37.3,79.1))-.5);
        vec2 tile=vec2(noise(cell*.24)>.47?0.:2.,0.);
        vec2 atlasSize=vec2(3.,2.);
        vec2 uv=(tile+center+.146*(rotate*offset))/atlasSize;
        return textureGrad(u_materialArt,uv,.146*(rotate*dx)/atlasSize,.146*(rotate*dy)/atlasSize).rgb;
      }
      vec3 cutReefPlane(vec2 p,vec2 dx,vec2 dy) {
        vec2 cell=floor(p),f=fract(p);
        vec2 middle=f.x>f.y?vec2(1,0):vec2(0,1);
        vec3 weights=vec3(1.-max(f.x,f.y),abs(f.x-f.y),min(f.x,f.y));
        weights=weights*weights*(3.-2.*weights);
        weights/=dot(weights,vec3(1.));
        return weights.x*reefFacet(cell,f,dx,dy)
              +weights.y*reefFacet(cell+middle,f-middle,dx,dy)
              +weights.z*reefFacet(cell+1.,f-1.,dx,dy);
      }
      vec3 carvedReefPigment(vec3 p,vec3 n) {
        p=p*2.95+vec3(9.3,12.7,4.2);
        vec3 dx=dFdx(p),dy=dFdy(p);
        vec3 weights=n*n;
        weights=max(weights*weights-.012,vec3(0.));
        weights/=dot(weights,vec3(1.));
        vec3 color=vec3(0.);
        if (weights.x>0.) color+=weights.x*cutReefPlane(p.zy,dx.zy,dy.zy);
        if (weights.y>0.) color+=weights.y*cutReefPlane(p.xz,dx.xz,dy.xz);
        if (weights.z>0.) color+=weights.z*cutReefPlane(p.xy,dx.xy,dy.xy);
        return color;
      }
      // Rotate hue in OKLab. Give coloured paint a small chroma allowance
      // under the water reflections; neutral trim and carved reef stone keep theirs.
      vec3 dyeHousePigment(vec3 pigment,float degrees,float chromaGain) {
        if (degrees==0.) return pigment;
        vec3 lms=pow(max(vec3(0.),vec3(dot(pigment,vec3(.412221,.536333,.051446)),
                    dot(pigment,vec3(.211903,.680700,.107397)),
                    dot(pigment,vec3(.088302,.281719,.629979)))),vec3(1./3.));
        float L=dot(lms,vec3(.210454,.793618,-.004072));
        vec2 ab=vec2(dot(lms,vec3(1.977998,-2.428592,.450594)),
                     dot(lms,vec3(.025904,.782772,-.808676)));
        float angle=radians(degrees), cs=cos(angle), sn=sin(angle);
        ab=mat2(cs,sn,-sn,cs)*ab*(1.+chromaGain*smoothstep(.02,.075,length(ab)));
        lms=L+vec3(dot(ab,vec2(.396338,.215804)),dot(ab,vec2(-.105561,-.063854)),
                   dot(ab,vec2(-.089484,-1.291486)));
        lms=lms*lms*lms;
        vec3 dyed=vec3(dot(lms,vec3(4.076742,-3.307712,.230970)),
                       dot(lms,vec3(-1.268438,2.609757,-.341319)),
                       dot(lms,vec3(-.004196,-.703419,1.707615)));
        const vec3 luma=vec3(.2126,.7152,.0722);
        float y=dot(pigment,luma);
        dyed*=y/max(.00001,dot(dyed,luma));
        float low=min(dyed.r,min(dyed.g,dyed.b));
        return low<0. ? mix(vec3(y),dyed,y/max(.00001,y-low)) : dyed;
      }
      // Work in linear light. The gains retain the source's pores, mineral
      // inclusions, painted lettering and UV detail through the lighting pass.
      float glazePigment(inout vec3 pigment,float finish) {
        vec3 gain=vec3(1.);
        float coat=0.;
        if (u_heroFinish==1 && v_material==0. && u_textureMode==2 && v_uv.y<.90) {
          // The fruit UV island ends at .874; the other parts all use the white swatch at .955.
          // Its collapsed top row is blank white; carry amber rind up to the crown.
          float crownCap=smoothstep(.855,.868,v_uv.y)*smoothstep(.79,.86,v_restNormal.y)
                        *smoothstep(.85,.98,min(pigment.r,min(pigment.g,pigment.b)));
          pigment=mix(pigment,vec3(.83,.40,.070),crownCap*.97);
          gain=vec3(1.46,1.16,.68);
          coat=.48;
        } else if (u_heroFinish==1 && v_material==5.) {
          gain=vec3(.70,1.40,.79);
          coat=.43;
        } else if (u_heroFinish==2 && v_material==4.) {
          coat=.23;
        } else if (u_heroFinish==3 && v_material==4.) {
          gain=vec3(2.23,1.09,.86);
          coat=.78;
        } else if (u_heroFinish==4 && (v_material==3. || v_material>=12.)) {
          gain=vec3(1.66,1.18,.72);
          coat=.62;
        } else if (u_heroFinish==5 && v_material==1.) {
          // The painted red letters and the blue glove share other parts of the palette.
          float teal=smoothstep(.025,.10,pigment.g-pigment.r)*
                     (1.-smoothstep(.06,.17,abs(pigment.b-pigment.g)));
          gain=mix(vec3(1.),vec3(.65,1.40,1.43),teal);
          coat=.38+.39*teal;
        } else if (u_heroFinish>=6) {
          float y=dot(pigment,vec3(.2126,.7152,.0722));
          pigment=max(vec3(0.),mix(vec3(y),pigment,1.+.14*finish));
          gain=vec3(1.09);
          if (u_heroFinish==7 && v_material==0.) {
            float skin=smoothstep(.07,.18,min(pigment.g,pigment.b)-pigment.r);
            gain=mix(gain,vec3(.88,1.20,.99),skin);
          }
          coat=v_material==8.?.53:v_material==6.?.09:.28;
        } else if (u_heroFinish>0) {
          coat=v_material==1.?.45:.12;
        }
        pigment*=mix(vec3(1.),gain,finish);
        return coat*finish;
      }
      vec3 surfaceGrain(vec3 p, bool wood, bool lengthwiseY, bool staves) {
        vec3 w=v_restNormal*v_restNormal;
        w*=w;
        w/=max(.001,w.x+w.y+w.z);
        vec2 yz=p.zy, xz=p.zx, xy=p.xy;
        if (lengthwiseY) { yz=yz.yx; xy=xy.yx; }
        if (staves) xz=p.xz;
        vec2 frequency=wood||lengthwiseY?vec2(.57,.80):vec2(1.);
        yz=yz*frequency+.23; xz=xz*frequency+.47; xy*=frequency;
        // Filter the narrow fibers before grazing-angle minification. Planar panels
        // and flat flags generally only need one projection.
        vec2 dx0=dFdx(yz)*1.3, dy0=dFdy(yz)*1.3;
        vec2 dx1=dFdx(xz)*1.3, dy1=dFdy(xz)*1.3;
        vec2 dx2=dFdx(xy)*1.3, dy2=dFdy(xy)*1.3;
        if (w.z>.993) return textureGrad(u_surfaceFinish,xy,dx2,dy2).rgb;
        if (w.y>.993) return textureGrad(u_surfaceFinish,xz,dx1,dy1).rgb;
        if (w.x>.993) return textureGrad(u_surfaceFinish,yz,dx0,dy0).rgb;
        return w.x*textureGrad(u_surfaceFinish,yz,dx0,dy0).rgb
              +w.y*textureGrad(u_surfaceFinish,xz,dx1,dy1).rgb
              +w.z*textureGrad(u_surfaceFinish,xy,dx2,dy2).rgb;
      }

      vec3 bumpNormal(vec3 n,float relief) {
        vec3 dx=dFdx(v_position), dy=dFdy(v_position);
        vec3 tx=cross(dy,n), ty=cross(n,dx);
        float area=dot(dx,tx);
        vec3 gradient=(tx*dFdx(relief)+ty*dFdy(relief))*sign(area)/max(abs(area),1e-9);
        return normalize(n-gradient*inversesqrt(1.+dot(gradient,gradient)*4.));
      }

      void main() {
        if (v_color.a<.025) discard;
        vec3 fromEye=v_position-u_eye;
        float distanceToObject=length(fromEye);
        vec3 direction=fromEye/max(.001,distanceToObject);
        float normalLength=dot(v_normal,v_normal);
        vec3 n=normalLength>.001?v_normal*inversesqrt(normalLength):vec3(0,1,0);
        bool glass=(v_material>=1.5 && v_material<2.5) || v_color.a<.98;
        // Mirrored parts retain the original lighting direction in their vertex normals.
        if (glass && dot(n,direction)>0.) n=-n;
        float shade=sunlight(v_position,n);
        bool metal=v_material==1., upright=v_material==12., staves=v_material==13.;
        bool wood=v_material==3.||upright||staves, stone=v_material==4.;
        bool fruit=v_material==5., cloth=v_material==6., ink=v_material==7.;
        bool shell=v_material==8., sponge=v_material==9., reed=v_material==10., signPaint=v_material==11.;
        vec3 base=toLinear(v_color.rgb);
        if (u_textureMode>0) {
          vec3 texel=texture(u_modelColor,v_uv).rgb;
          base=u_textureMode==2 ? base*texel : texel;
        }
        // Painted eyes and teeth keep their source pigment. For the single-atlas
        // character the near-white eyes and near-black pupils need the same treatment.
        float high=max(max(base.r,base.g),base.b), low=min(min(base.r,base.g),base.b);
        float protectedPigment=u_character?max(1.-smoothstep(.012,.067,high),
                          smoothstep(.45,.78,low)*(1.-smoothstep(.04,.20,high-low))):0.;
        float finish=glass||ink?0.:1.-protectedPigment;
        float glaze=u_heroFinish>0?glazePigment(base,finish):0.;
        bool carvedReef=u_heroFinish==2 && stone;
        vec3 grain;
        if (carvedReef) {
          // The monolith, its carved features and the stepping stones use the
          // reef's world-scale mineral pattern. Keep the original stone as a binder.
          vec3 mineral=carvedReefPigment(v_position,n);
          vec3 cutStone=mix(v_color.rgb*vec3(.80,.91,1.08),mineral,.76);
          base=mix(base,toLinear(cutStone),u_materialReady);
          float footprint=length(fwidth(v_position));
          float grit=rockNoise(v_position*19.7,n)-.5;
          grain=vec3(grit*(1.-smoothstep(.028,.098,footprint)));
        } else {
          grain=surfaceGrain(v_local*(u_character?2.7:stone?.87:1.),wood,reed||upright,staves)-.5;
        }
        bool portholeRim=u_heroFinish==2 && ink && base.b>max(.06,1.3*base.r);
        if (portholeRim) glaze=.48;
        if (!u_character && !glass && (!ink || portholeRim)) {
          float hue=staves||reed||fruit ? u_houseHues.y
                  : wood||metal||portholeRim ? u_houseHues.z
                  : cloth||signPaint ? u_houseHues.w : u_houseHues.x;
          if (u_heroFinish==5) hue=mix(hue,4.,smoothstep(.03,.15,base.r-max(base.g,base.b)));
          base=dyeHousePigment(base,hue,carvedReef?0.:.055);
        }
        vec2 patchCoord=v_local.xz+v_local.y*vec2(.37,.61);
        float patina=noise(patchCoord*(u_character?4.3:.94))-.5;
        float grainHeight=wood||reed?grain.g:stone||fruit||sponge?grain.r:grain.b;
        float relief=carvedReef?.011:stone?.026:wood?.008:reed?.009:fruit?.005:sponge?.0019:cloth||signPaint?.0007:u_character?.0014:.007;
        vec3 outerNormal=n;
        n=bumpNormal(n,grainHeight*relief*finish);
        float characterGrain=sponge?.24:shell?.24:cloth?.19:.12;
        float amplitude=u_character?characterGrain:signPaint?.11:cloth?.15:carvedReef?.45:stone?1.39:wood?1.13:reed?.84:fruit?.33:.68;
        base*=1.+finish*(amplitude*grainHeight+patina*(u_character?.065:.27));
        float skirt=(1.-smoothstep(.04,.80,v_local.y+patina*.37));
        if (!u_character && !cloth && !signPaint && finish>.0) {
          // Sea-worn lower courses pick up a little of the surrounding sand and reef.
          float mineral=smoothstep(.01,.38,grain.r+.44*patina);
          float weather=clamp(skirt*(.10+.24*mineral)+mineral*(stone?.27:metal?.14:.065),0.,.50);
          vec3 deposit=mix(vec3(.053,.111,.102),vec3(.21,.27,.23),mineral);
          base=mix(base,deposit,carvedReef?weather*.23:weather);
          if (wood) base=mix(base,vec3(.13,.17,.15),.24*smoothstep(.025,.24,grain.g+patina*.28));
        }
        float luminance=sqrt(clamp(dot(base,vec3(.2126,.7152,.0722)),.0001,1.));
        float facingSun=dot(n,keyLight);
        float hemi=clamp(.5+.5*n.y,0.,1.);
        float bounce=max(0.,dot(n,normalize(vec3(.61,-.18,.76))));
        vec3 ambient=mix(vec3(.21,.25,.22),vec3(.32,.48,.57),hemi);
        ambient+=vec3(.23,.22,.155)*bounce;
        ambient+=vec3(.045,.075,.081)*max(0.,-facingSun);
        if (u_character) ambient+=vec3(.169,.151,.110);
        if (signPaint) ambient+=vec3(.26,.225,.18);
        if (cloth && !u_character) ambient+=vec3(.12,.11,.083);
        float access=clamp(v_access,0.,1.);
        ambient*=mix(vec3(.40,.53,.59),vec3(1.),access);
        vec3 direct=vec3(.98,.98,.88)*max(0.,facingSun)*mix(.14,1.,shade)*(u_character?.88:1.12);
        vec3 color=base*(ambient+direct);
        // A small amount of diffuse upwelling keeps the body colour legible
        // inside the same sunlit bay as the enamel houses.
        color+=base*glaze*(.09+.17*hemi)*(.34+.66*access);
        float shallow=exp(-max(0.,waterY-illuminationHeight(v_position.y))*.0067);
        vec2 caustic=currentLight(v_position);
        float crest=caustic.x+.32*caustic.y;
        float waterLight=shallow*(.39+.61*shade)*(.42+.58*max(0.,facingSun))*(.44+.56*access);
        vec3 focused=base*.78+vec3(.075,.118,.14)*(.30+.70*luminance);
        color+=focused*crest*waterLight*(u_character?.42:.99)*mix(.40,1.,finish);

        vec3 halfAngle=normalize(keyLight-direction);
        float facing=clamp(dot(n,-direction),0.,1.);
        float edge=1.-facing;
        float rim=edge*edge*edge;
        float rough=clamp(.5+grainHeight*finish+.25*patina,0.,1.);
        float power=glass?79.:metal?mix(70.,26.,rough):shell?39.:stone||cloth?12.:23.;
        float shine=pow(max(0.,dot(n,halfAngle)),power)*(.22+.78*shade);
        vec3 specularTint=metal?mix(vec3(.38,.56,.60),base,.32):vec3(.47,.60,.66);
        float response=glass?.41:metal?.38:shell?.19:stone||cloth||reed?.033:.082;
        // The extra wet sheen follows the reflection angle. Cloth and thatch
        // reflect very little, and only some mineral grains catch the surface.
        float wetSheen=u_character?0.:metal||portholeRim?.24:glass?.17:cloth||reed?.025:stone?.14:.16;
        float mineralFlecks=stone?.38+.62*smoothstep(-.20,.18,grain.r):1.;
        response+=.18*wetSheen*mineralFlecks;
        color+=specularTint*(shine*response+rim*response*.23)*(.25+.75*sqrt(luminance));
        if (glaze+wetSheen>.001) {
          // The broad reflection follows the wave-lit surface even when the
          // camera has risen beyond the range of the close-up reflections.
          vec3 coatNormal=normalize(mix(outerNormal,n,.27));
          vec3 ray=reflect(direction,coatNormal);
          float sky=smoothstep(-.24,.87,ray.y);
          float aperture=pow(max(0.,dot(ray,normalize(vec3(-.27,.91,-.31)))),7.);
          float fresnel=pow(1.-clamp(dot(coatNormal,-direction),0.,1.),2.);
          float softness=.89+.11*rough;
          vec3 seaReflection=mix(vec3(.018,.065,.091),vec3(.41,.71,.82),sky);
          if (metal) {
            // The curved bucket rim sees bright surface water above a darker horizon.
            color*=1.+glaze*(sky-.5)*.17;
            seaReflection=mix(seaReflection,vec3(.74,.82,.84),sky*sky*.36);
          }
          color+=glaze*softness*(.44+.56*access)*(
             seaReflection*(.044+.15*fresnel)
            +vec3(.60,.84,.88)*aperture*(.14+.12*shade));
          if (!u_character) {
            // A long opening in the wave-lit surface is reflected as a moving
            // band across curved roofs and rims as the viewer changes position.
            vec3 opening=normalize(vec3(-.32,.88,.35));
            vec3 along=normalize(vec3(.74,.02,.63));
            vec3 across=normalize(cross(opening,along));
            vec2 offset=vec2(dot(ray,along),dot(ray,across));
            float spread=metal||portholeRim?1.30:wood?.87:.69;
            float band=exp2(-dot(offset*offset,vec2(11.,83.)*spread))
                       *smoothstep(.58,.90,dot(ray,opening));
            float flecks=carvedReef?(.38+.62*smoothstep(-.20,.18,grain.r)):1.;
            float strength=metal||portholeRim?.29:wood?.16:stone?.16:.21;
            vec3 highlight=mix(vec3(.68,.91,1.),base,.16);
            color+=highlight*band*strength*(glaze*flecks+wetSheen*mineralFlecks)
                  *(.28+.72*shade)*(.48+.52*access);
          }
        }
        float nearReflection=1.-smoothstep(10.,33.,distanceToObject);
        if (nearReflection>.001) {
          vec3 waterSide=reflect(direction,n);
          float sky=smoothstep(-.25,.89,waterSide.y);
          float glint=pow(max(dot(waterSide,normalize(vec3(.25,.76,.60))),0.),metal||glass?14.:5.);
          float responseSky=glass?.30:metal?.24:shell?.115:ink?.034:stone||wood||cloth?.024:.063;
          vec3 reflected=mix(vec3(.026,.11,.15),vec3(.50,.73,.82),sky);
          color+=reflected*(.14+.61*rim+.26*glint)*responseSky*nearReflection*mix(.38,1.,access);
          color+=vec3(.35,.53,.55)*glint*responseSky*nearReflection;
        }
        if (glass) {
          vec3 reflected=reflect(direction,n);
          float reflectedSky=smoothstep(-.40,.80,reflected.y);
          color+=rim*mix(vec3(.007,.029,.037),vec3(.044,.077,.081),reflectedSky);
        }
        // A pearly sign face and recessed glazing catch a little interior light.
        if (!u_character && u_heroFinish>0 && (signPaint || glass)) {
          float pearl=signPaint?smoothstep(.34,.73,low):.36;
          color+=vec3(.053,.039,.016)*pearl*(.5+.5*access);
        }

        vec4 lamp=vec4(0.);
        float luminousCore=0.;
        float distantGlass=0.;
        vec3 transmittedGlow=vec3(.115,.052,.008);
        if (u_heroFinish==1 || u_heroFinish==2 || u_heroFinish==5) {
          lamp=interiorLamp();
          if (u_heroFinish!=5 && lamp.a>0.) {
            distantGlass=smoothstep(15.,54.,distanceToObject);
            lamp.rgb+=vec3(.26,.12,.026)*distantGlass;
            lamp.a+=.09*distantGlass;
          }
          luminousCore=min(1.,lamp.r);
          color*=mix(vec3(1.),vec3(.90,.64,.36),luminousCore);
          color+=lamp.rgb*mix(.68,1.,facing);
          color+=vec3(.15,.059,.019)*portholeBounce(v_local/u_pose.z)*(.46+.54*facing);
        }
        if (u_heroFinish==4) {
          vec3 p=v_local/u_pose.z;
          bool outerGlass=v_material==2. && v_color.a<.30 && (p.z>5.40 || abs(p.x)>7.30);
          if (v_material==${pendantDiffuser}.) {
            float core=pow(max(0.,-v_restNormal.y),.7);
            color=color*.45+1.18*mix(vec3(1.14,.36,.057),vec3(1.32,.86,.27),core);
            luminousCore=1.;
          } else if (outerGlass) {
            // Keep a readable glow through distant water, with clear glass
            // and restrained warm reflections at street level.
            float depthGlow=smoothstep(12.,55.,distanceToObject);
            float middle=lampPool(p.xy,vec2(0.,2.22),vec2(7.,1.38));
            float spill=mix(.64,1.,middle)*mix(.72,1.,facing);
            distantGlass=depthGlow*spill;
            transmittedGlow=vec3(.26,.135,.018);
            lamp.a=.48*depthGlow;
            color+=vec3(1.,.56,.16)*spill*(.20+.70*depthGlow);
          } else if (!glass) {
            if (abs(p.x)<7.08 && p.z>-.82 && p.z<5.46 && p.y<4.08) {
              vec3 localNormal=normalize(v_restNormal);
              float pool=0.;
              ${krustyPendants.map(({x,y,z}) =>
                `pool+=pendantLight(p,localNormal,vec3(${x},${y-.13},${z}));`).join('\n              ')}
              color+=base*vec3(1.18,.66,.25)*min(1.,pool*2.01);
            }
            float fill=diningRoomBounce(p,direction);
            float headroom=1.-.55*smoothstep(.35,.88,max(max(color.r,color.g),color.b));
            color+=base*vec3(.19,.145,.097)*(fill*headroom);
          }
        }
        vec3 lit=min(toSrgb(max(vec3(0),color)),vec3(1.0));
        // The town's glazed enamel travels through a shorter artistic fog range.
        // Blend toward that finish on the landmarks while preserving distant haze.
        float opticalDistance=distanceToObject*(1.-(u_character?.06:.24)*glaze-.19*luminousCore);
        vec3 rendered=waterFog(lit,direction,opticalDistance);
        if (distanceToObject>115.) {
          rendered=mix(rendered,distantWaterColor(direction),smoothstep(115.,282.,distanceToObject));
        }
        rendered+=volumeToDepth(distanceToObject);
        rendered+=transmittedGlow*distantGlass*(1.-smoothstep(105.,168.,distanceToObject));
        float alpha=v_color.a;
        if (alpha<.98) alpha=clamp(alpha+(.08+.34*alpha)*rim+shine*.085,0.,.98);
        alpha=max(alpha,lamp.a*mix(.73,1.,facing));
        outColor=vec4(rendered,alpha);
      }
    `);
    const shadowPass = createProgram(gl, `#version 300 es
      precision highp float;
      ${transform}
      ${lightProjection}
      void main() { gl_Position=vec4(lightClip(modelPosition(u_min+a_position*u_extent)),1); }
    `, shadowFragment);
    const contactPass = createProgram(gl, `#version 300 es
      precision highp float;
      layout(location=0) in vec3 a_position;
      layout(location=1) in vec2 a_disc;
      layout(location=2) in float a_strength;
      uniform vec3 u_eye, u_right, u_up, u_forward;
      uniform vec2 u_lens;
      out vec2 v_disc;
      out float v_strength;
      void main() {
        vec3 fromEye=a_position-u_eye;
        float z=dot(fromEye,u_forward);
        gl_Position=vec4(dot(fromEye,u_right)*u_lens.x,dot(fromEye,u_up)*u_lens.y,
                         z*${depthScale}-${depthOffset},z);
        v_disc=a_disc;
        v_strength=a_strength*(1.-smoothstep(11.,46.,z));
      }
    `, `#version 300 es
      precision mediump float;
      in vec2 v_disc;
      in float v_strength;
      out vec4 outColor;
      void main() {
        float mask=1.-smoothstep(.06,1.,dot(v_disc,v_disc));
        outColor=vec4(.044,.096,.103,mask*mask*v_strength);
      }
    `);
    const contactVao = gl.createVertexArray();
    const contactBuffer = gl.createBuffer();
    gl.bindVertexArray(contactVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, contactBuffer);
    let contactOffset = 0;
    for (const [slot, components] of [3, 2, 1].entries()) {
      gl.enableVertexAttribArray(slot);
      gl.vertexAttribPointer(slot, components, gl.FLOAT, false, 24, contactOffset);
      contactOffset += components * Float32Array.BYTES_PER_ELEMENT;
    }
    const contactElements = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, contactElements);
    gl.bindVertexArray(null);
    const contactSide = 4;
    const contactWidth = contactSide + 1;
    const contactVertices = contactWidth ** 2;
    const contactIndices = contactSide ** 2 * 6;
    let contactCapacity = 0;
    let contactData;

    const cache = new Map();
    const proxies = [];
    const anisotropy = gl.getExtension('EXT_texture_filter_anisotropic');
    createTexture(gl);
    const surfaceFinish = loadTexture(gl, window.bikiniSurfaceFinish, anisotropy, true);
    gl.useProgram(pass.program);
    gl.uniform1i(pass.uniforms.u_surfaceFinish,8);
    function describe(id) {
      const source = assets[id];
      if (!source) return null;
      if (!cache.has(id)) {
        const {min, extent} = source;
        const half = extent.map(length => length * .5);
        const center = min.map((value, axis) => value + half[axis]);
        cache.set(id, {
          source, min, extent, center, radius: Math.hypot(...half), heroFinish:heroFinishes[id]??0,
          houseHues:houseHues[id],
          authoredHeight: extent[1],
          preserveTopology: principalCharacters.has(id),
          smallResidentLOD: ordinaryResidents.has(id),
          legacyHead: ordinaryResidents.has(id) || ['c06','c08','c10','c11','c12'].includes(id),
          glides: id === 'c07' || id === 'c13',
          texture: source.t && source.tex ? loadTexture(gl, source.tex, anisotropy) : null,
          textureMode: source.texMultiply ? 2 : 1
        });
      }
      return cache.get(id);
    }

    function initialize(model, placement) {
      if (model.geometry) return;
      const mesh = decodeMesh(model.source);
      if (placement) {
        fitHouseFooting(mesh, placement, placement.height / model.authoredHeight, seabedFloor);
        model.min = mesh.min;
        model.extent = mesh.extent;
        const half = mesh.extent.map(length => length * .5);
        model.center = mesh.min.map((value,axis) => value + half[axis]);
        model.radius = Math.hypot(...half);
      }
      model.geometry = uploadMesh(gl, mesh, model);
      if (model.heroFinish===4) model.pendants = uploadMesh(gl, makeKrustyPendants(mesh));
      model.pivots = mesh.pivots;
      if (model.source.skin) model.skinTrack = readSkinTrack(model.source.skin);
      return mesh;
    }

    function place(placement, model, floor, house = false, standing = null) {
      const yaw = standing?.yaw ?? placement.yaw ?? 0;
      const sin = Math.sin(yaw), cos = Math.cos(yaw);
      const scale = placement.height / Math.max(.001, model.authoredHeight);
      const skinned = !house && Boolean(model.source.skin);
      const legacyRig = !house && !skinned && model.source.j;
      const roll = house || skinned ? 0 : Math.tan(clamp(placement.lean ?? 0, -.12, .12));
      const footOffset = skinned ? -.005 : (placement.bob ?? 0) - .012;
      const y = (placement.baseY ?? floor(placement.x, placement.z)) + (house ? -.052 : footOffset);
      const routePace = placement.pace ?? 0;
      const pace = skinned ? clamp(routePace/.89,0,1) : legacyRig ? clamp(routePace,0,1) : 0;
      const stride = legacyRig ? pace * Math.sin(placement.step ?? 0) : 0;
      const leftArm = legacyRig ? placement.leftArm ?? 0 : 0;
      const rightArm = legacyRig ? placement.rightArm ?? 0 : 0;
      const {x, z} = placement;
      const [cx, cy, cz] = model.center;
      const bank = 1 / Math.hypot(1, roll);
      const localX = (cx - roll * cy) * bank;
      const centerX = x + (localX * cos + cz * sin) * scale;
      const centerY = y + (cy + roll * cx) * bank * scale;
      const centerZ = z + (cz * cos - localX * sin) * scale;
      const motion = standing ? .22
        : Math.max(pace * (skinned ? .24 : .12), Math.max(Math.abs(leftArm), Math.abs(rightArm)) * .3);
      const radius = (model.radius + model.extent[1] * motion) * scale;
      const smallResidentLOD = model.smallResidentLOD && (placement.instanceId ?? placement.id) !== placement.id;
      return {model, x, y, z, sin, cos, scale, roll, centerX, centerY, centerZ, radius, house,
        stride, leftArm, rightArm, smallResidentLOD, pace, walkTime:placement.walkTime ?? 0, standing,
        elevated:placement.baseY !== undefined};
    }

    const attention = new Map();
    function trackVisitor(placement,model,camera,time,floor,canSee,lensX,lensY) {
      const {x,z,height,heading,instanceId,stagedLook,stagedWave} = placement;
      const dx = camera.x-x, dz = camera.z-z;
      const distance = Math.hypot(dx,dz);
      const standingOn = placement.baseY ?? floor(x,z);
      const eyeLevel = stagedLook ? .80 : model.source.skin?.headPivot?.[1] ?? .76;
      const eyes = standingOn+height*eyeLevel+.045;
      const dy = camera.y-eyes;
      let state = attention.get(instanceId);
      if (!state) {
        if (distance > 8.6 || Math.abs(dy) > 4.5) return null;
        state = {bodyTurn:0,lookYaw:0,lookPitch:0,waveStart:Infinity,waveTime:-Infinity,
          welcomed:false,finalWave:false,lookUntil:-Infinity,time:time-1/60};
        attention.set(instanceId,state);
      }
      const dt = clamp(time-state.time,0,.12);
      state.time = time;
      if (distance>4.75 || Math.abs(dy)>3.35) state.welcomed = false;

      const playerBearing = Math.atan2(dx,dz);
      const sy = Math.sin(camera.yaw), cy = Math.cos(camera.yaw);
      const sp = Math.sin(camera.pitch), cp = Math.cos(camera.pitch);
      const forward = -dx*sy+dz*cy;
      const depth = forward*cp-dy*sp;
      const horizontal = Math.abs(dx*cy+dz*sy)*lensX;
      const vertical = Math.abs(dy*cp+forward*sp)*lensY;
      const watching = depth > 0 && horizontal < .40*depth && vertical < .43*depth;
      const approached = distance < 3.25 && Math.abs(dy)<2.35;
      const addressed = watching && distance < (stagedLook ? 8.6 : 6.8) && Math.abs(dy)<3.25;
      const visible = (approached || addressed) && canSee(camera,{x,y:eyes,z});
      if (visible) state.lookUntil = time+.38;
      const looking = (visible || time<state.lookUntil) && distance<8.6 && Math.abs(dy)<3.9;

      const body = placement.yaw ?? heading ?? 0;
      const bearing = wrapAngle(playerBearing-body);
      if (stagedWave && !state.finalWave && visible && depth > 0 &&
          horizontal < .26*depth && vertical < .29*depth) {
        state.finalWave = true;
        state.waveStart = time+.17;
      } else if (placement.greet && !stagedLook && !state.welcomed && placement.canGreet !== false &&
          distance < 3.65 && Math.abs(dy)<2.65 && Math.abs(wrapAngle(playerBearing-heading)) < 2.05 &&
          depth > 0 && horizontal < depth && vertical < depth &&
          (visible || canSee(camera,{x,y:eyes,z}))) {
        state.welcomed = true;
        // Let the turn begin before lifting the hand.
        state.waveStart = time+.23+Math.min(.34,Math.abs(bearing-state.bodyTurn)*.17);
        state.lookUntil = Math.max(state.lookUntil,time+.48);
      }

      const following = looking || time<state.lookUntil;
      const moving = model.glides || (placement.pace ?? 0)>.13;
      const limit = moving ? (model.legacyHead || model.source.skin ? .44 : .80) : Math.PI;
      const target = following && !placement.lockBodyYaw ? clamp(bearing,-limit,limit) : 0;
      const angle = wrapAngle(target-state.bodyTurn);
      const step = Math.min(2.35*dt,Math.abs(angle)*(1-Math.exp(-4.8*dt)));
      state.bodyTurn = wrapAngle(state.bodyTurn+Math.sign(angle)*step);
      state.yaw = body+state.bodyTurn;
      const gazeBlend = 1-Math.exp(-8*dt);
      const yaw = following ? clamp(wrapAngle(playerBearing-state.yaw),-.52,.52) : 0;
      const pitch = following ? clamp(Math.atan2(dy,Math.max(.1,distance)),-.38,.52) : 0;
      state.lookYaw += (yaw-state.lookYaw)*gazeBlend;
      state.lookPitch += (pitch-state.lookPitch)*gazeBlend;
      state.waveTime = time-state.waveStart;
      return state;
    }

    const houses = [];
    const footingMeshes = [];
    const houseMeshes = new Map();
    // Pigments can decode during world construction, before their first encounter.
    for (const [id, source] of Object.entries(assets)) {
      if (source.t && source.tex) describe(id);
    }
    for (const placement of layout.houses) {
      const model = describe(placement.id);
      if (!model) continue;
      if (!houseMeshes.has(model)) houseMeshes.set(model, initialize(model, placement));
      const mesh = houseMeshes.get(model);
      const house = place(placement, model, seabedFloor, true);
      houseProxy(mesh, house, proxies);
      footingMeshes.push({mesh,house});
      houses.push(house);
    }
    houseMeshes.clear();

    function forEachFootingTriangle(visit) {
      for (const {mesh,house} of footingMeshes) visitFootingTriangles(mesh, house, seabedFloor, visit);
    }

    function useModel(instance, uniforms) {
      const {model, x, y, z, sin, cos, scale, roll, stride, leftArm, rightArm} = instance;
      gl.uniform3fv(uniforms.u_min, model.min);
      gl.uniform3fv(uniforms.u_extent, model.extent);
      gl.uniform3f(uniforms.u_origin, x, y, z);
      gl.uniform4f(uniforms.u_pose, sin, cos, scale, roll);
      if (uniforms.u_character) {
        gl.uniform1i(uniforms.u_character, Number(!instance.house));
        gl.uniform1i(uniforms.u_heroFinish,model.heroFinish);
        if (model.houseHues) gl.uniform4fv(uniforms.u_houseHues,model.houseHues);
        const track = model.skinTrack;
        gl.uniform1i(uniforms.u_skinned, Number(Boolean(track)));
        if (track) {
          gl.uniformMatrix4x3fv(uniforms['u_skin[0]'],false,characterPalette(track,instance));
        } else {
          // The older resident meshes drive left/right legs and arms independently.
          gl.uniform4f(uniforms.u_jointAngles, stride * .35, -stride * .35,
            -stride * .21 + leftArm, stride * .21 + rightArm);
          if (stride || leftArm || rightArm) gl.uniform3fv(uniforms['u_pivots[0]'], model.pivots);
        }
        const gaze = instance.standing;
        gl.uniform2f(uniforms.u_residentLook, model.legacyHead ? (gaze?.lookYaw ?? 0)*.75 : 0,
          model.legacyHead ? (gaze?.lookPitch ?? 0)*.46 : 0);
        gl.uniform1i(uniforms.u_textureMode, model.texture?.ready ? model.textureMode : 0);
        gl.uniform1i(uniforms.u_modelColor, 7);
        if (model.texture?.ready) {
          gl.activeTexture(gl.TEXTURE7);
          gl.bindTexture(gl.TEXTURE_2D, model.texture.texture);
          gl.activeTexture(gl.TEXTURE0);
        }
      }
      gl.bindVertexArray(model.geometry.vao);
    }

    const visible = [], transparent = [];
    function drawOpaque(camera, lensX, lensY, time, floor, useCamera, viewportHeight, canSee = () => true) {
      const sy = Math.sin(camera.yaw), cy = Math.cos(camera.yaw);
      const sp = Math.sin(camera.pitch), cp = Math.cos(camera.pitch);
      const {x, y, z} = camera;
      const horizontalReach = Math.hypot(lensX, 1);
      const verticalReach = Math.hypot(lensY, 1);
      visible.length = 0;
      transparent.length = 0;
      function collect(instance) {
        const dx = instance.centerX - x, dy = instance.centerY - y, dz = instance.centerZ - z;
        const distance = Math.hypot(dx, dy, dz);
        const radius = instance.radius;
        if (distance - radius > (instance.house ? 282 : 115)) return;
        const rear = dx * sy - dz * cy;
        const depth = rear * cp + dy * sp;
        if (depth + radius < nearClip) return;
        if (Math.abs(dx * cy + dz * sy) * lensX > depth + radius * horizontalReach) return;
        if (Math.abs(dy * cp - rear * sp) * lensY > depth + radius * verticalReach) return;
        initialize(instance.model);
        const item = {instance, dx, dy, dz, depth};
        visible.push(item);
        if (instance.model.geometry.transparency) transparent.push(item);
      }
      for (const house of houses) collect(house);
      for (const placement of layout.characters?.(time, floor) ?? []) {
        const distance = Math.hypot(placement.x-x,placement.z-z);
        if (distance>122) {
          attention.delete(placement.instanceId);
          continue;
        }
        const model = describe(placement.id);
        if (model) {
          const standing = trackVisitor(placement,model,camera,time,floor,canSee,lensX,lensY);
          collect(place(placement,model,floor,false,standing));
        }
      }
      if (!visible.length) return;
      useCamera(pass, camera, time, lensX, lensY);
      visible.sort((a, b) => a.depth - b.depth);
      for (const {instance, depth} of visible) {
        const {geometry} = instance.model;
        if (!geometry.opaqueCount) continue;
        useModel(instance, pass.uniforms);
        // A fixed rest-pose size keeps a distant resident's gait from switching this LOD.
        const restRadius = instance.model.radius * instance.scale;
        const lodRadius = instance.model.skinTrack ? restRadius : instance.radius;
        const projected = lodRadius * lensY * viewportHeight / Math.max(nearClip, depth - lodRadius * .5);
        const small = instance.smallResidentLOD && depth > 32 &&
          restRadius * lensY * viewportHeight < 28 * (depth - restRadius * .5);
        const smallLOD = small ? geometry.lods[2] : null;
        const lod = projected < (instance.house ? 112 : 57) ? smallLOD ?? geometry.lods[1] ?? geometry.lods[0]
          : projected < (instance.house ? 252 : 151) ? geometry.lods[0] : null;
        gl.drawElements(gl.TRIANGLES, lod?.count ?? geometry.opaqueCount, geometry.type, lod?.offset ?? 0);
        const {pendants} = instance.model;
        if (pendants) {
          gl.bindVertexArray(pendants.vao);
          gl.drawElements(gl.TRIANGLES, pendants.opaqueCount, pendants.type, 0);
        }
      }
    }

    function drawTransparent(camera, lensX, lensY, time, useCamera) {
      if (!transparent.length) return;
      useCamera(pass, camera, time, lensX, lensY);
      transparent.sort((a, b) => b.depth - a.depth);
      for (const {instance, dx, dy, dz} of transparent) {
        const {geometry} = instance.model;
        const localX = instance.cos * dx - instance.sin * dz;
        const localZ = instance.sin * dx + instance.cos * dz;
        useModel(instance, pass.uniforms);
        sortTransparency(gl, geometry, localX + instance.roll * dy, dy - instance.roll * localX, localZ);
        gl.drawElements(gl.TRIANGLES, geometry.transparency.source.length, geometry.type, geometry.offset);
      }
    }

    function drawContacts(camera, lensX, lensY, time, floor, useCamera) {
      if (!visible.length) return;
      let count = 0;
      for (const {instance, depth} of visible) {
        if (!instance.house && !instance.elevated && depth < 46) count++;
      }
      if (!count) return;
      gl.bindVertexArray(contactVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, contactBuffer);
      if (count > contactCapacity) {
        contactCapacity = Math.max(count, contactCapacity * 2);
        contactData = new Float32Array(contactCapacity * contactVertices * 6);
        const indices = new Uint16Array(contactCapacity * contactIndices);
        let i = 0;
        for (let disc = 0; disc < contactCapacity; disc++) {
          for (let row = 0; row < contactSide; row++) for (let col = 0; col < contactSide; col++) {
            const a = disc * contactVertices + row * contactWidth + col;
            const b = a + 1, c = a + contactWidth, d = c + 1;
            indices.set([a, c, b, b, c, d], i);
            i += 6;
          }
        }
        gl.bufferData(gl.ARRAY_BUFFER, contactData.byteLength, gl.DYNAMIC_DRAW);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
      }
      let cursor = 0;
      for (const {instance, depth} of visible) {
        if (instance.house || instance.elevated || depth >= 46) continue;
        const {x, y, z, model, scale, sin, cos} = instance;
        const gap = Math.max(0, y - floor(x, z));
        const width = clamp(model.extent[0] * scale * .44, .18, .61) + gap * .25;
        const length = clamp(model.extent[2] * scale * .55, .18, .58) + gap * .20;
        const strength = .53 / (1 + gap * 2.6);
        for (let row = 0; row <= contactSide; row++) {
          for (let col = 0; col <= contactSide; col++) {
            const u = 2 * col / contactSide - 1, v = 2 * row / contactSide - 1;
            const px = x + cos * u * width + sin * v * length + .035;
            const pz = z + cos * v * length - sin * u * width + .041;
            contactData[cursor++] = px;
            contactData[cursor++] = floor(px, pz) + .012;
            contactData[cursor++] = pz;
            contactData[cursor++] = u;
            contactData[cursor++] = v;
            contactData[cursor++] = strength;
          }
        }
      }
      useCamera(contactPass, camera, time, lensX, lensY);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, contactData, 0, cursor);
      gl.drawElements(gl.TRIANGLES, count * contactIndices, gl.UNSIGNED_SHORT, 0);
    }

    function drawShadows() {
      gl.useProgram(shadowPass.program);
      for (const house of houses) {
        const {geometry} = house.model;
        if (!geometry.opaqueCount) continue;
        useModel(house, shadowPass.uniforms);
        gl.drawElements(gl.TRIANGLES, geometry.opaqueCount, geometry.type, 0);
      }
      gl.deleteProgram(shadowPass.program);
    }

    const artworkReady = Promise.all([
      surfaceFinish.settled, ...Array.from(cache.values(), model => model.texture?.settled ?? true),
    ]).then(status => status.every(Boolean));
    return {proxies, artworkReady, forEachFootingTriangle, releaseFootingMeshes() { footingMeshes.length = 0; },
      drawOpaque, drawContacts, drawTransparent, drawShadows};
  };
})();
