(() => {
  'use strict';

  const spacing = .15;
  const rise = .045;
  const burial = .002;
  const bevel = .049;
  const material = 25;
  const color = [1,1,0];

  window.buildRaisedRoad = function buildRaisedRoad(mesh, seabedFloor, field) {
    const sample = (x,z) => field.sample(x,z);
    const left = Math.floor(field.minX / spacing), right = Math.ceil(field.maxX / spacing);
    const back = Math.floor(field.minZ / spacing), front = Math.ceil(field.maxZ / spacing);
    const width = right - left + 1;
    const intersections = new Map();
    const rows = Array.from({length:front-back+1},() => Array(width));
    function node(i,j) {
      const cached=rows[j][i];
      if(cached) return cached;
      const x = (left+i)*spacing, z = (back+j)*spacing;
      const point={x,z,d:sample(x,z),id:j*width+i};
      rows[j][i]=point;
      return point;
    }

    function crossing(a,b,level) {
      if(a.id>b.id) [a,b]=[b,a];
      const key=(a.id*rows.length*width+b.id)*2+Number(level===0);
      let point=intersections.get(key);
      if(!point) {
        const t=(level-a.d)/(b.d-a.d);
        point={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,d:level};
        intersections.set(key,point);
      }
      return point;
    }

    function write(point,onBevel) {
      let data=onBevel?point.bevel:point.deck;
      if(!data) {
        const {x,z,d}=point;
        const e=.018, inverse=.5/e;
        const fraction=Math.max(0,Math.min(1,(d+bevel)/bevel));
        const y=seabedFloor(x,z)+rise-(rise+burial)*fraction;
        let nx=(seabedFloor(x-e,z)-seabedFloor(x+e,z))*inverse;
        let nz=(seabedFloor(x,z-e)-seabedFloor(x,z+e))*inverse;
        if(onBevel) {
          const fall=(rise+burial)*inverse/bevel;
          nx+=(sample(x+e,z)-sample(x-e,z))*fall;
          nz+=(sample(x,z+e)-sample(x,z-e))*fall;
        }
        const length=Math.hypot(nx,1,nz);
        data=[[x,y,z],[nx/length,1/length,nz/length],fraction];
        if(onBevel) point.bevel=data;
        else point.deck=data;
      }
      mesh.vertex(data[0],data[1],color,material,data[2]);
    }

    function polygon(triangle, min, max, onBevel) {
      const points=[];
      for(let i=0;i<3;i++) {
        const a=triangle[i], b=triangle[(i+1)%3];
        if(a.d>=min&&a.d<=max) points.push(a);
        const lower=a.d<b.d?a:b, upper=a.d<b.d?b:a;
        const crossesMin=lower.d<min&&min<upper.d;
        const crossesMax=lower.d<max&&max<upper.d;
        if(a.d<b.d) {
          if(crossesMin) points.push(crossing(a,b,min));
          if(crossesMax) points.push(crossing(a,b,max));
        } else {
          if(crossesMax) points.push(crossing(a,b,max));
          if(crossesMin) points.push(crossing(a,b,min));
        }
      }
      for(let i=1;i<points.length-1;i++) {
        const a=points[0], b=points[i], c=points[i+1];
        const area=(b.z-a.z)*(c.x-a.x)-(b.x-a.x)*(c.z-a.z);
        if(area<=1e-13) continue;
        write(a,onBevel); write(b,onBevel); write(c,onBevel);
      }
    }

    function tile(a,b,c) {
      const minimum=Math.min(a.d,b.d,c.d), maximum=Math.max(a.d,b.d,c.d);
      if(minimum>=0) return;
      if(maximum<=-bevel) {
        write(a,false); write(b,false); write(c,false);
        return;
      }
      const triangle=[a,b,c];
      if(minimum<-bevel) polygon(triangle,-Infinity,-bevel,false);
      polygon(triangle,-bevel,0,true);
    }

    // Inside the town this spacing and diagonal align with the seabed's 1.5 m cells.
    // The contour owns both the deck boundary and the beveled edge at each branch.
    const block=6;
    for(let row=0;row<rows.length-1;row+=block) {
      const jEnd=Math.min(row+block,rows.length-1);
      for(let col=0;col<width-1;col+=block) {
        const iEnd=Math.min(col+block,width-1);
        const iMid=Math.floor((col+iEnd)/2), jMid=Math.floor((row+jEnd)/2);
        const farthest=spacing*Math.hypot(iEnd-iMid,jEnd-jMid);
        // A signed distance cannot reach the zero contour inside an empty block
        // if its center is farther from the road than the farthest corner.
        if(node(iMid,jMid).d>1.2*farthest+.025) continue;

        for(let j=row;j<jEnd;j++) {
          for(let i=col;i<iEnd;i++) {
            const a=node(i,j), b=node(i+1,j), c=node(i,j+1), d=node(i+1,j+1);
            tile(a,c,b);
            tile(b,c,d);
          }
        }
      }
    }
  };
})();
