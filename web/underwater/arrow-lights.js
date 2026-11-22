(() => {
  'use strict';

  const cord = [.085,.128,.119];
  const bronze = [.29,.215,.124];
  const socket = [.13,.19,.17];
  const bulb = [[1.15,.65,.235],[1.2,.78,.355],[1.25,.85,.44]];
  const litGlass = 27;
  const enamel = 22;
  const metal = 24;
  const fullTurn = 2*Math.PI;

  const cross = (a,b) => [
    a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]
  ];
  const unit = vector => {
    const length = Math.hypot(...vector);
    return vector.map(value=>value/length);
  };

  window.buildArrowLights = function buildArrowLights(mesh, house, model, floor) {
    const scale = house.height/model.extent[1];
    const sin = Math.sin(house.yaw), cos = Math.cos(house.yaw);
    const grade = floor(house.x,house.z)-.052;
    const turn = ([x,y,z]) => [x*cos+z*sin,y,z*cos-x*sin];
    const origin = [house.x,grade,house.z];
    const place = point => turn(point).map((value,axis)=>origin[axis]+scale*value);

    function rings(surface, sides, color, material) {
      let previous;
      for (const row of surface) {
        const ring = Array.from({length:sides}, (_,index)=>{
          const {point, normal, strength} = row(fullTurn*index/sides);
          return [place(point),turn(normal),strength];
        });
        if (previous) {
          for (let side=0; side<sides; side++) {
            const next = (side+1)%sides;
            for (const [point,normal,strength] of [
              previous[side],previous[next],ring[side],ring[side],previous[next],ring[next]
            ]) mesh.vertex(point,normal,color,material,strength);
          }
        }
        previous = ring;
      }
    }

    function wire(path, segments, radius, reference, color, material) {
      rings(Array.from({length:segments+1}, (_,index)=>{
        const t = index/segments, point = path(t);
        const after = path(t+.001), before = path(t-.001);
        const axis = unit(after.map((value,i)=>value-before[i]));
        const first = unit(cross(reference,axis));
        const second = cross(axis,first);
        return angle=>{
          const normal = first.map((value,i)=>value*Math.cos(angle)+second[i]*Math.sin(angle));
          return {point:point.map((value,i)=>value+radius*normal[i]),normal,strength:0};
        };
      }),7,color,material);
    }

    function pendant([x,y,z], profile, color, material) {
      rings(profile.map(([drop,radius,strength=0],index)=>{
        const before = profile[Math.max(0,index-1)];
        const after = profile[Math.min(profile.length-1,index+1)];
        const slope = unit([after[0]-before[0],after[1]-before[1]]);
        return angle=>({
          point:[x+radius*Math.cos(angle),y-drop,z+radius*Math.sin(angle)],
          normal:[slope[0]*Math.cos(angle),slope[1],slope[0]*Math.sin(angle)],
          strength
        });
      }),12,color,material);
    }

    // Exported h03 has a shaft at y=6.57 and bent steel loops at x=±.90.
    // The front ends of the loops turn back toward the shaft near z=.45.
    for (const x of [-.90,.90]) {
      wire(t=>[x,6.566+.093*Math.cos(fullTurn*t),.448+.051*Math.sin(fullTurn*t)],
        22,.016,[1,0,0],bronze,metal);
    }
    const strand = t=>[-.90+1.8*t,6.473-.227*4*t*(1-t),.448+.024*Math.sin(Math.PI*t)];
    wire(strand,27,.013,[0,0,1],cord,enamel);

    const cap = [[.006,0],[.006,.032],[.024,.043],[.077,.044],[.092,.052],
      [.110,.052],[.119,.043],[.119,0]];
    const glass = [[.111,.034,.21],[.131,.055,.46],[.163,.071,.79],[.207,.074,.88],
      [.246,.061,.68],[.276,.040,.39],[.290,0,.24]];
    const tints = [1,0,2,1,0,2,1];
    const lights = [];
    for (const [index,t] of [.085,.224,.360,.503,.644,.785,.918].entries()) {
      const point = strand(t);
      pendant(point,cap,socket,enamel);
      pendant(point,[[.079,.041],[.084,.050],[.093,.054],[.103,.053],[.112,.047]],bronze,metal);
      pendant(point,glass,bulb[tints[index]],litGlass);
      lights.push(place([point[0],point[1]-.200,point[2]]));
    }
    return lights;
  };

  window.createArrowGlow = function createArrowGlow(gl, lights, render) {
    const {createProgram,createGeometry,depthScale,depthOffset,nearClip} = render;
    const corners = [[-1,-1],[1,-1],[-1,1],[-1,1],[1,-1],[1,1]];
    const vertices = new Float32Array(lights.flatMap(point=>corners.flatMap(corner=>[...point,...corner])));
    const geometry = createGeometry(gl,vertices,[3,2]);
    const pass = createProgram(gl,`#version 300 es
      precision highp float;
      layout(location=0) in vec3 a_center;
      layout(location=1) in vec2 a_corner;
      uniform vec3 u_eye,u_forward,u_right,u_up;
      uniform vec2 u_lens;
      uniform float u_viewHeight;
      out vec2 v_corner;
      out float v_depth;
      void main() {
        vec3 relative=a_center-u_eye;
        float z=dot(relative,u_forward);
        v_corner=a_corner;
        v_depth=z;
        if(z<=${nearClip}) {
          gl_Position=vec4(2.,2.,2.,1.);
          return;
        }
        float radius=max(.106,7.*z/(u_viewHeight*u_lens.y));
        vec2 plane=vec2(dot(relative,u_right),dot(relative,u_up));
        // Keep the halo at the bulb's depth so nearby geometry can occlude it.
        gl_Position=vec4((plane+a_corner*radius)*u_lens,z*${depthScale}-${depthOffset},z);
      }`,`#version 300 es
      precision highp float;
      in vec2 v_corner;
      in float v_depth;
      out vec4 outColor;
      void main() {
        float r2=dot(v_corner,v_corner);
        float falloff=max(0.,exp(-4.2*r2)-exp(-4.2))*(1.-smoothstep(.72,1.,r2));
        float visibility=exp(-.011*v_depth)*(1.-smoothstep(51.,92.,v_depth));
        outColor=vec4(1.,.55,.16,.34*falloff*visibility);
      }`);
    return (useCamera,camera,time,focalX,focalY,height)=>{
      useCamera(pass,camera,time,focalX,focalY);
      gl.uniform1f(pass.uniforms.u_viewHeight,height);
      gl.bindVertexArray(geometry.vao);
      gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
      gl.drawArrays(gl.TRIANGLES,0,geometry.count);
      gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    };
  };
})();
