(() => {
  'use strict';

  const surfaceY = 100;
  // Stretch the light field less across the water than up through it so the deeper column stays visible.
  const lightingSurfaceY = 54;
  const lightFieldAnchor = [0, 7.6, 10.3];
  const lightFieldVerticalScale = (surfaceY - lightFieldAnchor[1]) / (lightingSurfaceY - lightFieldAnchor[1]);
  const lightFieldHorizontalScale = 1.25;
  const nearClip = 0.056;
  const farClip = 340;
  const depthScale = (farClip + nearClip) / (farClip - nearClip);
  const depthOffset = 2 * farClip * nearClip / (farClip - nearClip);
  const surfaceSun = [-.061, .387, -.920];
  const sunHorizontalLength = Math.hypot(surfaceSun[0],surfaceSun[2]);
  const sunAlong = [surfaceSun[0]/sunHorizontalLength,surfaceSun[2]/sunHorizontalLength];
  const sunAcross = [-sunAlong[1],sunAlong[0]];
  const patchGridRadiusX = 4;
  const patchGridRadiusZ = 3;
  const patchCount = (patchGridRadiusX * 2 + 1) * (patchGridRadiusZ * 2 + 1);
  const patchSpacingX = 18.5;
  const patchSpacingZ = 26;
  const patchFadeX = patchGridRadiusX + .08;
  const patchFadeZ = patchGridRadiusZ + .08;
  const apertureCenter = [-8,-74];
  const lightFieldReach = 246;
  const apertureFalloffLimit = 19;
  const shaftFalloffLimit = 20;
  const shaftWidthAtSurface = 1.65;
  const shaftWidthByDepth = .061;
  const shaftGridSize = [2*patchGridRadiusX+1,2*patchGridRadiusZ+1];
  const shaftSpacing = [patchSpacingX,patchSpacingZ];
  const shaftGridOrigin = apertureCenter.map((value,axis)=>
    Math.floor(value/shaftSpacing[axis])-(axis===0?patchGridRadiusX:patchGridRadiusZ));
  const importedAssets = window.bikiniMeshes;
  const openingShell = window.diveOpeningShell;
  const proposedLayout = window.bikiniLayout;
  const layout = window.createDiveImports && proposedLayout?.houses?.some(house => importedAssets?.[house.id])
    ? proposedLayout : null;

  function viewLens(canvas, fieldOfView) {
    const aspect = Math.max(1,canvas.clientWidth) / Math.max(1,canvas.clientHeight);
    const horizontal = fieldOfView?.horizontal;
    const vertical = fieldOfView?.vertical ?? (aspect < 1 ? 82 : 80);
    const focalX = horizontal === undefined ? (aspect < 1 ? 1.25 : 1.55) / aspect : 1 / Math.tan(horizontal * Math.PI / 360);
    return [focalX, 1 / Math.tan(vertical * Math.PI / 360)];
  }

  // Bounds include the whole sub-cell jitter and wave motion of each aperture.
  // Projecting their cones onto X and Z gives independent conservative tests.
  function shaftStrips(axis) {
    const other = 1-axis;
    const otherMin = (shaftGridOrigin[other]+.12)*shaftSpacing[other];
    const otherMax = (shaftGridOrigin[other]+shaftGridSize[other]-.12)*shaftSpacing[other];
    return Array.from({length:shaftGridSize[axis]},(_,index)=>{
      const a = (shaftGridOrigin[axis]+index+.12)*shaftSpacing[axis];
      const b = (shaftGridOrigin[axis]+index+.88)*shaftSpacing[axis];
      let low=Infinity, high=-Infinity;
      for(const along of [a,b]) for(const side of [otherMin,otherMax]) {
        const across=(along-apertureCenter[axis])*sunAcross[axis]+
          (side-apertureCenter[other])*sunAcross[other];
        for(const spread of [.88,1.12]) for(const forward of [.36,.59]) {
          const drift=.8*Math.tanh(across/40)*spread*sunAcross[axis]-forward*sunAlong[axis];
          low=Math.min(low,drift);
          high=Math.max(high,drift);
        }
      }
      return `vec4(${[a,b,low-.0001,high+.0001].map(value=>value.toFixed(6)).join(',')})`;
    }).join(',');
  }
  const floor = (x, z) => {
    const swell = 0.36 * Math.sin(x * 0.14 + z * 0.11) + 0.26 * Math.sin(z * 0.23 - x * 0.12);
    const dunes = 0.20 * Math.sin(x * 0.33 + z * 0.21) * Math.sin(z * 0.12);
    const trench = 4.2 * Math.exp(-((x + 26) ** 2 / 138 + (z + 47) ** 2 / 900));
    const shelf = 0.94 * Math.exp(-((x - 31) ** 2 + (z + 40) ** 2) / 270);
    const lookout = 1.13 * Math.exp(-((z - 7.3) ** 2 / 48 + x ** 2 / 166));
    const distance = Math.max(0, -z - 19);
    const offshore = 4.6 * (1 - Math.exp(-distance / 69)) ** 1.32;
    const relief = 0.35 + 0.65 * Math.exp(-distance / 57);
    // The town stands on an inclined sandbank. From the bay the back streets
    // rise above the front roofs, and each street still meets the sea floor.
    const bank = 5.45 * Math.exp(-(((x-2)/29)**4 + ((z+62)/17.5)**2));
    const approach = 1.15 * Math.exp(-(((x-1)/19)**4 + ((z+35)/8.3)**2));
    const outerBank = 3.8*Math.exp(-(((x+23)/23)**2+((z-63)/14)**2)) +
      5.7*Math.exp(-(((x-47)/24)**2+((z-80)/17)**2)) +
      4.3*Math.exp(-(((x+80)/18)**2+((z-12)/36)**2)) +
      3.5*Math.exp(-(((x-76)/21)**2+((z-2)/29)**2));
    const natural = (swell + dunes) * relief + shelf + lookout - trench - offshore + bank - approach + outerBank;
    return layout?.grade?.(x,z,natural) ?? natural;
  };

  // Use the same two triangles for placement, swimming clearance and rendering.
  const gridAxis = Array.from({length:169},(_,i)=>{
    const offset=i-84, distance=Math.abs(offset);
    if (distance<=40) return offset*1.5;
    const t=(distance-40)/44;
    return Math.sign(offset)*(60+290*t*(.32+.68*t));
  });
  const gridHeights = gridAxis.map(z=>gridAxis.map(x=>floor(x,z)));
  function cellAt(value) {
    let low=0, high=gridAxis.length-1;
    while (high-low>1) {
      const middle=(low+high)>>1;
      if (gridAxis[middle]<=value) low=middle;
      else high=middle;
    }
    return low;
  }
  function seabedFloor(x,z) {
    const i=cellAt(x), j=cellAt(z);
    const u=(x-gridAxis[i])/(gridAxis[i+1]-gridAxis[i]);
    const v=(z-gridAxis[j])/(gridAxis[j+1]-gridAxis[j]);
    const a=gridHeights[j][i], b=gridHeights[j][i+1];
    const c=gridHeights[j+1][i], d=gridHeights[j+1][i+1];
    return u+v<=1 ? a+u*(b-a)+v*(c-a) : d+(1-u)*(c-d)+(1-v)*(b-d);
  }

  const water = `
    uniform float u_time;
    uniform vec3 u_eye;
    uniform sampler2D u_caustics;
    const vec3 sun = normalize(vec3(-.30,.86,-.48));
    const vec3 surfaceSun = normalize(vec3(${surfaceSun.join(', ')}));
    const float waterY = ${lightingSurfaceY}.0;
    const vec3 lightAnchor = vec3(${lightFieldAnchor.map(value => value.toFixed(1)).join(', ')});
    const vec3 lightScale = vec3(${lightFieldHorizontalScale}, ${lightFieldVerticalScale}, ${lightFieldHorizontalScale});
    const int patchCount = ${patchCount};
    const int shaftColumns = ${shaftGridSize[0]};
    const int shaftRows = ${shaftGridSize[1]};
    const ivec2 shaftOrigin = ivec2(${shaftGridOrigin.join(',')});
    const vec2 shaftSpacing = vec2(${shaftSpacing.map(value=>value.toFixed(2)).join(',')});
    const vec4 columnStrips[shaftColumns] = vec4[shaftColumns](${shaftStrips(0)});
    const vec4 rowStrips[shaftRows] = vec4[shaftRows](${shaftStrips(1)});
    const float lightFieldReach = ${lightFieldReach}.0;
    uniform vec4 u_lightPatches[patchCount];
    uniform vec2 u_lightDirections[patchCount];
    uniform vec3 u_lightHues[patchCount];
    uniform vec4 u_lightArea;

    vec3 lightPosition(vec3 p) {
      return lightAnchor + (p-lightAnchor)/lightScale;
    }

    float illuminationHeight(float y) {
      return y-max(0.0,y-lightAnchor.y)*(1.0-1.0/lightScale.y);
    }

    float hash21(vec2 p) {
      vec3 q = fract(p.xyx * vec3(.1031, .1099, .1137));
      q += dot(q, q.yzx + 33.33);
      return fract((q.x + q.y) * q.z);
    }

    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f*f*(3.0-2.0*f);
      return mix(mix(hash21(i), hash21(i+vec2(1,0)), f.x),
                 mix(hash21(i+vec2(0,1)), hash21(i+vec2(1)), f.x), f.y);
    }

    vec2 surfaceProjection(vec3 p) {
      return p.xz + (waterY-p.y)*sun.xz/sun.y;
    }

    float skyTransmission(vec2 surfacePoint) {
      float swell = sin(dot(surfacePoint,vec2(.083,.057))+.65*sin(surfacePoint.y*.067)+u_time*.14);
      float crossSwell = sin(dot(surfacePoint,vec2(-.125,.173))-u_time*.21);
      return .86+.105*swell+.035*crossSwell;
    }

    vec2 currentLight(vec3 p) {
      vec2 origin = surfaceProjection(p);
      vec2 bent = origin + .22*vec2(
        sin(origin.y*1.65+.67*sin(origin.x*.78)+u_time*.51),
        sin(origin.x*1.48+.56*cos(origin.y*.94)-u_time*.43)
      );
      vec2 projected = bent*.069 + .003*vec2(u_time,-u_time);
      vec2 swell = vec2(sin(origin.y*.24+origin.x*.14-u_time*.24),
                        sin(origin.x*.19-origin.y*.11+u_time*.17));
      projected += swell*.033;
      vec2 focused = texture(u_caustics,projected).gb;
      // Crossing waves split a few crests into softer, slightly displaced folds.
      float doubleCrest = smoothstep(-.18,.86,.58*swell.x+.42*swell.y);
      vec2 split = texture(u_caustics,projected+.010*swell+vec2(.004,-.003)).gb;
      return mix(focused,max(focused*.77,split*.67),.63*doubleCrest);
    }

    float solarAlignment(vec3 direction) {
      return max(0.0,dot(direction,surfaceSun));
    }

    float forwardLight(float alignment) {
      return smoothstep(.47,.955,alignment)*(.25+.75*pow(alignment,5.0));
    }

    vec3 seaColor(vec3 direction) {
      float above = smoothstep(-.18, .60, direction.y);
      float towardSun = pow(solarAlignment(direction),9.0);
      vec3 distanceColor = mix(vec3(.014,.137,.309), vec3(.079,.410,.584), above);
      float distantHaze = pow(max(0.0,dot(direction,vec3(-.06,-.045,-.997))),7.0);
      float elevation = direction.y + .07;
      distantHaze *= exp(-18.0*elevation*elevation);
      distanceColor += vec3(.009,.051,.064)*distantHaze;
      float deeper = smoothstep(17.0,36.0,waterY-illuminationHeight(u_eye.y));
      distanceColor *= mix(vec3(1.0),vec3(.74,.94,.99),deeper);
      return distanceColor + vec3(.039,.112,.147)*towardSun;
    }

    vec3 horizonColor() { return vec3(.075,.36,.54); }

    float beamAlongRay(vec4 aperture, vec2 drift, vec3 viewRay, vec3 eye, float limit) {
      if (aperture.w < .001) return 0.0;
      vec2 fromBeam = eye.xz-aperture.xy-drift*(waterY-eye.y);
      vec2 lateral = viewRay.xz+viewRay.y*drift;
      float speedSquared = max(dot(lateral,lateral),.008);
      float along = -dot(fromBeam,lateral)/speedSquared;
      float sampleDistance = clamp(along,0.0,limit);
      float depth = max(waterY-eye.y-viewRay.y*sampleDistance,0.0);
      float variation = .5+.5*sin(dot(aperture.xy,vec2(.39,.27)));
      float reach = 38.0+21.0*variation+6.0*aperture.w;
      if (depth >= reach) return 0.0;
      float width = aperture.z*(${shaftWidthAtSurface}+${shaftWidthByDepth}*depth);
      vec2 offset = (fromBeam+lateral*sampleDistance)/width;
      float crossSection = dot(offset,offset);
      if (crossSection > ${shaftFalloffLimit}.0) return 0.0;
      float span = width*inversesqrt(speedSquared);
      float visible = smoothstep(-2.3,2.3,(limit-along)/span)-smoothstep(-2.3,2.3,-along/span);
      float thread = .89+.11*sin(dot(offset,vec2(5.7,-3.8))+.39*sin(depth*.27+aperture.x));
      float edge = .67*exp(-1.58*crossSection)*thread+.33*exp(-.49*crossSection);
      float surfaceBloom = exp(-depth*.080);
      edge += .69*surfaceBloom*exp(-.23*crossSection);
      float fadesWithDepth = exp(-depth*.026)*(1.0-smoothstep(reach*.54,reach,depth));
      // The wave-mixed surface layer carries fewer suspended particles.
      float suspended = .21+.79*smoothstep(.30,3.8+1.5*variation,depth);
      float distanceFade = 1.0-smoothstep(lightFieldReach*.80,lightFieldReach,sampleDistance);
      return aperture.w*edge*visible*fadesWithDepth*suspended*exp(-sampleDistance*.0032)*distanceFade;
    }

    float waterRayLimit(vec3 eye, vec3 ray) {
      return ray.y > 0.0 ? clamp((waterY-eye.y)/ray.y,0.0,lightFieldReach) : lightFieldReach;
    }

    vec3 diffuseWater(vec3 eye, vec3 ray) {
      float distanceInWater=waterRayLimit(eye,ray);
      vec3 midpoint=eye+ray*distanceInWater*.61;
      float diffuse=(1.0-exp(-distanceInWater*.043))*exp(-max(0.0,waterY-midpoint.y)*.009);
      return vec3(.037,.112,.168)*diffuse*(.44+.56*skyTransmission(surfaceProjection(midpoint)));
    }

    vec3 mergeHorizon(vec3 water, vec3 direction) {
      float elevation=asin(clamp(direction.y,-1.0,1.0));
      return mix(horizonColor(),water,smoothstep(-.035,.12,elevation));
    }

    vec3 distantWaterColor(vec3 direction) {
      return mergeHorizon(seaColor(direction)+diffuseWater(lightPosition(u_eye),normalize(direction/lightScale)),direction);
    }

    bool crossesShaftStrip(vec4 band, vec2 ends, vec2 depths) {
      const float widthScale = 4.83; // sqrt(20) times the maximum aperture radius.
      const float padding = widthScale*${shaftWidthAtSurface};
      const float widening = widthScale*${shaftWidthByDepth};
      vec2 left = ends-(band.z-widening)*depths;
      vec2 right = ends-(band.w+widening)*depths;
      return max(left.x,left.y)>=band.x-padding && min(right.x,right.y)<=band.y+padding;
    }

    vec3 scatter(vec3 direction, float travel) {
      float alignment = solarAlignment(direction);
      float phase = smoothstep(.40,.64,alignment)*.11 + .89*forwardLight(alignment);
      if (phase <= 0.0) return vec3(0);
      vec3 scaledRay = direction/lightScale;
      float distanceScale = length(scaledRay);
      vec3 lightRay = scaledRay/distanceScale;
      vec3 eye = lightPosition(u_eye);
      float beamLimit = min(travel*distanceScale,waterRayLimit(eye,lightRay));
      if (beamLimit <= .001) return vec3(0);
      float inLight = 0.0;
      vec3 colorOfLight = vec3(0.0);
      vec3 rayEnd = eye+lightRay*beamLimit;
      vec2 areaDistance = max(min(eye.xz,rayEnd.xz)-u_lightArea.xy,
                              u_lightArea.xy-max(eye.xz,rayEnd.xz));
      if (all(lessThan(areaDistance,u_lightArea.zw+vec2(90.0,70.0)))) {
        vec2 depths=max(vec2(0),waterY-vec2(eye.y,rayEnd.y));
        int first=shaftColumns, last=-1;
        for(int col=0;col<shaftColumns;col++) {
          if(crossesShaftStrip(columnStrips[col],vec2(eye.x,rayEnd.x),depths)) {
            first=min(first,col);
            last=col;
          }
        }
        if(last<first) return vec3(0);
        for(int row=0;row<shaftRows;row++) {
          if(!crossesShaftStrip(rowStrips[row],vec2(eye.z,rayEnd.z),depths)) continue;
          for(int col=first;col<=last;col++) {
            int i=row*shaftColumns+col;
            float beam=beamAlongRay(u_lightPatches[i],u_lightDirections[i],lightRay,eye,beamLimit);
            inLight+=beam;
            colorOfLight+=beam*u_lightHues[i];
          }
        }
      }
      float strength = (1.0-exp(-inLight*1.11))*phase;
      return colorOfLight*(.90*strength/max(inLight,.0001));
    }

    vec3 waterFog(vec3 color, vec3 direction, float depth) {
      float opticalDepth = .0048*depth+.095*(1.0-exp(-.058*depth));
      opticalDepth += 3.2*smoothstep(166.0,266.0,depth);
      float clear = exp(-opticalDepth);
      vec3 absorbed = color * exp(-depth * vec3(.0034,.00165,.00060));
      return mix(seaColor(direction), absorbed, clear) + vec3(.018,.043,.057)*(1.0-clear);
    }
  `;

  const screenVertex = `#version 300 es
    precision highp float;
    out vec2 v_screen;
    void main() {
      vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
      v_screen = p * 2.0 - 1.0;
      gl_Position = vec4(v_screen, 0, 1);
    }
  `;

  // Volume radiance changes smoothly along a view ray. Cache it in 16 depth
  // slices each frame; opaque silhouettes still sample at their exact hit depth.
  const volumeFragment = `#version 300 es
    precision highp float;
    uniform vec3 u_right, u_up, u_forward;
    uniform vec2 u_lens, u_tileSize;
    out vec4 outColor;
    ${water}
    void main() {
      vec2 tile = floor(gl_FragCoord.xy/u_tileSize);
      float layer = tile.x+tile.y*4.0;
      vec2 screen = 2.0*fract(gl_FragCoord.xy/u_tileSize)-1.0;
      vec3 ray = normalize(u_forward+u_right*screen.x/u_lens.x+u_up*screen.y/u_lens.y);
      float distance = 4.0*(exp2(layer*(7.0/15.0))-1.0);
      outColor = vec4(scatter(ray,distance),1);
    }
  `;
  const volumeSampling = `
    uniform sampler2D u_volume;
    uniform vec2 u_viewport;
    vec3 sampleVolume(float layer) {
      vec2 halfTexel = 2.0/vec2(textureSize(u_volume,0));
      vec2 uv = clamp(gl_FragCoord.xy/u_viewport, halfTexel, 1.0-halfTexel);
      vec2 tile = vec2(mod(layer,4.0),floor(layer*.25));
      return texture(u_volume,(tile+uv)*.25).rgb;
    }
    vec3 volumeToDepth(float distance) {
      float slice = clamp(log2(1.0+.25*distance)*(15.0/7.0),0.0,15.0);
      float lower = floor(slice);
      return mix(sampleVolume(lower),sampleVolume(min(15.0,lower+1.0)),fract(slice));
    }
  `;

  const causticFragment = `#version 300 es
    precision highp float;
    in vec2 v_screen;
    uniform float u_time;
    uniform vec2 u_cellCenters[64];
    out vec4 outColor;

    void main() {
      vec2 uv = (v_screen*.5+.5) * 8.0;
      uv += .27 * vec2(sin(uv.y*1.570796 + u_time*.48), sin(uv.x*2.356194 - u_time*.31));
      uv += .086 * vec2(sin(uv.x*3.92699+uv.y*2.356194-u_time*.21), cos(uv.y*5.49779-uv.x*2.356194+u_time*.28));
      vec2 grid = floor(uv), local = fract(uv);
      float first = 9.0, second = 9.0, third = 9.0;
      for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
          vec2 offset = vec2(x,y);
          ivec2 cell = ivec2(mod(grid+offset,8.0));
          vec2 center = u_cellCenters[cell.y*8+cell.x];
          vec2 delta = center + offset - local;
          float distanceSquared = dot(delta, delta);
          third = min(third,max(second,distanceSquared));
          second = min(second,max(first,distanceSquared));
          first = min(first,distanceSquared);
        }
      }
      float gap = max(0.0, sqrt(second)-sqrt(first));
      float core = exp(-gap*41.0);
      float glow = exp(-gap*10.5);
      float flare = .55*sin(dot(uv,vec2(2.356194,3.141593))+u_time*.39);
      flare += .45*sin(dot(uv,vec2(3.926991,-2.356194))-u_time*.57);
      float focus = .15+.85*smoothstep(-.70,.70,flare);
      float junction = exp(-18.0*max(0.0,sqrt(third)-sqrt(second)));
      float filament = exp(-gap*mix(26.,47.,focus))*focus*(1.0+.21*junction);
      float halo = exp(-gap*8.7)*(.62+.38*focus);
      outColor = vec4(.70*core+.30*glow,filament,halo,1);
    }
  `;

  const backgroundFragment = `#version 300 es
    precision highp float;
    in vec2 v_screen;
    out vec4 outColor;
    uniform vec3 u_right, u_up, u_forward;
    uniform vec2 u_lens;
    uniform sampler2D u_waterArt;
    uniform float u_waterReady;
    ${water}
    ${volumeSampling}

    vec4 waveSurface(vec2 q) {
      const vec2 mainSwell = vec2(.24,.43);
      const vec2 crossSwell = vec2(-.53,.34);
      const vec2 shortWave = vec2(.49,.91);
      const vec2 chop = vec2(.94,-1.17);
      const vec2 windRipple = vec2(.61,2.63);
      float a = dot(q,mainSwell) - u_time*.94 + .38*sin(dot(q,vec2(-.11,.16)));
      float b = dot(q,crossSwell) - u_time*1.07;
      float c = dot(q,shortWave) - u_time*1.32;
      float d = dot(q,chop) + u_time*1.57;
      float e = dot(q,windRipple) - u_time*1.98 + .64*sin(b);
      float height = .64*sin(a) + .29*sin(b) + .12*sin(c) + .051*sin(d) + .023*sin(e);
      vec2 slope = .64*cos(a)*mainSwell + .29*cos(b)*crossSwell;
      slope += .12*cos(c)*shortWave + .051*cos(d)*chop + .023*cos(e)*windRipple;
      float crest = sin(a) + .34*sin(b) + .15*sin(c);
      return vec4(height,slope,crest);
    }

    float waveGlints(vec2 q, vec2 slope) {
      vec2 stretched = q + 1.2*slope;
      float bend = noise(stretched*vec2(.43,.50)+vec2(0,u_time*.14));
      float phase = dot(stretched,vec2(.49,2.10)) - u_time*1.69;
      phase += 1.7*bend + .61*sin(dot(stretched,vec2(-.36,.58))+u_time*.71);
      float crest = sin(phase);
      float coverage = noise(stretched*vec2(.79,1.12)+vec2(.28*u_time,0));
      float antialias = min(.25, fwidth(phase)*.25);
      float longStreak = smoothstep(.86-antialias,.99,crest)*smoothstep(.47,.74,coverage);
      longStreak *= 1.0-smoothstep(.8,3.2,fwidth(phase));
      float secondaryPhase = dot(stretched,vec2(-.89,3.34)) - u_time*2.12 + 2.1*bend;
      float shortStreak = smoothstep(.90-antialias,.99,sin(secondaryPhase));
      shortStreak *= 1.0-smoothstep(.7,2.7,fwidth(secondaryPhase));
      float tinyPhase = dot(stretched,vec2(.77,5.2))+2.7*bend-u_time*2.8;
      float smallGlints = smoothstep(.84-antialias,.99,sin(tinyPhase))
                       * smoothstep(.55,.76,noise(stretched*vec2(1.1,1.8)+slope))
                       * (1.0-smoothstep(.6,2.5,fwidth(tinyPhase)));
      return max(max(longStreak,shortStreak*smoothstep(.47,.82,coverage)*.78),smallGlints*.62);
    }

    vec2 surfaceApertures(vec2 position, vec2 slope, out vec3 lightHue) {
      vec2 intensity = vec2(0);
      lightHue = vec3(.98,1.02,1.02);
      vec2 disturbedPosition = position+.30*slope;
      if (any(greaterThan(abs(disturbedPosition-u_lightArea.xy),u_lightArea.zw+7.0))) return intensity;
      // A surface glint can only reach this ellipse around the sample.
      const vec2 footprint = vec2(6.29,3.90);
      ivec2 first=max(ivec2(floor((disturbedPosition-footprint)/shaftSpacing))-shaftOrigin,ivec2(0));
      ivec2 last=min(ivec2(floor((disturbedPosition+footprint)/shaftSpacing))-shaftOrigin,
                     ivec2(shaftColumns-1,shaftRows-1));
      for(int row=first.y;row<=last.y;row++) {
        for(int col=first.x;col<=last.x;col++) {
          int i=row*shaftColumns+col;
          vec4 aperture = u_lightPatches[i];
          if (aperture.w < .001) continue;
          vec2 fromAperture = (disturbedPosition-aperture.xy)/aperture.z;
          vec2 profile = fromAperture*vec2(.75,1.21);
          float distanceSquared = dot(profile,profile);
          if (distanceSquared < ${apertureFalloffLimit}.0) {
            vec2 glow = aperture.w*exp(-distanceSquared*vec2(.24,1.48));
            if (glow.y > intensity.y) lightHue = u_lightHues[i];
            intensity = max(intensity,glow);
          }
        }
      }
      return intensity;
    }

    void main() {
      vec3 direction = normalize(u_forward + u_right*v_screen.x/u_lens.x + u_up*v_screen.y/u_lens.y);
      vec3 color = seaColor(direction);
      vec3 eye = lightPosition(u_eye);
      vec3 scaledRay = direction/lightScale;
      float distanceScale = length(scaledRay);
      vec3 lightRay = scaledRay/distanceScale;
      if (lightRay.y > 0.0 && (waterY-eye.y) < lightRay.y*(lightFieldReach+34.0)) {
        float distanceToSurface = (waterY-eye.y) / lightRay.y;
        vec2 q = eye.xz + lightRay.xz * min(distanceToSurface, lightFieldReach+15.0);
        vec4 ripple = waveSurface(q);
        distanceToSurface = max(0.0,distanceToSurface+ripple.x/max(lightRay.y,.055));
        q = eye.xz + lightRay.xz * min(distanceToSurface, lightFieldReach+15.0);
        ripple = waveSurface(q);
        vec3 normal = normalize(vec3(-ripple.y,1.,-ripple.z));
        vec3 incident = refract(lightRay, -normal, 1.333);
        float seenSky = smoothstep(.58,.707,dot(lightRay,normal));
        float facingLight = solarAlignment(direction);
        // Use the same angular falloff for the surface and the shafts below it.
        float litWater = forwardLight(facingLight);
        float sunCore = pow(facingLight,33.0);
        float distant = 1.0-smoothstep(133.0,248.0,distanceToSurface);
        float deeper = smoothstep(11.0,26.0,waterY-eye.y);
        float grazing = smoothstep(.01,.13,lightRay.y);
        float waveVisibility = grazing*mix(1.0,smoothstep(.13,.433,direction.y),deeper);
        vec2 tide = q * .068 + vec2(.19,-.03)*u_time*.075 + ripple.yz*.19;
        float micro = texture(u_caustics, tide).r;
        float lace = pow(micro, 1.45);
        float waveRidge = smoothstep(.28,1.0,ripple.w);
        float facingRidge = smoothstep(-.06,.29,.76*ripple.y-.58*ripple.z);
        float bands = noise(q*.22+ripple.yz*2.2);
        float shine = waveRidge * (.35+.65*bands) * (.44+.56*facingRidge);
        float glints = waveGlints(q,ripple.yz) * (.59+.41*waveRidge);
        float waveLight = .075+.925*litWater;
        float skylight = skyTransmission(q);
        vec3 reflected = mix(vec3(.021,.17,.302),vec3(.15,.48,.60),litWater);
        reflected += vec3(.047,.108,.13)*skylight*waveLight;
        reflected += vec3(.50,.70,.75)*(lace*(.036+.10*waveRidge)+shine*.28)*waveLight;
        vec3 windowColor = mix(vec3(.18,.50,.65),vec3(.59,.83,.88),clamp(incident.y+.15,0.0,1.0));
        windowColor += vec3(.39,.34,.24)*sunCore*(.35+.65*facingRidge);
        vec3 surface = mix(reflected,windowColor,seenSky*.87*waveLight);
        float clarity = distant*waveVisibility*exp(-distanceToSurface*.0046);
        color = mix(color,surface,clarity*mix(.63,.95,litWater));
        vec3 lightHue;
        vec2 apertures = surfaceApertures(q,ripple.yz,lightHue);
        apertures *= litWater;
        float apertureVisibility = waveVisibility*exp(-distanceToSurface*.0052)
                                 * (1.0-smoothstep(168.0,lightFieldReach+10.0,distanceToSurface));
        color += vec3(.25,.34,.38)*apertures.x*apertureVisibility;
        float reflectionLight = (glints*(.88+.41*skylight)+shine*.17)*waveLight;
        reflectionLight += .72*smoothstep(.34,.77,glints)*waveLight;
        reflectionLight += apertures.x*(.25+.42*waveRidge+.49*glints);
        float sharpCrest = .51*smoothstep(.60,.94,glints)*waveLight;
        float crown = sunCore*(.32+1.06*shine+.61*glints);
        float sparkle = clamp((reflectionLight*2.08+sharpCrest+crown)*clarity,0.0,.98);
        color = mix(color,mix(vec3(.72,.94,1.02),vec3(1.03,1.04,.98),litWater),sparkle);
        float sunlitCrest = apertures.y*apertureVisibility*(.36+.72*waveRidge+1.34*glints);
        vec3 crestHue = mix(vec3(1.06,1.07,1.03),lightHue*1.15,.65);
        color = mix(color,crestHue,clamp(sunlitCrest,0.0,.97));
        vec2 uv = q*vec2(.025,.058) + ripple.yz*.094+vec2(.002,-.004)*u_time;
        vec3 crestSample = texture(u_waterArt,uv).rgb;
        float white = smoothstep(.35,.86,dot(crestSample,vec3(.22,.64,.14)));
        float overhead = smoothstep(.15,.48,direction.y)*clarity;
        float solar = pow(max(0.,dot(direction,normalize(vec3(-.04,.48,-.88)))),13.);
        color += (vec3(.19,.24,.23)*white + vec3(.16,.18,.16)*solar)*overhead*u_waterReady;
        color = mix(color,vec3(.94,.995,1.0),white*overhead*(.20+.41*solar));
      }
      color = mergeHorizon(color+diffuseWater(eye,lightRay),direction);
      color += sampleVolume(15.0);
      outColor = vec4(color, 1);
    }
  `;

  const lightProjection = `
    const vec3 keyLight = normalize(vec3(-.30,.86,-.48));
    vec3 lightClip(vec3 p) {
      vec3 side = normalize(cross(vec3(0,1,0),keyLight));
      vec3 up = cross(keyLight,side);
      vec3 rel = p-vec3(0,4,-22);
      return vec3(dot(rel,side)/79.0,dot(rel,up)/62.0,-dot(rel,keyLight)/115.0);
    }
  `;
  const shadowVertex = `#version 300 es
    layout(location=0) in vec3 a_position;
    layout(location=3) in vec2 a_type;
    ${lightProjection}
    void main() { gl_Position = a_type.x==21.0 ? vec4(2,2,2,1) : vec4(lightClip(a_position),1); }
  `;
  const shadowFragment = `#version 300 es
    precision mediump float;
    void main() {}
  `;
  const sunlight = `
    uniform highp sampler2DShadow u_shadow;
    float sunlight(vec3 p,vec3 n) {
      vec3 uv = .5+.5*lightClip(p+n*.021);
      vec3 dx = dFdx(uv), dy = dFdy(uv);
      float area = dx.x*dy.y-dx.y*dy.x;
      vec2 gradient = abs(area)>1.e-15
        ? clamp(vec2(dy.y*dx.z-dx.y*dy.z,dx.x*dy.z-dy.x*dx.z)/area,vec2(-3),vec2(3))
        : vec2(0);
      if (any(lessThan(uv,vec3(0))) || any(greaterThan(uv,vec3(1)))) return 1.0;
      uv.z -= .00008 + .48*dot(abs(gradient),1.0/vec2(textureSize(u_shadow,0)));
      float s=0.0;
      for (int i=0;i<6;i++) {
        float a=float(i)*2.39996;
        vec2 delta=vec2(cos(a),sin(a))*sqrt(float(i)+.4)*.00054;
        s+=texture(u_shadow,vec3(uv.xy+delta,uv.z+dot(gradient,delta)));
      }
      return s/6.0;
    }
  `;

  const sceneVertex = `#version 300 es
    precision highp float;
    layout(location=0) in vec3 a_position;
    layout(location=1) in vec3 a_normal;
    layout(location=2) in vec3 a_color;
    layout(location=3) in vec2 a_type;
    uniform vec3 u_eye, u_right, u_up, u_forward;
    uniform vec2 u_lens;
    uniform float u_time;
    out vec3 v_position, v_normal, v_color;
    out float v_detail;
    flat out float v_material;
    ${window.diveFishMotion}

    void main() {
      vec3 p = a_position;
      vec3 normal = a_normal;
      if (a_type.x == 21.0) swimDiveFish(p,normal,a_type.y,u_time);
      if (a_type.x == 26.0) {
        const vec2 hinge = vec2(${openingShell.hinge.join(',')});
        float roll=${openingShell.roll[0]}*sin(u_time*${openingShell.roll[1]});
        mat2 turn=mat2(cos(roll),sin(roll),-sin(roll),cos(roll));
        p.xy = hinge+turn*(p.xy-hinge);
        normal.xy=turn*normal.xy;
        p.y+=${openingShell.bob[0]}*sin(u_time*${openingShell.bob[1]});
      }
      if (a_type.x == 1.0) {
        float phase=a_type.y, sway=1.0;
        if (phase>=32.0) {
          float encoded=phase-32.0;
          float root=(floor(encoded/8.0)-512.0)/64.0;
          phase=mod(encoded,8.0);
          sway=smoothstep(.025,.90,p.y-root);
        }
        p.x += sway*.125*sin(u_time*1.28 + phase + p.y*.85);
        p.z += sway*.075*cos(u_time*.96 + phase + p.y*.66);
      }
      vec3 fromEye = p-u_eye;
      float z = dot(fromEye, u_forward);
      gl_Position = vec4(dot(fromEye,u_right)*u_lens.x, dot(fromEye,u_up)*u_lens.y,
                         z*${depthScale}-${depthOffset}, z);
      v_position = p;
      v_normal = normal;
      v_color = a_color;
      v_detail = a_type.y;
      v_material = a_type.x;
    }
  `;

  const reefMaterial = `
    uniform sampler2D u_materialArt;
    uniform float u_materialReady;

    vec3 surfaceSample(vec2 uv, vec2 tile) {
      vec2 scaled = uv/vec2(3,2);
      return textureGrad(u_materialArt,(tile+.012+.976*fract(uv))/vec2(3,2),dFdx(scaled),dFdy(scaled)).rgb;
    }

    vec3 stoneSample(vec3 p, vec3 n, vec2 tile) {
      vec3 w = pow(abs(n),vec3(4));
      w /= max(.001,w.x+w.y+w.z);
      return w.x*surfaceSample(p.zy,tile)+w.y*surfaceSample(p.xz,tile)+w.z*surfaceSample(p.xy,tile);
    }

    float rockNoise(vec3 p, vec3 normal) {
      vec3 weights = abs(normal)*abs(normal);
      vec3 projected = vec3(noise(p.zy),noise(p.xz),noise(p.xy+8.3));
      return dot(weights,projected);
    }

    vec3 reefPigment(vec3 p, vec3 n, vec3 stoneColor) {
      float growth = smoothstep(.33,.72,noise(p.xz*.34+p.y*.43));
      vec2 tile = stoneColor.r > .47 ? vec2(1,0) : (growth>.4 ? vec2(0,0):vec2(2,0));
      vec3 stone = stoneColor*vec3(.96,1.12,1.19);
      vec3 art = stoneSample(p*.52,n,tile);
      return mix(stone,art*(.76+.42*stone),.84*u_materialReady);
    }
  `;

  const sceneFragment = `#version 300 es
    precision highp float;
    in vec3 v_position, v_normal, v_color;
    in float v_detail;
    flat in float v_material;
    out vec4 outColor;
    uniform sampler2D u_townGround;
    uniform sampler2D u_roadDistance;
    uniform vec4 u_groundBounds;
    uniform bool u_raisedRoad;
    ${lightProjection}
    ${sunlight}
    ${water}
    ${volumeSampling}
    ${reefMaterial}

    // Irregular broken shell and mineral faces, in world units and band-limited at a distance.
    float mineralChips(vec2 grains, float footprint) {
      if (footprint >= .98) return 0.0;
      vec2 cell = floor(grains);
      float seed = hash21(cell);
      vec2 uv = fract(grains)-(.31+.38*fract(seed*vec2(19.71,45.17)));
      vec2 axis = normalize(vec2(sin(seed*34.4),cos(seed*34.4)));
      vec2 face = vec2(dot(uv,axis),dot(uv,vec2(-axis.y,axis.x)));
      face.y *= 1.15+1.8*fract(seed*8.7);
      float edge = max(abs(face.y),max(abs(face.x)*.77,abs(face.x+face.y*.54)*.88));
      float radius = .06+.19*fract(seed*13.3);
      float facet = 1.0-smoothstep(radius*.65,radius+.025+footprint*.3,edge);
      return facet*smoothstep(.35,.69,seed)*(.40+.60*seed)*(1.0-smoothstep(.30,.98,footprint));
    }

    vec3 sealedRoad(vec2 position, float footprint) {
      float wear = .65*noise(position*.78)+.35*noise(position*3.9+8.6);
      vec3 binder = mix(vec3(.062,.069,.075),vec3(.117,.125,.131),wear);
      float dust = noise(position*vec2(8.2,11.5)+2.5)-.5;
      binder += dust*vec3(.059,.064,.054)*(1.0-smoothstep(.090,.27,footprint));
      float visibleAggregate = 1.0-smoothstep(.038,.174,footprint);
      if (visibleAggregate == 0.0) return binder;

      float crushed = (noise(position*vec2(37.,51.))-.5)*(1.-smoothstep(.011,.043,footprint));
      float fine = (noise(position*117.0+vec2(8.,3.))-.5)*(1.0-smoothstep(.003,.012,footprint));
      float flecks = mineralChips(position*58.4,footprint*58.4);
      return binder + visibleAggregate*(crushed*.055+fine*.085+vec3(.10,.087,.066)*flecks);
    }

    vec3 reliefNormal(vec3 position, vec3 normal, float height, float amount) {
      vec3 along = dFdx(position);
      vec3 across = dFdy(position);
      vec3 slopeX = cross(across,normal);
      vec3 slopeY = cross(normal,along);
      float area = dot(along,slopeX);
      vec3 gradient = (dFdx(height)*slopeX+dFdy(height)*slopeY)
                    * (sign(area)/max(abs(area),.0000001));
      return normalize(normal-amount*gradient);
    }

    vec3 tintBrightFilament(vec3 filament, float crest, vec2 position) {
      float bright = smoothstep(.28,.74,crest);
      if (bright == 0.0) return filament;
      const vec3 luma = vec3(.2126,.7152,.0722);
      float tint = noise(position*vec2(.39,.53)+vec2(.024,-.017)*u_time);
      vec3 tintColor = mix(vec3(.58,1.04,1.11),vec3(1.15,.92,.56),smoothstep(.25,.49,tint));
      tintColor = mix(tintColor,vec3(.99,.66,1.12),smoothstep(.53,.77,tint));
      vec3 matchedTint = tintColor*dot(filament,luma)/dot(tintColor,luma);
      return mix(filament,matchedTint,.30*bright);
    }

    void main() {
      vec3 fromEye = v_position - u_eye;
      float distanceToObject = length(fromEye);
      vec3 direction = fromEye / max(distanceToObject, .0001);
      // Beyond the full horizon blend, none of the surface shading reaches the eye.
      // Leave a derivative footprint at the transition for neighboring shaded pixels.
      if (distanceToObject > 282.0+2.0*fwidth(distanceToObject)) {
        outColor = vec4(distantWaterColor(direction)+volumeToDepth(distanceToObject),1);
        return;
      }
      vec3 n = normalize(v_normal);
      float shade = sunlight(v_position,n);
      vec3 color;
      vec2 caustic = currentLight(v_position);
      float skylight = skyTransmission(surfaceProjection(v_position));
      float shallow = exp(-max(0.0,waterY-v_position.y-10.0)*.0088);
      bool ground = v_material == 3.0 || v_material == 25.0;
      if (ground) {
        vec2 q = v_position.xz;
        float footprint = length(fwidth(q));
        float closeLight = 1.0-smoothstep(4.,27.,distanceToObject);
        vec2 drift = vec2(noise(q*.31),noise(q*.29+4.9));
        float coarseVisible = 1.0-smoothstep(.020,.091,footprint);
        float fineVisible = 1.0-smoothstep(.008,.048,footprint);
        float coarseSand = coarseVisible>0.0 ? noise(q*23.0+5.0)-.5 : 0.0;
        float fineSand = fineVisible>0.0 ? noise(q*43.0)-.5 : 0.0;
        float grit = .44*coarseSand*coarseVisible+.56*fineSand*fineVisible;
        float shellFlecks = mineralChips(q*38.0+drift*.41,38.0*footprint);
        float smallVisible = 1.0-smoothstep(.002,.012,footprint);
        float micaVisible = 1.0-smoothstep(.0009,.0044,footprint);
        float smallGrain = smallVisible>0.0 ? (noise(q*vec2(137.,161.)+.83*drift)-.5)*smallVisible : 0.0;
        float mica = micaVisible>0.0 ? (noise(q*vec2(359.,323.)+8.)-.5)*micaVisible : 0.0;
        float ridgeline = dot(q,vec2(.37,.93))*9.8 + 3.6*drift.x + sin(q.x*1.65+q.y*.32)*.46;
        float ripple = sin(ridgeline);
        float broadGrain = .61*noise(q*1.4)+.39*noise(q*5.9);
        ripple *= 1.0-smoothstep(.27,.86,fwidth(ridgeline));
        float rippleLight = .041*ripple*mix(.42,1.0,drift.y);
        float tone = .58*noise(q*.15)+.42*noise(q*.48+drift);
        vec3 sand = mix(vec3(.618,.676,.619),vec3(.772,.803,.717),smoothstep(.17,.86,tone));
        float worn = v_material==3. ? v_color.b*(.78+.22*drift.x) : 0.;
        sand += (broadGrain-.5)*vec3(.107,.101,.086)+rippleLight*(1.-.87*worn);
        sand += grit*vec3(.29,.26,.24) + shellFlecks*vec3(.115,.100,.077);
        sand += (smallGrain*.23+mica*.14)*vec3(1.,.91,.77);
        // Foot traffic exposes denser, warmer grains between the stepping stones.
        sand=mix(sand,sand*vec3(.88,.844,.79)+vec3(.033,.028,.022),worn);
        sand *= mix(vec3(1),vec3(.91,.91,.86),closeLight);

        vec3 sandNormal = reliefNormal(v_position,n,coarseSand*.0054*coarseVisible+
                                      smallGrain*.0014+mica*.00036,1.);
        float slope = .80+.20*max(0.0,dot(sandNormal,sun));
        float canopy = .61*noise(q*vec2(.141,.110)+vec2(.21,-.32))
                     + .39*noise(q*.293+vec2(5.1,.1)*drift);
        float patchLight = smoothstep(.20,.80,.71*canopy+.29*skylight);
        float exposure = mix(1.14+.18*skylight+.14*patchLight, .89+.15*skylight+.10*patchLight,closeLight);
        float refraction = .92+.46*skylight+.24*patchLight;

        vec2 townUV = (q-u_groundBounds.xy)*u_groundBounds.zw;
        float baseContact = texture(u_townGround,townUV).r;
        float contact = clamp(v_color.r*(1.0-.42*baseContact),0.0,1.0);
        float occlusion = .085+.915*pow(contact,1.23);
        float crest = caustic.x;
        float matteSand = 1.0-smoothstep(.025,.24,crest);
        float exposedSand = smoothstep(.52,.78,dot(sand,vec3(.2126,.7152,.0722)));
        color = sand * slope * occlusion * exposure * (1.0-matteSand*(.014+.021*exposedSand));
        vec3 grains = surfaceSample(q*.23+drift*.08,vec2(1,0));
        color *= mix(vec3(1),clamp(vec3(.65)+grains*.69,.67,1.21),u_materialReady*(1.-.48*closeLight));
        float focusedCrest = crest*(1.025+.61*smoothstep(.043,.32,crest));
        vec3 focused = tintBrightFilament(vec3(1.43,1.38,1.12)*focusedCrest,crest*v_color.g,q);
        vec3 halo = vec3(.33,.47,.50)*caustic.y;
        float causticPatch = (.55+.38*noise(q*.25)+.10*sin(q.y*.15+q.x*.22))*mix(.19,1.,shade);
        causticPatch *= (1.-.28*closeLight)*(1.-.48*smoothstep(45.,145.,distanceToObject));
        color += (focused*.57+halo*.74) * v_color.g * shallow * refraction * mix(.57,1.0,contact)*causticPatch;

        float edge = (texture(u_roadDistance,townUV).r-.5)*1.8;
        float aa = clamp(footprint*.43,.003,.09);
        float sandEdge = edge+(noise(q*9.)-.5)*.034;
        float coverage = u_raisedRoad ? float(v_material==25.) : 1.-smoothstep(-.052-aa,.034+aa,sandEdge);
        if(u_raisedRoad && v_material==3.) {
          color *= 1.-.22*(1.-smoothstep(-.01,.055+aa,edge));
        }
        if (coverage>.001) {
          vec3 pavement = sealedRoad(q,footprint);
          float boundary = 1.-smoothstep(0.,.09,abs(edge));
          float grazing = 1.0-clamp(dot(n,-direction),0.0,1.0);
          vec3 sheen = vec3(.016,.022,.026)*skylight*(.18+.82*grazing*grazing);
          float wetFilament = caustic.x*smoothstep(.16,.55,caustic.x);
          vec3 reflected = tintBrightFilament(vec3(.14,.19,.21)*wetFilament,wetFilament,q);
          vec3 trailColor = pavement*(1.02+.15*skylight)+sheen;
          trailColor += (vec3(.10,.14,.15)*caustic.x+vec3(.023,.036,.040)*caustic.y+reflected*shallow)*mix(.15,1.,shade);
          trailColor *= 1.0-.32*baseContact;
          if(v_material==25.) {
            float bevelLight=clamp(dot(n,keyLight),0.,1.);
            vec3 cutStone=pavement*(.78+.55*bevelLight)+vec3(.034,.035,.031);
            trailColor=mix(trailColor,cutStone,v_detail*.83);
          } else {
            trailColor=mix(trailColor,color,.13*boundary*(.25+.75*noise(q*19.)));
          }
          color = mix(color,trailColor,coverage);
        }
      } else {
        vec2 q = v_position.xz*.82+v_position.y*vec2(.64,.87);
        float mottled = noise(q*2.5)*.36 + noise(q*7.7)*.36 + noise(q*21.0)*.28;
        float detail = mix(mottled,.5,smoothstep(.045,.21,length(fwidth(q))));
        float sunFacing = max(0.0,dot(n, sun));
        float wrapLight = max(0.0,dot(n,vec3(-.26,.88,.4)));
        float light = .82 + .43*sunFacing + .16*wrapLight;
        float skyFill = .18;
        float contrast = .68+detail*.61;
        vec3 stone = v_color * vec3(.96,1.12,1.19);
        if (v_material == 0.0) {
          float footprint = length(fwidth(v_position));
          float band = rockNoise(v_position*4.1,n);
          float grain = rockNoise(v_position*19.7,n);
          float grainVisible = 1.0-smoothstep(.028,.098,footprint);
          vec3 rockNormal = reliefNormal(v_position,n,grain,.011*grainVisible);
          sunFacing = max(0.0,dot(rockNormal,sun));
          float upward = smoothstep(-.18,.83,n.y);
          light = .64+.53*sunFacing+.13*wrapLight+.117*upward;
          skyFill = .13;
          float crevice = smoothstep(.21,.55,band);
          float stonePattern = .66*band+.34*mix(.5,grain,grainVisible);
          stonePattern = mix(stonePattern,.5,smoothstep(.10,.27,footprint));
          contrast = (.58+.81*stonePattern)*mix(.86,1.03,crevice);
          stone = reefPigment(v_position,n,v_color);
        }
        if (v_material == 1.0) {
          light = .91+.48*abs(dot(n, sun));
          stone = v_color * vec3(.92,1.12,1.02);
        }
        if (v_material == 2.0) {
          light = .94+.34*sunFacing+.16*wrapLight;
          stone = v_color * vec3(.96,1.04,1.15);
        }
        color = stone * (light+skyFill*skylight) * contrast + vec3(.013,.034,.045);
        if (v_material == 0.0) {
          float stoneGrain = (rockNoise(v_position*37.0,n)-.5);
          stoneGrain *= 1.0-smoothstep(.012,.056,length(fwidth(v_position)));
          color += stoneGrain*vec3(.21,.23,.22);
        }
        vec3 reflected = tintBrightFilament(vec3(.67,.70,.58)*caustic.x,caustic.x*sunFacing,v_position.xz);
        reflected += vec3(.19,.43,.44)*caustic.y;
        color += reflected * (.14 + .63*sunFacing) * shallow;
        if (v_material >= 8.0) {
          float diffuse = .58+.35*max(0.0,dot(n,keyLight))+.18*max(0.0,n.y);
          float rim = pow(1.0-abs(dot(n,-direction)),3.0);
          float speckle = noise(q*22.0)-.5;
          color = v_color*diffuse + .11*caustic.x*vec3(.64,.86,.95);
          if (v_material == 9.0) color += (.16*rim+.05*speckle)*vec3(.64,.88,1.0);
          if (v_material == 10.0) color *= mix(vec3(1),.59+1.12*stoneSample(v_position*.47,n,vec2(0,1)).rgb,u_materialReady);
          if (v_material == 11.0) color *= mix(vec3(1),.65+1.13*stoneSample(v_position*.65,n,vec2(1,1)),u_materialReady);
          if (v_material == 13.0) color = v_color*(.80+.28*diffuse+.12*speckle)+.09*caustic.x;
          if (v_material == 14.0) color = v_color*.87;
          if (v_material == 15.0 || v_material == 26.0) color = v_color*(.85+.26*diffuse)+vec3(.06,.07,.12)*rim;
          if (v_material == 21.0) color = v_color*(.90+.28*diffuse)+.10*rim+.085*caustic.x;
          if (v_material == 22.0 || v_material == 24.0) {
            float facing = max(0.,dot(n,keyLight));
            float sky = .5+.5*n.y;
            bool metal = v_material==24.0;
            float enamel = pow(max(0.,dot(n,normalize(keyLight-direction))),metal ? 58.0 : 32.0);
            float glancing = pow(1.0-max(0.0,dot(n,-direction)),3.0);
            float patina = .65*noise(q*2.1)+.35*noise(q*8.3);
            float fine = (noise(q*92.0)-.5)*(1.-smoothstep(.002,.017,length(fwidth(q))));
            vec3 pigment = v_color*(.86+.20*patina+fine*(metal?.095:.051));
            vec3 highlight = metal ? mix(vec3(.53,.60,.63),v_color,.48) : vec3(.27,.32,.34);
            color = pigment*(.49+.70*facing+.32*sky)+highlight*enamel;
            color += (metal ? vec3(.082,.14,.17):vec3(.052,.082,.104))*glancing+.10*caustic.x*sky;
          }
          if (v_material == 23.0) {
            float glassEdge = smoothstep(.54,1.0,v_detail);
            float closeView = 1.-smoothstep(8.,32.,distanceToObject);
            vec3 reflection = reflect(direction,n);
            float surfaceReflection = smoothstep(-.32,.50,reflection.y);
            float fret = noise(reflection.xz*vec2(3.,7.)+reflection.y*3.);
            vec3 interior = v_color*mix(vec3(.80,.89,.91),vec3(.29,.47,.54),closeView);
            interior *= 1.-.36*glassEdge;
            vec3 waterReflection = mix(vec3(.04,.17,.26),vec3(.37,.66,.73),surfaceReflection);
            float fresnel = .14+.55*pow(1.-abs(dot(n,-direction)),3.);
            color = mix(interior,waterReflection,fresnel)+vec3(.12,.24,.26)*surfaceReflection*fret;
            color += vec3(.57,.78,.81)*pow(max(0.,dot(reflection,keyLight)),50.);
          }
        }
      }
      if (v_material != 14.0 && v_material != 23.0 && distanceToObject<154.0) {
        color *= mix(vec3(.59,.66,.77),vec3(1.12,1.08,1.04),shade);
      }
      float sunWindow = exp(-dot(v_position.xz-vec2(0.,-44.),v_position.xz-vec2(0.,-44.))*.00063);
      float localSun = ground ? mix(.045,.29,smoothstep(4.,27.,distanceToObject)) : .29;
      color *= 1.0+localSun*sunWindow;
      if (v_material == 27.0) {
        float facing = max(0.,dot(n,-direction));
        float glow = v_detail*(.76+.24*facing);
        float glint = pow(max(0.,dot(reflect(direction,n),keyLight)),24.);
        float core = smoothstep(.25,.91,glow);
        color = mix(v_color*vec3(.74,.44,.24),vec3(1.43,1.15,.64),core);
        color += vec3(.36,.51,.58)*glint+vec3(.014,.047,.061)*pow(1.-facing,3.);
      }
      float filteredLight = exp(-max(0.0,waterY-v_position.y-10.0)*.0032);
      float opticalDistance = v_material>=22.0 && v_material<=24.0 ? distanceToObject*.55 : distanceToObject;
      vec3 rendered = waterFog(color * filteredLight, direction, opticalDistance);
      // Match the open-water background before the far plane can cut across the seabed.
      if (distanceToObject > 115.0) {
        rendered=mix(rendered,distantWaterColor(direction),smoothstep(115.0,282.0,distanceToObject));
      }
      float peak = max(rendered.r,max(rendered.g,rendered.b));
      if (ground && peak > .88) {
        float rolled = .88+.112*(1.0-exp(-(peak-.88)/.112));
        rendered *= rolled/peak;
      }
      rendered += volumeToDepth(distanceToObject);
      outColor = vec4(rendered,1);
    }
  `;

  const particleVertex = `#version 300 es
    precision highp float;
    layout(location=0) in vec3 a_position;
    layout(location=1) in vec3 a_style;
    uniform vec3 u_eye, u_right, u_up, u_forward;
    uniform vec2 u_lens;
    uniform float u_time, u_viewHeight;
    out float v_alpha, v_bubble;
    void main() {
      float phase = a_style.y;
      bool ambientBubble = a_style.z > 1.5;
      bool surfaceBubble = a_style.z > 2.5;
      vec3 p = a_position;
      vec2 offset = p.xz-u_eye.xz;
      float reach = surfaceBubble ? 13.0 : 31.0;
      if (ambientBubble && dot(offset,offset) > reach*reach) {
        gl_Position = vec4(2.0,2.0,2.0,1.0);
        gl_PointSize = 1.0;
        v_alpha = 0.0;
        v_bubble = 1.0;
        return;
      }
      p.x += (surfaceBubble ? .16 : .38)*sin(u_time*.45 + phase*6.28);
      p.z += (surfaceBubble ? .12 : .28)*cos(u_time*.39 + phase*5.7);
      float lifetimeFade = 1.0;
      if (a_style.z > .5) {
        float height = ${surfaceY - 0.1}-a_position.y;
        float speed = surfaceBubble ? .59+.29*phase : ambientBubble ? 1.05+.55*phase
                     : (${lightingSurfaceY - 0.1}-a_position.y)*(.023+phase*.018);
        float ascent = height*fract(phase+u_time*speed/height);
        p.y = a_position.y + ascent;
        lifetimeFade = smoothstep(0.0,.5,min(ascent,height-ascent));
      } else {
        p.y += .25*sin(u_time*.35+phase*5.6);
      }
      vec3 relative = p-u_eye;
      float dist = length(relative);
      float z = dot(relative,u_forward);
      gl_Position = vec4(dot(relative,u_right)*u_lens.x, dot(relative,u_up)*u_lens.y,
                         z*${depthScale}-${depthOffset}, z);
      gl_PointSize = clamp(u_viewHeight*a_style.x/max(z,.1), 1.0, 26.0);
      v_bubble = min(a_style.z,1.0);
      v_alpha = (1.0-smoothstep(11.0,59.0,dist)) * smoothstep(.45,2.0,dist);
      v_alpha *= mix(.52,.95,v_bubble) * mix(.38,1.0,phase);
      if (ambientBubble) {
        v_alpha = .63 * (1.0-smoothstep(7.0,30.0,dist))
                      * smoothstep(.25,1.45,dist) * mix(.56,1.0,phase);
      }
      if (surfaceBubble) {
        gl_PointSize = min(gl_PointSize,8.0);
        v_alpha = .41 * (1.0-smoothstep(5.0,12.0,dist))
                      * smoothstep(.48,1.9,dist) * mix(.64,1.0,phase);
      }
      v_alpha *= lifetimeFade;
      if (v_alpha <= .002) gl_Position = vec4(2.0,2.0,2.0,1.0);
    }
  `;

  const particleFragment = `#version 300 es
    precision highp float;
    in float v_alpha, v_bubble;
    out vec4 outColor;
    void main() {
      vec2 p = gl_PointCoord*2.0-1.0;
      float r = length(p);
      float dotShape = 1.0-smoothstep(.10, .97, r);
      float edge = smoothstep(.46,.86,r)*(1.0-smoothstep(.86,1.0,r));
      float gleam = 1.0-smoothstep(.07,.36,length(p-vec2(-.35,-.49)));
      float bubble = .64*edge+.93*gleam+.07*dotShape;
      outColor = vec4(mix(vec3(.54,.85,.91),vec3(.83,.96,1),gleam), v_alpha*mix(dotShape,bubble,v_bubble));
    }
  `;

  function createMesh() {
    const values = [];
    const shared = new WeakMap();
    const smoothed = [];
    function vertex(p, normal, color, material, phase) {
      values.push(...p, ...normal, ...color, material, phase);
    }
    function triangle(a, b, c, color, material = 0, phase = 0) {
      const ab = b.map((value, i) => value - a[i]);
      const ac = c.map((value, i) => value - a[i]);
      const normal = [ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0]];
      const length = Math.hypot(...normal);
      if (!length) return;
      for (let i = 0; i < 3; i++) normal[i] /= length;
      for (const p of [a, b, c]) {
        if (material === 0 || material === 2) {
          let sample = shared.get(p);
          if (!sample) {
            sample = { normal: [0,0,0], color: [0,0,0], count: 0 };
            shared.set(p, sample);
          }
          for (let i = 0; i < 3; i++) {
            sample.normal[i] += normal[i];
            sample.color[i] += color[i];
          }
          sample.count++;
          smoothed.push({ index: values.length + 3, sample });
        }
        vertex(p, normal, color, material, phase);
      }
    }
    function smoothFaces() {
      for (const { index, sample } of smoothed) {
        const length = Math.hypot(...sample.normal) || 1;
        for (let i = 0; i < 3; i++) {
          values[index + i] = .13 * values[index + i] + .87 * sample.normal[i] / length;
          values[index + 3 + i] = .25 * values[index + 3 + i] + .75 * sample.color[i] / sample.count;
        }
      }
      smoothed.length = 0;
    }
    return { values, vertex, triangle, smoothFaces };
  }

  function addSeabed(mesh, colliders, frontages) {
    const points = [];
    const cells = gridAxis.length-1;
    const contact = new Float64Array(gridAxis.length ** 2).fill(1);
    // Each rock only shades the sand within 1.9 radii of its projected centre.
    for (const rock of colliders) {
      const cx = rock.x + rock.radius*.25, cz = rock.z + rock.radius*.46;
      const reach = rock.radius*1.9;
      const left = cellAt(cx-reach), right = Math.min(cells,cellAt(cx+reach)+1);
      const back = cellAt(cz-reach), front = Math.min(cells,cellAt(cz+reach)+1);
      for (let iz = back; iz <= front; iz++) {
        const dz = gridAxis[iz]-rock.z-rock.radius*.46;
        for (let ix = left; ix <= right; ix++) {
          const dx = gridAxis[ix]-rock.x-rock.radius*.25;
          const distance = Math.hypot(dx,dz)/rock.radius;
          if (distance < 1.9) contact[iz*gridAxis.length+ix] *= .64+.36*Math.min(1,Math.max(0,(distance-.43)/1.37));
        }
      }
    }
    for (let iz = 0; iz <= cells; iz++) {
      const z = gridAxis[iz];
      for (let ix = 0; ix <= cells; ix++) {
        const x = gridAxis[ix];
        const normal = [floor(x-.12,z)-floor(x+.12,z), .24, floor(x,z-.12)-floor(x,z+.12)];
        const length = Math.hypot(...normal);
        for (let i = 0; i < 3; i++) normal[i] /= length;
        const light = contact[iz*gridAxis.length+ix];
        points.push([[x,gridHeights[iz][ix],z], normal, [light,.42+.58*light,0]]);
      }
    }
    const width = cells + 1;
    const vertex = ([p, n, color]) => mesh.vertex(p, n, color, 3, 0);
    for (let iz = 0; iz < cells; iz++) {
      for (let ix = 0; ix < cells; ix++) {
        const i = iz * width + ix;
        const a = points[i], b = points[i + 1], c = points[i + width], d = points[i + width + 1];
        const lot=frontages?.cells.get(iz*cells+ix);
        if(lot) {
          const n=frontages.subdivisions, side=n+1, fine=[];
          for(let row=0;row<=n;row++) for(let col=0;col<=n;col++) {
            const s=col/n,t=row/n,index=row*side+col;
            const x=gridAxis[ix]+s*(gridAxis[ix+1]-gridAxis[ix]);
            const z=gridAxis[iz]+t*(gridAxis[iz+1]-gridAxis[iz]);
            const blend=(va,vb,vc,vd)=>s+t<=1 ? va+s*(vb-va)+t*(vc-va) : vd+(1-s)*(vc-vd)+(1-t)*(vb-vd);
            const y=blend(a[0][1],b[0][1],c[0][1],d[0][1])+lot.bank[index];
            const normal=a[1].map((v,k)=>blend(v,b[1][k],c[1][k],d[1][k]));
            normal[0]+=(frontages.rise(x-.08,z)-frontages.rise(x+.08,z))/.16;
            normal[2]+=(frontages.rise(x,z-.08)-frontages.rise(x,z+.08))/.16;
            const light=blend(a[2][0],b[2][0],c[2][0],d[2][0]);
            fine.push([[x,y,z],normal,[light,.42+.58*light,lot.worn[index]]]);
          }
          for(let row=0;row<n;row++) for(let col=0;col<n;col++) {
            const v=row*side+col;
            vertex(fine[v]); vertex(fine[v+side]); vertex(fine[v+1]);
            vertex(fine[v+1]); vertex(fine[v+side]); vertex(fine[v+side+1]);
          }
          continue;
        }
        vertex(a); vertex(c); vertex(b);
        vertex(b); vertex(c); vertex(d);
      }
    }
  }

  function buildParticles(floorAt) {
    let seed = 37182;
    const random = () => {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const points = [];
    const addedParticles = Math.round(2650 * (surfaceY - lightingSurfaceY) / lightingSurfaceY);
    for (let i = 0; i < 2650 + addedParticles; i++) {
      const near = i < 300 || (i >= 2650 && i < 2650 + addedParticles * 300 / 2650);
      const x = (random()-.5)*(near ? 38 : 176);
      const z = (random()-.5)*(near ? 47 : 176);
      const upper = i >= 2650;
      const bottom = upper ? lightingSurfaceY : floor(x,z);
      const y = bottom + random() * ((upper ? surfaceY : lightingSurfaceY)-bottom);
      points.push(x,y,z, .006+random()*.024, random(), 0);
    }
    for (const [x,z] of [[-14,8],[15,5],[-7,-9],[14,-24],[25,-40],[-22,-38],[-30,-49],[8,18],[-11,20],[-14,-16]]) {
      const count = Math.round((z > -15 ? 43 : 27) * surfaceY / lightingSurfaceY);
      for (let i = 0; i < count; i++) {
        const px = x+(random()-.5)*1.5, pz = z+(random()-.5)*1.5;
        points.push(px,floor(px,pz)+.54,pz, .039+random()**2*.21, random(), 1);
      }
    }
    // Stagger rising bubbles through the water column in world space. The grid
    // extends beyond the swim bounds so the field has no edge as the diver turns.
    const cellSize = 6, tileSize = 24, extent = 120;
    const originalCount = points.length/6;
    const buildLayer = (spacing, addCell) => {
      const rows = [];
      for (let z = -extent; z < extent; z += tileSize) {
        const offsets = [];
        for (let x = -extent; x < extent; x += tileSize) {
          offsets.push(points.length/6);
          for (let pz = z; pz < z+tileSize; pz += spacing) {
            for (let px = x; px < x+tileSize; px += spacing) addCell(px,pz);
          }
        }
        offsets.push(points.length/6);
        rows.push(offsets);
      }
      return rows;
    };
    const waterColumn = buildLayer(cellSize, (x,z) => {
      const count = Math.ceil((surfaceY-floorAt(x+cellSize*.5,z+cellSize*.5))/4.2);
      const phaseOffset = random();
      for (let i = 0; i < count; i++) {
        const px = x+random()*cellSize, pz = z+random()*cellSize;
        const phase = (i+phaseOffset+random()*.45)/count;
        points.push(px,floorAt(px,pz)+.18,pz,.029+random()**2*.105,phase%1,2);
      }
    });
    // Short-lived microbubbles from surface agitation fill the thinner water
    // volume visible when the diver is just below the surface and looks up.
    const surfaceLayer = buildLayer(2, (x,z) => {
      const phase = random();
      for (let i = 0; i < 2; i++) {
        points.push(x+random()*2,surfaceY-6.1+random()*.6,z+random()*2,
          .018+random()*.029,(phase+i*.5)%1,3);
      }
    });
    return { vertices:new Float32Array(points), originalCount, waterColumn, surfaceLayer, tileSize, extent };
  }

  function drawParticles(gl, geometry, field, camera) {
    gl.bindVertexArray(geometry.vao);
    gl.drawArrays(gl.POINTS,0,field.originalCount);
    function drawLayer(rows, reach) {
      const {extent,tileSize} = field;
      const tile = value => Math.max(0,Math.min(rows.length-1,Math.floor((value+extent)/tileSize)));
      const firstX = tile(camera.x-reach), lastX = tile(camera.x+reach);
      const firstZ = tile(camera.z-reach), lastZ = tile(camera.z+reach);
      for (let z = firstZ; z <= lastZ; z++) {
        const start = rows[z][firstX];
        gl.drawArrays(gl.POINTS,start,rows[z][lastX+1]-start);
      }
    }
    drawLayer(field.waterColumn,31);
    if (camera.y > surfaceY-18.1) drawLayer(field.surfaceLayer,13);
  }

  function createProgram(gl, vertexSource, fragmentSource) {
    function compile(kind, source) {
      const shader = gl.createShader(kind);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(error);
      }
      return shader;
    }
    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    const uniforms = {};
    for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
      const { name } = gl.getActiveUniform(program, i);
      uniforms[name] = gl.getUniformLocation(program, name);
    }
    return { program, uniforms };
  }

  function createSceneOutput(gl, screen) {
    const sceneTarget = gl.createFramebuffer();
    const bloomTarget = gl.createFramebuffer();
    const depth = gl.createRenderbuffer();

    function colorTarget(unit, framebuffer) {
      const texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    }
    const sceneUnit = 9, bloomUnit = 10;
    colorTarget(sceneUnit, sceneTarget);
    gl.bindRenderbuffer(gl.RENDERBUFFER,depth);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);
    gl.bindRenderbuffer(gl.RENDERBUFFER,null);
    colorTarget(bloomUnit, bloomTarget);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    gl.activeTexture(gl.TEXTURE0);

    const extract = createProgram(gl, screenVertex, `#version 300 es
      precision highp float;
      in vec2 v_screen;
      uniform sampler2D u_scene;
      uniform vec2 u_step;
      out vec4 outColor;
      vec3 highlight(vec2 uv) {
        vec3 pixel = texture(u_scene,uv).rgb;
        float luminance = dot(pixel,vec3(.2126,.7152,.0722));
        float peak = max(pixel.r,max(pixel.g,pixel.b));
        return pixel * smoothstep(.72,.97,mix(luminance,peak,.58));
      }
      void main() {
        vec2 uv = v_screen*.5+.5;
        vec2 x = vec2(u_step.x,0), y = vec2(0,u_step.y);
        // Sample bright detail before averaging so narrow reflections keep a halo.
        vec3 sum = .20*highlight(uv)
                 + .12*(highlight(uv+x)+highlight(uv-x)+highlight(uv+y)+highlight(uv-y))
                 + .08*(highlight(uv+x+y)+highlight(uv-x+y)+highlight(uv+x-y)+highlight(uv-x-y));
        outColor = vec4(sum,1);
      }
    `);
    const compose = createProgram(gl, screenVertex, `#version 300 es
      precision highp float;
      in vec2 v_screen;
      uniform sampler2D u_scene, u_bloom;
      uniform float u_detail;
      out vec4 outColor;
      float luma(vec3 color) {
        return dot(color,vec3(.299,.587,.114));
      }
      vec3 smoothEdges(vec2 uv, vec3 center) {
        float middle = luma(center);
        if (fwidth(middle) < max(.016,middle*.047)) return center;
        vec2 pixel = 1.0/vec2(textureSize(u_scene,0));
        float nw = luma(texture(u_scene,uv+pixel*vec2(-1, 1)).rgb);
        float ne = luma(texture(u_scene,uv+pixel*vec2( 1, 1)).rgb);
        float sw = luma(texture(u_scene,uv+pixel*vec2(-1,-1)).rgb);
        float se = luma(texture(u_scene,uv+pixel*vec2( 1,-1)).rgb);
        float low = min(middle,min(min(nw,ne),min(sw,se)));
        float high = max(middle,max(max(nw,ne),max(sw,se)));
        float contrast = high-low;
        if (contrast < max(.065,high*.18)) {
          // Restore texture contrast lost in the linear upscale without
          // amplifying bright glints or outlining strong silhouettes.
          float detail = middle - (nw+ne+sw+se)*.25;
          float gain = u_detail * (1.0-smoothstep(.046,.115,contrast));
          return clamp(center+clamp(gain*detail,-.022,.022),0.,1.);
        }
        vec2 direction = vec2(sw+se-nw-ne,nw+sw-ne-se);
        float reduce = max(.008,(nw+ne+sw+se)*.033);
        direction = clamp(direction/(min(abs(direction.x),abs(direction.y))+reduce),-3.0,3.0);
        vec2 offset = direction * pixel;
        vec3 filtered = .5*(texture(u_scene,uv+offset/6.0).rgb+texture(u_scene,uv-offset/6.0).rgb);
        return mix(center,filtered,.86);
      }
      void main() {
        vec2 uv = v_screen*.5+.5;
        vec3 scene = smoothEdges(uv,texture(u_scene,uv).rgb);
        vec3 glow = texture(u_bloom,uv).rgb;
        outColor = vec4(scene + min(.083*glow,vec3(.046))*(1.0-.57*scene),1);
      }
    `);
    gl.useProgram(extract.program);
    gl.uniform1i(extract.uniforms.u_scene,sceneUnit);
    gl.useProgram(compose.program);
    gl.uniform1i(compose.uniforms.u_scene,sceneUnit);
    gl.uniform1i(compose.uniforms.u_bloom,bloomUnit);

    let sceneWidth = 0, sceneHeight = 0, bloomWidth = 0, bloomHeight = 0;
    let ready = false;
    function resize(width,height) {
      if (width === sceneWidth && height === sceneHeight) return ready;
      sceneWidth = width;
      sceneHeight = height;
      bloomWidth = Math.max(1,Math.ceil(width/4));
      bloomHeight = Math.max(1,Math.ceil(height/4));
      gl.activeTexture(gl.TEXTURE0 + sceneUnit);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.bindRenderbuffer(gl.RENDERBUFFER,depth);
      gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,width,height);
      gl.bindFramebuffer(gl.FRAMEBUFFER,sceneTarget);
      ready = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.activeTexture(gl.TEXTURE0 + bloomUnit);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,bloomWidth,bloomHeight,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.bindFramebuffer(gl.FRAMEBUFFER,bloomTarget);
      ready = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE && ready;
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      gl.activeTexture(gl.TEXTURE0);
      return ready;
    }
    function present(width,height,detail) {
      gl.invalidateFramebuffer(gl.FRAMEBUFFER,[gl.DEPTH_ATTACHMENT]);
      gl.disable(gl.DEPTH_TEST);
      gl.bindVertexArray(screen);
      gl.bindFramebuffer(gl.FRAMEBUFFER,bloomTarget);
      gl.viewport(0,0,bloomWidth,bloomHeight);
      gl.useProgram(extract.program);
      // The radius follows the output's size when the 3D render scale changes.
      gl.uniform2f(extract.uniforms.u_step,3.7/width,3.7/height);
      gl.drawArrays(gl.TRIANGLES,0,3);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      gl.viewport(0,0,width,height);
      gl.useProgram(compose.program);
      gl.uniform1f(compose.uniforms.u_detail,detail);
      gl.drawArrays(gl.TRIANGLES,0,3);
    }
    return {sceneTarget,resize,present};
  }

  function createGeometry(gl, vertices, attributes) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    const stride = attributes.reduce((sum, size) => sum + size, 0);
    let offset = 0;
    for (const [i, size] of attributes.entries()) {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, size, gl.FLOAT, false, stride * 4, offset * 4);
      offset += size;
    }
    gl.bindVertexArray(null);
    return { vao, count: vertices.length / stride };
  }

  // Keep the original triangle order (including coplanar signs and trim). Runs of
  // neighbouring triangles follow the same building, reef, or strip of seabed.
  function createScenery(gl, vertices) {
    const stride = 11, vertexCount = vertices.length / stride;
    const words = new Uint32Array(vertices.buffer, vertices.byteOffset, vertices.length);
    const indices = new Uint32Array(vertexCount);
    const slots = new Uint32Array(2 ** Math.ceil(Math.log2(vertexCount * 1.5)));
    const slotMask = slots.length - 1;
    let unique = 0;
    const batches = [];
    const batchSize = 3 * 192;
    for (let start = 0; start < vertexCount; start += batchSize) {
      let left = Infinity, bottom = Infinity, back = Infinity;
      let right = -Infinity, top = -Infinity, front = -Infinity, padding = .015;
      const end = Math.min(start + batchSize, vertexCount);
      for (let i = start; i < end; i++) {
        const offset = i * stride;
        const x = vertices[offset], y = vertices[offset+1], z = vertices[offset+2];
        left = Math.min(left, x); right = Math.max(right, x);
        bottom = Math.min(bottom, y); top = Math.max(top, y);
        back = Math.min(back, z); front = Math.max(front, z);
        // Shader animation can move fish, the clam and kelp beyond the rest pose.
        const material = vertices[offset+9];
        if (material === 21) padding = Math.max(padding, 8);
        if (material === 26) padding = Math.max(padding, 1);
        if (material === 1) padding = Math.max(padding, .15);
        let hash = 2166136261;
        for (let j = 0; j < stride; j++) hash = Math.imul(hash ^ words[offset+j], 16777619);
        let slot = (hash ^ (hash >>> 16)) & slotMask;
        while (slots[slot]) {
          const existing = (slots[slot]-1) * stride;
          let j = 0;
          while (j < stride && words[existing+j] === words[offset+j]) j++;
          if (j === stride) break;
          slot = (slot+1) & slotMask;
        }
        if (!slots[slot]) {
          // Compact in place. Every destination precedes or equals its source.
          if (unique < i) words.copyWithin(unique * stride, offset, offset+stride);
          slots[slot] = ++unique;
        }
        indices[i] = slots[slot]-1;
      }
      batches.push({start,end,x:(left+right)/2,y:(bottom+top)/2,z:(back+front)/2,
        rx:(right-left)/2+padding,ry:(top-bottom)/2+padding,rz:(front-back)/2+padding});
    }
    const geometry = createGeometry(gl, vertices.subarray(0, unique*stride), [3,3,3,2]);
    gl.bindVertexArray(geometry.vao);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    const multi = gl.getExtension('WEBGL_multi_draw');
    const offsets = new Int32Array(batches.length), counts = new Int32Array(batches.length);
    const planes = new Float64Array(24);
    function setPlane(i, x, y, z, d) {
      planes[i] = x; planes[i+1] = y; planes[i+2] = z; planes[i+3] = d;
    }
    function drawAll() {
      gl.bindVertexArray(geometry.vao);
      gl.drawElements(gl.TRIANGLES, vertexCount, gl.UNSIGNED_INT, 0);
    }
    function drawView(camera, lensX, lensY) {
      const sy = Math.sin(camera.yaw), cy = Math.cos(camera.yaw);
      const sp = Math.sin(camera.pitch), cp = Math.cos(camera.pitch);
      const fx = sy*cp, fy = sp, fz = -cy*cp;
      const ux = -sy*sp*lensY, uy = cp*lensY, uz = cy*sp*lensY;
      setPlane(0, fx+cy*lensX, fy, fz+sy*lensX, 0);
      setPlane(4, fx-cy*lensX, fy, fz-sy*lensX, 0);
      setPlane(8, fx+ux, fy+uy, fz+uz, 0);
      setPlane(12, fx-ux, fy-uy, fz-uz, 0);
      setPlane(16, fx, fy, fz, -nearClip);
      setPlane(20, -fx, -fy, -fz, farClip);
      let runs = 0, lastEnd = -1;
      for (const b of batches) {
        const x = b.x-camera.x, y = b.y-camera.y, z = b.z-camera.z;
        let visible = true;
        for (let p = 0; p < 24; p += 4) {
          const nx = planes[p], ny = planes[p+1], nz = planes[p+2];
          const radius = Math.abs(nx)*b.rx+Math.abs(ny)*b.ry+Math.abs(nz)*b.rz;
          if (nx*x+ny*y+nz*z+planes[p+3]+radius < 0) {
            visible = false;
            break;
          }
        }
        if (!visible) continue;
        if (lastEnd === b.start) counts[runs-1] += b.end - b.start;
        else {
          offsets[runs] = b.start * Uint32Array.BYTES_PER_ELEMENT;
          counts[runs++] = b.end - b.start;
        }
        lastEnd = b.end;
      }
      gl.bindVertexArray(geometry.vao);
      if (multi && runs > 1) {
        multi.multiDrawElementsWEBGL(gl.TRIANGLES, counts, 0, gl.UNSIGNED_INT, offsets, 0, runs);
      } else {
        for (let i = 0; i < runs; i++) gl.drawElements(gl.TRIANGLES, counts[i], gl.UNSIGNED_INT, offsets[i]);
      }
    }
    return {drawAll, drawView};
  }

  function loadArtwork(gl, data, unit, wrap=gl.CLAMP_TO_EDGE) {
    const texture = gl.createTexture();
    const state = { ready: false };
    let settle;
    state.settled = new Promise(resolve => { settle = resolve; });
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,1,1,0,gl.RGB,gl.UNSIGNED_BYTE,new Uint8Array([45,92,120]));
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,wrap);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,wrap);
    gl.activeTexture(gl.TEXTURE0);
    const source = new Image();
    const anisotropy = gl.getExtension('EXT_texture_filter_anisotropic');
    source.onload = () => {
      if (gl.isContextLost() || !gl.isTexture(texture)) {
        settle(false);
        return;
      }
      try {
        gl.activeTexture(gl.TEXTURE0+unit);
        gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,source);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
        if (anisotropy) {
          const maximum = gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
          gl.texParameterf(gl.TEXTURE_2D,anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(4,maximum));
        }
        state.ready = true;
      } catch (error) {
        console.warn(error);
      } finally {
        gl.activeTexture(gl.TEXTURE0);
        settle(state.ready);
      }
    };
    source.onerror = () => settle(false);
    if (data) source.src = data;
    else settle(false);
    return state;
  }

  function uploadGroundMap(gl,unit,width,height,data) {
    gl.activeTexture(gl.TEXTURE0+unit);
    gl.bindTexture(gl.TEXTURE_2D,gl.createTexture());
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,width,height,0,gl.RED,gl.UNSIGNED_BYTE,data);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,4);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.activeTexture(gl.TEXTURE0);
  }

  // The flat paint and the raised mesh sample the same union of full-width lanes.
  function bakeRoadField(gl,lanes,buildings) {
    const points=lanes.flat().concat(buildings);
    const padding=p=>(p.radius??p.width)+3;
    const minX=Math.floor(Math.min(...points.map(p=>p.x-padding(p))));
    const minZ=Math.floor(Math.min(...points.map(p=>p.z-padding(p))));
    const maxX=Math.ceil(Math.max(...points.map(p=>p.x+padding(p))));
    const maxZ=Math.ceil(Math.max(...points.map(p=>p.z+padding(p))));
    const scale=Math.min(20,Math.floor(gl.getParameter(gl.MAX_TEXTURE_SIZE)/Math.max(maxX-minX,maxZ-minZ)));
    const width=(maxX-minX)*scale,height=(maxZ-minZ)*scale,reach=.9;
    const data=new Uint8Array(width*height).fill(255);
    for(const lane of lanes) for(let i=1;i<lane.length;i++) {
      const a=lane[i-1],b=lane[i],dx=b.x-a.x,dz=b.z-a.z,length2=dx*dx+dz*dz;
      const margin=Math.max(a.width,b.width)+reach;
      const left=Math.max(0,Math.floor((Math.min(a.x,b.x)-margin-minX)*scale));
      const right=Math.min(width-1,Math.ceil((Math.max(a.x,b.x)+margin-minX)*scale));
      const top=Math.max(0,Math.floor((Math.min(a.z,b.z)-margin-minZ)*scale));
      const bottom=Math.min(height-1,Math.ceil((Math.max(a.z,b.z)+margin-minZ)*scale));
      for(let row=top;row<=bottom;row++) for(let col=left;col<=right;col++) {
        const x=minX+(col+.5)/scale-a.x, z=minZ+(row+.5)/scale-a.z;
        const t=Math.min(1,Math.max(0,(x*dx+z*dz)/Math.max(length2,1.e-9)));
        const distance=Math.hypot(x-t*dx,z-t*dz)-(a.width+t*(b.width-a.width));
        const offset=row*width+col;
        data[offset]=Math.min(data[offset],Math.round(255*Math.max(0,.5+.5*distance/reach)));
      }
    }
    uploadGroundMap(gl,4,width,height,data);
    function sample(x,z) {
      const u=(x-minX)*scale-.5,v=(z-minZ)*scale-.5;
      const col=Math.floor(u),row=Math.floor(v);
      if(col<0 || row<0 || col>=width-1 || row>=height-1) return reach;
      const i=row*width+col, du=u-col,dv=v-row;
      const a=data[i]+du*(data[i+1]-data[i]);
      const b=data[i+width]+du*(data[i+width+1]-data[i+width]);
      return ((a+dv*(b-a))/255-.5)*2*reach;
    }
    return {sample,minX,minZ,maxX,maxZ,width,height,scale};
  }

  function contactGeometryKey(vertices, imports) {
    let key = 0x811c9dc5;
    function point(x,y,z) {
      // Contact is rasterized at no more than 20 px/m. Quantize well below
      // a texel so an engine's last-bit rounding does not invalidate the mask.
      key = Math.imul(key ^ Math.round(x*10000), 0x01000193);
      key = Math.imul(key ^ Math.round(y*10000), 0x01000193);
      key = Math.imul(key ^ Math.round(z*10000), 0x01000193);
    }
    for (let i=0; i<vertices.length; i+=11) {
      point(vertices[i],vertices[i+1],vertices[i+2]);
      key = Math.imul(key ^ vertices[i+9], 0x01000193);
    }
    imports?.forEachFootingTriangle((a,b,c) => { point(...a); point(...b); point(...c); });
    return key >>> 0;
  }

  function unpackContactMask(encoded, length) {
    let source;
    try { source=atob(encoded); } catch { return null; }
    const values = new Uint8Array(length);
    let read=0, write=0;
    // Each variable-length token holds a span and a repeat flag, followed
    // by either one repeated byte or the literal bytes for that span.
    while (read<source.length) {
      let byte=source.charCodeAt(read++), token=byte&127, shift=7;
      while (byte&128) {
        if (read===source.length || shift>=28) return null;
        byte=source.charCodeAt(read++);
        token|=(byte&127)<<shift;
        shift+=7;
      }
      const span=token>>>1;
      if (!span || write+span>length) return null;
      if (token&1) {
        if (read===source.length) return null;
        values.fill(source.charCodeAt(read++),write,write+span);
        write+=span;
      } else {
        if (read+span>source.length) return null;
        for (let end=read+span; read<end;) values[write++]=source.charCodeAt(read++);
      }
    }
    return write===length ? values : null;
  }

  function useTownContact(gl,field,data) {
    const {minX,minZ,width,height,scale}=field;
    uploadGroundMap(gl,3,width,height,data);
    return (x,z) => {
      const col=Math.floor((x-minX)*scale), row=Math.floor((z-minZ)*scale);
      if(col<0 || row<0 || col>=width || row>=height) return false;
      return field.sample(x,z)>.16 && data[row*width+col]<12;
    };
  }

  function bakeTownContact(gl,field,vertices,imports) {
    const {minX,minZ,width,height,scale}=field;
    const packed=window.bikiniTownContactMask;
    // Use the static scene's exact mask. Edits to the map and devices that
    // require a smaller map still follow the original rasterization path.
    if (packed?.bounds?.join(',') === [minX,minZ,width,height,scale].join(',')
      && packed.geometry === contactGeometryKey(vertices,imports)) {
      const values=unpackContactMask(packed.data,width*height);
      if (values) return useTownContact(gl,field,values);
    }
    const coverage=document.createElement('canvas');
    coverage.width=width; coverage.height=height;
    const pen=coverage.getContext('2d');
    pen.beginPath();
    function stamp(points,house) {
      // Clip at 26 cm above grade. Projecting the entire housing would put
      // an extra dark disk underneath every overhanging roof or window.
      const clipped=[];
      for(let j=0;j<3;j++) {
        const p=points[j], q=points[(j+1)%3];
        if(p[2]<=.26) clipped.push(p);
        if((p[2]<.26)!==(q[2]<.26)) {
          const t=(p[2]-.26)/(p[2]-q[2]);
          clipped.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);
        }
      }
      if(clipped.length<3) return;
      if(house) {
        // Opposite faces of thin paving stones overlap in projection. Give
        // them the same winding so the contact mask contains their union.
        const [a,b,c]=clipped;
        if((b[0]-a[0])*(c[1]-a[1])<(b[1]-a[1])*(c[0]-a[0])) clipped.reverse();
      }
      const [p,...rest]=clipped;
      pen.moveTo((p[0]-minX)*scale,(p[1]-minZ)*scale);
      for(const q of rest) pen.lineTo((q[0]-minX)*scale,(q[1]-minZ)*scale);
      pen.closePath();
    }
    for(let i=0;i<vertices.length;i+=33) {
      if(vertices[i+9]===23 || vertices[i+9]===25) continue;
      const grade=seabedFloor(vertices[i],vertices[i+2]);
      if(Math.min(vertices[i+1],vertices[i+12],vertices[i+23])>grade+.62) continue;
      const points=[];
      for(let j=i;j<i+33;j+=11) {
        const x=vertices[j], z=vertices[j+2];
        points.push([x,z,vertices[j+1]-seabedFloor(x,z)]);
      }
      stamp(points,false);
    }
    pen.fill();
    // Stroke the perimeter as well as the footprint of hollow metal housings.
    pen.lineWidth=2; pen.stroke();
    if(imports) {
      pen.beginPath();
      imports.forEachFootingTriangle((a,b,c)=>stamp([a,b,c],true));
      pen.fill();
      pen.lineWidth=1; pen.stroke();
    }
    const blurred=document.createElement('canvas');
    blurred.width=width; blurred.height=height;
    const soft=blurred.getContext('2d');
    soft.filter='blur('+(scale*.12)+'px)';
    soft.drawImage(coverage,0,0);
    const rgba=soft.getImageData(0,0,width,height).data;
    const data=new Uint8Array(width*height);
    for(let i=0;i<data.length;i++) data[i]=rgba[i*4+3];
    return useTownContact(gl,field,data);
  }

  function bakeShadows(gl, geometry, drawImported) {
    const size = Math.min(2048,gl.getParameter(gl.MAX_TEXTURE_SIZE));
    gl.activeTexture(gl.TEXTURE5);
    const depth = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,depth);
    gl.texStorage2D(gl.TEXTURE_2D,1,gl.DEPTH_COMPONENT24,size,size);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_MODE,gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_FUNC,gl.LEQUAL);
    const target = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER,target);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,depth,0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    const pass = createProgram(gl,shadowVertex,shadowFragment);
    gl.useProgram(pass.program);
    gl.viewport(0,0,size,size);
    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    geometry.drawAll();
    drawImported?.();
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    gl.deleteFramebuffer(target);
    gl.deleteProgram(pass.program);
    gl.activeTexture(gl.TEXTURE0);
  }

  window.createDiveWorld = (canvas) => {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL 2 is unavailable');
    const rendererInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = gl.getParameter(rendererInfo?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER);
    const software = /swiftshader|llvmpipe|softpipe|swrast|software rasterizer|basic render|\bwarp\b/i.test(renderer);
    const balanced = software
      ? { output: 655360, raster: 460800, initial: .74, floor: .50 }
      : { output: 2764800, raster: 2073600, initial: .90, floor: .66 };
    const caustic = createProgram(gl, screenVertex, causticFragment);
    const volume = createProgram(gl, screenVertex, volumeFragment);
    const background = createProgram(gl, screenVertex, backgroundFragment);
    const scene = createProgram(gl, sceneVertex, sceneFragment);
    const particle = createProgram(gl, particleVertex, particleFragment);
    const returnPlaque = window.createReturnPlaque(gl, { createProgram, createGeometry, depthScale, depthOffset, water, volumeSampling });
    const screen = gl.createVertexArray();
    const output = createSceneOutput(gl,screen);
    const mesh = createMesh();
    const lanes=[];
    const imports=layout && window.createDiveImports(gl,importedAssets,layout,seabedFloor,{
      createProgram, depthScale, depthOffset, nearClip, lightProjection, shadowFragment, sunlight, water, volumeSampling, reefMaterial
    });
    const town=window.buildBayTown(mesh,floor,seabedFloor,lanes);
    const expansion=window.buildTownExpansion();
    for (const site of expansion.sites) town.push(...window.buildDistrictBuilding(mesh,seabedFloor,site));
    town.push(...(layout?.sites ?? []));
    lanes.push(...expansion.lanes,...(layout?.lanes ?? []),window.buildBayApproach());
    const roadField=bakeRoadField(gl,lanes,town);
    const openSand=bakeTownContact(gl,roadField,mesh.values,imports);
    imports?.releaseFootingMeshes();
    const frontages=layout && window.buildDoorstepSand(layout.houses,lanes,gridAxis,cellAt,roadField);
    const reserved=layout?.reserved;
    const colliders=window.buildDiveEcology(mesh,seabedFloor,
      (x,z) => !reserved?.(x,z) && openSand(x,z),reserved);
    colliders.push(...window.buildDiveVista(mesh,seabedFloor,reserved),...town);
    window.buildDiveWildlife(mesh);
    mesh.smoothFaces();
    const sceneryLength=mesh.values.length;
    for (const value of imports?.proxies ?? []) mesh.values.push(value);
    const collision=window.buildDiveCollision(mesh.values);
    mesh.values.length=sceneryLength;
    if (imports) imports.proxies.length=0;
    const arrowHouse=layout?.houses.find(house=>house.id==='h03');
    let drawArrowGlow;
    if (arrowHouse && importedAssets.h03) {
      const bulbs=window.buildArrowLights(mesh,arrowHouse,importedAssets.h03,seabedFloor);
      drawArrowGlow=window.createArrowGlow(gl,bulbs,{createProgram,createGeometry,depthScale,depthOffset,nearClip});
    }
    // Imported houses already have contact from their real footprint. An
    // additional boulder-sized shadow used to darken their entire front yard.
    const houseSites=new Set(layout?.houses);
    addSeabed(mesh, colliders.filter(site=>!houseSites.has(site)),frontages);
    const scenery = createScenery(gl, new Float32Array(mesh.values));
    bakeShadows(gl,scenery,imports?.drawShadows);
    mesh.values.length = 0;
    window.buildRaisedRoad(mesh,seabedFloor,roadField);
    const raisedGeometry=createScenery(gl,new Float32Array(mesh.values));
    mesh.values.length=0;
    let raisedRoad=true;
    const floorAt=(x,z)=>seabedFloor(x,z)+(frontages?.rise(x,z) ?? 0)+(raisedRoad?
      Math.max(0,.045-.047*Math.max(0,Math.min(1,(roadField.sample(x,z)+.049)/.049))) : 0);
    const {vertices: particleVertices, ...particleField} = buildParticles(floorAt);
    const particles = createGeometry(gl, particleVertices, [3,3]);
    const waterArt = loadArtwork(gl, window.lagoonTextures.water,1,gl.REPEAT);
    const materialArt = loadArtwork(gl, window.lagoonTextures.materials,2);
    const causticSize = software ? 256 : 512;
    const causticInterval = software ? 1 / 12 : 1 / 24;
    const cellPhases = new Float32Array(128);
    const cellCenters = new Float32Array(cellPhases.length);
    for (let cell = 0; cell < 64; cell++) {
      const x = cell % 8, y = Math.floor(cell / 8);
      const horizontal = Math.sin(x*127.1+y*311.7)*43758.5453;
      const vertical = Math.sin(x*269.5+y*183.3)*43758.5453;
      cellPhases[cell*2] = (horizontal-Math.floor(horizontal))*Math.PI*2;
      cellPhases[cell*2+1] = (vertical-Math.floor(vertical))*Math.PI*2;
    }
    const causticTexture = gl.createTexture();
    const causticTarget = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, causticTexture);
    gl.texStorage2D(gl.TEXTURE_2D, Math.log2(causticSize) + 1, gl.RGBA8, causticSize, causticSize);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const anisotropy = gl.getExtension('EXT_texture_filter_anisotropic');
    if (anisotropy) {
      const maximum = gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
      gl.texParameterf(gl.TEXTURE_2D, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(4, maximum));
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, causticTarget);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, causticTexture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('The water light texture could not be created');
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const volumeTarget = gl.createFramebuffer();
    const volumeTexture = gl.createTexture();
    const volumeFormat = gl.getExtension('EXT_color_buffer_float') ? gl.RGBA16F : gl.RGBA8;
    const maxTileSize = Math.floor(gl.getParameter(gl.MAX_TEXTURE_SIZE)/4);
    let volumeWidth = 0, volumeHeight = 0;
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, volumeTexture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);

    let lastCaustic = -1, lastVolumeTime = -1;
    const volumeView = {};
    let quality = balanced.initial;
    let preferDetail = false;
    let fixedQuality = false;
    let width = 1, height = 1;
    const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const pendingTimers = [];
    const freeTimers = [];
    let lastRealTime, budgetStarted = 0, nextTimingFrame = 0, fastWindows = 0;
    let frameSum = 0, frameSamples = 0, gpuSum = 0, gpuSamples = 0;

    // RAF can stay on vsync while the graphics driver queues slow frames. Sample
    // the GPU asynchronously, leaving the HUD and the simulation at full rate.
    function updateBudget(now) {
      if (fixedQuality) return null;
      const interval = now-lastRealTime;
      lastRealTime = now;
      if (!(interval > 0) || document.hidden) {
        budgetStarted = now;
        frameSum = frameSamples = gpuSum = gpuSamples = fastWindows = 0;
        return null;
      }
      frameSum += Math.min(interval,.25);
      frameSamples++;
      let query = null;
      if (timer && --nextTimingFrame <= 0) {
        nextTimingFrame = 5;
        const disjoint = gl.getParameter(timer.GPU_DISJOINT_EXT);
        while (pendingTimers.length) {
          const oldest = pendingTimers[0];
          if (!disjoint && !gl.getQueryParameter(oldest,gl.QUERY_RESULT_AVAILABLE)) break;
          pendingTimers.shift();
          if (!disjoint) {
            gpuSum += gl.getQueryParameter(oldest,gl.QUERY_RESULT) / 1e9;
            gpuSamples++;
          }
          freeTimers.push(oldest);
        }
        if (disjoint) gpuSum = gpuSamples = 0;
        if (pendingTimers.length < 4 && !gl.getQuery(timer.TIME_ELAPSED_EXT,gl.CURRENT_QUERY)) {
          query = freeTimers.pop() || gl.createQuery();
          if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT,query);
        }
      }
      if (now-budgetStarted >= .42 && frameSamples >= 6) {
        const measured = gpuSamples ? gpuSum/gpuSamples : frameSum/frameSamples;
        const limit = gpuSamples ? .0192 : .023;
        if (measured > limit) {
          const floor = preferDetail ? .88 : balanced.floor;
          const scaled = quality*Math.max(.85,Math.sqrt(limit/measured));
          quality = Math.max(floor,Math.floor(scaled*32)/32);
          fastWindows = 0;
        } else if (measured < (gpuSamples ? .0153 : .0182)) {
          if (++fastWindows >= 4) {
            quality = Math.min(1,quality+.055);
            fastWindows = 0;
          }
        } else fastWindows = 0;
        budgetStarted = now;
        frameSum = frameSamples = gpuSum = gpuSamples = 0;
      }
      return query;
    }
    const apertureData = new Float32Array(patchCount * 4);
    const apertureAngles = new Float32Array(patchCount * 2);
    const apertureHues = new Float32Array(patchCount * 3);
    const apertureArea = new Float32Array([...apertureCenter,patchFadeX*patchSpacingX,patchFadeZ*patchSpacingZ]);
    const whiteLight = [.91,.97,1];
    const apertureTints = [whiteLight,[1.12,.98,.68],whiteLight,[.99,.79,1.10],whiteLight,whiteLight,[.68,1.01,1.10]];
    const lightPatches = [];

    function cellVariation(x, z, salt) {
      const value = Math.sin(x*127.1+z*311.7+salt*79.43)*43758.5453;
      return value-Math.floor(value);
    }

    function createLightPatches() {
      const cellX = Math.floor(apertureCenter[0]/patchSpacingX);
      const cellZ = Math.floor(apertureCenter[1]/patchSpacingZ);
      for (let z = cellZ-patchGridRadiusZ; z <= cellZ+patchGridRadiusZ; z++) {
        for (let x = cellX-patchGridRadiusX; x <= cellX+patchGridRadiusX; x++) {
          const positionX = (x+.5+.68*(cellVariation(x,z,1)-.5))*patchSpacingX;
          const positionZ = (z+.5+.68*(cellVariation(x,z,2)-.5))*patchSpacingZ;
          const width = .55+.43*cellVariation(x,z,3);
          const intensity = .42+.52*cellVariation(x,z,4);
          const spread = .88+.24*cellVariation(x,z,5);
          const advance = .39+.16*cellVariation(x,z,6);
          const tint = apertureTints[Math.floor(cellVariation(x,z,7)*apertureTints.length)];
          apertureHues.set(tint,lightPatches.length*3);
          lightPatches.push([positionX,positionZ,width,intensity,spread,advance]);
        }
      }
    }

    createLightPatches();

    function animateApertures(time) {
      for (const [index, [x, z, width, intensity, spread, advance]] of lightPatches.entries()) {
        // Soften the edge of this fixed, sunlit part of the water surface.
        const edgeX = patchFadeX-Math.abs(x-apertureArea[0])/patchSpacingX;
        const edgeZ = patchFadeZ-Math.abs(z-apertureArea[1])/patchSpacingZ;
        const fade = Math.min(1,Math.max(0,Math.min(edgeX,edgeZ)/.92));
        const coverage = fade*fade*(3-2*fade);
        const swell = x*.24+z*.43-time*.94+.38*Math.sin(-x*.11+z*.16);
        const crossSwell = -x*.53+z*.34-time*1.07;
        const chop = x*.49+z*.91-time*1.32;
        const ripple = Math.sin(swell);
        const flicker = .82+.13*ripple+.05*Math.sin(crossSwell+chop);
        const aperture = index * 4;
        const angle = index * 2;
        apertureData[aperture] = x + .67*Math.sin(crossSwell);
        apertureData[aperture+1] = z + .59*ripple;
        apertureData[aperture+2] = width * (1+.10*Math.cos(chop));
        apertureData[aperture+3] = intensity * flicker * coverage;
        // Fan away from the solar bearing with the same outward direction on each side.
        const across = (apertureData[aperture]-apertureCenter[0])*sunAcross[0]+
          (apertureData[aperture+1]-apertureCenter[1])*sunAcross[1];
        const outward = .80*Math.tanh(across/40)*spread;
        const forward = advance+.02*Math.cos(swell);
        apertureAngles[angle] = outward*sunAcross[0]-forward*sunAlong[0];
        apertureAngles[angle+1] = outward*sunAcross[1]-forward*sunAlong[1];
      }
    }

    function useCamera(pass, camera, time, focalX, focalY) {
      const y = Math.sin(camera.yaw), z = Math.cos(camera.yaw);
      const s = Math.sin(camera.pitch), c = Math.cos(camera.pitch);
      const { uniforms: u } = pass;
      gl.useProgram(pass.program);
      gl.uniform3f(u.u_eye, camera.x, camera.y, camera.z);
      gl.uniform3f(u.u_right,z,0,y);
      gl.uniform3f(u.u_up,-y*s,c,z*s);
      gl.uniform3f(u.u_forward,y*c,s,-z*c);
      gl.uniform2f(u.u_lens,focalX,focalY);
      gl.uniform1f(u.u_time,time);
      if (u.u_caustics) gl.uniform1i(u.u_caustics,0);
      if (u.u_volume) {
        gl.uniform1i(u.u_volume,6);
        gl.uniform2f(u.u_viewport,width,height);
      }
      if (u.u_waterArt) {
        gl.uniform1i(u.u_waterArt,1);
        gl.uniform1f(u.u_waterReady,Number(waterArt.ready));
      }
      if (u.u_shadow) gl.uniform1i(u.u_shadow,5);
      if (u.u_materialArt) {
        gl.uniform1i(u.u_materialArt,2);
        gl.uniform1f(u.u_materialReady,Number(materialArt.ready));
      }
      if (u.u_townGround) {
        gl.uniform1i(u.u_townGround,3);
        gl.uniform1i(u.u_roadDistance,4);
        gl.uniform4f(u.u_groundBounds,roadField.minX,roadField.minZ,
          1/(roadField.maxX-roadField.minX),1/(roadField.maxZ-roadField.minZ));
        gl.uniform1i(u.u_raisedRoad,Number(raisedRoad));
      }
      const apertures = u['u_lightPatches[0]'];
      if (apertures) {
        gl.uniform4fv(apertures,apertureData);
        gl.uniform2fv(u['u_lightDirections[0]'],apertureAngles);
        gl.uniform3fv(u['u_lightHues[0]'],apertureHues);
        gl.uniform4fv(u.u_lightArea,apertureArea);
      }
    }

    function render(camera, time, realTime, fieldOfView) {
      const frameTimer = updateBudget(realTime);
      const viewWidth = Math.max(1, canvas.clientWidth);
      const viewHeight = Math.max(1, canvas.clientHeight);
      const [focalX,focalY] = viewLens(canvas,fieldOfView);
      const pixels = viewWidth * viewHeight;
      const outputBudget = preferDetail ? 5760000 : balanced.output;
      const rasterBudget = preferDetail ? 5184000 : balanced.raster;
      const displayRatio = Math.min(window.devicePixelRatio || 1,2,Math.sqrt(outputBudget/pixels));
      const displayWidth = Math.max(1, Math.round(viewWidth * displayRatio));
      const displayHeight = Math.max(1, Math.round(viewHeight * displayRatio));
      if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
      }
      // Keep presentation stable as the GPU budget changes. Only the costly 3D
      // pass scales down, then the same pass that adds bloom upsamples the image.
      const sceneRatio = Math.min(displayRatio,Math.sqrt(rasterBudget/pixels)) * quality;
      width = Math.max(1,Math.round(viewWidth * sceneRatio));
      height = Math.max(1,Math.round(viewHeight * sceneRatio));
      const useOffscreen = output.resize(width,height);
      if (!useOffscreen) {
        width = displayWidth;
        height = displayHeight;
      }

      animateApertures(time);

      gl.disable(gl.DEPTH_TEST);
      if (time - lastCaustic >= causticInterval) {
        lastCaustic = time;
        for (let i = 0; i < cellPhases.length; i += 2) {
          cellCenters[i] = .5+.32*Math.sin(cellPhases[i]+time*.47);
          cellCenters[i+1] = .5+.32*Math.sin(cellPhases[i+1]+time*.33);
        }
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, causticTarget);
        gl.viewport(0,0,causticSize,causticSize);
        gl.useProgram(caustic.program);
        gl.uniform1f(caustic.uniforms.u_time,time);
        gl.uniform2fv(caustic.uniforms['u_cellCenters[0]'],cellCenters);
        gl.bindVertexArray(screen);
        gl.drawArrays(gl.TRIANGLES,0,3);
        gl.bindFramebuffer(gl.FRAMEBUFFER,null);
        gl.bindTexture(gl.TEXTURE_2D,causticTexture);
        gl.generateMipmap(gl.TEXTURE_2D);
      }
      const tileWidth = Math.max(2,Math.min(maxTileSize,Math.ceil(width/12)));
      const tileHeight = Math.max(2,Math.min(maxTileSize,Math.ceil(height/12)));
      const resizeVolume = tileWidth !== volumeWidth || tileHeight !== volumeHeight;
      const moveVolume = camera.x !== volumeView.x || camera.y !== volumeView.y || camera.z !== volumeView.z
        || camera.yaw !== volumeView.yaw || camera.pitch !== volumeView.pitch
        || focalX !== volumeView.focalX || focalY !== volumeView.focalY;
      // At rest the slowly varying shafts can reuse the last cache. Any camera
      // movement or zoom redraws them immediately, with no reprojection lag.
      if (resizeVolume || moveVolume || Math.abs(time-lastVolumeTime) >= 1/30) {
        gl.bindFramebuffer(gl.FRAMEBUFFER,volumeTarget);
        if (resizeVolume) {
          gl.activeTexture(gl.TEXTURE6);
          gl.bindTexture(gl.TEXTURE_2D,volumeTexture);
          gl.texImage2D(gl.TEXTURE_2D,0,volumeFormat,tileWidth*4,tileHeight*4,0,gl.RGBA,
            volumeFormat===gl.RGBA8 ? gl.UNSIGNED_BYTE : gl.HALF_FLOAT,null);
          gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,volumeTexture,0);
          gl.activeTexture(gl.TEXTURE0);
        }
        volumeWidth = tileWidth;
        volumeHeight = tileHeight;
        Object.assign(volumeView,camera,{focalX,focalY});
        lastVolumeTime = time;
        gl.viewport(0,0,tileWidth*4,tileHeight*4);
        useCamera(volume,camera,time,focalX,focalY);
        gl.uniform2f(volume.uniforms.u_tileSize,tileWidth,tileHeight);
        gl.bindVertexArray(screen);
        gl.drawArrays(gl.TRIANGLES,0,3);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER,useOffscreen ? output.sceneTarget : null);
      gl.viewport(0,0,width,height);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      imports?.drawOpaque(camera,focalX,focalY,time,floorAt,useCamera,height,collision.canSee);
      useCamera(scene,camera,time,focalX,focalY);
      scenery.drawView(camera,focalX,focalY);
      if(raisedRoad) {
        raisedGeometry.drawView(camera,focalX,focalY);
      }
      returnPlaque.draw(useCamera,camera,time,focalX,focalY,floorAt);

      // Leave the more expensive surface and volume shading to uncovered pixels.
      gl.depthMask(false);
      gl.depthRange(1,1);
      gl.depthFunc(gl.LEQUAL);
      useCamera(background,camera,time,focalX,focalY);
      gl.bindVertexArray(screen);
      gl.drawArrays(gl.TRIANGLES,0,3);
      gl.depthRange(0,1);
      gl.depthFunc(gl.LESS);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
      imports?.drawContacts(camera,focalX,focalY,time,floorAt,useCamera);
      drawArrowGlow?.(useCamera,camera,time,focalX,focalY,height);
      imports?.drawTransparent(camera,focalX,focalY,time,useCamera);
      useCamera(particle,camera,time,focalX,focalY);
      gl.uniform1f(particle.uniforms.u_viewHeight,height);
      drawParticles(gl,particles,particleField,camera);
      gl.disable(gl.BLEND);
      gl.depthMask(true);
      if (useOffscreen) output.present(displayWidth,displayHeight,.22 + .60*(1-width/displayWidth));
      if (frameTimer) {
        gl.endQuery(timer.TIME_ELAPSED_EXT);
        pendingTimers.push(frameTimer);
      }
    }

    const openingArt = Promise.all([
      waterArt.settled, materialArt.settled, returnPlaque.artworkReady, imports?.artworkReady ?? true,
    ]).then(status => status.every(Boolean));
    return { floor:floorAt, colliders, collision, render, surfaceY, openingArt,
      startReturnPlaque: returnPlaque.start,
      hideReturnPlaque: returnPlaque.hide,
      hitReturnPlaque(camera,fieldOfView,x,y) {
        const [focalX,focalY] = viewLens(canvas,fieldOfView);
        return returnPlaque.hit(camera,focalX,focalY,x,y,collision.canSee);
      },
      setRenderQuality(mode) {
        const nextFixed = mode==='capture';
        const next = nextFixed || mode==='detail';
        if (next===preferDetail && nextFixed===fixedQuality) return;
        preferDetail=next;
        fixedQuality=nextFixed;
        quality=preferDetail ? 1 : balanced.initial;
        budgetStarted=lastRealTime ?? 0;
        frameSum=frameSamples=gpuSum=gpuSamples=fastWindows=0;
      },
      setRoadProfile(profile) { raisedRoad=profile==='raised'; } };
  };
})();
