(function () {
  'use strict';

  const viewpoints = {
    // From the welcome buoy, the lighthouse sits between the two neighbourhoods.
    shallows: { x: 0, y: 8, z: 28, yaw: -.0048, pitch: .028 },
    town: { x: 8.5, y: 8.9, z: -14.5, yaw: -.235, pitch: -.094 },
    street: { x: 1.9, z: -32.8, yaw: -.12, pitch: .19, heightAboveFloor:1.68 },
    ridge: { x: 22.6, z: -62, yaw: -.33, pitch: -.17, heightAboveFloor: 3.1 },
    reef: { x: 33, y: 3.9, z: -29.1, yaw: .50, pitch: -.06 },
    conch: { x:25.1,z:-12.2,heightAboveFloor:2.9,yaw:.018,pitch:.015, range:13.4, span:20.6 },
    neighbors: { x:30.7,z:-18.6,heightAboveFloor:1.49,yaw:.43,pitch:.042 },
    diner: { x:-45.3,z:-25.6,heightAboveFloor:2.80,yaw:-.406,narrowYaw:-.82,pitch:.075,range:12,span:14.9 },
    chum: { x:-44.6,z:-30.2,heightAboveFloor:1.97,yaw:-2.68,pitch:.11,range:8.3,span:6.6 },
    cove: { x:43.3,z:-15.7,heightAboveFloor:3.35,yaw:.52,pitch:-.12,range:14.8,span:12.6 },
    horn: { x:45.2,z:-25.55,heightAboveFloor:2.85,yaw:.60,pitch:-.063,range:12.5,span:9.6 },
    trench: { x: -32, y: 2.2, z: -32, yaw: -.57, pitch: -.08 }
  };
  // The current follows the bay and its outer reefs, with a clear view of the town.
  const tour = [
    viewpoints.shallows,
    { x: 1, y: 7.5, z: 13, yaw: -.12, pitch: -.17 },
    viewpoints.town,
    viewpoints.conch,
    viewpoints.cove,
    { x: 22.5, y: 13.5, z: -46.5, yaw: -.18, pitch: -.27 },
    viewpoints.ridge,
    { x: 9.2, y: 21, z: -45.5, yaw: -.60, pitch: -.42 },
    { x: -12, y: 10, z: -20, yaw: .44, pitch: -.12 },
    { x: -29, y: 8, z: -24, yaw: .87, pitch: -.10 },
    viewpoints.diner,
    { x: -18, y: 11, z: -4, yaw: .37, pitch: -.14 },
    viewpoints.shallows
  ];

  const keyActions = new Map([
    ['KeyW', 'forward'], ['ArrowUp', 'forward'],
    ['KeyS', 'back'], ['ArrowDown', 'back'],
    ['KeyA', 'left'], ['ArrowLeft', 'left'],
    ['KeyD', 'right'], ['ArrowRight', 'right'],
    ['Space', 'up'], ['KeyE', 'up'],
    ['KeyC', 'down'], ['KeyQ', 'down'],
    ['ShiftLeft', 'boost'], ['ShiftRight', 'boost']
  ]);

  const worldEdge = 85;
  const clearance = 0.65;
  const distanceBetween = (a,b) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
  const between = (a,b,t) => ({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});

  function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
  }

  function angleDifference(from, to) {
    return Math.atan2(Math.sin(to - from), Math.cos(to - from));
  }

  window.createDiveControls = function createDiveControls(canvas, callbacks = {}) {
    const camera = { ...viewpoints.shallows };
    const velocity = { x: 0, y: 0, z: 0 };
    const pressedKeys = new Set();
    const screenActions = new Set();
    const floor = callbacks.floor || (() => 0);
    const getCollision = typeof callbacks.collision === "function" ? callbacks.collision : () => callbacks.collision;
    const waterCeiling = (callbacks.surfaceY ?? 12) - 0.55;
    let drag = null;
    let glide = null;
    let cruising = false;
    let tourIndex = 0;

    function stopMotion() {
      velocity.x = 0;
      velocity.y = 0;
      velocity.z = 0;
    }

    function setCruise(enabled) {
      enabled = Boolean(enabled);
      if (enabled === cruising) return;
      cruising = enabled;
      if (enabled) {
        const distances = tour.map(stop => Math.hypot(stop.x-camera.x, stop.z-camera.z));
        const nearest = distances.indexOf(Math.min(...distances));
        tourIndex = nearest === tour.length-1 ? 0 : nearest + Number(distances[nearest] < 4);
        if (!beginGlide(tour[tourIndex], true)) cruising = false;
      } else glide = null;
      callbacks.onCruise?.(cruising);
    }

    function manualInput() {
      glide = null;
      setCruise(false);
      callbacks.onManual?.();
    }

    function setInput(action, active) {
      if (active) {
        screenActions.add(action);
        if (action !== 'boost') manualInput();
      } else {
        screenActions.delete(action);
      }
    }

    function bounds(point) {
      const x=clamp(point.x,-worldEdge,worldEdge), z=clamp(point.z,-worldEdge,worldEdge);
      return {x,z,y:clamp(point.y,floor(x,z)+clearance,waterCeiling)};
    }

    function segmentClear(a,b) {
      const steps=Math.max(1,Math.ceil(distanceBetween(a,b)/.22));
      for(let i=0;i<=steps;i++){
        const p=between(a,b,i/steps);
        if(p.y<floor(p.x,p.z)+clearance-1e-6 || p.y>waterCeiling+1e-6) return false;
      }
      return getCollision()?.clearLine(a,b) ?? true;
    }

    function routeFromPivots(start,target,pivots) {
      const points=[start,...pivots,target];
      for(let i=1;i<points.length;i++){
        if(!segmentClear(points[i-1],points[i])) return null;
      }
      return points;
    }

    function routeBetween(start,target) {
      if(segmentClear(start,target)) return [start,target];

      const horizontal=Math.hypot(target.x-start.x,target.z-start.z);
      const xSide=horizontal>.1?(target.z-start.z)/horizontal:1;
      const zSide=horizontal>.1?(start.x-target.x)/horizontal:0;
      const mid=between(start,target,.5);
      for(const height of [1.25,3.0,6.0,10.0]){
        for(const offset of [0,2.6,-2.6,5.2,-5.2]){
          const pivot=bounds({x:mid.x+xSide*offset,y:mid.y+height,z:mid.z+zSide*offset});
          const path=routeFromPivots(start,target,[pivot]);
          if(path)return path;
        }
      }

      function access(point,height) {
        const options=[];
        for(const radius of [0,1.3,2.65]){
          const directions=radius===0?1:8;
          for(let i=0;i<directions;i++){
            const angle=i*Math.PI*2/directions;
            const foot=bounds({x:point.x+radius*Math.cos(angle),y:point.y+.35,z:point.z+radius*Math.sin(angle)});
            if(!segmentClear(point,foot)) continue;
            const top=bounds({x:foot.x,y:height,z:foot.z});
            if(segmentClear(foot,top)) options.push([foot,top]);
          }
        }
        return options;
      }

      // Find clear ascents out of confined spots, then cross above the intervening model.
      for(const lift of [4.5,10,19]){
        const height=Math.min(waterCeiling,Math.max(start.y,target.y)+lift);
        const departures=access(start,height), arrivals=access(target,height);
        for(const [out,high] of departures){
          for(const [back,entry] of arrivals){
            if(segmentClear(high,entry)) return [start,out,high,entry,back,target];
          }
        }
      }
      return null;
    }

    function smoothRoute(points) {
      const result=[points[0]];
      for(let i=1;i<points.length-1;i++){
        const a=points[i-1],corner=points[i],b=points[i+1];
        const left=distanceBetween(a,corner),right=distanceBetween(corner,b);
        const trim=Math.min(1.75,left*.32,right*.32);
        if(trim<.08){
          result.push(corner);
          continue;
        }
        const entry=between(corner,a,trim/left), exit=between(corner,b,trim/right);
        const rounded=Array.from({length:9},(_,j)=>{
          const t=j/8;
          return between(between(entry,corner,t),between(corner,exit,t),t);
        });
        const test=[result.at(-1),...rounded,b];
        if(test.every((p,j)=>j===0||segmentClear(test[j-1],p))) result.push(...rounded);
        else result.push(corner);
      }
      result.push(points.at(-1));
      return result;
    }

    function reset() {
      return goto('shallows');
    }

    function resetImmediately() {
      setCruise(false);
      glide = null;
      drag = null;
      pressedKeys.clear();
      screenActions.clear();
      stopMotion();
      Object.assign(camera, viewpoints.shallows);
    }

    function goto(id) {
      if (!Object.prototype.hasOwnProperty.call(viewpoints, id)) return false;
      setCruise(false);
      return beginGlide(viewpoints[id],false);
    }

    function beginGlide(view,touring) {
      const target={...view};
      if(view.heightAboveFloor!==undefined) target.y=floor(view.x,view.z)+view.heightAboveFloor;
      if(view.span){
        const halfLens=(callbacks.horizontalFov?.()??90)*Math.PI/360;
        const retreat=Math.max(0,view.span/(2*Math.tan(halfLens))-view.range);
        const aimY=target.y+Math.tan(view.pitch)*view.range;
        const aimX=target.x+Math.sin(view.yaw)*view.range;
        const aimZ=target.z-Math.cos(view.yaw)*view.range;
        // On a narrow screen, back away around the opposite storefront so that
        // the bucket and its handle do not hide the restaurant's clam sign.
        const turn=clamp(retreat/(view.range*.65),0,1);
        target.yaw=view.yaw+((view.narrowYaw??view.yaw)-view.yaw)*turn;
        target.x=aimX-Math.sin(target.yaw)*(view.range+retreat);
        target.z=aimZ+Math.cos(target.yaw)*(view.range+retreat);
        target.y=Math.max(target.y+retreat*.09,floor(target.x,target.z)+1.2);
        target.pitch=Math.atan2(aimY-target.y,view.range+retreat);
      }
      const start={...camera};
      const destination={...bounds(target),yaw:target.yaw,pitch:target.pitch};
      const route=routeBetween(start,destination);
      if(!route){
        glide=null;
        callbacks.onBlocked?.();
        return false;
      }
      stopMotion();
      const points=smoothRoute(route);
      const lengths=[0];
      for(let i=1;i<points.length;i++) lengths.push(lengths.at(-1)+distanceBetween(points[i-1],points[i]));
      const distance=lengths.at(-1);
      const duration=touring?clamp(distance/4.8,1.8,12):clamp(distance/11,.9,9);
      glide={start,target:destination,points,lengths,distance,duration,elapsed:0,index:0};
      return true;
    }

    function updateGlide(dt) {
      const {start,target,duration,points,lengths,distance}=glide;
      glide.elapsed+=dt;
      const progress=Math.min(1,glide.elapsed/duration);
      const eased=progress*progress*(3-2*progress);
      const position=distance*eased;
      while(glide.index<points.length-2 && position>lengths[glide.index+1]) glide.index++;
      const i=glide.index;
      const step=lengths[i+1]-lengths[i];
      const p=between(points[i],points[i+1],step>1e-8?(position-lengths[i])/step:1);
      Object.assign(camera,p);
      camera.yaw=start.yaw+angleDifference(start.yaw,target.yaw)*eased;
      camera.pitch=start.pitch+(target.pitch-start.pitch)*eased;
      if(progress===1){
        Object.assign(camera,target);
        glide=null;
        if(cruising && (++tourIndex>=tour.length || !beginGlide(tour[tourIndex],true))) setCruise(false);
      }
    }

    function moveBy(dx,dy,dz) {
      const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy,dz)/.11));
      for(let i=0;i<steps;i++){
        const from={x:camera.x,y:camera.y,z:camera.z};
        const raw={x:from.x+dx/steps,y:from.y+dy/steps,z:from.z+dz/steps};
        const target=bounds(raw);
        let p=getCollision()?.slide(from,target)??target;
        const corrected=bounds(p);
        if(distanceBetween(p,corrected)>1e-6){
          if(!segmentClear(from,corrected)) return;
          p=corrected;
        }
        Object.assign(camera,p);
        const sx=p.x-target.x,sy=p.y-target.y,sz=p.z-target.z;
        const lengthSquared=sx*sx+sy*sy+sz*sz;
        if(lengthSquared>1e-8){
          const inward=Math.min(0,(velocity.x*sx+velocity.y*sy+velocity.z*sz)/lengthSquared);
          velocity.x-=sx*inward;
          velocity.y-=sy*inward;
          velocity.z-=sz*inward;
        }
        if(target.y!==raw.y && (raw.y-target.y)*velocity.y>0) velocity.y=0;
      }
    }
    function update(dt) {
      dt = clamp(dt, 0, 0.05);
      if (glide) {
        updateGlide(dt);
        return false;
      }

      const active = new Set(screenActions);
      for (const code of pressedKeys) active.add(keyActions.get(code));
      const along = Number(active.has('forward')) - Number(active.has('back'));
      const across = Number(active.has('right')) - Number(active.has('left'));
      const vertical = Number(active.has('up')) - Number(active.has('down'));
      if (along || across || vertical) setCruise(false);

      const speed = active.has('boost') ? 6.7 : 4.15;
      const forwardSpeed = speed * along / Math.max(1, Math.hypot(along, across));
      const strafeSpeed = speed * across / Math.max(1, Math.hypot(along, across));
      const sin = Math.sin(camera.yaw);
      const cos = Math.cos(camera.yaw);
      const flatForward = forwardSpeed * Math.cos(camera.pitch);
      const desiredX = flatForward * sin + strafeSpeed * cos;
      const desiredZ = -flatForward * cos + strafeSpeed * sin;
      const desiredY = forwardSpeed * Math.sin(camera.pitch) + vertical * speed * .68;
      const response = 1 - Math.exp(-dt * 6.8);
      velocity.x += (desiredX - velocity.x) * response;
      velocity.y += (desiredY - velocity.y) * response;
      velocity.z += (desiredZ - velocity.z) * response;

      moveBy(velocity.x*dt,velocity.y*dt,velocity.z*dt);
      return true;
    }
    window.addEventListener('keydown', event => {
      const action = keyActions.get(event.code);
      if (!action || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target.closest?.('input, textarea, select, [contenteditable]')) return;
      if (event.code === 'Space' && event.target.closest?.('button, a[href], [role="button"]')) return;
      event.preventDefault();
      pressedKeys.add(event.code);
      if (action !== 'boost') manualInput();
    });

    window.addEventListener('keyup', event => pressedKeys.delete(event.code));
    window.addEventListener('blur', () => {
      pressedKeys.clear();
      screenActions.clear();
      drag = null;
      stopMotion();
    });

    canvas.addEventListener('pointerdown', event => {
      if (drag || event.button !== 0) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.focus({ preventScroll: true });
      canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener('pointermove', event => {
      if (drag?.id !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (!dx && !dy) return;

      manualInput();
      const sensitivity = event.pointerType === 'touch' ? 0.0051 : 0.0043;
      camera.yaw = angleDifference(0, camera.yaw + dx * sensitivity);
      camera.pitch = clamp(camera.pitch - dy * sensitivity, -1.36, 1.41);
    });

    function endDrag(event) {
      if (drag?.id === event.pointerId) drag = null;
    }

    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('lostpointercapture', endDrag);

    return { camera, update, reset, resetImmediately, goto, setInput, setCruise, getCruise: () => cruising };
  };
})();
