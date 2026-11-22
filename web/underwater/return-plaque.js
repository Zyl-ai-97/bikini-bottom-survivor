(() => {
  'use strict';

  const boardWidth = 2.24;
  const boardHeight = .75;
  const boardDepth = .135;
  const bevel = .03;
  const plaqueScale = 2.95;
  const arrivalDelay = .64;
  const fallDuration = 3.25;
  const lipDuration = .78;
  const seabedDuration = 2.15;
  const lipClearance = 3.25;
  const groundReach = 19.75;
  const sandOffset = 5;
  const reach = 12;
  const openingShell = window.diveOpeningShell;
  const atlasURL = new URL('assets/return-plaque.webp', document.currentScript.src).href;

  function boardMesh() {
    const left = -boardWidth / 2, right = boardWidth / 2;
    const bottom = -boardHeight / 2, top = boardHeight / 2;
    const outline = [[left + .02, bottom + .12]];

    function curve(controls, end, steps) {
      const start = outline.at(-1);
      for (let step = 1; step <= steps; step++) {
        const t = step / steps, s = 1 - t;
        outline.push(start.map((value, axis) => controls.length === 1
          ? s * s * value + 2 * s * t * controls[0][axis] + t * t * end[axis]
          : s ** 3 * value + 3 * s * s * t * controls[0][axis]
            + 3 * s * t * t * controls[1][axis] + t ** 3 * end[axis]));
      }
    }

    curve([[left - .01, bottom + .018]], [left + .13, bottom + .012], 5);
    curve([[-.6, bottom - .022], [.49, bottom + .015]], [right - .1, bottom], 7);
    curve([[right + .006, bottom + .012]], [right, bottom + .135], 5);
    outline.push([right - .025, top - .14]);
    curve([[right - .03, top - .005]], [right - .14, top], 5);
    curve([[.63, top + .009], [-.38, top - .017]], [left + .17, top - .004], 7);
    curve([[left + .03, top - .014]], [left + .026, top - .14], 5);

    const vertices = [];
    const add = (p, normal, uv, material) => vertices.push(...p, ...normal, ...uv, material);

    function triangle(a, b, c, uv, material) {
      const ab = b.map((value, axis) => value - a[axis]);
      const ac = c.map((value, axis) => value - a[axis]);
      const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      const len = Math.hypot(...n);
      const normal = n.map(value => value / len);
      for (const point of [a, b, c]) add(point, normal, uv(point), material);
    }

    const faceUV = ([x, y]) => [.5 + x / boardWidth, .5 - y / boardHeight];
    const edgeUV = ([x, y, z]) => [.5 + x / (boardWidth + .1), .5 + z * 3 + y * .28];
    const solidUV = () => [0, 0];
    const half = boardDepth / 2;
    const rings = [[-half - bevel, 0], [-half, bevel], [half, bevel], [half + bevel, 0]]
      .map(([z, spread]) => outline.map(([x, y]) => [x * (1 + 2 * spread / boardWidth), y * (1 + 2 * spread / boardHeight), z]));
    const lowerBevel = rings[1];
    const rightOfCenter = lowerBevel.findIndex(([x]) => x >= 0);
    const before = lowerBevel[rightOfCenter - 1], after = lowerBevel[rightOfCenter];
    const across = -before[0] / (after[0] - before[0]);
    const baseContact = [0, before[1] + (after[1] - before[1]) * across, before[2]];
    for (let i = 0; i < outline.length; i++) {
      const j = (i + 1) % outline.length;
      triangle([0, 0, -half - bevel], rings[0][j], rings[0][i], faceUV, 0);
      triangle([0, 0, half + bevel], rings[3][i], rings[3][j], faceUV, 0);
      for (let ring = 0; ring < 3; ring++) {
        const back = rings[ring], front = rings[ring + 1];
        triangle(back[i], back[j], front[j], edgeUV, 1);
        triangle(back[i], front[j], front[i], edgeUV, 1);
      }
    }

    for (const side of [-1, 1]) {
      const tack = (angle, radius, z) => [side * .94 + radius * Math.cos(angle), -.025 + radius * Math.sin(angle), z];
      const eye = (angle, turn) => {
        const rim = .034 + .011 * Math.cos(turn);
        return [side * .88 + rim * Math.cos(angle), top + .018 + rim * Math.sin(angle), .027 + .011 * Math.sin(turn)];
      };
      for (let step = 0; step < 12; step++) {
        const a = step * Math.PI / 6, b = a + Math.PI / 6;
        triangle(tack(a, 0, half + .053), tack(a, .052, half + .026), tack(b, .052, half + .026), solidUV, 2);
        for (let ring = 0; ring < 6; ring++) {
          const u = ring * Math.PI / 3, v = u + Math.PI / 3;
          triangle(eye(a, u), eye(b, u), eye(b, v), solidUV, 3);
          triangle(eye(a, u), eye(b, v), eye(a, v), solidUV, 3);
        }
      }
    }
    return { vertices: new Float32Array(vertices), baseContact };
  }

  function orientation(matrix, yaw, pitch, roll) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cr = Math.cos(roll), sr = Math.sin(roll);
    matrix.set([
      cy * cr + sy * sp * sr, cp * sr, cy * sp * sr - sy * cr,
      sy * sp * cr - cy * sr, cp * cr, cy * sp * cr + sy * sr,
      sy * cp, -sp, cy * cp,
    ]);
  }

  function progressAt(age, start, duration) {
    return Math.max(0, Math.min(1, (age - start) / duration));
  }

  function smooth(progress) {
    return progress * progress * (3 - 2 * progress);
  }

  function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }

  function hitTriangle(origin, ray, a, ab, ac) {
    const crossed = cross(ray, ac);
    const det = dot(ab, crossed);
    if (Math.abs(det) < 1e-8) return Infinity;
    const fromVertex = origin.map((value, axis) => value - a[axis]);
    const u = dot(fromVertex, crossed) / det;
    if (u < 0 || u > 1) return Infinity;
    const normal = cross(fromVertex, ab);
    const v = dot(ray, normal) / det;
    return v < 0 || u + v > 1 ? Infinity : dot(ac, normal) / det;
  }

  window.createReturnPlaque = function createReturnPlaque(gl, { createProgram, createGeometry, depthScale, depthOffset, water, volumeSampling }) {
    const { vertices, baseContact } = boardMesh();
    const shape = createGeometry(gl, vertices, [3, 3, 2, 1]);
    const positions = Array.from({ length: vertices.length / 27 }, (_, triangle) => {
      const i = triangle * 27;
      const a = [vertices[i], vertices[i + 1], vertices[i + 2]];
      return [a, a.map((value, axis) => vertices[i + 9 + axis] - value),
        a.map((value, axis) => vertices[i + 18 + axis] - value)];
    });

    const pass = createProgram(gl, `#version 300 es
      precision highp float;
      layout(location=0) in vec3 a_position;
      layout(location=1) in vec3 a_normal;
      layout(location=2) in vec2 a_uv;
      layout(location=3) in float a_material;
      uniform vec3 u_eye, u_right, u_up, u_forward, u_center;
      uniform mat3 u_turn;
      uniform vec2 u_lens;
      out vec3 v_position, v_normal;
      out vec2 v_uv;
      flat out float v_material;
      void main() {
        v_position = u_center + u_turn * a_position * ${plaqueScale};
        v_normal = u_turn * a_normal;
        v_uv = a_uv;
        v_material = a_material;
        vec3 rel = v_position - u_eye;
        float depth = dot(rel, u_forward);
        gl_Position = vec4(dot(rel,u_right)*u_lens.x,dot(rel,u_up)*u_lens.y,
          depth * ${depthScale} - ${depthOffset},depth);
      }
    `, `#version 300 es
      precision highp float;
      uniform sampler2D u_atlas;
      in vec3 v_position, v_normal;
      in vec2 v_uv;
      flat in float v_material;
      out vec4 outColor;
      ${water}
      ${volumeSampling}
      void main() {
        vec3 relative = v_position-u_eye;
        float range = length(relative);
        vec3 ray = relative / max(range,.001);
        vec3 n = normalize(v_normal);
        vec3 light = normalize(vec3(-.40,.73,.55));
        float diffuse = .82 + .28*max(dot(n,light),0.0);
        vec2 coords = .002 + clamp(v_uv,0.0,1.0)*.996;
        vec3 pigment = texture(u_atlas,vec2(coords.x,(coords.y+min(v_material,1.0))*.5)).rgb;
        if (v_material == 1.0) pigment *= vec3(.76,.60,.43);
        if (v_material == 2.0) pigment = vec3(.59,.46,.26);
        if (v_material == 3.0) pigment = vec3(.27,.32,.29);
        if (v_material >= 2.0) diffuse += .25*pow(max(dot(reflect(ray,n),light),0.0),12.0);
        float ripple = .5 + .5*sin(v_position.x*2.2 + v_position.y*2.0 + .55*sin(v_position.z*1.5-u_time));
        vec3 base = pigment*diffuse + .032*ripple*vec3(.43,.81,1.0);
        vec3 color = waterFog(base,ray,.79*range) + volumeToDepth(range);
        outColor = vec4(color,1.0);
      }
    `);

    const atlas = gl.createTexture();
    // The main framebuffer and bloom passes own units 9 and 10.
    const atlasUnit = 11;
    gl.activeTexture(gl.TEXTURE0 + atlasUnit);
    gl.bindTexture(gl.TEXTURE_2D, atlas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([23, 73, 136, 255, 161, 113, 68, 255]));
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.activeTexture(gl.TEXTURE0);
    const art = new Image();
    let settleArt;
    const artworkReady = new Promise(resolve => { settleArt = resolve; });
    art.onload = () => {
      if (gl.isContextLost() || !gl.isTexture(atlas)) {
        settleArt(false);
        return;
      }
      const previousUnit = gl.getParameter(gl.ACTIVE_TEXTURE);
      try {
        gl.activeTexture(gl.TEXTURE0 + atlasUnit);
        gl.bindTexture(gl.TEXTURE_2D, atlas);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, art);
        gl.generateMipmap(gl.TEXTURE_2D);
        settleArt(true);
      } catch (error) {
        console.warn(error);
        settleArt(false);
      } finally {
        gl.activeTexture(previousUnit);
      }
    };
    art.onerror = () => settleArt(false);
    art.src = atlasURL;

    const center = new Float32Array(3);
    const turn = new Float32Array(9);
    const localTurn = new Float32Array(9);
    let started = null;
    let visible = false;
    let clickable = false;
    let reducedMotion = false;

    function start(time, reduce) {
      started = time;
      reducedMotion = reduce;
      visible = clickable = false;
    }

    function hide() {
      started = null;
      visible = clickable = false;
    }

    function draw(useCamera, camera, time, focalX, focalY, floorAt) {
      if (started === null) return;
      const age = reducedMotion ? Infinity : time - started - arrivalDelay;
      if (age < 0) return;

      const approach = progressAt(age, 0, fallDuration);
      const edge = progressAt(age, fallDuration, lipDuration);
      const descent = progressAt(age, fallDuration + lipDuration, seabedDuration);
      const release = smooth(edge), settle = smooth(descent);
      const contactTime = started + arrivalDelay + fallDuration;
      const shellTime = reducedMotion ? contactTime : Math.min(time, contactTime);
      const { roll, position: crown } = openingShell.crownAt(shellTime);
      const x = crown[0] + sandOffset * settle;
      const z = crown[2] + lipClearance * release + (groundReach - lipClearance) * settle;
      const fallFromEdge = .42;
      const shellHeight = crown[1] + 41 * (1 - approach) ** 1.35 - fallFromEdge * edge ** 3;
      const groundX = crown[0] + sandOffset;
      const groundZ = crown[2] + groundReach;
      const sand = floorAt(groundX, groundZ) - .21;
      const position = [x, shellHeight + (sand - shellHeight) * settle, z];

      const groundSlope = Math.atan2(floorAt(groundX + 2, groundZ - .45) - floorAt(groundX - 2, groundZ + .45), 4);
      const approachTilt = Math.sin(Math.PI * approach);
      const edgeTilt = Math.sin(Math.PI * edge);
      const currentTilt = Math.sin(Math.PI * descent);
      orientation(localTurn, .22 + .095 * approachTilt - .11 * currentTilt,
        -.21 + .10 * approachTilt + .34 * edgeTilt + .11 * currentTilt - .04 * settle,
        .065 * currentTilt + groundSlope * settle);
      const shellRoll = roll * (1 - release);
      const sin = Math.sin(shellRoll), cos = Math.cos(shellRoll);
      for (let i = 0; i < 9; i += 3) {
        turn[i] = cos * localTurn[i] - sin * localTurn[i + 1];
        turn[i + 1] = sin * localTurn[i] + cos * localTurn[i + 1];
        turn[i + 2] = localTurn[i + 2];
      }

      // The same lower-bevel point meets the shell and plants into the sand.
      for (let axis = 0; axis < 3; axis++) {
        center[axis] = position[axis] - plaqueScale * (
          turn[axis] * baseContact[0] + turn[axis + 3] * baseContact[1] + turn[axis + 6] * baseContact[2]);
      }
      visible = true;
      clickable = descent === 1;

      useCamera(pass, camera, time, focalX, focalY);
      gl.uniform3fv(pass.uniforms.u_center, center);
      gl.uniformMatrix3fv(pass.uniforms.u_turn, false, turn);
      gl.uniform1i(pass.uniforms.u_atlas, atlasUnit);
      gl.bindVertexArray(shape.vao);
      gl.drawArrays(gl.TRIANGLES, 0, shape.count);
    }

    function hit(camera, focalX, focalY, x, y, canSee) {
      if (!visible || !clickable || x < 0 || x > 1 || y < 0 || y > 1) return false;
      const offset = [camera.x - center[0], camera.y - center[1], camera.z - center[2]];
      if (dot(offset, offset) > (reach + 1.25 * plaqueScale) ** 2) return false;
      const sy = Math.sin(camera.yaw), cy = Math.cos(camera.yaw);
      const sp = Math.sin(camera.pitch), cp = Math.cos(camera.pitch);
      const sx = (2 * x - 1) / focalX, vy = (1 - 2 * y) / focalY;
      const direction = [sy * cp + cy * sx - sy * sp * vy, sp + cp * vy, -cy * cp + sy * sx + cy * sp * vy];
      const toLocal = ([a, b, c]) => [0, 3, 6].map(i => (turn[i] * a + turn[i + 1] * b + turn[i + 2] * c) / plaqueScale);
      const origin = toLocal(offset), ray = toLocal(direction);

      // Reject rays missing the whole plaque before testing its bevel and tacks.
      const along = -dot(origin, ray) / dot(ray, ray);
      const nearest = origin.map((value, axis) => value + ray[axis] * along);
      if (along < 0 || dot(nearest, nearest) > 1.25 ** 2) return false;

      let contact = Infinity;
      for (const triangle of positions) {
        const distance = hitTriangle(origin, ray, ...triangle);
        if (distance > .056 && distance < contact) contact = distance;
      }
      return contact * Math.hypot(...direction) <= reach && canSee(camera, {
        x: camera.x + direction[0] * contact,
        y: camera.y + direction[1] * contact,
        z: camera.z + direction[2] * contact,
      });
    }

    return { start, hide, draw, hit, artworkReady };
  };
})();
