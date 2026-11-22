import * as THREE from './vendor/three.module.js';

const heading = -.50;

// A ring is [longitudinal x, centre height, vertical radius, lateral radius].
function loft(rings, sides, tint) {
  const positions = [], colors = [], indices = [];
  rings.forEach(([x, y, height, width], row) => {
    for (let i = 0; i < sides; i++) {
      const a = i / sides * Math.PI * 2;
      positions.push(x, y + height * Math.cos(a), width * Math.sin(a));
      tint(x, Math.cos(a)).toArray(colors, colors.length);
      if (row) {
        const j = row * sides + i, k = row * sides + (i + 1) % sides;
        indices.push(j - sides, k - sides, j, k - sides, k, j);
      }
    }
  });
  return geometry(positions, colors, indices);
}

function geometry(positions, colors, indices) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

// Bake the individual eyes, toes and feather surfaces into one static draw.
function bodyBatch() {
  const positions = [], normals = [], colors = [];
  function append(g, color) {
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), c = g.getAttribute('color');
    const ix = g.index;
    for (let i = 0; i < (ix ? ix.count : p.count); i++) {
      const j = ix ? ix.getX(i) : i;
      positions.push(p.getX(j), p.getY(j), p.getZ(j));
      normals.push(n.getX(j), n.getY(j), n.getZ(j));
      if (color) colors.push(color.r, color.g, color.b);
      else colors.push(c.getX(j), c.getY(j), c.getZ(j));
    }
    g.dispose();
  }
  function ellipsoid(x, y, z, a, b, c, color) {
    const g = new THREE.SphereGeometry(1, 12, 8);
    append(g.scale(a,b,c).translate(x,y,z), color);
  }
  function joint(start, end, r1, r2, color) {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
    const delta = b.clone().sub(a);
    const g = new THREE.CylinderGeometry(r2, r1, delta.length(), 7, 1);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), delta.normalize()));
    a.lerp(b,0.5);
    append(g.translate(a.x,a.y,a.z),color);
  }
  const white = new THREE.Color('#f0efdf'), grey = new THREE.Color('#a4b1ba');
  append(loft([
    [-.312,.421,.003,.004],[-.270,.415,.044,.057],[-.196,.406,.092,.102],
    [-.110,.405,.123,.127],[-.020,.412,.140,.137],[.060,.431,.134,.127],
    [.117,.465,.108,.106],[.154,.502,.092,.087],[.183,.529,.091,.083],
    [.217,.548,.095,.086],[.251,.553,.090,.082],[.282,.550,.078,.072],
    [.308,.545,.055,.056],[.324,.542,.031,.038],[.330,.542,.004,.004],
  ],28,(x,up) => white.clone().lerp(grey, THREE.MathUtils.smoothstep(up,.18,.86)
    * (1 - THREE.MathUtils.smoothstep(x,.025,.16)) * .90)));
  const beak = new THREE.Color('#e2ba62'), billShadow = new THREE.Color('#ad8249');
  const billSpot = new THREE.Color('#b76a43');
  append(loft([[.298,.537,.028,.046],[.326,.542,.027,.037],[.369,.543,.022,.026],
    [.402,.537,.017,.014],[.424,.527,.008,.008],[.429,.519,.001,.001]],
    16,(x,up)=>billShadow.clone().lerp(beak, THREE.MathUtils.smoothstep(up,-.90,.35))
      .lerp(billSpot,Math.exp(-((x-.40)**2/.00017 + (up+.66)**2/.12))*.82)));
  const feet = new THREE.Color('#c99d7e'), nails = new THREE.Color('#61564b');
  const iris = new THREE.Color('#ac925c'), pupil = new THREE.Color('#252725');
  const pearl = new THREE.Color('#faf5e1');
  for (const side of [-1,1]) {
    ellipsoid(.256,.572,side*.075,.014,.014,.010,iris);
    ellipsoid(.258,.573,side*.081,.010,.010,.007,pupil);
    ellipsoid(.261,.577,side*.086,.0026,.0026,.0022,pearl);
    ellipsoid(.334,.555,side*.029,.009,.0028,.0027,nails);
    // Both feet straddle the same wire. Account for the yaw between the gull
    // and the sign when curling the toes across the wire's axis.
    const x = -.029 * side;
    const z = Math.tan(heading) * x;
    const hip = [-.036+x,.315,side*.061], ankle = [-.072+x,.181,side*.065];
    const ball = [x,.016,z-.015];
    joint(hip,ankle,.017,.012,feet);
    joint(ankle,ball,.012,.009,feet);
    ellipsoid(...ball,.018,.009,.016,feet);
    const knuckles = [];
    for (const spread of [-1,0,1]) {
      const along = spread*.015;
      const reach = spread === 0 ? .028 : .022;
      const bend = [x+.015+along,.020,z+reach*.44-along*.44];
      const lip = [x+.019+along,.000,z+reach-along*.44];
      knuckles.push(bend);
      joint(ball,bend,.007,.0055,feet);
      joint(bend,lip,.0055,.0048,feet);
      joint(lip,[x+.013+along,-.018,z+reach*.39-along*.44],.0048,.001,nails);
    }
    const web = new THREE.BufferGeometry();
    web.setAttribute('position',new THREE.Float32BufferAttribute([...ball,...knuckles[2],
      ...knuckles[1],...ball,...knuckles[1],...knuckles[0]],3));
    web.computeVertexNormals();
    append(web,feet);
    const heel = [x-.016,-.006,z-.027];
    joint(ball,heel,.007,.0045,feet);
    joint(heel,[x-.011,-.021,z-.011],.0045,.001,nails);
  }
  // A gull's pale tail spreads very slightly while carrying a load.
  for (let i=-3;i<=3;i++) {
    const quill = new THREE.SphereGeometry(1,14,6);
    quill.scale(.135,.010,.026).rotateY(i*.087).rotateZ(-.105)
      .translate(-.298+Math.abs(i)*.006,.418-Math.abs(i)*.002,i*.020);
    append(quill, white.clone().lerp(grey,.12 + .055*Math.abs(i)));
  }
  const g = new THREE.BufferGeometry();
  for (const [name,array] of [['position',positions],['normal',normals],['color',colors]]) {
    g.setAttribute(name,new THREE.Float32BufferAttribute(array,3));
  }
  return g;
}

// Each section describes span, leading edge, trailing edge and dihedral.
// The elbow sweeps forward and the slender primaries then sweep aft.
const wingSections = [
  [0,.113,-.177,.000],[.13,.149,-.194,.040],[.20,.168,-.186,.060],
  [.27,.183,-.172,.077],[.34,.190,-.155,.092],[.41,.193,-.142,.100],
  [.47,.190,-.130,.103],[.52,.183,-.121,.100],[.58,.167,-.124,.091],[.63,.149,-.134,.078],
  [.72,.100,-.168,.050],[.76,.068,-.188,.038],[.79,.042,-.199,.027],
  [.825,-.002,-.212,.016],[.85,-.033,-.228,.007],[.88,-.070,-.233,-.003],
  [.90,-.093,-.249,-.010],[.925,-.129,-.250,-.018],[.95,-.159,-.260,-.024],
  [.975,-.205,-.258,-.030],[1,-.254,-.268,-.036],
];

function articulatedWings(material) {
  const pos = [], colors = [], indices = [], weights = [], joints = [], bones = [];
  const upper = new THREE.Color('#a7b4bd'), lower = new THREE.Color('#dfdfd3');
  const black = new THREE.Color('#353d46'), white = new THREE.Color('#eaeade');
  for (const side of [-1,1]) {
    const boneIndex = bones.length;
    const root = new THREE.Bone(), wrist = new THREE.Bone();
    root.position.set(.017,.467,side*.065);
    wrist.position.set(.062,.095,side*.59);
    root.add(wrist);
    bones.push(root,wrist);
    const columns = 8;
    for (const top of [true,false]) {
      const first = pos.length/3;
      wingSections.forEach(([span,leading,trailing,rise],row) => {
        const primary = THREE.MathUtils.smoothstep(span,.68,.90);
        for (let c=0;c<=columns;c++) {
          const u = c / columns;
          const rear = THREE.MathUtils.smoothstep(u,.52,1);
          const stagger = (row % 2) * rear * (1 - THREE.MathUtils.smoothstep(span,.95,1));
          const chord = THREE.MathUtils.lerp(leading,trailing,u)
            - (.006 + primary*.022)*stagger;
          const sweptSpan = span + (.003 + primary*.014)*stagger;
          const arch = Math.sin(Math.PI*u);
          const thickness = (.006+.018*(1-span)) * arch;
          const height = rise + .021*arch*(1-span) + (top ? 1 : -1)*thickness - stagger*.007;
          pos.push(chord,.467+height,side*(.065+1.22*sweptSpan));
          const tint = (top ? upper : lower).clone();
          const feather = .5 + .5*Math.cos(span*76.0 + u*2.7);
          // A scalloped row of coverts overhangs the cooler flight feathers.
          const coverts = .50 + .08*feather;
          const overlap = Math.exp(-((u-coverts)**2/.006));
          tint.multiplyScalar(1-.16*overlap*(1-primary)-.12*feather*rear);
          tint.lerp(black,primary*(top ? 1 : .95));
          const whiteTrailingEdge = (1-primary)*THREE.MathUtils.smoothstep(u,.67,.98)*.86;
          const mirror = Math.exp(-((span-.928)**2/.00021 + (u-.56)**2/.038));
          tint.lerp(white,Math.min(1,whiteTrailingEdge+mirror*.9+THREE.MathUtils.smoothstep(span,.961,1)*.7));
          tint.toArray(colors,colors.length);
          const bend = THREE.MathUtils.smoothstep(span,.39,.65);
          joints.push(boneIndex,boneIndex+1,0,0);
          weights.push(1-bend,bend,0,0);
          if (row && c) {
            const i=first+row*(columns+1)+c;
            const a=i-columns-2, b=i-columns-1, d=i-1;
            if ((side>0) === top) indices.push(a,b,d,b,i,d);
            else indices.push(a,d,b,b,d,i);
          }
        }
      });
    }
  }
  const g = geometry(pos,colors,indices);
  g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(joints,4));
  g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  const mesh = new THREE.SkinnedMesh(g,material);
  mesh.add(bones[0],bones[2]);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.frustumCulled = false;
  return {mesh,bones};
}

export function createCarrierGull() {
  const object = new THREE.Group();
  object.name = 'Sign-carrying gull';
  const bird = new THREE.Group();
  // A three-quarter heading separates the near and far wings in the camera.
  bird.rotation.y = heading;
  const plumage = new THREE.MeshStandardMaterial({vertexColors:true,roughness:.88});
  bird.add(new THREE.Mesh(bodyBatch(),plumage));
  const {mesh,bones} = articulatedWings(plumage);
  bird.add(mesh);
  object.add(bird);
  function update(time, exertion = .2) {
    const beat = time * 7.9;
    const lift = .18 + (.54*exertion+.025)*Math.sin(beat);
    const flex = -.28 + exertion*.37*Math.sin(beat-.84);
    const bank = .082 + Math.sin(time*.83)*.065;
    for (let i=0;i<2;i++) {
      const side = i*2-1;
      bones[i*2].rotation.x = -side*lift + bank;
      bones[i*2+1].rotation.x = -side*flex;
      bones[i*2+1].rotation.z = exertion*.084*Math.cos(beat-.50);
    }
    bird.rotation.z = .016*Math.sin(beat-.4)*exertion;
  }
  update(0);
  return {object,update};
}
