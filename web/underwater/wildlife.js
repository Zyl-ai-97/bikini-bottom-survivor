(() => {
  'use strict';

  const TAU = 2 * Math.PI;
  const MATERIAL = 21;
  const palettes = [
    { body:[1,.43,.072], belly:[1,.76,.22], band:[.96,.91,.80], fin:[.85,.25,.055], edge:[.12,.102,.15] },
    { body:[.13,.44,.94], belly:[.28,.75,1], band:[.10,.20,.40], fin:[.98,.68,.12], edge:[.17,.32,.56] },
    { body:[.79,.17,.41], belly:[.97,.52,.54], band:[.99,.68,.22], fin:[.93,.34,.27], edge:[.55,.15,.35] },
    { body:[.12,.67,.58], belly:[.51,.94,.72], band:[.085,.31,.31], fin:[.29,.85,.64], edge:[.10,.48,.49] }
  ];

  const schools = [
    { center:[-14,6.7,1], heading: .46, pace:.67, radius:2.65, count:5, type:0, size:.51 },
    { center:[16.3,8.9,-22], heading:2.12, pace:.52, radius:4.10, count:5, type:1, size:.66 },
    { center:[-8.7,7.45,-43.2], heading:1.06, pace:.58, radius:3.45, count:4, type:2, size:.54 },
    { center:[11.7,5.6,-64], heading:3.95, pace:.43, radius:4.20, count:4, type:3, size:.59 }
  ];

  const fish = schools.flatMap((school, group) => Array.from({ length:school.count }, (_, member) => {
    const offset = member * 1.92 + group * .55;
    // An uneven wedge gives the school depth and predictable spacing as it turns.
    return {
      group, member,
      size:school.size * (1 + .19 * Math.cos(offset * 1.7)),
      origin:[
        school.center[0] + (member - (school.count - 1) * .5) * .86,
        school.center[1] + .38 * Math.cos(offset * 1.7) + (member % 2) * .29,
        school.center[2] + .63 * Math.sin(offset) + (member % 3) * .62
      ]
    };
  }));

  const mix = (a,b,t) => a.map((n,i) => n + (b[i] - n) * t);
  const vector = value => `vec3(${value.map(n => n.toFixed(5)).join(',')})`;

  // Each vertex holds the integer fish index in a_type.y. The same center and
  // heading apply to the entire fish, including its eyes and thin membranes.
  window.diveFishMotion = `
    const vec3 fishCenters[${fish.length}] = vec3[${fish.length}](${fish.map(f => vector(f.origin)).join(',')});
    const int fishSchool[${fish.length}] = int[${fish.length}](${fish.map(f => f.group).join(',')});
    const vec3 schoolMotion[${schools.length}] = vec3[${schools.length}](${
      schools.map(s => vector([s.heading,s.pace,s.radius])).join(',')
    });

    void swimDiveFish(inout vec3 position, inout vec3 normal, float tag, float time) {
      int index = int(tag + .5);
      int group = fishSchool[index];
      vec3 origin = fishCenters[index];
      vec3 motion = schoolMotion[group];
      float turn = time * motion.y + motion.x;
      vec2 course = vec2(cos(turn), .70 * sin(turn));
      vec2 travel = motion.z * vec2(sin(turn), -.70 * cos(turn));
      vec2 forward = normalize(course);
      vec2 right = vec2(-forward.y, forward.x);
      float timing = time * (7.6 + float(group) * .23) + float(index) * 1.82;
      vec3 p = position - origin;
      float tail = smoothstep(.05, .56, -p.x);
      p.z += tail * sin(timing - p.x * 7.0) * .115;
      p.y += tail * cos(timing * .73) * .018;
      position.xz = origin.xz + travel + forward * p.x + right * p.z;
      position.y = origin.y + p.y + .39 * sin(turn * 1.37) + .055 * sin(timing * .31);
      normal.xz = forward * normal.x + right * normal.z;
    }
  `;

  window.buildDiveWildlife = function buildDiveWildlife(mesh) {
    fish.forEach(({group,size,origin}, index) => {
      const palette = palettes[schools[group].type];
      const p = local => local.map((n,i) => origin[i] + n * size);
      const tri = (a,b,c,color) => mesh.triangle(p(a),p(b),p(c),color,MATERIAL,index);
      const quad = (a,b,c,d,color) => {
        tri(a,b,c,color);
        tri(a,c,d,color);
      };
      // A spindle body with a tall shoulder, rounded head and narrow tail stock.
      const sections = [
        [-.82,.036,.040],[-.64,.12,.090],[-.39,.24,.147],[-.20,.29,.175],
        [.035,.32,.194],[.22,.29,.186],[.44,.206,.153],[.57,.118,.114],[.65,.030,.045]
      ];
      const sides = 8;
      const point = ([x,h,w],i) => [x,Math.cos(i * TAU / sides) * h,Math.sin(i * TAU / sides) * w];
      for (let segment = 0; segment < sections.length - 1; segment++) {
        for (let i = 0; i < sides; i++) {
          const reefBlue = group === 1 && (segment === 1 || (segment <= 5 && (i === 0 || i === 7)));
          const stripe = group === 0 ? segment === 2 || segment === 5 :
            group === 2 ? segment === 1 || (segment === 4 && i > 1 && i < 6) :
            group === 3 && (segment === 2 || segment === 4);
          const tone = .22 + .34 * (1 - Math.cos((i + .5) * TAU / sides));
          const base = mix(palette.body,palette.belly,tone);
          const color = reefBlue || stripe ? mix(palette.band,base,.14 + .12 * tone) : base;
          quad(point(sections[segment],i),point(sections[segment],i + 1),
            point(sections[segment + 1],i + 1),point(sections[segment + 1],i),color);
        }
      }
      for (let side = 0; side < sides; side++) {
        tri([.675,.002,0],point(sections.at(-1),side),point(sections.at(-1),side + 1),palette.body);
      }

      function fin(root, rib, outline) {
        for (let i = 0; i < outline.length - 1; i++) {
          const color = i === 0 || i === outline.length - 2 ? mix(palette.fin,palette.edge,.32) : palette.fin;
          tri(root,outline[i],outline[i + 1],color);
          tri(rib,outline[i + 1],outline[i],mix(color,palette.belly,.15));
        }
      }

      fin([-.78,0,.021],[-.83,0,-.027],[
        [-.89,.085,0],[-1.08,.23,.002],[-1.26,.28,.035],[-1.18,.128,.055],[-1.08,.025,.042],
        [-1.16,-.085,.031],[-1.25,-.23,-.007],[-1.10,-.21,-.026],[-.88,-.067,0]
      ]);
      fin([-.15,.24,.021],[-.20,.252,-.023],[
        [.25,.265,0],[.13,.407,.020],[-.08,.446,.032],[-.33,.415,.016],[-.61,.225,-.005],[-.66,.137,0]
      ]);
      fin([-.24,-.21,.018],[-.32,-.18,-.033],[
        [-.045,-.262,0],[-.16,-.332,.015],[-.35,-.326,.013],[-.58,-.177,0]
      ]);

      for (const sign of [-1,1]) {
        const gill = [.20,-.015,sign * .167];
        fin(gill,[.17,-.040,sign * .144],[
          [.11,-.07,sign * .20],[.01,-.157,sign * .28],[-.12,-.177,sign * .29],[-.18,-.142,sign * .236]
        ]);
        for (const [x,y,z,radius,color] of [
          [.431,.075,.136,.079,[.12,.11,.15]],
          [.433,.079,.151,.062,[.95,.88,.62]],
          [.451,.082,.160,.043,[.018,.029,.053]],
          [.471,.102,.164,.013,[1,.97,.91]]
        ]) {
          const center = [x,y,sign*z];
          for (let i = 0; i < 5; i++) {
            const a = i * TAU / 5, b = (i + 1) * TAU / 5;
            const rim = angle => [x + Math.cos(angle) * radius,y + Math.sin(angle) * radius, sign * (z - .008)];
            if (sign > 0) tri(center,rim(a),rim(b),color);
            else tri(center,rim(b),rim(a),color);
          }
        }
      }
    });
  };
})();
