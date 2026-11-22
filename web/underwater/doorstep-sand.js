(() => {
  'use strict';

  // Inside the fence, the sand banks against the wall itself. Measurements
  // are in local metres at the placed size, including the offset doorways.
  // wall half-width/depth, corner radius, centre X, door X, front Z, walk width
  const footprints = {
    h01: [1.67,1.48,1.36,0,0,1.68,.53],
    h02: [1.59,1.27,.55,0,0,1.33,.70],
    h03: [2.27,1.87,1.85,0,.23,1.85,.43],
    h04: [3.83,3.10,.18,0,0,2.93,1.14],
    h05: [1.91,1.91,1.91,0,0,2.23,.86],
    h06: [1.24,1.13,.99,0,-.01,1.25,.43],
    h07: [.53,.52,.42,-.22,-.22,.53,.39],
    h08: [.72,.43,.35,0,0,.56,.37]
  };
  function smooth(value) {
    const t=Math.min(1,Math.max(0,value));
    return t*t*(3-2*t);
  }
  const subdivisions=6, side=subdivisions+1;

  window.buildDoorstepSand = (houses, lanes, axis, cellAt, road) => {
    const cells = new Map(), width=axis.length-1;
    for(const house of houses) {
      const spec=footprints[house.id];
      if(!spec) continue;
      const [w,d,corner,cx,door,front,pathWidth]=spec;
      // Patrick's rock opens upward, so the sandy verge continues under its lip.
      const gateScour=house.id==='h03' ? .34 : 1;
      const sin=Math.sin(house.yaw), cos=Math.cos(house.yaw);
      const world=(x,z)=>[house.x+x*cos+z*sin,house.z-x*sin+z*cos];
      const [gateX,gateZ]=world(door,front);
      // Starting the approach straight out from the threshold keeps existing
      // stepping stones and openings in picket fences on its centreline.
      const reach={h01:4.33,h02:4.09,h06:5.38,h07:3.21,h08:3.74}[house.id] ?? front+.60;
      const [tipX,tipZ]=world(door,reach);
      let endpoint, nearest=Infinity;
      for(const lane of lanes) for(const p of lane) {
        const distance=(p.x-tipX)**2+(p.z-tipZ)**2;
        if(distance<nearest) { nearest=distance; endpoint=p; }
      }
      if(!endpoint) continue;
      // A worn sand approach meets the existing pavement, even on lots where
      // the nearest street turns across the axis of the doorway.
      const segments=[[gateX,gateZ,tipX,tipZ],[tipX,tipZ,endpoint.x,endpoint.z]].map(([x,z,bx,bz])=>{
        const dx=bx-x,dz=bz-z;
        return {x,z,dx,dz,length2:Math.max(.00001,dx*dx+dz*dz)};
      });
      const corners=[world(-w+cx,-d),world(w+cx,-d),world(-w+cx,d),world(w+cx,d),
        [tipX,tipZ],[endpoint.x,endpoint.z]];
      const xs=corners.map(p=>p[0]), zs=corners.map(p=>p[1]);
      const back=cellAt(Math.min(...zs)-1.45), forward=cellAt(Math.max(...zs)+1.45);
      const left=cellAt(Math.min(...xs)-1.45), right=cellAt(Math.max(...xs)+1.45);
      for(let j=back;j<=forward;j++) for(let i=left;i<=right;i++) {
        const key=j*width+i;
        const stepX=(axis[i+1]-axis[i])/subdivisions;
        const stepZ=(axis[j+1]-axis[j])/subdivisions;
        // Include every corner of a fine triangle that can touch the diner floor.
        const floorPadX=Math.abs(cos)*stepX+Math.abs(sin)*stepZ;
        const floorPadZ=Math.abs(sin)*stepX+Math.abs(cos)*stepZ;
        let cell=cells.get(key);
        for(let row=0;row<side;row++) for(let col=0;col<side;col++) {
          const x=axis[i]+(axis[i+1]-axis[i])*col/subdivisions;
          const z=axis[j]+(axis[j+1]-axis[j])*row/subdivisions;
          const u=(x-house.x)*cos-(z-house.z)*sin;
          const v=(x-house.x)*sin+(z-house.z)*cos;
          const dx=Math.abs(u-cx)-w+corner,dz=Math.abs(v)-d+corner;
          const wall=Math.hypot(Math.max(0,dx),Math.max(0,dz))+Math.min(Math.max(dx,dz),0)-corner;
          let path=Infinity;
          for(const seg of segments) {
            const ax=x-seg.x,az=z-seg.z;
            const t=Math.min(1,Math.max(0,(ax*seg.dx+az*seg.dz)/seg.length2));
            path=Math.min(path,Math.hypot(ax-t*seg.dx,az-t*seg.dz));
          }
          const pocket=.50+.27*Math.sin(x*2.14+z*1.31)+.23*Math.cos(z*2.47-x*.73);
          const wear=1-smooth((path-pathWidth*.36)/(pathWidth*(.80+.26*pocket)));
          const edge=road.sample(x,z);
          // Accretion is patchy around the sides and scoured away where people
          // pass. Its outer edge reaches the original seabed with zero slope.
          let bank=(.035+.095*pocket)*(1-smooth(Math.max(0,wall)/(.31+.48*pocket)))
                    *(1-gateScour*wear)*smooth(edge/.23);
          if(house.id==='h04') {
            // The occupied floor is 6 cm above the unraised plot. At the
            // very back, leave the original sand bank against the rear lip.
            const outsideFloor=Math.max(Math.abs(u)-3.71-floorPadX,
              -v-2.58-floorPadZ,v-2.82-floorPadZ);
            bank-=Math.max(0,bank-.045)*(1-smooth(outsideFloor/.18));
            // Fill low pockets at the slab's rear edge so the wall sits
            // against a continuous sand seam.
            const rearSeam=(1-smooth((Math.abs(v+3.07)-floorPadZ)/.17))
              *(1-smooth((Math.abs(u)-3.71-floorPadX)/.17));
            bank=Math.max(bank,.064*rearSeam);
          }
          const worn=wear*smooth((edge+.045)/.19);
          if(bank<.00002 && worn<.001) continue;
          if(!cell) {
            cell={bank:new Float32Array(side*side), worn:new Float32Array(side*side)};
            cells.set(key,cell);
          }
          const at=row*side+col;
          cell.bank[at]=Math.max(cell.bank[at],bank);
          cell.worn[at]=Math.max(cell.worn[at],worn);
        }
      }
    }
    function rise(x,z) {
      const i=cellAt(x),j=cellAt(z),cell=cells.get(j*width+i);
      if(!cell) return 0;
      const u=Math.max(0,Math.min(subdivisions,(x-axis[i])/(axis[i+1]-axis[i])*subdivisions));
      const v=Math.max(0,Math.min(subdivisions,(z-axis[j])/(axis[j+1]-axis[j])*subdivisions));
      const col=Math.min(subdivisions-1,Math.floor(u)),row=Math.min(subdivisions-1,Math.floor(v));
      const a=row*side+col, s=u-col,t=v-row, h=cell.bank;
      return s+t<=1 ? h[a]+s*(h[a+1]-h[a])+t*(h[a+side]-h[a]) :
        h[a+side+1]+(1-s)*(h[a+side]-h[a+side+1])+(1-t)*(h[a+1]-h[a+side+1]);
    }
    return {cells,subdivisions,rise};
  };
})();
