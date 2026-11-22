(() => {
  'use strict';

  // City to bay. The trail narrows through the reef gap before reaching
  // the open sand behind the initial camera.
  const waypoints = [
    {x:-1.67,z:-37.20,width:.82},
    {x:-2.94,z:-31.20,width:.98},
    {x:-3.57,z:-25.00,width:1.10},
    {x:-3.35,z:-21.45,width:1.15},
    {x:-1.83,z:-18.00,width:1.18},
    {x:1.16,z:-13.80,width:1.22},
    {x:2.76,z:-10.32,width:1.23},
    {x:2.67,z:-7.82,width:1.20},
    {x:2.18,z:-5.48,width:1.14},
    {x:1.13,z:-2.67,width:1.11},
    {x:-.44,z:1.06,width:1.06},
    {x:-.57,z:3.58,width:1.02},
    {x:-1.82,z:6.78,width:1.00},
    {x:-1.85,z:8.34,width:1.02},
    {x:-.76,z:11.48,width:.90},
    {x:-.32,z:14.00,width:.89},
    {x:.49,z:16.00,width:.83},
    {x:1.04,z:17.00,width:.75},
    {x:1.34,z:18.00,width:.69},
    {x:1.83,z:19.00,width:.68},
    {x:2.39,z:20.00,width:.70},
    {x:2.79,z:21.00,width:.79},
    {x:2.90,z:22.20,width:.91},
    {x:2.92,z:25.80,width:.95},
    {x:3.15,z:29.00,width:.95},
    {x:3.56,z:32.35,width:.90}
  ];

  function tangent(i, key) {
    if(i===0&&key==='x') return -.2536585;
    const before=waypoints[Math.max(0,i-1)];
    const after=waypoints[Math.min(i+1,waypoints.length-1)];
    return (after[key]-before[key])/(after.z-before.z);
  }

  function interpolate(i,t,key) {
    const a=waypoints[i], b=waypoints[i+1];
    const t2=t*t, t3=t2*t;
    const length=b.z-a.z;
    return (2*t3-3*t2+1)*a[key]+(t3-2*t2+t)*length*tangent(i,key)+
      (-2*t3+3*t2)*b[key]+(t3-t2)*length*tangent(i+1,key);
  }

  window.buildBayApproach = function buildBayApproach() {
    const samples=[];
    for(let i=0;i<waypoints.length-1;i++) {
      const a=waypoints[i], b=waypoints[i+1];
      const steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.14);
      for(let j=0;j<steps;j++) {
        const t=j/steps;
        samples.push({x:interpolate(i,t,'x'),z:a.z+(b.z-a.z)*t,width:interpolate(i,t,'width')});
      }
    }
    samples.push({...waypoints[waypoints.length-1]});
    return samples;
  };
})();
