(() => {
  'use strict';
  // Heights are in the town's metres. Each imported frontage faces local +Z.
  const houseScale=1.10;
  const house = (id,x,z,yaw,height,halfWidth,halfDepth) =>
    ({id,x,z,yaw,height:height*houseScale,halfWidth:halfWidth*houseScale,
      halfDepth:halfDepth*houseScale,radius:Math.hypot(halfWidth,halfDepth)*houseScale});
  const houses = [
    house('h03',18.0,-25.6,0,3.05,2.18,1.82),
    house('h02',25.4,-26.0,0,6.06,2.04,2.55),
    house('h01',32.8,-26.25,0,6.50,2.20,3.05),
    house('h04',-48.6,-37.2,.08,7.50,5.35,4.45),
    house('h05',-48.4,-23.0,Math.PI-.08,7.35,2.63,2.65),
    house('h06',49.90,-23.55,-.84,3.70,2.60,3.70),
    house('h07',53.5,-32.3,-1.28,4.80,2.45,2.38),
    house('h08',50.1,-42.95,-.22,4.40,1.98,2.32)
  ];
  const streets = [
    [[-3.47,-22.2],[-1.5,-21.1],[2.6,-20.9],[8.3,-22.0],[14.6,-21.0],[21,-20.55],[28.5,-20.5],[35.6,-20.45],[40.0,-19.45],[42.6,-19.2],[43.3,-21.9],[43.6,-24.7],[44.6,-27.9],[46.8,-30.75],[47.8,-34.6],[49.30,-37.8]],
    [[-30.30,-28.15],[-33.55,-27.8],[-36.35,-27.2],[-39.6,-27.6],[-43,-29.45],[-46.4,-30.10],[-50.15,-30.25],[-54.2,-30.6]]
  ];
  const lanes=streets.map((points,i)=>window.sampleTownLane(points,i?.70:.69));
  const flats=[
    {x:25.4,z:-25.25,w:11.5,d:4.85,level:.23,blend:4.3},
    {x:-48.6,z:-30.15,w:6.6,d:12.95,level:-.48,blend:4.8},
    {x:49.90,z:-23.55,w:5.0,d:5.0,level:.03,blend:3.8},
    {x:53.5,z:-32.3,w:3.3,d:3.5,level:-.25,blend:3.1},
    {x:50.1,z:-42.95,w:3.3,d:3.8,level:-.47,blend:3.8}
  ];
  function grade(x,z,natural) {
    let y=natural;
    for(const flat of flats){
      const dist=Math.hypot(Math.max(0,Math.abs(x-flat.x)-flat.w),Math.max(0,Math.abs(z-flat.z)-flat.d));
      if(dist>=flat.blend)continue;
      const t=dist/flat.blend;
      y=flat.level+(y-flat.level)*t*t*(3-2*t);
    }
    // The old shell pavilion sits immediately behind Patrick's plot.
    const shelter=Math.hypot(x-17.45,z+30.75);
    if(shelter<3.25){
      const t=Math.max(0,(shelter-1.25)/2);
      y=natural+(y-natural)*t*t*(3-2*t);
    }
    return y;
  }
  // Keep circulation and each parcel independent of the random reef generator.
  const parcels=houses.map(h=>{
    const asset=window.bikiniMeshes?.[h.id], scale=asset?h.height/asset.extent[1]:0;
    const centerX=asset?(asset.min[0]+asset.extent[0]/2)*scale:0;
    const centerZ=asset?(asset.min[2]+asset.extent[2]/2)*scale:0;
    return {...h,centerX,centerZ,halfWidth:asset?asset.extent[0]*scale/2:h.halfWidth,
      halfDepth:asset?asset.extent[2]*scale/2:h.halfDepth,cos:Math.cos(h.yaw),sin:Math.sin(h.yaw)};
  });
  const corridors=streets.flatMap((points,street)=>points.slice(1).map(([x,z],i)=>{
    const [sx,sz]=points[i], dx=x-sx,dz=z-sz;
    return {sx,sz,dx,dz,len:dx*dx+dz*dz,width:street?.79:.80};
  }));
  function reserved(x,z,r=0) {
    for(const h of parcels){
      const dx=x-h.x,dz=z-h.z;
      const u=Math.abs(dx*h.cos-dz*h.sin-h.centerX)-h.halfWidth;
      const v=Math.abs(dx*h.sin+dz*h.cos-h.centerZ)-h.halfDepth;
      if(Math.hypot(Math.max(0,u),Math.max(0,v))<r+.32)return true;
    }
    for(const s of corridors){
      const dx=x-s.sx,dz=z-s.sz, t=Math.max(0,Math.min(1,(dx*s.dx+dz*s.dz)/s.len));
      if(Math.hypot(dx-s.dx*t,dz-s.dz*t)<s.width+r+.12)return true;
    }
    return originalResidents.some(a=>Math.hypot(x-a.homeX,z-a.homeZ)<r+.66);
  }

  // Preserve the source poses. Families are placed in small groups sharing a
  // sightline, leaving room for a swimmer to pass between them and their door.
  const residents=[];
  function place(number,x,z,yaw,height) {
    const id='c'+String(number).padStart(2,'0');
    const a={id,instanceId:id,x,z,yaw,height,homeX:x,homeZ:z,heading:yaw,bob:0,lean:0,pace:0,step:0};
    residents.push(a);
    return a;
  }
  place(1,31.68,-22.10,-.40,1.33).greet=true;
  place(2,19.50,-22.65,.56,1.54).greet=true;
  place(3,24.02,-21.53,-.36,1.60).greet=true;
  place(4,-47.05,-32.26,.47,1.67).greet=true;
  place(5,-49.63,-26.60,2.80,.28*2).greet=true;
  place(6,42.17,-20.47,1.16,1.62);
  const gary=place(7,31.34,-21.1,1.28,.38);
  // Pearl's long muzzle and side-set eyes read in three-quarter profile.
  place(8,48.15,-38.84,-1.30,2.03);
  place(9,-47.61,-26.56,-2.15,1.77);
  place(10,19.33,-63.10,.17,1.97);
  place(11,20.76,-62.79,-1.11,1.30);
  place(12,-33.12,-29.95,1.02,1.02);
  const mystery=place(13,40.6,-21.6,.88,1.40);
  place(14,-45.64,-31.09,-2.16,1.42);
  const customer=place(15,-43.15,-30.12,-2.13,1.37);
  place(16,-1.55,-31.36,-1.02,1.29);
  place(17,-2.52,-30.77,1.88,1.45);
  const villager=place(18,45.56,-19.44,-.54,1.37);
  const rambler=place(19,7.35,-21.61,1.56,1.46);
  const originalResidents=residents.slice();

  // The original routes use hand-placed points on their streets.
  const walks=[
    ['bay-arrival',16,1.38,.74,7.3,[[1.6,-14.0],[2.6,-12.0],[3.25,-10.25],[3.23,-8.8]]],
    ['cinema',18,1.46,.70,10,[[-9.25,-33.62],[-7.3,-33.21],[-6.13,-32.71],[-5.34,-31.80]]],
    ['workshop',14,1.32,.62,1.5,[[-12.18,-33.35],[-13.44,-32.44],[-14.73,-30.76],[-15.39,-29.45]]],
    ['market-road',15,1.46,.78,4.9,[[-22.3,-27.23],[-24.7,-27.2],[-26.1,-27.15],[-29.1,-27.71]]],
    ['restaurant-row',16,1.43,.66,11,[[-50.1,-30.50],[-51.44,-30.64],[-52.68,-30.74],[-54.0,-30.80]]],
    ['conch-street',14,1.47,.75,2.1,[[14.75,-20.72],[17.3,-20.56],[19.7,-20.35],[22.1,-20.30]]],
    ['pineapple-road',17,1.38,.73,8.1,[[25.3,-20.21],[28.1,-20.23],[30.8,-20.21],[33.6,-20.19]]],
    ['east-bay',19,1.35,.73,1.3,[[44.39,-27.60],[45.41,-29.36],[46.57,-31.05],[47.24,-33.05]]],
    ['east-headland',18,1.31,.68,4.6,[[2.68,-38.28],[3.54,-36.7],[4.42,-35.53],[5.14,-33.77]]],
    ['west-shore',15,1.35,.77,3.2,[[-4.39,-40.47],[-5.68,-41.83],[-7.19,-43.6],[-8.88,-44.10]]],
    ['anchor-road',17,1.39,.67,6.9,[[-7.57,-52.28],[-5.6,-51.98],[-4.14,-51.50],[-2.42,-50.49]]],
    ['north-rise',14,1.43,.71,8.4,[[1.78,-55.57],[3.27,-55.84],[4.44,-57.28],[4.21,-58.76]]],
    ['ridge-street',18,1.44,.75,3.7,[[6.02,-62.22],[7.80,-63.40],[10.3,-64.31],[13.41,-64.58]]],
    ['upper-east-bank',19,1.52,.68,5.9,[[22.13,-59.54],[22.32,-57.02],[22.69,-54.18],[22.67,-52.65]]],
    ['pavilion-path',15,1.41,.68,1.2,[[11.78,-34.70],[13.45,-34.35],[14.84,-33.8],[16.01,-32.81]]]
  ];
  const bayApproach=window.buildBayApproach();

  // Keep a few walkers along the winding road between the city and the open bay.
  function baySpan(min,max,offset){
    return bayApproach.flatMap((point,i)=>{
      if(point.z<min||point.z>max)return [];
      const before=bayApproach[Math.max(0,i-2)],after=bayApproach[Math.min(bayApproach.length-1,i+2)];
      const dx=after.x-before.x,dz=after.z-before.z;
      const length=Math.hypot(dx,dz);
      return [{x:point.x+dz/length*offset,z:point.z-dx/length*offset}];
    });
  }

  const bayWalks=[
    ['bay-causeway',16,1.41,.67,2.6,baySpan(-2.45,3.89,-.25)],
    ['outer-reef',18,1.39,.71,9.2,baySpan(4.35,11.50,.24)],
    ['outer-shore',17,1.48,.70,5.7,baySpan(20.05,27.8,.22)]
  ];
  const meetings=[
    ['station',-3.84,-30.94,1.1,14,18],
    ['market',-34.99,-29.85,1.05,17,16],
    ['restaurants',-42.10,-28.55,1.02,19,18],
    ['conch-doorstep',22.9,-22.08,.36,15,19],
    ['east-bay-doors',48.53,-35.74,.86,17,15],
    ['lighthouse',1.52,-46.95,-.10,18,14],
    ['flower-quarter',9.19,-56.89,1.53,14,16],
    ['ridge-overlook',10.90,-65.61,1.66,15,17]
  ];

  function streetResident(name,number,x,z,yaw,height) {
    const actor=place(number,x,z,yaw,height);
    actor.instanceId=name;
    return actor;
  }

  function route(path,speed,phase){
    let length=0;
    path.forEach((point,i)=>{
      const before=path[Math.max(0,i-2)],after=path[Math.min(path.length-1,i+2)];
      point.heading=Math.atan2(after.x-before.x,after.z-before.z);
      if(i)length+=Math.hypot(point.x-path[i-1].x,point.z-path[i-1].z);
      point.distance=length;
    });
    const first=path[0], last=path.at(-1);
    const duration=length/speed+1.15;
    const pause=2.1+(phase%3)*.74;
    return {path,length,first,last,duration,pause,phase,speed};
  }
  const walkers=[...walks.map(([name,number,height,speed,phase,points])=>
    [name,number,height,speed,phase,window.sampleTownLane(points,0)]),...bayWalks]
    .map(([name,number,height,speed,phase,points])=>{
    const path=route(points,speed,phase);
    const {x,z,heading}=path.first;
    return {...path,actor:streetResident(name,number,x,z,heading,height)};
  });

  const conversations=meetings.flatMap(([name,x,z,yaw,first,second],i)=>{
    const dx=Math.sin(yaw)*.52,dz=Math.cos(yaw)*.52;
    // The c14 model has a longer hanging arm on its left side.
    return [
      streetResident(name+'-a',first,x-dx,z-dz,yaw,1.36+i%3*.042),
      streetResident(name+'-b',second,x+dx,z+dz,yaw+Math.PI,1.49-i%3*.037)
    ].map((actor,side)=>({
      actor,side,phase:i*2.37,leftArm:actor.id==='c14'||(i+side)%2===0,
      reach:.16+((i+2*side)%4)*.026, cadence:2.05+((i+side)%4)*.29
    }));
  });

  const ease=t=>t*t*(3-2*t);
  const mix=(a,b,t)=>a+(b-a)*t;
  const angleDifference=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));

  function sampleRoute(path,distance) {
    let low=0,high=path.length-1;
    while(high-low>1){
      const middle=(low+high)>>1;
      if(path[middle].distance<=distance)low=middle;
      else high=middle;
    }
    const a=path[low],b=path[high],f=(distance-a.distance)/(b.distance-a.distance);
    return {x:mix(a.x,b.x,f),z:mix(a.z,b.z,f),heading:a.heading+angleDifference(a.heading,b.heading)*f};
  }

  function walk(walker,t) {
    const {actor,path,length,first,last,duration,pause,phase,speed}=walker;
    const half=duration+pause;
    const period=half*2;
    const clock=((t+phase)%period+period)%period;
    const returning=clock>=half;
    const leg=clock%half;
    if(leg>=duration){
      const end=returning?first:last;
      const turn=Math.max(0,Math.min(1,(leg-duration-.32)/(pause-.72)));
      actor.x=end.x;
      actor.z=end.z;
      actor.yaw=end.heading+(Number(returning)+ease(turn))*Math.PI;
      actor.step=(Number(returning)+1)*length*9.3;
      actor.walkTime=(Number(returning)+1)*length/speed;
      actor.pace=actor.bob=actor.lean=0;
      return;
    }
    // Integrate linear acceleration near each end to keep an even speed
    // on the long stretches while easing in and out of the stop.
    const ramp=1.15, edge=Math.min(leg,duration-leg);
    const covered=edge<ramp?edge*edge/(2*ramp):edge-ramp/2;
    const progress=covered/(duration-ramp);
    const outward=(leg<duration*.5?progress:1-progress);
    const distance=(returning?1-outward:outward)*length;
    const {x,z,heading}=sampleRoute(path,distance);
    actor.x=x;
    actor.z=z;
    actor.yaw=heading+(returning?Math.PI:0);
    actor.pace=Math.min(1,edge/ramp)*.89;
    actor.step=(Number(returning)+outward)*length*9.3;
    actor.walkTime=(Number(returning)+outward)*length/speed;
    actor.bob=.012*actor.pace*Math.sin(actor.step)**2;
    actor.lean=.022*actor.pace*Math.sin(actor.step);
  }

  function talk({actor,side,phase,leftArm,reach,cadence},t) {
    const beats=((((t+phase)%10)+10)%10)*Math.PI/5;
    const speaking=Math.max(0,Math.cos(beats)*(side?-1:1));
    const gesture=speaking**2*Math.sin(2.7*t+phase+side*.8);
    actor.yaw=actor.heading+.041*gesture+.021*Math.sin(t*.64+phase+side);
    actor.lean=.012*Math.sin(t*.94+phase+side)+.032*gesture;
    // A negative pitch brings the hanging arm forward in the model's +Z direction.
    const arm=-reach*speaking**2*(.5+.5*Math.sin(t*cadence+phase+side*.8));
    actor.leftArm=leftArm?arm:0;
    actor.rightArm=leftArm?0:arm;
  }

  function promenade(actor,t,dx,dz,duration,pause,offset){
    if(!window.bikiniMeshes?.[actor.id]?.j)return;
    const half=duration+pause, clock=(t+offset)%(2*half), returning=clock>=half;
    const leg=clock%half, f=Math.min(1,leg/duration);
    const progress=f*f*(3-2*f), fraction=returning?1-progress:progress;
    actor.x=actor.homeX+dx*fraction;actor.z=actor.homeZ+dz*fraction;
    const turn=Math.max(0,(leg-duration)/pause);
    actor.yaw=Math.atan2(dx,dz)+(Number(returning)+turn*turn*(3-2*turn))*Math.PI;
    actor.pace=4*f*(1-f)*.90;
    actor.step=(Number(returning)+progress)*Math.hypot(dx,dz)*9.3;
    actor.bob=.012*actor.pace*Math.sin(actor.step)**2;
  }

  const recordingGreetings = [
    [23,29.4], [34,39], [29.4,34], [55.5,61], [61,66]
  ];
  const plazaKrabs = {x:-1.6,z:-25.8,yaw:.66};
  const planktonHop = {start:96.75,end:98.05};
  const gatheredGreetings = [
    [0,100.20,102.23], [2,102.23,104.48], [1,104.48,106.65],
    [3,106.65,108.85], [4,108.85,111.8],
  ];

  function planktonPerch(floor) {
    const {x,z,yaw} = plazaKrabs;
    const scale = originalResidents[3].height;
    // Both soles meet the blue sleeve on the side opposite the waving claw.
    const localX = .182 * scale, localZ = -.013 * scale;
    return {
      x:x + Math.cos(yaw)*localX + Math.sin(yaw)*localZ,
      z:z - Math.sin(yaw)*localX + Math.cos(yaw)*localZ,
      baseY:floor(x,z) + .3451*scale,
      yaw:yaw + 1.02,
    };
  }

  const gathering = [
    [0,68.8,94.7,1.2,-25.7,-.55,
      [[31.0,-21.85],[30.4,-20.75],[28.5,-20.5],[21,-20.7],[14.6,-21.1],
        [8.3,-22],[5.8,-21.6],[3.45,-22.2],[2.18,-23.85]]],
    [1,67.8,88.9,-.7,-27.6,.23,
      [[19.7,-21.45],[18.6,-20.45],[14.6,-20.88],[8.3,-21.65],
        [5.5,-21.4],[3.2,-22.1],[.85,-24.4]]],
    [2,69.0,91.7,1.0,-27.2,-.30,
      [[23.60,-20.79],[21,-20.35],[14.6,-20.95],[8.3,-21.8],
        [5.5,-21.5],[3.25,-22.25],[2.55,-24.7],[2.1,-26.72]]],
    [3,65.8,94.2,plazaKrabs.x,plazaKrabs.z,plazaKrabs.yaw,
      [[-46.3,-30.25],[-43,-29.25],[-39.6,-27.6],[-36.35,-27.2],
        [-33.55,-27.8],[-30.3,-28.15],[-26.1,-27.36],[-22.35,-27.45],
        [-18.42,-27.42],[-15.9,-28.65],[-14.62,-30.85],[-13.2,-32.85],
        [-10.3,-33.62],[-6.55,-32.7],[-5.1,-31.35],[-4.85,-29.65],[-3.59,-27.1],[-2.8,-26.15]]],
    [4,66.65,95.8,-2.24,-24.47,2.55,
      [[-49.5,-27.61],[-48.7,-29.2],[-47.2,-29.63],[-43,-28.86],
        [-39.6,-27.2],[-36.35,-26.85],[-33.55,-27.45],[-30.3,-27.8],
        [-26.1,-27.02],[-22.35,-27.06],[-18.42,-27.09],[-15.9,-28.35],
        [-14.44,-30.56],[-12.92,-32.56],[-10.3,-33.25],[-6.55,-32.39],
        [-4.91,-31.16],[-4.55,-29.48],[-3.79,-27.81],[-3.78,-26.49],
        [-3.26,-25.28],[-2.85,-24.84]]],
  ].map(([index,start,end,x,z,yaw,waypoints])=>{
    const actor = originalResidents[index];
    const points = [[actor.homeX,actor.homeZ],...waypoints,[x,z]];
    return {actor,index,start,end,yaw,...route(window.sampleTownLane(points,0),1,0)};
  });
  // Give the lead characters room to pass the smaller background groups.
  const recordingClearance = new Map([
    ['c19',[74,90,0,-1.28]],
    ['conch-street',[71.5,85,0,1.16]],
    ['restaurants-a',[68,72,0,1.4]],
    ['restaurants-b',[68,72,.25,1.4]],
    ['market-road',[76.5,80,-.13,1.15]],
    ['workshop',[81,86,-.84,-.80]],
    ['cinema',[86,90,0,-1.18]],
  ]);
  let recordingTime = null;

  function gatheringPose({actor,start,end,yaw,path,first,last,length},time) {
    const turn = .85, ramp = 1.25;
    if (time >= end + turn) {
      return {...actor,x:last.x,z:last.z,yaw,heading:yaw,instanceId:`${actor.id}-plaza`,
        greet:false,canGreet:false};
    }
    const duration = end - start - turn;
    const elapsed = time - start - turn;
    const travel = Math.max(0,Math.min(duration,elapsed));
    const edge = Math.min(travel,duration-travel);
    const covered = edge < ramp ? edge*edge/(2*ramp) : edge-ramp/2;
    const progress = covered/(duration-ramp);
    const distance = (travel < duration*.5 ? progress : 1-progress)*length;
    const {x,z,heading} = sampleRoute(path,distance);
    const easedTurn = ease(Math.max(0,Math.min(1,(time-start)/turn)));
    const settleTurn = ease(Math.max(0,Math.min(1,(time-end)/turn)));
    const facing = elapsed < 0 ? actor.heading+angleDifference(actor.heading,first.heading)*easedTurn
      : elapsed > duration ? last.heading+angleDifference(last.heading,yaw)*settleTurn : heading;
    const pace = .89*Math.min(1,edge/ramp);
    // The source cycle is in place. Tie its cadence to distance along the road.
    const walkTime = distance/Math.max(.54*actor.height,.52);
    return {...actor,x,z,yaw:facing,pace,walkTime,greet:false};
  }

  function perchedPose(actor,time,floor) {
    const destination = planktonPerch(floor);
    const progress = Math.min(1,(time-planktonHop.start)/(planktonHop.end-planktonHop.start));
    const travel = ease(progress);
    // Rise above the sleeve and set both feet down as the turn finishes.
    const yaw = actor.yaw + angleDifference(actor.yaw,destination.yaw)*travel;
    return {...actor,greet:false,canGreet:false,
      x:mix(actor.x,destination.x,travel),z:mix(actor.z,destination.z,travel),
      yaw,heading:yaw,
      baseY:mix(floor(actor.x,actor.z),destination.baseY,travel)+.66*Math.sin(Math.PI*progress)};
  }

  function characters(t,floor) {
    for(let i=0;i<originalResidents.length;i++){
      const a=originalResidents[i], phase=t*.66+i*2.39;
      if(a.greet)continue;
      a.yaw=a.heading+.070*Math.sin(phase)+.037*Math.sin(phase*.61+i);
    }
    // The snail and seahorse retain their authored glide along the sand.
    const crawl=t*.105;
    gary.x=gary.homeX+.52*Math.sin(crawl);gary.z=gary.homeZ+.26*Math.cos(crawl);
    gary.yaw=Math.atan2(.52*Math.cos(crawl),-.26*Math.sin(crawl));
    const swim=t*.31;
    mystery.x=mystery.homeX+.45*Math.sin(swim);mystery.z=mystery.homeZ+.16*Math.cos(swim);
    mystery.bob=.32+.10*Math.sin(swim*1.77);mystery.lean=.055*Math.sin(swim*1.17);
    promenade(rambler,t,4.55,-.19,8.6,2.4,.9);
    promenade(customer,t,-1.63,-.62,4.6,4.4,1.3);
    promenade(villager,t,-2.35,.74,5.1,2.9,4.2);
    for(const walker of walkers)walk(walker,t);
    for(const conversation of conversations)talk(conversation,t);
    if (recordingTime === null) return residents;
    const staged = residents.slice();
    for (const [index,[start,end]] of recordingGreetings.entries()) {
      staged[index] = {...residents[index],canGreet:recordingTime>=start && recordingTime<end};
    }
    for (const walk of gathering) {
      if (recordingTime >= walk.start) staged[walk.index] = gatheringPose(walk,recordingTime);
    }
    if (floor && recordingTime >= planktonHop.start) staged[4] = perchedPose(staged[4],recordingTime,floor);
    if (recordingTime >= planktonHop.end) {
      const wave = gatheredGreetings.find(([,start,end])=>recordingTime>=start && recordingTime<end)?.[0];
      for (let index=0;index<gatheredGreetings.length;index++) {
        staged[index] = {...staged[index],stagedLook:true,stagedWave:index===wave,
          lockBodyYaw:index===3 || index===4};
      }
    }
    for (const [index,actor] of staged.entries()) {
      const clearance = recordingClearance.get(actor.instanceId);
      if (!clearance) continue;
      const [start,end,dx,dz] = clearance;
      const blend = ease(Math.max(0,Math.min(1,(recordingTime-start+2)/2,(end+2-recordingTime)/2)));
      if (blend > 0) staged[index] = {...actor,x:actor.x+dx*blend,z:actor.z+dz*blend};
    }
    return staged;
  }
  window.bikiniLayout={houses,sites:houses,lanes,grade,reserved,characters,planktonPerch,
    setRecordingTime(time) { recordingTime = time; }};
})();
