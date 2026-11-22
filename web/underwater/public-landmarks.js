(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const wood = 10, sign = 13, enamel = 22, glass = 23, metal = 24;
  const timber = [.42,.22,.105], darkWood = [.24,.13,.074];
  const cream = [.99,.88,.61], ivory = [.88,.94,.85], brass = [.81,.57,.26];
  const teal = [.12,.51,.54], ink = [.10,.18,.23], red = [.78,.21,.16];
  const tint = (color,value) => color.map(c=>c*value);
  const glyph = {
    A:['05 20 45','13 33'], C:['40 10 01 04 15 45'],
    D:['05 00 20 41 44 25 05'], E:['40 00 05 45','02 32'], F:['40 00 05','02 32'],
    G:['40 10 01 04 15 45 43 23'], H:['00 05','40 45','02 42'],
    I:['00 40','20 25','05 45'], L:['00 05 45'], M:['05 00 23 40 45'],
    N:['05 00 45 40'], O:['10 30 41 44 35 15 04 01 10'],
    R:['05 00 30 41 32 02','22 45'], T:['00 40','20 25'], V:['00 25 40'],
    W:['00 15 23 35 40']
  };

  window.buildSignatureLandmark = function buildSignatureLandmark(kind,kit) {
    const {face,quad,smooth,box,tube,lathe,slab,steps,grade}=kit;
    function lettering(word,x,y,z,height,color,advance=.86) {
      let cursor=x-(word.length-1)*advance*height/2;
      for(const ch of word) {
        for(const stroke of glyph[ch]||[]) {
          const points=stroke.split(' ').map(pair=>[
            cursor+(Number(pair[0])/4-.5)*height*.59,
            y+(.5-Number(pair[1])/5)*height,z
          ]);
          for(let i=1;i<points.length;i++) tube(points[i-1],points[i],height*.053,color,sign,6);
        }
        cursor+=height*advance;
      }
    }

    function orb(center,radii,color,mat,tilt=0,sides=15) {
      const rings=9, c=Math.cos(tilt),s=Math.sin(tilt);
      function vertex(row,col) {
        const a=(row/rings-.5)*Math.PI,b=col/sides*TAU;
        const n=[Math.cos(a)*Math.cos(b),Math.sin(a),Math.cos(a)*Math.sin(b)];
        const [u,h,v]=n.map((k,i)=>k*radii[i]);
        const raw=n.map((k,i)=>k/radii[i]),len=Math.hypot(...raw);
        smooth([center[0]+u*c-h*s,center[1]+u*s+h*c,center[2]+v],
          [(raw[0]*c-raw[1]*s)/len,(raw[0]*s+raw[1]*c)/len,raw[2]/len],color,mat);
      }
      for(let j=0;j<rings;j++) for(let i=0;i<sides;i++) {
        if(j<rings-1){vertex(j,i);vertex(j+1,i);vertex(j+1,i+1);}
        if(j>0){vertex(j,i);vertex(j+1,i+1);vertex(j,i+1);}
      }
    }

    function bulb(x,y,z,r=.045) {orb([x,y,z],[r,r,r*.82],cream,sign,0,7);}
    function beam(a,b,r,color,mat=wood) {tube(a,b,r,color,mat,10);}
    function pairDoors() {
      for(const side of [-1,1]) {
        const u=side*.54;
        box(u,1.13,1.57,.99,1.81,.13,brass,metal);
        box(u,1.13,1.66,.82,1.60,.06,[.17,.30,.33],enamel);
        box(u,1.48,1.70,.69,.71,.035,[.27,.46,.46],glass);
        box(u,.69,1.70,.66,.38,.035,darkWood,wood);
        beam([u-side*.29,.84,1.76],[u-side*.29,1.15,1.76],.031,brass,metal);
      }
    }

    function movieHouse() {
      slab(2.76,1.91,.14,[.35,.39,.35],enamel);
      steps(0,1.87,2.54,.87,.14,enamel,[.49,.49,.39]);
      box(0,1.28,-.02,5.39,2.32,3.06,timber,wood);
      for(let side of [-1,1]){
        for(let i=0;i<8;i++) box(side*2.71,1.22,-1.28+i*.36,.09,1.93,.028,darkWood,wood);
        for(const v of [-.97,.26]) {
          box(side*2.75,1.55,v,.12,.72,.73,brass,metal);
          box(side*2.82,1.55,v,.04,.57,.60,[.23,.42,.43],glass);
          box(side*2.85,1.55,v,.035,.048,.60,timber,wood);
        }
      }

      // Four hip-roof faces carry overlapping, individually pointed thatch bundles.
      const eaves=[[-3.04,2.25,1.99],[3.04,2.25,1.99],[3.04,2.25,-1.99],[-3.04,2.25,-1.99]];
      const ends=[[-1.52,3.63,0],[1.52,3.63,0],[1.52,3.63,0],[-1.52,3.63,0]];
      const straw=[[.46,.45,.18],[.59,.49,.21],[.60,.56,.26],[.42,.43,.20]];
      for(let side=0;side<4;side++){
        const next=(side+1)%4, a=eaves[side],b=eaves[next],p=ends[side],q=ends[next];
        quad(a,b,q,p,straw[0],wood);
        const point=(t,v,lift)=>a.map((av,j)=>(av+(b[j]-av)*t)*(1-v)+(p[j]+(q[j]-p[j])*t)*v+(j===1?lift:0));
        const count=side%2?24:41;
        for(let band=0;band<3;band++) for(let i=0;i<count;i++) {
          const seed=Math.sin((i+1)*17.31+side*3.78+band*5.47);
          const v0=band/3-.025-.036*(seed+1),v1=(band+1)/3;
          const c=straw[(i+band*2+side)%straw.length];
          const l=point(i/count,v0+.052,.037),r=point((i+1)/count,v0+.052,.037);
          const tip=point((i+.48)/count,v0,.014);
          quad(l,r,point((i+1)/count,v1,.013),point(i/count,v1,.013),c,13);
          face(tip,r,l,tint(c,.84),13);
        }
      }
      beam([-1.55,3.66,0],[1.55,3.66,0],.085,darkWood);
      for(const side of [-1,1]) {
        const x=side*2.45;
        lathe(x,0,1.55,[[.13,.28],[.27,.32],[.41,.26],[.81,.24],[1.11,.30],[1.32,.22],[1.76,.25],[1.97,.32],[2.36,.27]],timber,wood,14);
        for(const y of [.36,.96,1.48,1.88]) lathe(x,0,1.55,[[y,.277],[y+.048,.285]],brass,metal,14);
        for(const k of [-1,1]) beam([x+k*.20,1.70,1.77],[x+k*.05,1.59,1.81],.04,darkWood);
        beam([x,1.58,1.81],[x,1.36,1.86],.073,timber);
        box(x,1.25,1.79,.26,.052,.06,darkWood);
        const u=side*1.70;
        box(u,1.31,1.55,.77,1.07,.14,brass,metal);
        box(u,1.32,1.64,.64,.92,.045,side<0?teal:red,sign);
        orb([u,1.45,1.67],[.19,.14,.018],side<0?cream:[.91,.64,.27],sign,-.3);
        for(let k=0;k<3;k++) box(u,1.10-k*.065,1.674,.34-k*.047,.019,.012,cream,sign);
      }
      pairDoors();
      box(0,2.24,1.89,3.40,.60,.66,red,enamel);
      box(0,2.26,2.235,3.18,.42,.055,[.88,.78,.48],sign);
      lettering('CINEMA',0,2.26,2.275,.25,[.18,.19,.20]);
      for(const h of [1.98,2.51]) {
        box(0,h,2.245,3.44,.067,.09,brass,metal);
        for(let i=-7;i<=7;i++) bulb(i*.215,h,2.30,.032);
      }
      // Raised letters project from the blade sign; doors and marquee stay visible beneath it.
      box(0,3.77,1.61,.74,2.61,.30,brass,metal);
      box(0,3.77,1.79,.61,2.47,.10,[.30,.14,.15],enamel);
      lettering('THE',0,4.83,1.86,.16,cream);
      'REEF'.split('').forEach((ch,i)=>lettering(ch,0,4.46-i*.48,1.86,.39,[.46,.94,.85]));
      for(const side of [-1,1]) beam([side*.336,2.54,1.83],[side*.336,4.99,1.83],.031,[.90,.58,.22],metal);
    }

    function glove(x,y,side) {
      const white=[.93,.94,.84],stroke=[.37,.53,.54];
      orb([x,y+.28,0],[.40,.43,.19],white,enamel);
      const fingers=[[-.26,.59,.13,.30,.20],[-.08,.70,.126,.35,.06],[.11,.66,.123,.31,-.08]];
      for(const [u,h,w,r,a] of fingers) orb([x+side*u,y+h,0],[w,r,.139],white,enamel,side*a);
      orb([x+side*.34,y+.38,.016],[.15,.29,.15],white,enamel,-side*.73);
      orb([x,y+.02,0],[.37,.118,.218],ivory,enamel);
      for(const u of [-.13,.015,.14]) beam([x+side*u,y+.24,.183],[x+side*(u+.018),y+.40,.184],.013,stroke,enamel);
    }

    function gateway() {
      for(const side of [-1,1]) {
        const x=side*2.22, foot=grade(x,0)-.12;
        lathe(x,0,0,[[foot,.36],[.20,.36],[.31,.27]],teal,enamel,18);
        for(let i=0;i<8;i++) lathe(x,0,0,[[.28+i*.345,.206],[.28+(i+1)*.345,.206]],i%2?ivory:red,enamel,18);
        lathe(x,0,0,[[2.99,.23],[3.09,.29],[3.22,.28],[3.28,.16]],brass,metal,18);
        glove(x,3.22,side);
        for(let j=0;j<4;j++) {
          const px=side*(2.47+j*.164),bottom=grade(px,.04)-.07;
          box(px,(bottom+1.16)/2,.04,.14,1.16-bottom,.12,tint(teal,.83+j*.05),enamel);
          face([px-.07,1.14,.11],[px+.07,1.14,.11],[px,1.28,.11],ivory,sign);
        }
      }
      const maroon=[.56,.16,.16];
      for(let i=0;i<28;i++) {
        const p=x=>{const t=x/2.24;return 3.48-.47*t*t;};
        const a=-2.24+i*.16,b=a+.16;
        quad([a,p(a)-.57,.10],[b,p(b)-.57,.10],[b,p(b),.10],[a,p(a),.10],maroon,enamel);
        quad([b,p(b)-.57,-.13],[a,p(a)-.57,-.13],[a,p(a),-.13],[b,p(b),-.13],teal,enamel);
        for(const h of [0,-.57]) beam([a,p(a)+h,.12],[b,p(b)+h,.12],.044,brass,metal);
        quad([a,p(a),-.13],[a,p(a),.10],[b,p(b),.10],[b,p(b),-.13],brass,metal);
        if(i%2===0) bulb(a+.08,p(a+.08)-.048,.162,.028);
      }
      'GLOVE WORLD'.split('').forEach((ch,i)=>{
        const x=(i-5)*.345;
        if(ch!==' ') lettering(ch,x,3.20-.47*(x/2.24)**2,.142,.374,cream);
      });
    }

    function wheel() {
      const hubY=2.72,radius=1.91;
      for(const v of [-.75,.75]) {
        for(const side of [-1,1]) {
          const x=side*1.39, g=grade(x,v);
          box(x,(g+.20)/2-.04,v,.46,.28-g,.43,[.52,.53,.44],enamel);
          beam([x,.19,v],[0,hubY,v*.60],.095,teal,metal);
        }
        beam([-1.22,.49,v],[1.22,.49,v],.056,brass,metal);
      }
      beam([0,hubY,-.71],[0,hubY,.71],.15,brass,metal);
      for(const v of [-.42,.42]) for(let i=0;i<48;i++) {
        const pos=(a,r)=>[r*Math.cos(a),hubY+r*Math.sin(a),v];
        const a=i*TAU/48,b=(i+1)*TAU/48;
        beam(pos(a,radius),pos(b,radius),.047,ivory,metal);
        beam(pos(a,radius-.16),pos(b,radius-.16),.030,red,enamel);
        if(i%4===0) {
          beam(pos(a,.15),pos(a,radius),.034,teal,metal);
          beam(pos(a,.25),pos(b+TAU/16,radius-.16),.024,brass,metal);
          bulb(...pos(a,radius-.16),.034);
        }
      }
      for(let i=0;i<8;i++) {
        const a=(i+.5)*TAU/8,x=Math.cos(a)*radius,y=hubY+Math.sin(a)*radius;
        beam([x,y,-.43],[x,y,.43],.043,brass,metal);
        for(const v of [-.37,.37]) for(const side of [-1,1])
          beam([x,y,v],[x+side*.235,y-.36,v],.028,brass,metal);
        const c=[red,teal,[.89,.65,.20],[.55,.37,.67]][i%4];
        orb([x,y-.42,0],[.34,.18,.42],c,enamel,0,12);
        box(x,y-.33,0,.44,.065,.58,cream,enamel);
      }
      for(const v of [-.90,.90]) {
        for(const x of [-2.14,-1.08,0,1.08,2.14]) beam([x,grade(x,v)-.07,v],[x,.55,v],.038,teal,metal);
        beam([-2.14,.48,v],[2.14,.48,v],.035,brass,metal);
      }
    }

    if(kind==='theater') movieHouse();
    if(kind==='gloveGate') gateway();
    if(kind==='gloveWheel') wheel();
  };
})();
