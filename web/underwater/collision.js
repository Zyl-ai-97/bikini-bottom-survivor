(() => {
  'use strict';

  const radius = .31;
  const radiusSquared = radius * radius;
  const stepSize = .15;
  const cellSize = 2;
  const clearance = .0008;
  const staticMaterials = new Set([0,9,10,13,22,23,24]);
  const dot = (ax,ay,az,bx,by,bz) => ax*bx+ay*by+az*bz;
  const clampUnit = t => Math.max(0,Math.min(1,t));

  // Real-Time Collision Detection, point-to-triangle Voronoi regions.
  function closestPoint(face,p,out) {
    const {a,ab,ac,b,c}=face;
    const x=p.x-a.x,y=p.y-a.y,z=p.z-a.z;
    const d1=dot(ab.x,ab.y,ab.z,x,y,z);
    const d2=dot(ac.x,ac.y,ac.z,x,y,z);
    let v=0,w=0;
    if(d1>0 || d2>0){
      const bx=p.x-b.x,by=p.y-b.y,bz=p.z-b.z;
      const d3=dot(ab.x,ab.y,ab.z,bx,by,bz);
      const d4=dot(ac.x,ac.y,ac.z,bx,by,bz);
      if(d3>=0 && d4<=d3){
        v=1;
      }else{
        const vc=d1*d4-d3*d2;
        if(vc<=0 && d1>=0 && d3<=0){
          v=d1/(d1-d3);
        }else{
          const cx=p.x-c.x,cy=p.y-c.y,cz=p.z-c.z;
          const d5=dot(ab.x,ab.y,ab.z,cx,cy,cz);
          const d6=dot(ac.x,ac.y,ac.z,cx,cy,cz);
          if(d6>=0 && d5<=d6){
            w=1;
          }else{
            const vb=d5*d2-d1*d6;
            if(vb<=0 && d2>=0 && d6<=0){
              w=d2/(d2-d6);
            }else{
              const va=d3*d6-d5*d4;
              if(va<=0 && d4-d3>=0 && d5-d6>=0){
                w=(d4-d3)/((d4-d3)+(d5-d6));
                v=1-w;
              }else{
                const inv=1/(va+vb+vc);
                v=vb*inv;
                w=vc*inv;
              }
            }
          }
        }
      }
    }
    out.x=a.x+ab.x*v+ac.x*w;
    out.y=a.y+ab.y*v+ac.y*w;
    out.z=a.z+ab.z*v+ac.z*w;
    return dot(p.x-out.x,p.y-out.y,p.z-out.z,p.x-out.x,p.y-out.y,p.z-out.z);
  }

  function segmentEdgeDistanceSquared(a,b,c,d) {
    const ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z;
    const vx=d.x-c.x,vy=d.y-c.y,vz=d.z-c.z;
    const wx=a.x-c.x,wy=a.y-c.y,wz=a.z-c.z;
    const uu=dot(ux,uy,uz,ux,uy,uz),vv=dot(vx,vy,vz,vx,vy,vz);
    const uv=dot(ux,uy,uz,vx,vy,vz),uw=dot(ux,uy,uz,wx,wy,wz);
    const vw=dot(vx,vy,vz,wx,wy,wz);
    const det=uu*vv-uv*uv;
    let s=det>1e-12?clampUnit((uv*vw-uw*vv)/det):0;
    let t=(uv*s+vw)/vv;
    if(t<0){
      t=0;
      s=clampUnit(-uw/uu);
    }else if(t>1){
      t=1;
      s=clampUnit((uv-uw)/uu);
    }
    const x=wx+s*ux-t*vx,y=wy+s*uy-t*vy,z=wz+s*uz-t*vz;
    return dot(x,y,z,x,y,z);
  }

  function sweepHits(face,a,b,scratch) {
    if(closestPoint(face,a,scratch)<radiusSquared || closestPoint(face,b,scratch)<radiusSquared) return true;
    const {a:q,b:r,c:s,normal:n}=face;
    const sideA=dot(n.x,n.y,n.z,a.x-q.x,a.y-q.y,a.z-q.z);
    const sideB=dot(n.x,n.y,n.z,b.x-q.x,b.y-q.y,b.z-q.z);
    if(sideA*sideB<0){
      const t=sideA/(sideA-sideB);
      const crossing={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};
      if(closestPoint(face,crossing,scratch)<radiusSquared) return true;
    }
    return segmentEdgeDistanceSquared(a,b,q,r)<radiusSquared ||
      segmentEdgeDistanceSquared(a,b,r,s)<radiusSquared ||
      segmentEdgeDistanceSquared(a,b,s,q)<radiusSquared;
  }

  window.buildDiveCollision = function buildDiveCollision(vertices) {
    const faces=[],cells=new Map();
    const readPoint=i=>({x:vertices[i],y:vertices[i+1],z:vertices[i+2]});
    const key=(x,y,z)=>x+','+y+','+z;
    function visitCells(minX,minY,minZ,maxX,maxY,maxZ,visit) {
      const x0=Math.floor(minX/cellSize),y0=Math.floor(minY/cellSize),z0=Math.floor(minZ/cellSize);
      const x1=Math.floor(maxX/cellSize),y1=Math.floor(maxY/cellSize),z1=Math.floor(maxZ/cellSize);
      for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++){
        if(visit(key(x,y,z)))return true;
      }
      return false;
    }

    for(let i=0;i+32<vertices.length;i+=33){
      if(!staticMaterials.has(vertices[i+9])) continue;
      const a=readPoint(i),b=readPoint(i+11),c=readPoint(i+22);
      const ab={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z};
      const ac={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z};
      const nx=ab.y*ac.z-ab.z*ac.y,ny=ab.z*ac.x-ab.x*ac.z,nz=ab.x*ac.y-ab.y*ac.x;
      const length=Math.hypot(nx,ny,nz);
      if(!Number.isFinite(length)||length<1e-8) continue;
      const normal={x:nx/length,y:ny/length,z:nz/length};
      const minX=Math.min(a.x,b.x,c.x),minY=Math.min(a.y,b.y,c.y),minZ=Math.min(a.z,b.z,c.z);
      const maxX=Math.max(a.x,b.x,c.x),maxY=Math.max(a.y,b.y,c.y),maxZ=Math.max(a.z,b.z,c.z);
      const id=faces.length;
      faces.push({a,b,c,ab,ac,normal,minX,minY,minZ,maxX,maxY,maxZ});
      visitCells(minX,minY,minZ,maxX,maxY,maxZ,cell=>{
        const bucket=cells.get(cell);
        if(bucket)bucket.push(id);
        else cells.set(cell,[id]);
        return false;
      });
    }

    const visited=new Uint32Array(faces.length);
    let query=0;
    function candidates(a,b,test) {
      query=(query+1)>>>0;
      if(query===0){
        visited.fill(0);
        query=1;
      }
      const loX=Math.min(a.x,b.x)-radius,loY=Math.min(a.y,b.y)-radius,loZ=Math.min(a.z,b.z)-radius;
      const hiX=Math.max(a.x,b.x)+radius,hiY=Math.max(a.y,b.y)+radius,hiZ=Math.max(a.z,b.z)+radius;
      return visitCells(loX,loY,loZ,hiX,hiY,hiZ,key=>{
        const bucket=cells.get(key);
        if(!bucket)return false;
        for(const id of bucket){
          if(visited[id]===query)continue;
          visited[id]=query;
          const face=faces[id];
          if(face.minX>hiX||face.minY>hiY||face.minZ>hiZ||face.maxX<loX||face.maxY<loY||face.maxZ<loZ)continue;
          if(test(face))return true;
        }
        return false;
      });
    }

    function overlaps(point) {
      const contact={x:0,y:0,z:0};
      return candidates(point,point,face=>closestPoint(face,point,contact)<(radius-clearance)**2);
    }

    function clearLine(start,end) {
      const dx=end.x-start.x,dy=end.y-start.y,dz=end.z-start.z;
      const distance=Math.hypot(dx,dy,dz);
      if(distance<1e-9) return !overlaps(start);
      // Bound the swept broad phase by short sections, even for an oblique route.
      const sections=Math.ceil(distance/1.85);
      const contact={x:0,y:0,z:0};
      let a=start;
      for(let i=1;i<=sections;i++){
        const t=i/sections,b=i===sections?end:{x:start.x+dx*t,y:start.y+dy*t,z:start.z+dz*t};
        if(candidates(a,b,face=>sweepHits(face,a,b,contact)))return false;
        a=b;
      }
      return true;
    }

    function canSee(start,end) {
      const contact={x:0,y:0,z:0};
      return !candidates(start,end,face=>{
        const origin=face.a, normal=face.normal;
        const from=dot(normal.x,normal.y,normal.z,start.x-origin.x,start.y-origin.y,start.z-origin.z);
        const to=dot(normal.x,normal.y,normal.z,end.x-origin.x,end.y-origin.y,end.z-origin.z);
        if(from*to>=0)return false;
        const t=from/(from-to);
        const hit={x:start.x+(end.x-start.x)*t,y:start.y+(end.y-start.y)*t,z:start.z+(end.z-start.z)*t};
        return closestPoint(face,hit,contact)<1e-10;
      });
    }

    function slide(start,end) {
      const dx=end.x-start.x,dy=end.y-start.y,dz=end.z-start.z;
      const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy,dz)/stepSize));
      const v={x:dx/steps,y:dy/steps,z:dz/steps};
      const contact={x:0,y:0,z:0};
      let safe={x:start.x,y:start.y,z:start.z};
      for(let step=0;step<steps;step++){
        const next={x:safe.x+v.x,y:safe.y+v.y,z:safe.z+v.z};
        let resolved=false;
        const active=[];
        for(let iteration=0;iteration<9;iteration++){
          let nearest=radiusSquared,hit=null,nx=0,ny=0,nz=0;
          candidates(next,next,face=>{
            const distance=closestPoint(face,next,contact);
            if(distance<nearest){
              nearest=distance;
              hit=face;
              nx=next.x-contact.x;
              ny=next.y-contact.y;
              nz=next.z-contact.z;
            }
            return false;
          });
          if(!hit){
            resolved=true;
            break;
          }
          const depth=Math.sqrt(nearest);
          if(depth<1e-8){
            const {a,normal:n}=hit;
            const sign=dot(n.x,n.y,n.z,safe.x-a.x,safe.y-a.y,safe.z-a.z)>=0?1:-1;
            nx=n.x*sign;
            ny=n.y*sign;
            nz=n.z*sign;
          }else{
            nx/=depth;
            ny/=depth;
            nz/=depth;
          }
          const correction=radius+clearance-depth;
          next.x+=nx*correction;
          next.y+=ny*correction;
          next.z+=nz*correction;
          active.push([nx,ny,nz]);
        }
        if(!resolved)break;
        safe=next;
        // Preserve the component of the remaining motion along the contacted surfaces.
        for(const [nx,ny,nz] of active){
          const inward=dot(v.x,v.y,v.z,nx,ny,nz);
          if(inward<0){
            v.x-=nx*inward;
            v.y-=ny*inward;
            v.z-=nz*inward;
          }
        }
      }
      return safe;
    }

    return {slide,clearLine,canSee,overlaps};
  };
})();
