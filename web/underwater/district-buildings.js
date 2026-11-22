(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const steel = 24, wood = 10, enamel = 22, windowGlass = 23, paint = 13;
  const navy = [.12,.22,.28], nickel = [.44,.58,.58], brass = [.74,.50,.23];
  const copper = [.48,.29,.16], warm = [.97,.67,.26], seaGlass = [.30,.67,.74];
  const lerp = (a,b,t) => a+(b-a)*t;
  const shade = (c,t) => c.map(v=>v*t);

  const plans = {
    market:{halfWidth:3.28,halfDepth:2.34,front:3.05,height:4.75},
    busStop:{halfWidth:1.92,halfDepth:1.14,front:1.36,height:2.98,throughWidth:2.51},
    theater:{halfWidth:3.15,halfDepth:2.15,front:2.9,height:5.20},
    gloveGate:{halfWidth:3.15,halfDepth:1.2,front:1.2,height:4.50,throughWidth:3.60},
    gloveWheel:{halfWidth:2.45,halfDepth:1.05,front:1.05,height:4.95},
    shell:{halfWidth:2.3,halfDepth:1.95,front:1.95,height:3.35,throughWidth:2.3},
    can:{halfWidth:1.16,halfDepth:1.20,front:1.67,height:3.71},
    workshop:{halfWidth:1.84,halfDepth:1.35,front:1.97,height:3.42},
    observatory:{halfWidth:1.49,halfDepth:1.49,front:1.94,height:3.66}
  };
  const aliases = {home:'can',store:'workshop',pump:'observatory',kiosk:'shell'};
  window.districtBuildingPlans=plans;

  window.buildDistrictBuilding = function buildDistrictBuilding(mesh,seabedFloor,spec) {
    const kind=aliases[spec.kind]||spec.kind;
    const plan=plans[kind];
    if(!Object.hasOwn(plans,kind)) return [];
    const {x,z,angle=0,scale=1,variant=0}=spec;
    const c=Math.cos(angle),s=Math.sin(angle);
    const colliders=[];
    let base=seabedFloor(x,z)+.085*scale;
    for(let i=0;i<16;i++){
      const t=i*TAU/16,u=Math.cos(t)*plan.halfWidth*.66,v=Math.sin(t)*plan.halfDepth*.66;
      base=Math.max(base,seabedFloor(x+(u*c+v*s)*scale,z+(v*c-u*s)*scale)+.065*scale);
    }
    function loc(u,h,v) {return [x+(u*c+v*s)*scale,base+h*scale,z+(v*c-u*s)*scale];}
    function grade(u,v) {
      const [a,,b]=loc(u,0,v);
      return (seabedFloor(a,b)-base)/scale;
    }
    function face(a,b,d,color,material=enamel) {
      mesh.triangle(loc(...a),loc(...b),loc(...d),color,material);
    }
    function quad(a,b,d,e,color,material=enamel) {
      face(a,b,d,color,material);
      face(a,d,e,color,material);
    }
    function smooth(p,n,c0,m,detail=0){
      mesh.vertex(loc(...p),[n[0]*c+n[2]*s,n[1],n[2]*c-n[0]*s],c0,m,detail);
    }
    function box(u,h,v,w,height,d,color,material=enamel) {
      const a=w*.5,b=height*.5,e=d*.5;
      const ps=[[-a,-b,-e],[a,-b,-e],[a,b,-e],[-a,b,-e],[-a,-b,e],[a,-b,e],[a,b,e],[-a,b,e]]
        .map(([i,j,k])=>[u+i,h+j,v+k]);
      for(const [i,j,k,l] of [[0,3,2,1],[4,5,6,7],[0,4,7,3],[5,1,2,6],[3,7,6,2],[0,1,5,4]]) {
        quad(ps[i],ps[j],ps[k],ps[l],color,material);
      }
    }
    function tube(a,b,r,color,material=steel,sides=10,endRadius=r) {
      const d=b.map((v,i)=>v-a[i]),length=Math.hypot(...d);
      if(length<1e-6)return;
      const n=d.map(v=>v/length);
      const tangent=Math.abs(n[1])>.97?[1,0,0]:[-n[2],0,n[0]];
      const mag=Math.hypot(...tangent),u=tangent.map(v=>v/mag);
      const v=[n[1]*u[2]-n[2]*u[1],n[2]*u[0]-n[0]*u[2],n[0]*u[1]-n[1]*u[0]];
      function ring(p,radius){
        return Array.from({length:sides},(_,i)=>{
          const t=i*TAU/sides;
          return p.map((value,j)=>value+radius*(u[j]*Math.cos(t)+v[j]*Math.sin(t)));
        });
      }
      const low=ring(a,r), high=ring(b,endRadius);
      for(let i=0;i<sides;i++){
        const j=(i+1)%sides;
        quad(low[i],low[j],high[j],high[i],color,material);
        face(a,low[j],low[i],color,material);
        face(b,high[i],high[j],color,material);
      }
    }
    function lathe(u,h,v,rows,color,material=enamel,sides=22,depth=1) {
      function vertex(j,i,tone) {
        const a=i*TAU/sides, [y,r]=rows[j];
        const prev=rows[Math.max(0,j-1)],next=rows[Math.min(rows.length-1,j+1)];
        const n=[Math.cos(a)*(next[0]-prev[0]),prev[1]-next[1],Math.sin(a)*(next[0]-prev[0])/depth];
        const mag=Math.hypot(...n)||1;
        smooth([u+Math.cos(a)*r,h+y,v+Math.sin(a)*r*depth],n.map(v=>v/mag),tone,material);
      }
      for(let j=1;j<rows.length;j++)for(let i=0;i<sides;i++){
        const k=(i+1)%sides, tone=shade(color,1+.04*Math.sin(i*1.98));
        if(rows[j][1]>0){vertex(j-1,i,tone);vertex(j,i,tone);vertex(j,k,tone);}
        if(rows[j-1][1]>0){vertex(j-1,i,tone);vertex(j,k,tone);vertex(j-1,k,tone);}
      }
    }
    function skirt(rx,rz,height,color,material=enamel) {
      const n=24;
      const row=Array.from({length:n},(_,i)=>{
        const angle=i*TAU/n,a=Math.cos(angle)*rx,b=Math.sin(angle)*rz;
        return [[a,grade(a,b)-.13,b],[a,height-.11,b],[a*.95,height,b*.95]];
      });
      for(let i=0;i<n;i++) {
        const j=(i+1)%n,[a,b,d]=row[i],[e,f,g]=row[j];
        quad(a,b,f,e,shade(color,.93),material);
        quad(b,d,g,f,color,material);
        face([0,height,0],g,d,color,material);
      }
    }
    function slab(rx,rz,height,color,material=enamel) {
      const points=[[-rx,-rz],[rx,-rz],[rx,rz],[-rx,rz]];
      const top=points.map(([u,v])=>[u,height,v]);
      quad(top[3],top[2],top[1],top[0],color,material);
      for(let i=0;i<4;i++){
        const j=(i+1)%4,a=top[i],b=top[j];
        quad([a[0],grade(a[0],a[2])-.14,a[2]],a,b,[b[0],grade(b[0],b[2])-.14,b[2]],color,material);
      }
    }
    function steps(u,v,w,depth,top,material=steel,color=nickel) {
      const start=v,end=v+depth, far=grade(u,end)+.058;
      for(let i=0;i<3;i++){
        const front=lerp(start,end,(i+1)/3),back=lerp(start,end,i/3)-.02;
        const height=lerp(top,far,i/2);
        const rows=[[-1,back],[1,back],[1,front],[-1,front]].map(([side,z0])=>{
          const x0=u+w*.5*side;
          return [[x0,Math.min(grade(x0,z0)-.06,height-.06),z0],[x0,height,z0]];
        });
        quad(rows[3][1],rows[2][1],rows[1][1],rows[0][1],color,material);
        for(let j=0;j<4;j++){
          const k=(j+1)%4;
          quad(rows[j][0],rows[j][1],rows[k][1],rows[k][0],shade(color,.71),material);
        }
      }
    }
    function porthole(u,h,v,bearing,r,frame=nickel,glazing=seaGlass) {
      const dx=Math.sin(bearing),dz=Math.cos(bearing),normal=[dx,0,dz], n=18;
      function circle(depth,radius) {
        return Array.from({length:n},(_,i)=>{
          const a=i*TAU/n;
          return [u+dx*depth+dz*Math.cos(a)*radius,h+Math.sin(a)*radius,
            v+dz*depth-dx*Math.cos(a)*radius];
        });
      }
      const back=circle(-.09,r*1.21),outer=circle(.115,r*1.22);
      const rim=circle(.17,r*1.15), inner=circle(.162,r*.88);
      const center=[u+dx*.176,h,v+dz*.176];
      for(let i=0;i<n;i++){
        const j=(i+1)%n;
        quad(back[j],outer[j],outer[i],back[i],shade(frame,.68),steel);
        quad(outer[i],outer[j],rim[j],rim[i],frame,steel);
        quad(rim[i],rim[j],inner[j],inner[i],shade(frame,1.11),steel);
        smooth(center,normal,glazing,windowGlass,0);
        smooth(inner[i],normal,glazing,windowGlass,1);
        smooth(inner[j],normal,glazing,windowGlass,1);
      }
      for(let i=0;i<6;i++){
        const a=i*TAU/6;
        const x0=u+dz*Math.cos(a)*r*1.032, y0=h+Math.sin(a)*r*1.032, z0=v-dx*Math.cos(a)*r*1.032;
        tube([x0+dx*.161,y0,z0+dz*.161],[x0+dx*.187,y0,z0+dz*.187],r*.046,brass,steel,6);
      }
    }
    function door(u,h,v,w,height,frame,panel,material=steel,peephole=false) {
      function outline(width,high,low,depth){
        const r=width/2;
        return [[u-r,h+low,depth],[u+r,h+low,depth],...Array.from({length:13},(_,i)=>{
          const a=i*Math.PI/12;
          return [u+Math.cos(a)*r,h+low+high-r+Math.sin(a)*r,depth];
        })];
      }
      const back=outline(w,height,0,v-.23);
      const rim=outline(w,height,0,v+.111),inset=outline(w*.79,height*.91,.03,v+.104);
      const inner=outline(w*.77,height*.90,.035,v+.053);
      for(let i=0;i<rim.length;i++){
        const j=(i+1)%rim.length;
        quad(back[i],back[j],rim[j],rim[i],shade(frame,.66));
        quad(rim[i],rim[j],inset[j],inset[i],frame,steel);
        quad(inset[i],inset[j],inner[j],inner[i],shade(frame,.47),steel);
      }
      for(let i=1;i<inner.length-1;i++) face(inner[0],inner[i],inner[i+1],panel,material);
      box(u,h+.038,v+.105,w*1.03,.077,.16,frame,steel);
      for(const f of [-1,1]){
        box(u-f*w*.33,h+height*.36,v+.077,.035,height*.43,.027,shade(panel,.61),material);
        box(u-f*w*.31,h+height*.38,v+.086,.092,.074,.034,frame,steel);
      }
      if(peephole)porthole(u,h+height*.65,v+.016,0,w*.168,frame,[.54,.64,.56]);
      box(u+w*.23,h+height*.46,v+.095,.098,.045,.044,brass,steel);
    }
    function obstacle(u,v,r,y) {
      const [ox,,oz]=loc(u,0,v);
      colliders.push({x:ox,z:oz,radius:r*scale,top:base+y*scale});
    }
    const letters={
      A:['01110','11011','10001','11111','10001','10001','10001'],
      B:['11110','10001','10001','11110','10001','10001','11110'],
      G:['01111','10000','10000','10111','10001','10001','01111'],
      M:['10001','11011','10101','10101','10001','10001','10001'],
      N:['10001','11001','11001','10101','10011','10011','10001'],
      O:['01110','11011','10001','10001','10001','11011','01110'],
      P:['11110','10001','10001','11110','10000','10000','10000'],
      R:['11110','10001','10001','11110','10010','10001','10001'],
      S:['01111','10000','10000','01110','00001','00001','11110'],
      T:['11111','00100','00100','00100','00100','00100','00100'],
      U:['10001','10001','10001','10001','10001','10001','01110'],
      '-':['00000','00000','00000','01110','00000','00000','00000'],
      "'":['00100','00100','01000','00000','00000','00000','00000']
    };
    function inscription(text,u,h,v,size,color) {
      const left=u-((text.length*6)-1)*size*.5;
      for(let k=0;k<text.length;k++){
        const glyph=letters[text[k]];
        if(!glyph) continue;
        for(let row=0;row<glyph.length;row++){
          const y=h-row*size;
          for(let i=0;i<5;){
            if(glyph[row][i]==='0'){i++;continue;}
            let next=i+1;
            while(glyph[row][next]==='1') next++;
            const a=left+(k*6+i)*size,b=left+(k*6+next)*size-.001;
            quad([a,y-size,v],[b,y-size,v],[b,y,v],[a,y,v],color,paint);
            i=next;
          }
        }
      }
    }

    function market() {
      const timber=[.48,.30,.16], dark=[.28,.19,.13], honey=[.69,.48,.22], parchment=[.87,.75,.50];
      const w=3.18, rz=2.22, cornice=2.70, cap=1.05;
      slab(3.25,2.31,.14,[.43,.38,.31]);
      box(0,.27,0,6.36,.22,4.37,dark,wood);
      box(0,1.44,-rz,6.35,2.41,.14,timber,wood);
      box(0,2.37,rz,6.39,.67,.18,timber,wood);
      for(const side of [-1,1]){
        box(side*3.113,1.43,0,.19,2.40,4.48,timber,wood);
        box(side*2.62,1.30,rz,1.19,1.78,.18,timber,wood);
        box(side*1.57,.30,rz-.10,1.14,.21,.42,dark,wood);
        box(side*1.54,1.26,rz,.99,1.32,.135,copper,steel);
        box(side*1.54,1.25,rz+.081,.86,1.19,.039,[.78,.59,.30],paint);
        for(let j=-1;j<=1;j++){
          box(side*1.54+j*.24,1.25,rz+.109,.033,1.17,.033,honey,steel);
        }
        box(side*1.54,.70,rz+.189,1.03,.103,.24,dark,wood);
        box(side*.966,1.20,rz,.095,1.94,.23,honey,steel);
        box(side*.47,1.16,rz+.022,.86,1.72,.077,navy,steel);
        box(side*.47,1.33,rz+.067,.70,1.25,.028,[.64,.61,.34],paint);
        box(side*.47,.31,rz+.079,.81,.106,.045,honey,steel);
        box(side*.16,1.10,rz+.102,.055,.157,.038,honey,steel);
        for(let j=0;j<7;j++){
          const y=.39+j*.32;
          box(side*3.220,y,0,.024,.018,4.42,dark,wood);
          if(j>0)box(side*2.65,y,rz+.10,1.01,.017,.021,dark,wood);
        }
      }
      box(0,1.17,rz+.07,.064,1.77,.077,honey,steel);
      box(0,2.10,rz+.072,1.78,.117,.18,honey,steel);
      box(0,2.16,rz+.055,6.33,.043,.211,dark,wood);
      function crest(a,u,more=0){return [u,cornice+Math.sin(a)*(cap+more),Math.cos(a)*(rz+more)];}
      for(let j=0;j<23;j++){
        const a=j*Math.PI/23,b=(j+1)*Math.PI/23;
        const tone=shade(timber,.91+.14*Math.sin(j*2.16)+.13*Math.sin(j*.3));
        quad(crest(a,-w),crest(a,w),crest(b,w),crest(b,-w),tone,wood);
        quad(crest(a,-w,.011),crest(a,w,.011),crest(a+.009,w,.012),crest(a+.009,-w,.012),dark,wood);
        face([-w,cornice,0],crest(a,-w),crest(b,-w),tone,wood);
        face([w,cornice,0],crest(b,w),crest(a,w),tone,wood);
        for(const q of [-2.82,2.82]){
          const ar=q-.136,br=q+.155;
          quad(crest(a,ar,.061),crest(a,br,.061),crest(b,br,.061),crest(b,ar,.061),shade(honey,.73+.24*Math.sin(a)),steel);
          if(j%3===1){
            const m=(a+b)*.5;
            tube(crest(m,q,.062),crest(m,q,.096),.050,honey,steel,8);
          }
        }
      }
      for(const q of [-2.82,2.82]){
        box(q,1.43,rz+.16,.294,2.54,.153,shade(honey,.85),steel);
        box(q,1.39,-rz-.06,.29,2.54,.105,shade(honey,.75),steel);
        for(const h of [.43,1.09,1.73,2.39]){
          tube([q,h,rz+.238],[q,h,rz+.261],.053,shade(honey,1.18),steel,8);
        }
      }
      box(0,2.69,rz+.059,6.40,.165,.19,shade(honey,.82),steel);
      // The over-sized lock bridges the lid seam above the entrance.
      const lockZ=rz+.182;
      box(0,2.66,lockZ,.60,.68,.20,shade(honey,.72),steel);
      box(0,2.66,lockZ+.111,.461,.50,.036,shade(honey,1.11),steel);
      tube([0,2.72,lockZ+.134],[0,2.72,lockZ+.145],.082,[.13,.14,.14],paint,14);
      quad([-.059,2.54,lockZ+.149],[.059,2.54,lockZ+.149],[.031,2.716,lockZ+.149],
        [-.031,2.716,lockZ+.149],[.13,.14,.14],paint);

      const signY=4.23,signZ=1.52;
      for(const side of [-1,1]){
        tube([side*1.37,3.51,1.18],[side*1.37,signY+.26,signZ-.036],.048,dark,steel,8);
      }
      const signShape=[[-1.82,-.282],[-1.83,.315],[-1.35,.354],[-.74,.321],[-.23,.342],
        [.42,.287],[.97,.324],[1.82,.282],[1.82,-.260],[1.16,-.323],[.35,-.313],[-.34,-.371],[-1.05,-.308]];
      for(let i=0;i<signShape.length;i++){
        const j=(i+1)%signShape.length,a=signShape[i],b=signShape[j];
        face([0,signY,signZ],[b[0],signY+b[1],signZ],[a[0],signY+a[1],signZ],parchment,paint);
        face([0,signY,signZ-.06],[a[0],signY+a[1],signZ-.06],[b[0],signY+b[1],signZ-.06],shade(parchment,.64),wood);
        quad([a[0],signY+a[1],signZ],[b[0],signY+b[1],signZ],[b[0],signY+b[1],signZ-.06],
          [a[0],signY+a[1],signZ-.06],honey,wood);
      }
      for(const side of [-1,1]){
        tube([side*1.84,signY-.34,signZ],[side*1.84,signY+.38,signZ],.112,shade(parchment,.82),wood,17);
        tube([side*1.84,signY-.349,signZ],[side*1.84,signY-.335,signZ],.081,honey,steel,14);
      }
      inscription("BARG'N-MART",0,signY+.152,signZ+.007,.050,[.32,.19,.11]);
      for(const [u,h] of [[-1.60,signY-.215],[1.49,signY-.208]]){
        tube([u-.068,h,signZ+.011],[u+.068,h,signZ+.011],.013,[.56,.30,.15],paint,6);
        tube([u,h-.059,signZ+.011],[u,h+.059,signZ+.011],.013,[.56,.30,.15],paint,6);
      }

      steps(0,2.31,1.93,.69,.34,enamel,[.52,.49,.40]);
      // A steel-wire cart and its wheels sit on the small shop apron.
      const u=2.69,v=2.53, py=grade(u,v)+.092;
      const rail=(x1,y1,z1,x2,y2,z2,r=.019,color=nickel)=>
        tube([u+x1,py+y1,v+z1],[u+x2,py+y2,v+z2],r,color,steel,6);
      for(const side of [-1,1]){
        const l=side*.222;
        rail(l,0,-.29,l,0,.21,.024);
        rail(l,0,.17,l,.35,.30);
        rail(l,0,-.23,l,.52,-.28);
        rail(l,.37,.30,l,.52,-.32,.025);
        rail(l,.52,-.32,l,.70,-.40,.023);
        for(const z of [-.24,.12]) tube([u+l-.031,py-.004,v+z],[u+l+.031,py-.004,v+z],.068,navy,steel,10);
        for(let j=0;j<5;j++){
          const z=lerp(-.26,.27,j/4);
          rail(l*.77,.250,z,l,lerp(.488,.373,j/4),z);
        }
      }
      rail(-.23,.70,-.40,.23,.70,-.40,.027,[.65,.38,.20]);
      rail(-.21,.37,.30,.21,.37,.30,.025);
      for(const q of [-.19,-.09,.03,.15])rail(q,.25,-.25,q,.25,.27,.014);
      for(const at of [-1.68,0,1.68]) for(const z0 of [-.99,1.02])obstacle(at,z0,1.43,3.67);
    }

    function busStop() {
      const frame=[.23,.47,.47], rim=[.50,.69,.63], roof=[.29,.60,.53];
      const brick=[.54,.41,.29], coal=[.13,.24,.27], gold=[.83,.66,.24];
      slab(1.66,1.06,.055,[.41,.43,.39]);
      for(const u of [-1.37,1.37])for(const v of [-.83,.74]){
        tube([u,grade(u,v)-.05,v],[u,2.06,v],.067,frame,steel,12);
        tube([u,.027,v],[u,.17,v],.113,coal,steel,12,.089);
        obstacle(u,v,.115,2.12);
      }
      box(0,2.00,-.79,2.80,.102,.091,rim,steel);
      box(0,2.01,.80,2.82,.111,.112,rim,steel);
      for(let i=0;i<12;i++){
        const a=-1.10+i*2.24/12,b=a+2.24/12;
        const h=v=>2.06+.285*(1-(v/1.14)**2)+.014*Math.sin(v*11);
        quad([-1.67,h(b),b],[1.66,h(b),b],[1.66,h(a),a],[-1.67,h(a),a],shade(roof,.82+.17*(i%2)),enamel);
        quad([1.66,h(b)-.069,b],[-1.67,h(b)-.069,b],[-1.67,h(a)-.069,a],[1.66,h(a)-.069,a],frame,steel);
        for(const sign of [-1,1]){
          quad([sign*1.66,h(a)-.069,a],[sign*1.66,h(a),a],[sign*1.66,h(b),b],[sign*1.66,h(b)-.069,b],rim,steel);
        }
      }
      box(0,1.943,1.106,3.34,.13,.088,frame,steel);
      box(0,1.95,-1.04,3.34,.115,.089,frame,steel);
      box(0,1.19,-.817,2.72,1.21,.051,[.32,.63,.64],windowGlass);
      box(0,1.20,-.781,.052,1.21,.07,rim,steel);
      box(0,.57,-.78,2.73,.076,.065,rim,steel);
      box(0,1.81,-.78,2.73,.082,.065,rim,steel);
      box(0,.535,-.57,2.22,.095,.39,brick,wood);
      box(0,.77,-.734,2.22,.23,.106,brick,wood);
      for(const u of [-.91,.91]) {
        box(u,.29,-.57,.069,.44,.24,frame,steel);
      }
      box(.79,1.46,-.775,.70,.52,.040,coal,steel);
      box(.79,1.46,-.751,.618,.441,.013,[.70,.72,.51],paint);
      const map=[ [.60,1.30],[.65,1.51],[.91,1.48],[.99,1.58] ];
      for(let i=1;i<map.length;i++){
        const [x0,y0]=map[i-1],[x1,y1]=map[i];
        tube([x0,y0,-.739],[x1,y1,-.739],.018,[.31,.45,.38],paint,6);
      }
      const u=-1.76,v=1.15, baseY=grade(u,v);
      tube([u,baseY-.07,v],[u,2.72,v],.048,frame,steel,11);
      tube([u,baseY-.035,v],[u,baseY+.105,v],.121,coal,steel,10);
      box(u,2.38,v,.292,.47,.103,shade(gold,.86),steel);
      box(u,2.38,v+.060,.225,.379,.014,[.90,.72,.30],paint);
      box(u,2.43,v+.071,.137,.087,.014,coal,paint);
      box(u,2.435,v+.080,.104,.040,.013,[.71,.84,.77],paint);
      for(const a of [-.051,.051]) tube([u+a,2.370,v+.079],[u+a,2.370,v+.09],.019,coal,paint,8);
      box(0,2.25,1.111,1.68,.43,.103,frame,steel);
      box(0,2.25,1.173,1.58,.35,.017,[.66,.76,.56],paint);
      inscription('BUS STOP',0,2.374,1.184,.035,[.12,.26,.24]);
      const at=grade(-1.76,1.15);
      obstacle(-1.76,1.15,.13,Math.max(at+.13,2.68));
    }
    function shell() {
      const shellPink=[.74,.50,.48], sand=[.51,.52,.47], crest=[.64,.54,.33];
      skirt(2.18,1.82,.033,sand);
      for(const x0 of [-1.45,1.45]){
        for(const z0 of [-.98,1.02]){
          tube([x0,grade(x0,z0)-.12,z0],[x0,2.18,z0],.095,crest,wood,11,.071);
          tube([x0,0,z0],[x0,.20,z0],.169,navy,steel,10,.145);
          tube([x0,1.91,z0],[x0,2.08,z0],.111,brass,steel,10);
          obstacle(x0,z0,.17,2.15);
        }
      }
      function lip(theta,t,offset=0){
        const u=2.26*Math.sin(theta)*t;
        const v=-1.72+3.50*Math.cos(theta*.64)*t;
        const rise=.99*Math.sin(Math.PI*t*.93)*Math.pow(Math.cos(theta*.43),2);
        const rib=.090*Math.cos(theta*33)*Math.sin(Math.PI*t*.7)*t;
        return [u,2.18+rise+rib+offset,v];
      }
      for(let j=0;j<16;j++) for(let i=0;i<42;i++){
        const a=-1.43+2.86*i/42,b=a+2.86/42,p=j/16,q=(j+1)/16;
        const c0=shade(shellPink,1+.12*Math.cos((a+b)*16.5));
        if(j===0) {
          face(lip(a,p),lip(a,q),lip(b,q),c0,paint);
          face(lip(a,p,-.085),lip(b,q,-.085),lip(a,q,-.085),shade(c0,.77),paint);
        } else {
          quad(lip(a,p),lip(a,q),lip(b,q),lip(b,p),c0,paint);
          quad(lip(a,p,-.085),lip(b,p,-.085),lip(b,q,-.085),lip(a,q,-.085),shade(c0,.78),paint);
        }
        if(j===15)quad(lip(a,q,-.085),lip(a,q),lip(b,q),lip(b,q,-.085),[.81,.64,.46],paint);
      }
      tube([-1.43,2.02,-.93],[1.43,2.02,-.93],.069,crest,wood,10);
      tube([0,2.1,-.98],[0,1.67,-.98],.050,crest,wood,7);
      lathe(0,1.52,-.98,[[0,.103],[.16,.128],[.22,.104]],[.83,.68,.41],windowGlass,12);
    }

    const buildingPalette=[[.27,.53,.59],[.44,.38,.56],[.58,.39,.23],[.33,.53,.42],[.49,.41,.27]];

    function can() {
      const color=buildingPalette[(variant+25)%5], accent=shade(color,1.34);
      skirt(1.15,1.15,.11,shade(color,.79));
      lathe(0,0,0,[[.06,1.015],[.24,1.02],[1.07,.89],[2.34,1],[2.63,1.01]],color,enamel,24);
      for(const [h,r] of [[.29,1.019],[1.48,.944],[2.43,1.015]]){
        lathe(0,0,0,[[h-.034,r],[h-.018,r+.053],[h+.024,r+.061],[h+.041,r]],shade(color,.66),steel,24);
      }
      lathe(0,0,0,[[2.59,1.06],[2.67,1.115],[2.77,1.10],[2.89,.82],[2.96,.33],[2.98,0]],accent,enamel,26);
      tube([.24,2.91,-.14],[.24,3.20,-.14],.104,accent,steel,10);
      tube([.24,3.20,-.14],[.405,3.45,-.14],.11,accent,steel,10,.156);
      tube([.39,3.43,-.14],[.45,3.52,-.14],.137,navy,steel,10);
      door(0,.18,.989,.67,1.17,shade(color,.73),shade(color,.56),enamel,true);
      steps(0,1.04,.73,.59,.20,enamel,[.47,.48,.40]);
      for(const [a,h,r,depth] of [[-.46,1.91,.239,1.00],[.96,1.39,.185,.96],[2.78,1.94,.204,1.00]]) {
        porthole(Math.sin(a)*depth,h,Math.cos(a)*depth,a,r,shade(accent,.94),seaGlass);
      }
      obstacle(0,0,1.10,3.0);
    }

    function workshop() {
      const color=buildingPalette[(variant+27)%5], trim=shade(color,.67);
      slab(1.77,1.34,.13,shade(color,.70));
      box(0,1.23,0,3.27,2.22,2.56,color,enamel);
      for(const u of [-1.59,1.59]) for(const v of [-1.23,1.24]) {
        box(u,1.32,v,.18,2.28,.18,trim,steel);
      }
      const roof=shade(color,.74);
      const a=[-1.76,2.27,-1.34],b=[1.76,2.27,-1.34],c=[1.76,2.27,1.34],d=[-1.76,2.27,1.34];
      const p=[-1.76,2.91,0],q=[1.76,2.91,0];
      quad(d,c,q,p,roof,steel);
      quad(b,a,p,q,shade(roof,.96),steel);
      face(a,d,p,trim,enamel);
      face(c,b,q,trim,enamel);
      tube(p,q,.059,shade(color,1.31),steel,8);
      for(const u of [-1.20,-.55,.1,.75,1.40]){
        tube([u,2.298,1.34],[u,2.95,0],.019,shade(color,1.2),steel,6);
        tube([u,2.298,-1.34],[u,2.95,0],.019,shade(color,1.18),steel,6);
      }
      tube([-1.16,2.44,-.51],[-1.16,3.17,-.51],.125,nickel,steel,11);
      tube([-1.16,3.12,-.51],[-1.16,3.30,-.51],.168,navy,steel,11,.13);
      door(-.67,.17,1.29,.79,1.49,shade(color,.73),shade(color,.53),steel);
      steps(-.67,1.38,.86,.56,.20,enamel,[.46,.43,.33]);
      const frame=shade(color,1.13);
      box(.65,1.31,1.31,1.03,.75,.09,frame,steel);
      box(.65,1.31,1.368,.87,.61,.014,[.88,.65,.33],paint);
      box(.64,1.31,1.384,.071,.66,.028,navy,steel);
      box(.65,1.36,1.395,.92,.032,.034,nickel,steel);
      box(.65,1.70,1.38,1.18,.15,.26,frame,steel);
      for(const v of [-.45,.44])porthole(1.641,1.53,v,Math.PI*.5,.186,frame,seaGlass);
      porthole(-1.49,1.52,.38,-Math.PI*.5,.199,frame,seaGlass);
      porthole(-.63,1.53,-1.139,Math.PI,.232,frame,seaGlass);
      box(-1.644,1.11,-.49,.043,.64,.76,trim,steel);
      box(-1.670,1.11,-.49,.015,.52,.63,navy,enamel);
      box(.59,1.11,-1.287,.88,.62,.041,trim,steel);
      box(.59,1.11,-1.310,.74,.49,.015,navy,enamel);
      for(let i=0;i<5;i++){
        const h=.922+i*.093;
        box(-1.683,h,-.49,.021,.035,.62,frame,steel);
        box(.59,h,-1.320,.72,.035,.020,frame,steel);
      }
      obstacle(-.72,0,1.19,2.62);
      obstacle(.72,0,1.19,2.62);
    }

    function observatory() {
      const color=buildingPalette[(variant+25)%5], frame=[.31,.47,.48];
      skirt(1.43,1.43,.096,shade(color,.68));
      lathe(0,0,0,[[.08,1.27],[.25,1.36],[.38,1.36],[.50,1.28]],color,enamel,28);
      lathe(0,0,0,[[.42,1.24],[.57,1.29],[1.52,1.31],[1.70,1.32]],color,enamel,28);
      lathe(0,0,0,[[1.65,1.32],[1.73,1.40],[1.89,1.41],[1.94,1.31]],frame,steel,30);
      const dome=[[1.91,1.24],[2.12,1.22],[2.38,1.15],[2.59,.96],[2.82,.74],[2.97,.46],[3.07,.23],[3.09,0]];
      lathe(0,0,0,dome,[.33,.68,.72],windowGlass,34);
      for(let i=0;i<8;i++){
        const a=i*TAU/8;
        for(let j=1;j<dome.length-1;j++){
          const [h,r]=dome[j-1],[g,t]=dome[j];
          tube([Math.sin(a)*(r+.015),h,Math.cos(a)*(r+.015)],[Math.sin(a)*(t+.015),g,Math.cos(a)*(t+.015)],.031,frame,steel,7);
        }
      }
      lathe(0,0,0,[[2.97,.22],[3.06,.27],[3.15,.24],[3.19,.18]],frame,steel,16);
      tube([0,3.14,0],[0,3.55,0],.039,brass,steel,7);
      tube([-.22,3.46,0],[.22,3.46,0],.031,brass,steel,7);
      door(0,.14,1.30,.73,1.21,frame,shade(color,.65),steel,true);
      steps(0,1.36,.82,.56,.184,enamel,[.47,.49,.44]);
      for(const a of [-1.24,1.12,2.81])porthole(Math.sin(a)*1.29,1.19,Math.cos(a)*1.29,a,.23,frame,warm);
      obstacle(0,0,1.39,3.20);
    }

    if(kind==="theater" || kind==="gloveGate" || kind==="gloveWheel") {
      if(!window.buildSignatureLandmark) return [];
      window.buildSignatureLandmark(kind,{loc,grade,quad,face,smooth,box,tube,lathe,skirt,slab,steps,porthole,door,angle});
      if(kind==="theater")obstacle(0,0,2.35,4.48);
      else if(kind==="gloveGate") for(const post of [-2.18,2.18])obstacle(post,0,.38,2.65);
      else obstacle(0,0,1.45,4.78);
    } else {
      const builders={market,busStop,shell,can,workshop,observatory};
      builders[kind]();
    }
    return colliders;
  };
})();
