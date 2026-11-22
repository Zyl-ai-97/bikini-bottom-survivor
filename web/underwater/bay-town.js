(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const sand = 3, stone = 11, pebbleStone = 12, paint = 22, glass = 23, trim = 24;
  const navy = [.11,.24,.36], nickel = [.40,.49,.48], cream = [.85,.78,.60];
  const white = [.87,.87,.76], blue = [.25,.51,.69], brass = [.68,.49,.22];
  const tint = (color,gain) => color.map(channel=>channel*gain);
  const lerp = (a,b,t) => a+(b-a)*t;

  window.buildBayTown = function buildBayTown(mesh,floor,seabedFloor=floor,lanes) {
    const colliders=[];
    const streets=[];
    let seed=76319;
    function random() {
      seed=(Math.imul(1664525,seed)+1013904223)>>>0;
      return seed/4294967296;
    }

    function quad(a,b,c,d,color,material=paint) {
      mesh.triangle(a,b,c,color,material);
      mesh.triangle(a,c,d,color,material);
    }

    function pipe(points,radii,color,material=paint,sides=8,caps=true) {
      const frames=points.map((p,i)=>{
        const a=points[Math.max(0,i-1)], b=points[Math.min(points.length-1,i+1)];
        const d=b.map((v,j)=>v-a[j]), length=Math.hypot(...d);
        const [dx,dy,dz]=d.map(v=>v/length);
        const ref=Math.abs(dy)>.93?[1,0,0]:[0,1,0];
        const dot=dx*ref[0]+dy*ref[1];
        const u=[ref[0]-dx*dot,ref[1]-dy*dot,-dz*dot];
        const ul=Math.hypot(...u);
        const [ux,uy,uz]=u.map(v=>v/ul);
        return [[ux,uy,uz],[dy*uz-dz*uy,dz*ux-dx*uz,dx*uy-dy*ux]];
      });
      // Transport the previous cross-section so elbows do not twist as the tangent changes.
      for(let i=1;i<frames.length;i++){
        const [u,v]=frames[i], previous=frames[i-1][0];
        const a=u.reduce((sum,n,j)=>sum+n*previous[j],0);
        const b=v.reduce((sum,n,j)=>sum+n*previous[j],0);
        const theta=Math.atan2(b,a);
        frames[i]=[u.map((n,j)=>n*Math.cos(theta)+v[j]*Math.sin(theta)),
          v.map((n,j)=>n*Math.cos(theta)-u[j]*Math.sin(theta))];
      }
      const rings=points.map((center,i)=>Array.from({length:sides},(_,j)=>{
        const t=j*TAU/sides, [u,v]=frames[i];
        const n=u.map((q,k)=>q*Math.cos(t)+v[k]*Math.sin(t));
        const radius=typeof radii==='number'?radii:radii[i];
        return [center.map((q,k)=>q+n[k]*radius),n];
      }));
      function vertex(i,j) {
        const [p,n]=rings[i][j];
        mesh.vertex(p,n,color,material,0);
      }
      for(let i=1;i<rings.length;i++) for(let j=0;j<sides;j++){
        const k=(j+1)%sides;
        vertex(i-1,j); vertex(i-1,k); vertex(i,k);
        vertex(i-1,j); vertex(i,k); vertex(i,j);
      }
      if(caps) for(let i=0;i<sides;i++){
        const j=(i+1)%sides,n=rings.length-1;
        mesh.triangle(points[0],rings[0][j][0],rings[0][i][0],color,material);
        mesh.triangle(points[n],rings[n][i][0],rings[n][j][0],color,material);
      }
    }

    function lathe(x,y,z,profile,color,material=paint,sides=16) {
      const rows=profile.map(([h,r],j)=>{
        const lo=profile[Math.max(j-1,0)], hi=profile[Math.min(j+1,profile.length-1)];
        const [dy,dr]=[hi[0]-lo[0],hi[1]-lo[1]];
        const norm=Math.hypot(dy,dr)||1;
        return Array.from({length:sides},(_,i)=>{
          const t=i*TAU/sides, u=Math.cos(t), v=Math.sin(t);
          return [[x+u*r,y+h,z+v*r],[dy*u/norm,-dr/norm,dy*v/norm]];
        });
      });
      function vertex(j,i,c) {
        const [p,n]=rows[j][i];
        mesh.vertex(p,n,c,material,0);
      }
      for(let j=1;j<rows.length;j++) for(let i=0;i<sides;i++){
        const k=(i+1)%sides,c=tint(color,.986+.027*Math.cos(i*1.9));
        if(profile[j][1]>0){vertex(j-1,i,c);vertex(j,i,c);vertex(j,k,c);}
        if(profile[j-1][1]>0){vertex(j-1,i,c);vertex(j,k,c);vertex(j-1,k,c);}
      }
    }

    function pebble(x,z,rx,rz,height,angle,color,seed) {
      const grade=seabedFloor(x,z), ca=Math.cos(angle), sa=Math.sin(angle);
      const buried=.038+height*.29;
      function point(phi,theta) {
        const flare=1+.072*Math.sin(3*theta+seed+2*phi)+.038*Math.cos(5*theta-seed);
        const width=Math.cos(phi)*flare;
        const u=rx*Math.cos(theta)*width+rx*.15*Math.sin(phi);
        const v=rz*Math.sin(theta)*width;
        const px=x+ca*u-sa*v, pz=z+sa*u+ca*v;
        const ground=seabedFloor(px,pz);
        const py=grade+(ground-grade)*.73-buried+(height+buried)*Math.sin(phi)
          +height*.105*width*Math.sin(2*theta+seed+phi*5);
        return [px,py,pz];
      }
      const rows=8, sides=16;
      const samples=Array.from({length:rows+1},(_,i)=>Array.from({length:sides},(_,j)=>{
        const phi=lerp(-.54,Math.PI*.5-.001,i/rows), theta=j*TAU/sides;
        const pos=point(phi,theta);
        const up=point(phi+.001,theta).map((v,k)=>v-pos[k]);
        const side=point(phi,theta+.001).map((v,k)=>v-pos[k]);
        const normal=[up[1]*side[2]-up[2]*side[1],up[2]*side[0]-up[0]*side[2],up[0]*side[1]-up[1]*side[0]];
        const length=Math.hypot(...normal)||1;
        const exposed=Math.max(0,Math.min(1,(pos[1]-seabedFloor(pos[0],pos[2]))/(height*.76)));
        const seam=Math.sin(pos[1]*44.0+pos[0]*13+pos[2]*10+seed+1.7*Math.sin(theta*2+phi));
        const variation=.97+.058*Math.sin(theta*3+phi*6+seed)+.028*seam;
        const wetSand=[.41,.41,.34];
        const pigment=color.map((v,k)=>lerp(wetSand[k],v*variation,.63+.37*exposed));
        return [pos,normal.map(v=>v/length),pigment];
      }));
      const vertex=(row,col)=>mesh.vertex(...samples[row][col],pebbleStone,0);
      for(let i=0;i<rows;i++) {
        for(let j=0;j<sides;j++) {
          const k=(j+1)%sides;
          vertex(i,j); vertex(i+1,j); vertex(i+1,k);
          vertex(i,j); vertex(i+1,k); vertex(i,k);
        }
      }
      const tip=point(Math.PI*.5,0);
      for(let j=0;j<sides;j++) {
        vertex(rows,j);
        mesh.vertex(tip,[0,1,0],color,pebbleStone,0);
        vertex(rows,(j+1)%sides);
      }
    }

    function streetLight(x,z,warm,near) {
      const y=seabedFloor(x,z);
      const bronze=warm?[.34,.32,.21]:[.25,.32,.29];
      const rim=warm?[.60,.51,.32]:[.47,.54,.48];
      const cast=[.31,.33,.30];
      const sides=near?22:15;
      const apron=Array.from({length:3},(_,row)=>Array.from({length:sides},(_,i)=>{
        const angle=i*TAU/sides;
        const radius=lerp(.121,.228+.026*Math.sin(3*angle+.7)+.010*Math.cos(7*angle),row*.5);
        const dx=Math.cos(angle), dz=Math.sin(angle);
        const px=x+dx*radius, pz=z+dz*radius, grade=seabedFloor(px,pz);
        const rise=[.026,.012,-.010][row];
        const normal=[dx*.17+(grade-seabedFloor(px+.037,pz))/.037,1,
          dz*.17+(grade-seabedFloor(px,pz+.037))/.037];
        const len=Math.hypot(...normal);
        const contact=[.86,.95,1][row];
        return [[px,grade+rise,pz],normal.map(value=>value/len),[contact,.42+.58*contact,0]];
      }));
      const vertex=(r,i)=>mesh.vertex(...apron[r][i],sand,0);
      for(let j=0;j<2;j++) {
        for(let i=0;i<sides;i++) {
          const next=(i+1)%sides;
          vertex(j+1,i); vertex(j,i); vertex(j,next);
          vertex(j+1,i); vertex(j,next); vertex(j+1,next);
        }
      }
      lathe(x,y,z,[[foundationDepth(x,y,z,.15),.141],[.017,.150],[.032,.149],
        [.045,.136],[.050,.115]],cast,trim,20);
      lathe(x,y,z,[[.048,.100],[.071,.106],[.093,.099],[.131,.083],[.153,.054],
        [.163,.042]],bronze,trim,18);
      lathe(x,y,z,[[.086,.086],[.095,.102],[.105,.101],[.115,.078]],rim,trim,18);
      lathe(x,y,z,[[.137,.042],[.205,.039],[.718,.028],[.800,.032]],bronze,trim,13);
      lathe(x,y,z,[[.715,.026],[.731,.042],[.756,.042],[.774,.035]],rim,trim,14);
      lathe(x,y,z,[[.774,.033],[.801,.043],[.818,.082],[.840,.130],[.852,.142],
        [.870,.136]],bronze,trim,sides);
      lathe(x,y,z,[[.851,.126],[.868,.132],[.894,.134],[.971,.129],[.992,.122]],
        warm?[1.22,.91,.52]:[.89,1.09,.97],glass,sides);
      lathe(x,y,z,[[.854,.129],[.856,.143],[.869,.143],[.877,.131]],rim,trim,sides);
      lathe(x,y,z,[[.977,.124],[.986,.151],[1.001,.161],[1.016,.157],
        [1.046,.124],[1.074,.073],[1.081,.036]],bronze,trim,sides);
      lathe(x,y,z,[[.988,.151],[.994,.165],[1.005,.165],[1.017,.155]],rim,trim,sides);
      lathe(x,y,z,[[1.067,.046],[1.083,.050],[1.107,.034],[1.114,0]],rim,trim,16);
      for(let i=0;i<3;i++) {
        const a=i*TAU/3+.48, u=Math.cos(a),v=Math.sin(a);
        pipe([[x+u*.133,y+.861,z+v*.133],[x+u*.137,y+.925,z+v*.137],
          [x+u*.132,y+.992,z+v*.132]],.010,bronze,trim,6);
      }
    }

    function foundationDepth(x,y,z,radius) {
      let low=seabedFloor(x,z);
      for(let i=0;i<24;i++){
        const a=i*TAU/24;
        low=Math.min(low,seabedFloor(x+radius*Math.cos(a),z+radius*Math.sin(a)));
      }
      return Math.min(-.25,low-y-.11);
    }
    function lane(points,width) {
      const samples=[];
      for(let i=0;i<points.length-1;i++){
        const a=points[i],b=points[i+1],p=points[Math.max(0,i-1)],q=points[Math.min(points.length-1,i+2)];
        const steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.25);
        for(let j=0;j<steps;j++){
          const t=j/steps;
          samples.push(a.map((u,k)=>.5*(2*u+(b[k]-p[k])*t+(2*p[k]-5*u+4*b[k]-q[k])*t*t+
            (-p[k]+3*u-3*b[k]+q[k])*t*t*t)));
        }
      }
      samples.push(points.at(-1));
      streets.push({samples,width});
    }

    function drawStreets() {
      for(let index=0;index<streets.length;index++){
        const {samples,width}=streets[index];
        const rows=samples.map(([x,z],i)=>{
          const p=samples[Math.max(0,i-1)],q=samples[Math.min(samples.length-1,i+1)];
          const dx=q[0]-p[0],dz=q[1]-p[1],len=Math.hypot(dx,dz);
          return [-1,-.78,0,.78,1].map(s=>{
            const u=x+dz/len*s*width,v=z-dx/len*s*width;
            return [u,seabedFloor(u,v)+(Math.abs(s)===1?.013:.032)+index*.002,v];
          });
        });
        for(let i=0;i<rows.length-1;i++){
          const [x,z]=samples[i];
          const atJunction=streets.some((road,j)=>j!==index && road.samples.some(([u,v])=>
            (u-x)**2+(v-z)**2<(width+road.width+.16)**2));
          for(let j=0;j<4;j++){
            const shoulder=(j===0||j===3)&&!atJunction;
            const color=shoulder?[.40,.46,.44]:[.105,.225,.34];
            quad(rows[i][j+1],rows[i][j],rows[i+1][j],rows[i+1][j+1],
              tint(color,.94+.11*random()),shoulder?stone:25);
          }
        }
      }
    }
    function mount(x,y,z,angle) {
      const ux=Math.cos(angle), uz=-Math.sin(angle);
      const dx=Math.sin(angle), dz=Math.cos(angle);
      return (a,b,c)=>[x+a*ux+c*dx,y+b,z+a*uz+c*dz];
    }

    function hardware(at,x,y,z,w,h,d,color,material=trim) {
      const u=w*.5,v=h*.5,s=d*.5;
      const p=[[-u,-v,-s],[u,-v,-s],[u,v,-s],[-u,v,-s],[-u,-v,s],[u,-v,s],[u,v,s],[-u,v,s]]
        .map(([a,b,c])=>at(x+a,y+b,z+c));
      [[0,3,2,1],[4,5,6,7],[0,4,7,3],[5,1,2,6],[3,7,6,2],[0,1,5,4]]
        .forEach(([a,b,c,d])=>quad(p[a],p[b],p[c],p[d],color,material));
    }

    function fastener(at,x,y,z,r,color=nickel) {
      pipe([at(x,y,z-.015),at(x,y,z+.008)],r,color,trim,6);
    }

    function windowRing(x,y,z,angle,r,frame=navy,light=[.68,.81,.74],bolted=false) {
      const at=mount(x,y,z,angle);
      const dx=Math.sin(angle),dz=Math.cos(angle),count=r>.17?18:14;
      const flange=Math.min(.056,.26*r);
      const frameDepth=Math.min(.108,.55*r);
      function ring(depth,radius) {
        return Array.from({length:count},(_,i)=>{
          const t=i*TAU/count;
          return at(Math.cos(t)*radius,Math.sin(t)*radius,depth);
        });
      }
      const root=ring(-.055,r+flange*.88);
      const shoulder=ring(frameDepth*.58,r+flange);
      const lip=ring(frameDepth,r+flange*.45);
      const rim=ring(frameDepth,r);
      const gasket=ring(frameDepth-.021,r*.925);
      const centerDepth=frameDepth-.010;
      const middle=ring(centerDepth-.004,r*.53);
      const center=at(0,0,centerDepth);
      const clear=tint(light,.96);
      function lens(vertex,i,radius) {
        const a=i*TAU/count;
        const bend=.27*radius*Math.cos(a), height=.27*radius*Math.sin(a);
        const length=Math.hypot(1,bend,height);
        mesh.vertex(vertex,[(dx+dz*bend)/length,height/length,(dz-dx*bend)/length],clear,glass,radius);
      }
      for(let i=0;i<count;i++){
        const j=(i+1)%count;
        quad(root[j],shoulder[j],shoulder[i],root[i],tint(frame,.85),trim);
        quad(shoulder[i],shoulder[j],lip[j],lip[i],tint(frame,1.17),trim);
        quad(lip[i],lip[j],rim[j],rim[i],frame,trim);
        quad(rim[i],rim[j],gasket[j],gasket[i],navy,paint);
        lens(center,i,0); lens(middle[i],i,.53); lens(middle[j],j,.53);
        lens(middle[i],i,.53); lens(gasket[i],i,1); lens(gasket[j],j,1);
        lens(middle[i],i,.53); lens(gasket[j],j,1); lens(middle[j],j,.53);
      }
      if (bolted && r>.16) {
        for(let i=0;i<5;i++) {
          const t=(i+.5)*TAU/5, d=r+flange*.65;
          fastener(at,Math.cos(t)*d,Math.sin(t)*d,frameDepth-.007,.012,brass);
        }
      }
    }

    function doorway(at,w,h,frame,kind) {
      const arch=kind==='home';
      function boundary(half,height,base,depth) {
        const corners=arch
          ? Array.from({length:11},(_,i)=>{
              const a=i*Math.PI/10;
              return [Math.cos(a)*half,height-half+Math.sin(a)*half];
            })
          : [[half,height-.12],[half-.10,height],[-half+.10,height],[-half,height-.12]];
        return [[-half,0],[half,0],...corners].map(([u,v])=>at(u,v+base,depth));
      }
      const flange=boundary(w*.55,h+.04,-.020,-.20);
      const outer=boundary(w*.53,h+.020,-.005,.098);
      const inner=boundary(w*.432,h*.925,.032,.116);
      const panel=boundary(w*.413,h*.906,.038,.073);
      for(let i=0;i<outer.length;i++){
        const j=(i+1)%outer.length;
        quad(flange[i],flange[j],outer[j],outer[i],tint(frame,.73),trim);
        quad(outer[i],outer[j],inner[j],inner[i],frame,trim);
        quad(inner[i],inner[j],panel[j],panel[i],tint(navy,.84),paint);
      }
      const doorPanel=kind==='service'?tint(frame,.51):tint(frame,.63);
      for(let i=1;i<panel.length-1;i++) mesh.triangle(panel[0],panel[i],panel[i+1],doorPanel,paint);
      hardware(at,0,.026,.12,w*1.065,.049,.094,frame);
      const steel=tint(frame,1.19);
      if(kind==='service') {
        hardware(at,0,h*.56,.080,w*.63,h*.49,.019,tint(doorPanel,.77),paint);
        hardware(at,0,h*.56,.097,.029,h*.47,.018,steel);
        for(let i=0;i<3;i++) hardware(at,0,h*(.30+i*.053),.091,w*.55,.016,.023,steel);
      } else {
        const center=at(0,h*.644,.071);
        const front=at(0,0,1), localOrigin=at(0,0,0);
        const angle=Math.atan2(front[0]-localOrigin[0],front[2]-localOrigin[2]);
        windowRing(...center,angle,Math.min(w*(kind==='lab'?.23:.195),kind==='lab'?.17:.13),tint(frame,.81),
          kind==='lab'?[.43,.74,.88]:kind==='beacon'?[.63,.78,.76]:[.57,.70,.67]);
        hardware(at,0,h*.29,.081,w*.62,.023,.024,steel);
        hardware(at,0,h*.19,.083,w*.52,.10,.021,tint(frame,.78),paint);
        if(kind==='lab') {
          hardware(at,-w*.30,h*.43,.111,.071,.151,.05,navy);
          hardware(at,-w*.30,h*.46,.145,.022,.037,.027,[.34,.77,.69],paint);
        }
      }
      for(const t of [.27,.70]) {
        hardware(at,-w*.39,h*t,.094,w*.17,.082,.034,steel);
        pipe([at(-w*.449,h*t-.043,.117),at(-w*.449,h*t+.043,.117)],.025,nickel,trim,7);
      }
      hardware(at,w*.271,h*.44,.094,.066,.14,.041,tint(brass,.84));
      pipe([at(w*.29,h*.397,.115),at(w*.29,h*.405,.152),at(w*.29,h*.486,.152),
        at(w*.29,h*.494,.115)],.016,brass,trim,7);
      for(const side of [-1,1]) {
        for(const t of [.15,.51,.75]) fastener(at,w*.48*side,h*t,.113,.013,nickel);
      }
    }

    function walkup(at,width,foot,reach,count,top,color,landingDepth) {
      const landing=at(0,0,reach);
      const end=seabedFloor(landing[0],landing[2])+.052;
      const breakAt=i=>landingDepth===undefined
        ? lerp(foot,reach,i/count)
        : i===0?foot:lerp(landingDepth,reach,(i-1)/(count-1));
      for(let i=0;i<count;i++) {
        const a=breakAt(i);
        const b=breakAt(i+1)+.015;
        const edge=lerp(top,end,i/Math.max(1,count-1));
        const mid=(a+b)*.5;
        const origin=at(0,0,0);
        const corners=[[-width*.5,a],[width*.5,a],[width*.5,b],[-width*.5,b]];
        const tread=corners.map(([x,z])=>at(x,edge-origin[1]-.018,z));
        const skirt=corners.map(([x,z])=>{
          const p=at(x*1.08,0,z);
          p[1]=Math.min(seabedFloor(p[0],p[2])-.105,edge-.10);
          return p;
        });
        for(let j=0;j<corners.length;j++) {
          const k=(j+1)%corners.length;
          quad(skirt[j],tread[j],tread[k],skirt[k],tint(color,j===2?.76:.68),paint);
        }
        hardware(at,0,edge-origin[1]-.018,mid,width+.022,.036,b-a+.02,color,trim);
      }
    }

    function entranceBearing(x,z,r,sites,radius,reach,width) {
      let selected=0, best=Infinity;
      for(let i=0;i<24;i++) {
        const a=i*TAU/24, dx=Math.sin(a), dz=Math.cos(a);
        const tx=x+dx*(r+.68), tz=z+dz*(r+.68);
        let score=Infinity, edge=Infinity;
        for(const {samples,width:streetWidth} of streets) {
          for(const [u,v] of samples) {
            score=Math.min(score,(tx-u)**2+(tz-v)**2);
            const longitudinal=(u-x)*dx+(v-z)*dz;
            const sideways=(u-x)*dz-(v-z)*dx;
            const ahead=Math.max(0,radius-.06-longitudinal,longitudinal-radius-reach-.028);
            const flank=Math.max(0,Math.abs(sideways)-width*.54-.012);
            edge=Math.min(edge,Math.hypot(ahead,flank)-streetWidth);
          }
        }
        if(edge<.27) score+=1e3+350*(.27-edge);
        for(const [u,v,width] of sites) {
          if (u===x && v===z) continue;
          const distance=Math.hypot(tx-u,tz-v);
          if(distance<width+.56) score+=(width+.56-distance)*32;
        }
        const rise=seabedFloor(tx,tz)-seabedFloor(x,z);
        score+=Math.abs(rise)*3+(1-dz)*.28;
        if(score<best) {selected=a;best=score;}
      }
      return selected;
    }

    function tower(x,z,r,h,style,sites) {
      const y=floor(x,z)+.07;
      const palette=[[.19,.43,.68],[.39,.57,.72],[.13,.34,.52],[.70,.51,.21],
        [.40,.62,.28],[.37,.37,.66],[.26,.58,.63],[.64,.32,.24]];
      const c=palette[style%palette.length];
      const roof=tint(c,style%4===0?.72:1.22);
      const shape=style%6;
      const waist=[.82,.96,.90,1.06,.86,.92][shape], shoulder=[1.01,1.09,1.05,1.06,1.13,.88][shape];
      const kind=style===16||style===20?'lab':style>=16||style===3||style===6?'service':'home';
      const base=.14;
      const doorHeight=Math.min(1.32,Math.max(.94,h*.43));
      const width=Math.max(.51,r*(kind==='home'?.68:.77));
      const hullRadius=height=>{
        if(height<=.25) return r*lerp(.87,.91,(Math.max(.12,height)-.12)/.13);
        if(height<=h*.44) return r*lerp(.91,waist,(height-.25)/(h*.44-.25));
        if(height<=h*.76) return r*lerp(waist,shoulder,(height-h*.44)/(h*.32));
        return r*shoulder;
      };

      const radius=Math.max(hullRadius(base),hullRadius(base+doorHeight))-.018;
      const porch=Math.max(.29,r*1.04-radius+.095);
      const bearing=entranceBearing(x,z,r,sites,radius,porch+.38,width*1.16);
      lathe(x,y,z,[[foundationDepth(x,y,z,r),r*.92],[.015,r*1.00],[.08,r*1.04],
        [.15,r*.91],[.148,r*.85]],tint(c,.82),paint,20);
      lathe(x,y,z,[[.12,r*.87],[.25,r*.91],[h*.44,r*waist],[h*.76,r*shoulder],[h,r*shoulder]],c,paint,20);
      for(const t of [.15,.48,.79]) {
        const band=h*t, seam=hullRadius(band);
        lathe(x,y,z,[[band-.019,hullRadius(band-.019)-.008],[band-.011,seam+.029],
          [band+.035,hullRadius(band+.035)+.027],[band+.049,hullRadius(band+.049)-.009]],tint(c,.74),trim,20);
      }
      const roofRim=shoulder+(style===16?.026:.075);
      lathe(x,y,z,[[h-.06,r*shoulder],[h+.025,r*roofRim],[h+.171,r*roofRim],
        [h+.20,r*shoulder]],tint(c,1.37),paint,14);
      if(style>=16) {
        const capStyle=(style-16)%4;
        const accent=style%3===0?[.67,.56,.25]:tint(c,1.22);
        if(capStyle===0) {
          const [lip,brim,upper]=style===16?[1.104,1.157,1.066]:[1.28,1.36,1.25];
          lathe(x,y,z,[[h+.13,r*lip],[h+.21,r*brim],[h+.31,r*upper],
            [h+.43,r*.77],[h+.53,r*.39],[h+.57,0]],accent,paint,17);
          pipe([[x-.23*r,y+h+.45,z],[x-.29*r,y+h+.77,z],[x-.16*r,y+h+.97,z],[x+.04*r,y+h+1.05,z]],r*.12,roof,paint,9);
          pipe([[x+.04*r,y+h+1.05,z],[x+.09*r,y+h+1.065,z]],r*.144,navy,paint,8);
        } else if(capStyle===1) {
          lathe(x,y,z,[[h+.15,r*.59],[h+.25,r*.85],[h+.45,r*1.11],[h+.60,r*1.16],
            [h+.67,r*1.13],[h+.64,r*.96],[h+.34,r*.74],[h+.29,0]],accent,paint,18);
          lathe(x,y,z,[[h+.54,r*.50],[h+.60,r*.52],[h+.73,r*.31],[h+.75,0]],tint(c,.72),paint,13);
        } else if(capStyle===2) {
          lathe(x,y,z,[[h+.17,r*1.08],[h+.23,r*1.15],[h+.42,r*1.06],[h+.61,r*.82],
            [h+.77,r*.48],[h+.81,r*.22],[h+.85,0]],accent,paint,22);
          for(let i=0;i<8;i++) {
            const a=i*TAU/8,u=Math.cos(a)*r,v=Math.sin(a)*r;
            pipe([[x+u*1.105,y+h+.28,z+v*1.105],[x+u*.99,y+h+.495,z+v*.99],
              [x+u*.69,y+h+.69,z+v*.69],[x+u*.29,y+h+.81,z+v*.29]],r*.027,tint(c,.71),paint,5);
          }
          pipe([[x,y+h+.83,z],[x+r*.08,y+h+1.03,z]],r*.09,brass,paint,7);
        } else {
          lathe(x,y,z,[[h+.19,r*shoulder],[h+.29,r*.73],[h+.32,0]],roof,paint,15);
          const sx=x-r*.48, sz=z-.13;
          lathe(sx,y,sz,[[h-.47,r*.44],[h-.15,r*.55],[h+.60,r*.55],[h+.69,r*.58],
            [h+.78,r*.58],[h+.84,r*.38],[h+.87,0]],accent,paint,15);
          windowRing(sx,y+h+.40,sz+r*.54,.0,r*.16,tint(c,.59),[.87,.86,.61]);
          pipe([[x+r*.29,y+h+.26,z+r*.18],[x+r*.29,y+h+.63,z+r*.18],
            [x+r*.43,y+h+.82,z+r*.18],[x+r*.63,y+h+.87,z+r*.18]],r*.10,accent,paint,9);
        }
      } else if(shape===0 || shape===4){
        lathe(x,y,z,[[h+.16,r*shoulder],[h+.33,r*.96],[h+r*.58,r*.65],
          [h+r*.73,r*.32],[h+r*.76,0]],roof,paint,15);
        pipe([[x,y+h+r*.70,z],[x,y+h+r*.99,z]],r*.053,brass,paint,7);
      } else {
        lathe(x,y,z,[[h+.19,r*shoulder],[h+.25,r*.76],[h+.27,0]],roof,paint,15);
        const t=r*(shape===2?1.18:.83), bend=[x+r*.17,y+h+t*.81,z-.02];
        pipe([[x-r*.12,y+h+.22,z],[x-r*.12,y+h+t*.58,z],bend,
          [x+r*.40,y+h+t*.89,z+.02]],[r*.134,r*.127,r*.126,r*.148],tint(c,1.23),paint,9);
        pipe([[x+r*.39,y+h+t*.89,z+.02],[x+r*.46,y+h+t*.91,z+.025]],r*.17,navy,paint,9);
      }
      for(const [t,a] of [[.46,.56],[.61,1.50],[.77,-.61],[.49,-1.56],[.70,2.93]]){
        const port=r*(.186+random()*.052);
        if(t===.77&&(style===16||style===20||style===23)) continue;
        const arc=Math.abs(Math.atan2(Math.sin(a-bearing),Math.cos(a-bearing)));
        const height=arc*r<width*.55+port+.06 ? Math.max(h*t,base+doorHeight+port+.105) : h*t;
        const rr=hullRadius(height)-.025;
        const light=style%3===0?[.98,.77,.36]:style%3===1?[.63,.76,.68]:[.45,.64,.72];
        windowRing(x+Math.sin(a)*rr,y+height,z+Math.cos(a)*rr,a,port,tint(c,.69),light,
          style>=16&&t>.69);
      }
      if(style===16 || style===20 || style===23){
        const accent=style===16?[.67,.79,.80]:style===20?[.72,.75,.40]:[.81,.59,.35];
        const q=h*.66, ring=r*lerp(waist,shoulder,(.66-.44)/.32);
        lathe(x,y,z,[[q-.075,ring],[q-.049,ring+.069],[q+.052,ring+.073],[q+.083,ring]],
          accent,paint,18);
        const a=-.51, q2=h*.64, radius=hullRadius(q2);
        const wx=x+Math.sin(a)*radius,wz=z+Math.cos(a)*radius;
        pipe([[wx-Math.sin(a)*.052,y+q2,wz-Math.cos(a)*.052],[wx+Math.sin(a)*.078,y+q2,wz+Math.cos(a)*.078]],
          r*.32,accent,paint,14);
        windowRing(wx+Math.sin(a)*.055,y+q2,wz+Math.cos(a)*.055,a,r*.195,navy,[.87,.83,.54]);
        const side=style===20?-1:1, vent=x+side*r*.46;
        const elbow=[[vent,y+h+.35,z+.21],[vent+side*r*.13,y+h+.60,z+.23],
          [vent+side*r*.07,y+h+.83,z+.24],[vent-side*r*.06,y+h+1.07,z+.30],
          [vent+side*r*.14,y+h+1.25,z+.32]];
        pipe(elbow,[r*.105,r*.11,r*.115,r*.12,r*.158],accent,paint,10);
        const outlet=elbow.at(-1);
        pipe([outlet,[outlet[0]+side*.026,outlet[1]+.018,outlet[2]+.003]],r*.112,navy,paint,10);
      }
      const at=mount(x+Math.sin(bearing)*radius,y+base,z+Math.cos(bearing)*radius,bearing);
      doorway(at,width,doorHeight,tint(c,.88),kind);
      walkup(at,width*1.16,-.06,porch+.38,3,y+base+.057,tint(c,1.12),porch);

      if(style%3!==1) {
        const a=bearing+(style%2?.95:-1.18)*Math.PI, height=h*(style>=16?.39:.54);
        const rad=hullRadius(height)-.036;
        const service=mount(x+Math.sin(a)*rad,y+height,z+Math.cos(a)*rad,a);
        const w=r*.45;
        hardware(service,0,0,.027,w,w*.77,.09,tint(c,.66));
        if(kind==='service') {
          hardware(service,0,0,.076,w*.78,w*.56,.031,navy,paint);
          for(let vane=-1;vane<=1;vane++) hardware(service,0,vane*w*.14,.104,w*.73,.026,.048,nickel);
          for(const u of [-.40,.40]) fastener(service,u*w,0,.079,.014,brass);
        } else {
          hardware(service,0,0,.082,w*.72,w*.54,.026,tint(c,.96),paint);
          fastener(service,w*.25,0,.106,.017,brass);
        }
      }
      colliders.push({x,z,radius:r*Math.max(shoulder,.98),top:y+h+Math.max(r*1.18,style===16||style===20||style===23?1.39:style>=16?1.08:0)});
      return y;
    }
    function lighthouse(x,z) {
      const y=floor(x,z)+.06;
      const red=[.76,.195,.14], gold=[.78,.54,.19], blueGray=[.21,.35,.43];
      lathe(x,y,z,[[foundationDepth(x,y,z,1.58),1.54],[.12,1.58],[.20,1.54],[.35,1.36],[.40,1.31]],cream,trim,24);
      for(let k=0;k<8;k++){
        const a=.36+k*.932, r=1.23-k*.071;
        lathe(x,y,z,[[a,r],[a+.932,r-.071]],k%2?white:red,k%2?trim:paint,25);
        if(k%2===1 && k<6) windowRing(x+.28,y+a+.43,z+r-.045,.15,.17,navy,[.74,.78,.62]);
      }
      const vestibule=mount(x,y+.37,z+1.254,0);
      doorway(vestibule,.76,1.28,[.30,.43,.48],'beacon');
      walkup(vestibule,1.02,-.09,1.56,7,y+.424,cream,.45);
      for(const side of [-1,1]) {
        hardware(vestibule,side*.425,.77,.027,.095,.386,.137,blueGray);
        hardware(vestibule,side*.425,.79,.106,.057,.211,.031,[.57,.65,.52],paint);
      }
      lathe(x,y,z,[[7.42,.72],[7.61,1.06],[7.73,1.17],[7.85,1.19],[7.93,0]],navy,paint,24);
      lathe(x,y,z,[[7.92,.66],[8.12,.66],[8.16,.53]],gold,paint,20);
      lathe(x,y,z,[[8.11,.46],[9.17,.46]],[.91,.81,.49],glass,20);
      for(let i=0;i<=16;i++){
        const a=i*TAU/16, u=x+Math.cos(a)*1.11, v=z+Math.sin(a)*1.11;
        if(i<16){
          pipe([[u,y+7.83,v],[u,y+8.38,v]],.026,brass,paint,5);
          if(i%2===0){
            const bx=x+Math.cos(a)*.51,bz=z+Math.sin(a)*.51;
            pipe([[bx,y+8.08,bz],[bx,y+9.22,bz]],.038,navy,paint,6);
          }
        }
      }
      for(const h of [8.15,8.40]){
        const points=Array.from({length:33},(_,i)=>{
          const a=i*TAU/32; return [x+Math.cos(a)*1.11,y+h,z+Math.sin(a)*1.11];
        });
        pipe(points,.028,brass,paint,6,false);
      }
      lathe(x,y,z,[[9.04,.57],[9.11,.82],[9.22,.85],[9.24,.78]],navy,paint,24);
      lathe(x,y,z,[[9.21,.74],[9.29,.82],[9.37,.79],[9.61,.46],[9.82,.11],[9.87,0]],gold,paint,24);
      pipe([[x,y+9.67,z],[x,y+10.15,z]],.058,gold,paint,9);
      colliders.push({x,z,radius:1.46,top:y+9.98});
    }

    function anchor(x,z){
      const y=floor(x,z)+.12;
      const iron=[.31,.47,.51], edge=[.53,.65,.66], dark=[.12,.25,.31], rope=[.57,.44,.26];
      function point(u,v,w=0) {
        return [x+u-.113*v,y+v+.037*u,z+w+.17*u];
      }
      function route(coords,r,c,sides=12,caps=true){
        pipe(coords.map(p=>point(...p)),r,c,paint,sides,caps);
      }
      lathe(x,y,z,[[foundationDepth(x,y,z,1.81),1.81],[.15,1.75],[.28,1.67],[.38,1.18],[.48,0]],navy,paint,24);
      route([[0,.27,0],[0,3.01,0],[0,8.59,0],[0,13.9,0]],[.49,.445,.365,.31],iron,15);
      route([[.02,.38,.21],[.02,3.01,.21],[.02,8.59,.185],[.02,13.4,.16]],.098,edge,8);
      for(const [h,r] of [[1.04,.48],[6.2,.36],[8.91,.35],[12.55,.33]]){
        route([[0,h-.095,0],[0,h+.095,0]],r,dark,12);
      }
      route([[-3.60,8.82,.005],[-3.32,8.82,0],[0,8.93,0],[3.24,9.03,.0],[3.62,9.05,.0]],
        [.26,.20,.238,.20,.25],iron,13);
      for(const side of [-1,1]){
        const sign=side>0?.21:-.21;
        route([[0,1.29,0],[side*1.31,1.31,.04],[side*2.51,1.85,.09],[side*3.45,2.92,.13],
          [side*4.06,4.08,.12]],[.49,.43,.37,.33,.27],iron,14);
        const tail=point(side*3.47,3.50,-.22);
        const outer=point(side*4.49,3.66,.15);
        const peak=point(side*4.14,5.51-.25*sign,.13);
        const inner=point(side*2.88,4.52,.13);
        const ridge=point(side*3.72,4.24,.56);
        for(const [a,b,c] of [[tail,outer,dark],[outer,peak,iron],[peak,inner,edge],[inner,tail,iron]]){
          mesh.triangle(a,b,ridge,c,paint);
        }
        mesh.triangle(tail,inner,outer,dark,paint);
        mesh.triangle(inner,peak,outer,dark,paint);
        const h=side>0?9.01:8.82,u=side*3.43;
        route([[u-.11,h,0],[u+.11,h,0]],.32,edge,11);
      }
      route([[0,12.68,0],[.65,13.79,.03],[1.40,14.11,.02]],.22,iron,12);
      route([[0,12.72,0],[-.67,13.42,.02],[-1.60,13.48,.01]],.20,iron,12);
      const collars=[[-1.68,13.97,1.13,.93],[1.40,15.50,1.23,1.43]];
      for(const [cx,cy,rx,ry] of collars){
        const ring=Array.from({length:49},(_,i)=>{
          const a=i*TAU/48;return [cx+rx*Math.cos(a),cy+ry*Math.sin(a),.01];
        });
        route(ring,.167,iron,11,false);
        route(ring.map(([u,v,w])=>[u,v,w+.106]),.062,edge,8,false);
      }
      const tether=Array.from({length:81},(_,i)=>{
        const a=i/80*TAU*4.3;
        return [.34*Math.sin(a),12.70-i/80*2.24,.34*Math.cos(a)+.01];
      });
      route(tether,.072,rope,7,false);
      route([[.05,10.6,.30],[.43,9.85,.46],[1.12,9.22,.63],[2.3,9.13,.38],[3.32,9.07,.20]],
        .074,rope,7);
      colliders.push({x,z,radius:1.20,top:y+17.05});
      for(const side of [-1,1]) colliders.push({x:x+side*3.8,z:z+side*.61,radius:.84,top:y+5.52});
    }

    function orchidTower(x,z){
      const y=floor(x,z)+.10;
      const steel=[.21,.34,.55], petal=[.43,.44,.80], petalEdge=[.54,.61,.90];
      lathe(x,y,z,[[foundationDepth(x,y,z,1.27),1.25],[.12,1.27],[.20,1.25],[.44,.91],[.54,.88]],cream,trim,20);
      lathe(x,y,z,[[.48,.77],[1.16,.77],[1.29,.62],[1.42,.32]],steel,paint,18);
      pipe([[x,y+1.04,z],[x-.15,y+3.78,z],[x-.29,y+7.2,z],[x-.42,y+9.86,z]],
        [.246,.186,.152,.172],steel,paint,13);
      pipe([[x+.15,y+.95,z+.16],[x+.13,y+3.42,z+.18],[x+.03,y+5.5,z+.22]],.054,[.43,.61,.70],paint,8);
      for(const [h,dx] of [[1.50,-.024],[4.02,-.15],[7.10,-.29],[8.72,-.36]]){
        pipe([[x+dx,y+h-.08,z],[x+dx-.005,y+h+.08,z]],h<2?.265:.212,navy,paint,10);
      }
      const cx=x-.42,cy=y+10.48,cz=z+.06;
      pipe([[cx,cy-.08,cz-.28],[cx,cy,cz+.33]],.60,steel,paint,20);
      pipe([[cx,cy,cz+.34],[cx,cy,cz+.43]],.43,petalEdge,paint,18);
      pipe([[cx,cy,cz+.43],[cx,cy,cz+.46]],.18,[.76,.76,.91],trim,14);
      for(let i=0;i<5;i++){
        const a=Math.PI/2+i*TAU/5+.11, dx=Math.cos(a),dy=Math.sin(a);
        const reach=i%2?2.43:2.63;
        const points=Array.from({length:15},(_,j)=>{
          const t=j/14, length=.44+t*reach;
          const drift=(t*t-.4*t)*.37;
          return [cx+dx*length-dy*drift,cy+dy*length+dx*drift,cz+.022+.10*Math.sin(t*Math.PI)];
        });
        const radii=points.map((_,j)=>{
          const t=j/14;
          return .07+.565*Math.sin(Math.PI*t)**.77+.135*(1-t);
        });
        pipe(points,radii,i%2?petalEdge:petal,paint,15);
      }
      colliders.push({x,z,radius:1.07,top:y+1.49},{x:x-.39,z,radius:.36,top:y+13.63});
    }
    // Junctions share control points. The first tangent continues the sandy bay approach.
    lane([[-1.67,-37.2],[-1.50,-38],[-1.20,-39.20],[.30,-40.70],[2.55,-41.15],
      [2.85,-42.80],[3.60,-44.15],[2.30,-46.85],[1.65,-49.85],[1.65,-53.30],
      [.75,-54.80],[1.80,-55.40],[3.45,-55.70],[4.65,-57.50],[4.35,-59.15]],.82);
    lane([[-1.20,-39.20],[-4.20,-40.10],[-7.35,-43.55],[-9.60,-44.30],[-10.35,-46.92],[-9.68,-47.35],[-8.25,-46.25],
      [-6.60,-45.80],[-4.65,-46.10],[-3.15,-45.35],[-3.30,-42.35],[-1.05,-41.30],[2.55,-41.15]],.517);
    // The north branch ends behind the anchor, leaving sand beneath its low fluke.
    lane([[-9.03,-52.15],[-7.20,-52.10],[-4.65,-51.65],[-1.95,-50.15],[1.65,-49.85]],.484);
    lane([[.30,-40.70],[1.8,-39.80],[2.4,-38.30],[4.35,-35.15],[5.10,-33.50],
      [6.15,-32.90],[8.25,-32.75],[11.55,-34.85],[13.80,-38.45],[16.64,-41.82],[17.10,-42.82],[17.02,-43.55],
      [16.20,-44.90],[15.15,-49.10],[14.4,-51.80],[14.10,-54.50],[12.75,-55.55],
      [11.85,-55.55],[9.45,-56.30],[8.40,-55.55],[6.90,-54.35],[4.50,-54.65],
      [2.10,-53.75],[1.65,-53.30]],.508);
    lane([[3.60,-44.15],[5.70,-43.40],[8.40,-43.70],[11.10,-44.60],[13.35,-45.50],[16.20,-44.90]],.438);
    if(lanes) {
      for(const {samples,width} of streets) {
        lanes.push(samples.map(([x,z])=>({x,z,width})));
        // Keep the building variations identical to the standalone road mesh.
        for(let i=0;i<4*(samples.length-1);i++) random();
      }
    } else {
      drawStreets();
    }

    lighthouse(-.60,-45.50);
    anchor(-6.30,-48.50);
    orchidTower(7.20,-51.70);

    const sites=[
      // West shore. The open arc to its east exposes both faces of the anchor.
      [-15.28,-44.91,.70,1.85,1],[-12.78,-46.43,.99,3.23,21],[-14.65,-47.72,.77,2.33,2],
      [-16.21,-49.27,.68,2.69,0],[-12.35,-49.53,.88,2.70,0],[-10.47,-50.28,.71,2.06,6],
      [-14.26,-52.01,.77,3.17,5],[-12.19,-53.28,.58,2.30,1],

      // The northern ridge is visible through gaps in the lower neighborhoods.
      [-10.55,-55.48,.87,3.32,6],[-8.22,-54.35,.62,2.24,1],[-6.38,-55.15,.93,3.99,18],
      [-4.15,-54.37,.68,2.79,2],[-2.61,-52.74,.63,2.18,5],
      [-10.40,-58.21,.64,2.45,1],[-7.57,-58.59,.79,3.15,2],[-3.74,-58.20,.77,3.41,0],
      [-.78,-56.89,.67,2.67,6],[2.43,-57.95,.78,3.20,1],

      // A staggered headland projects toward the viewer on the east.
      [6.52,-34.81,.98,2.58,16],[8.34,-36.36,.81,2.95,20],[5.53,-38.38,.73,2.15,1],
      [8.14,-39.55,1.09,3.78,18],[10.27,-38.89,.76,2.56,3],[11.91,-41.19,1.03,3.16,23],
      [4.46,-41.96,.53,1.88,5],[12.85,-42.78,.57,2.11,1],[14.55,-43.55,.85,2.59,25],
      [10.58,-42.25,.67,1.98,6],

      // The flower-tower neighborhood opens onto two small lanes.
      [4.57,-46.46,.71,2.51,0],[6.09,-45.87,.65,2.12,1],[8.1,-46.30,.80,2.98,5],
      [10.76,-47.18,.62,2.28,0],[13.25,-47.67,.83,3.39,2],[11.11,-49.90,.68,2.66,6],
      [8.77,-50.11,.57,1.99,1],[4.47,-51.06,.66,2.25,2],[10.04,-54.09,.75,2.91,1],
      [12.34,-53.81,.75,3.01,5],[6.45,-56.32,.66,2.83,2]
    ];
    sites.forEach(([x,z,r,h,style])=>tower(x,z,r,h,style,sites));
    const stoneColors=[[.35,.39,.34],[.35,.42,.45],[.49,.45,.35],[.33,.38,.38]];
    const roadside=[
      [-2.88,-37.92,.105,.072,.045,1.06,2],[-3.24,-38.16,.251,.144,.116,.58,1],
      [-3.63,-38.39,.174,.101,.064,2.34,0],[-3.55,-37.86,.135,.104,.102,-.19,3],
      [1.78,-42.89,.19,.11,.089,1.4,1],[2.13,-43.12,.102,.079,.059,.36,3],
      [-7.06,-41.44,.20,.12,.11,1.12,2],[-7.28,-41.69,.09,.06,.052,2.1,0],
      [2.48,-49.82,.18,.14,.073,.58,1],[-11.35,-43.32,.21,.12,.085,1.68,3],
      [-13.17,-51.50,.17,.10,.088,1.49,0],[-12.84,-51.83,.095,.062,.035,.91,3],
      [5.02,-39.73,.22,.11,.083,1.57,1],[13.07,-43.91,.19,.13,.103,1.11,0],
      [15.25,-49.66,.21,.15,.086,.14,2],[2.03,-55.82,.19,.095,.081,-.95,3],
      [-5.10,-53.88,.16,.13,.095,1.62,1],[7.02,-55.65,.24,.13,.086,.44,2]
    ];
    roadside.forEach(([x,z,rx,rz,height,angle,color],index)=>{
      const edge=Math.max(rx,rz)*1.24+.24;
      const clear=streets.every(({samples,width})=>samples.every(([u,v])=>
        (u-x)**2+(v-z)**2>(width+edge)**2));
      if(clear) pebble(x,z,rx,rz,height,angle,stoneColors[color],index*1.78);
    });
    const lamps=[[-2.88,-38.55],[.73,-39.31],[-6.56,-40.47],[6.65,-39.33],[-12.8,-44.7],
      [13.41,-43.56],[-3.31,-47.5],[-5.08,-52.82],[2.97,-53.03],[10.72,-51.12]];
    lamps.forEach(([x,z],index)=>streetLight(x,z,index%4!==3,index<2));

    return colliders;
  };
})();
