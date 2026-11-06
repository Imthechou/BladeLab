import { MARK_WIDTH, MARK_HEIGHT, oreMaterialOf, mineralHeritage } from './forge.js?v=5';

const T = globalThis.THREE;
const metalId = { raw: 0, silver: 1, pearl: 2, gunmetal: 3, obsidian: 4 };
const patternId = { none: 0, damascus: 1, crystal: 2, ember: 3, nebula: 4 };
const filmId = { none: 0, oxide: 1, doppler: 2, rainbow: 3, gold: 4 };
const fxId = { none: 0, edge: 1, ember: 2, aurora: 3 };

export function surfaceUniforms() {
  const marks = new T.DataTexture(new Uint8Array(MARK_WIDTH * MARK_HEIGHT * 4), MARK_WIDTH, MARK_HEIGHT);
  marks.magFilter = marks.minFilter = T.LinearFilter;
  marks.needsUpdate = true;
  return {
    fCodes: { value: new T.Vector4() },
    fLevels: { value: new T.Vector4() },
    fClock: { value: 0 },
    fSeed: { value: 0 },
    fHeat: { value: 0 },
    fMarks: { value: marks },
    fPurity: { value: .65 },
    fOreTone: { value: new T.Color('#879cab') },
    fOreTrace: { value: .5 },
    fOreStyle: { value: 0 },
    fOreFamily: { value: 0 },
    fOreSeed: { value: .5 },
    fPulse: { value: 0 },
    fWave: { value: 0 },
    fHit: { value: new T.Vector3() },
    fGrip: { value: new T.Color('#44413d') },
    fGuard: { value: new T.Color('#83828b') },
    fGripStyle: { value: 0 },
    fFitted: { value: 0 },
    fRaw: { value: 0 },
  };
}

export function setSurface(uniforms, run, fit) {
  const { skin } = run;
  uniforms.fCodes.value.set(metalId[skin.metal], patternId[skin.pattern], filmId[skin.film], fxId[skin.fx]);
  uniforms.fLevels.value.set(skin.levels.metal, skin.levels.pattern, skin.levels.film, skin.levels.fx);
  uniforms.fSeed.value = skin.seed;
  uniforms.fPurity.value = (run.purity || run.ore?.purity || 65) / 100;
  const sourceMineral = oreMaterialOf(run.ore);
  const heritage = mineralHeritage(run.ore);
  uniforms.fOreTone.value.set(heritage.tone);
  uniforms.fOreTrace.value = (run.ore?.vein ?? 52) / 100;
  uniforms.fOreStyle.value = sourceMineral.style;
  uniforms.fOreFamily.value = heritage.family;
  uniforms.fOreSeed.value = heritage.seed;
  uniforms.fGrip.value.set(fit?.color || '#393f42');
  uniforms.fGuard.value.set(fit?.accent || '#858992');
  uniforms.fGripStyle.value = fit?.grip || 0;
  uniforms.fFitted.value = fit ? 1 : 0;
  const texture = uniforms.fMarks.value;
  if (texture.userData.seed !== run.seed || texture.userData.hit !== run.hits) {
    const pixels = texture.image.data;
    pixels.fill(0);
    for (const [index, mark] of Object.entries(run.marks || {})) {
      const i = Number(index) * 4;
      pixels[i] = (mark & 15) * 17;
      pixels[i + 1] = ((mark >> 4) & 15) * 17;
      pixels[i + 2] = ((mark >> 8) & 15) * 17;
    }
    texture.userData.seed = run.seed;
    texture.userData.hit = run.hits;
    texture.needsUpdate = true;
  }
}

const vertexHead = `
attribute vec4 forgeCoord;
varying vec4 vForge;
varying vec3 vForgePos;
varying vec3 vForgeNormal;
`;
const vertexBody = `
vForge = forgeCoord;
vForgePos = position;
vForgeNormal = normalize(normalMatrix * normal);
`;

const fragmentHead = `
uniform vec4 fCodes, fLevels;
uniform float fClock, fSeed, fHeat, fPurity, fPulse, fWave, fGripStyle, fFitted, fRaw, fOreTrace, fOreStyle, fOreFamily, fOreSeed;
uniform sampler2D fMarks;
uniform vec3 fGrip, fGuard, fHit, fOreTone;
varying vec4 vForge;
varying vec3 vForgePos;
varying vec3 vForgeNormal;

float forgeHash(vec2 p) {
  vec3 q = fract(p.xyx * vec3(.1031,.11369,.13787));
  q += dot(q, q.yzx + 19.19);
  return fract((q.x + q.y) * q.z);
}
float forgeNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.-2.*f);
  return mix(mix(forgeHash(i),forgeHash(i+vec2(1.,0.)),f.x),
    mix(forgeHash(i+vec2(0.,1.)),forgeHash(i+vec2(1.,1.)),f.x),f.y);
}
float forgeBand(float x, float width) {
  float aa = max(.015, fwidth(x) * .65);
  return 1. - smoothstep(width, width+aa, abs(fract(x)-.5));
}
`;

// Shared object-space geology: shell windows and both cut faces sample exactly
// the same deposit. The blade stretches this field along its own length.
const geology = `
float mineralHash3(vec3 p) {
  p=fract(p*.1031);p+=dot(p,p.yzx+31.32);return fract((p.x+p.y)*p.z);
}
float mineralNoise3(vec3 p) {
  vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(mix(mineralHash3(i),mineralHash3(i+vec3(1,0,0)),f.x),
    mix(mineralHash3(i+vec3(0,1,0)),mineralHash3(i+vec3(1,1,0)),f.x),f.y),
    mix(mix(mineralHash3(i+vec3(0,0,1)),mineralHash3(i+vec3(1,0,1)),f.x),
    mix(mineralHash3(i+vec3(0,1,1)),mineralHash3(i+vec3(1,1,1)),f.x),f.y),f.z);
}
vec3 mineralCells(vec2 q, float seed) {
  vec2 cell=floor(q),f=fract(q);
  float near=9.,second=9.,shade=0.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 b=vec2(float(x),float(y));
    vec2 jitter=vec2(forgeHash(cell+b+seed),forgeHash(cell+b+seed+19.3));
    vec2 d=b+jitter-f;float dist=dot(d,d);
    if(dist<near){second=near;near=dist;shade=forgeHash(cell+b+seed+8.7);}
    else second=min(second,dist);
  }
  return vec3(sqrt(near),sqrt(second)-sqrt(near),shade);
}
vec4 mineralField(vec3 p, float family, float style, float seed) {
  vec3 v=p+vec3(seed*7.,seed*3.,style*.29);
  float n=mineralNoise3(v*4.7)*.72+mineralNoise3(v*11.3)*.28;
  float fine=mineralNoise3(v*49.);
  float warp=mineralNoise3(v*3.1);
  vec2 q=p.yz;
  float seam=0.,facets=n;
  if(family < .5){
    float layers=q.x*(4.7+mod(style,3.)*.9)+q.y*.65+warp*1.45;
    seam=forgeBand(layers,.14)*smoothstep(.30,.60,n);
    facets=.30+.70*warp;
  }else if(family < 1.5){
    vec3 cell=mineralCells(q*(6.3+style*.4)+vec2(warp*.31,n*.19),seed*17.);
    facets=cell.z;
    seam=smoothstep(.015,.09,cell.y)*(.23+.77*cell.z);
  }else if(family < 2.5){
    seam=(1.-smoothstep(.025,.10,abs(n-.51)))*smoothstep(.28,.56,warp);
    facets=mineralNoise3(v*15.);
  }else if(family < 3.5){
    float a=forgeBand(q.x*8.+q.y*3.5+warp*.27,.10)*smoothstep(.35,.58,n);
    float b=forgeBand(q.x*4.-q.y*6.2+seed*2.,.07)*smoothstep(.53,.74,warp);
    seam=max(a,b*.62);facets=mineralNoise3(v*21.);
  }else{
    float layers=q.x*(5.2+mod(style,3.)*.65)+q.y*.55+warp*1.18;
    seam=forgeBand(layers,.21)*(.30+.70*n);
    facets=.3+.7*mineralNoise3(v*8.);
  }
  // Sparse irregular fracture edges, with gaps. Avoid a periodic dotted network.
  float fracture=(1.-smoothstep(.012,.034,abs(warp-.49)))*smoothstep(.45,.65,n);
  return vec4(seam,facets,fine,fracture);
}
vec3 rockBump(vec3 n, float height, vec3 viewP) {
  vec3 dx=dFdx(-viewP), dy=dFdy(-viewP);
  vec3 rx=cross(dy,n), ry=cross(n,dx);
  float det=dot(dx,rx);
  if(abs(det)<.00000001)return n;
  return normalize(abs(det)*n-sign(det)*(dFdx(height)*rx+dFdy(height)*ry));
}
`;

const body = `
vec2 fp = vec2(vForgePos.x, vForgePos.y + abs(vForgePos.z)*.26);
vec2 st = vForge.xy;
float grip = smoothstep(.02,.96,vForge.z) * fFitted;
float edge = vForge.w;
float grazing = pow(1. - abs(dot(normalize(vForgeNormal),normalize(vViewPosition))),2.7);
float bend = fSeed*6.28318;
float coarse = forgeNoise(fp*vec2(8.,24.)+vec2(bend,-bend));
vec3 mark = texture2D(fMarks,st).rgb;
float brush = sin(fp.y*1950. + sin(fp.x*21.)*1.5) * (1.-smoothstep(.2,2.8,fwidth(fp.y*1950.)));
float refine = clamp((fLevels.x-1.)*.04,0.,.085);
vec3 steel = vec3(.35,.38,.40);
float forgeRough = .32;
float forgeMetal = .92;
vec3 forgeGlow = vec3(0.);
if (fCodes.x > .5 && fCodes.x < 1.5) { steel = vec3(.55,.59,.63); forgeRough = .245; }
else if (fCodes.x < 2.5 && fCodes.x > 1.5) { steel = vec3(.51,.64,.67); forgeRough = .255; }
else if (fCodes.x < 3.5 && fCodes.x > 2.5) { steel = vec3(.25,.29,.36); forgeRough = .28; }
else if (fCodes.x > 3.5) { steel = vec3(.21,.19,.23); forgeRough = .255; }
steel *= .92 + brush*.038 + coarse*.13;
forgeRough += brush*.025 + (coarse-.5)*.14 - refine;
float slag = smoothstep(.62,.91,forgeNoise(fp*vec2(49.,91.)+bend));
steel *= 1.-(1.-fPurity)*slag*.42;
forgeRough += (1.-fPurity)*slag*.14;
// A durable mineral fingerprint remains underneath every forged finish.
vec4 sourceField = mineralField(vec3(0.,st.y*.84-.42,st.x*1.42-.71),fOreFamily,fOreStyle,fOreSeed);
float inheritedGrain = sourceField.x * (.45+.55*fOreTrace);
vec3 sourceBase = fOreTone*(.72+coarse*.18);
steel = mix(steel,sourceBase,.58);
vec3 sourceLight = mix(vec3(.59,.64,.67),fOreTone,.66);
if(fOreFamily < .5) steel = mix(steel,steel*.34,inheritedGrain*.80);
else if(fOreFamily < 1.5) steel = mix(steel,sourceLight*(.36+sourceField.y*.70),.46+inheritedGrain*.18);
else if(fOreFamily < 2.5) steel = mix(steel*.54,fOreTone*(.92+.18*sourceField.z),inheritedGrain*.88);
else if(fOreFamily < 3.5) steel = mix(steel*.65,sourceLight,inheritedGrain*.72);
else steel = mix(steel*.79,sourceLight,inheritedGrain*.61);
forgeRough += inheritedGrain*.10 + (sourceField.z-.5)*.025;
float patternWeight = .56 + .12 * fLevels.y;
float pat = 0.;
float seam = 0.;
if (fCodes.y > .5 && fCodes.y < 1.5) {
  float wav = fp.y*81. + sin(fp.x*11.+bend)*1.25 + sin(fp.x*25.+fp.y*18.-bend)*.43 + coarse*.35;
  pat = mix(forgeBand(wav, .105),forgeBand(wav*.51+.24,.072),.36);
  steel *= 1.12 - pat * patternWeight*.77;
  forgeRough += pat*.16;
} else if (fCodes.y > 1.5 && fCodes.y < 2.5) {
  vec2 q = fp*vec2(21.,58.) + bend;
  q += vec2(coarse*.31, sin(q.x*.72+bend)*.24);
  vec2 c = vec2(q.x+.53*q.y,q.x-.64*q.y);
  vec2 i = floor(c);
  float facet = forgeHash(i);
  float cut = max(forgeBand(c.x,.045),forgeBand(c.y,.044));
  steel = mix(steel, mix(vec3(.25,.39,.46),vec3(.67,.82,.82),facet), patternWeight*.76);
  steel += cut*.055;
  forgeRough += (facet-.45)*.19 + cut*.055;
} else if (fCodes.y > 2.5 && fCodes.y < 3.5) {
  float meander = fp.y*30. + sin(fp.x*17.+bend)*.70 + sin(fp.x*39.-bend)*.18 + coarse*.32;
  seam = forgeBand(meander,.045) * smoothstep(.24,.53,coarse) * (1.-edge*.75);
  steel = mix(steel*.57,vec3(.65,.20,.073),seam*patternWeight);
  forgeRough += .09*(1.-seam);
} else if (fCodes.y > 3.5) {
  float dust = forgeHash(floor(fp*vec2(350.,530.)));
  float ribbon = smoothstep(.31,.76,coarse*.62+forgeNoise(fp*vec2(3.,15.)+bend)*.46);
  vec3 sky = mix(vec3(.115,.13,.24),vec3(.40,.28,.58),ribbon);
  steel = mix(steel,sky,patternWeight*.77);
  steel += smoothstep(.979,.999,dust)*ribbon*.36;
}
float filmMix = (.22 + .105*fLevels.z) * (fCodes.y > .5 ? .77 : 1.);
if (fCodes.z > .5 && fCodes.z < 1.5) {
  float hamon = smoothstep(.14,.8,st.y+.18*sin(fp.x*24.+bend)+.22*coarse);
  vec3 oxide = mix(vec3(.58,.34,.15),vec3(.13,.32,.65),hamon);
  steel = mix(steel,oxide,filmMix*(.44+.56*hamon));
} else if (fCodes.z > 1.5 && fCodes.z < 2.5) {
  float current = sin(st.x*9. + 2.2*sin(st.x*3.2+bend) + st.y*1.35 + coarse*2.);
  vec3 jewel = mix(vec3(.094,.37,.49),vec3(.49,.19,.56),smoothstep(-.42,.72,current));
  steel = mix(steel,jewel,min(.67, filmMix*1.7));
  forgeRough -= .08;
} else if (fCodes.z > 2.5 && fCodes.z < 3.5) {
  float phase = st.x*4.8+st.y*1.15+grazing*3.7+coarse*.86+bend;
  vec3 prism = .37 + .29*cos(phase + vec3(0.,2.094,4.188));
  steel = mix(steel,prism,min(.58,filmMix*(.85+.65*grazing)));
  forgeRough -= .035;
} else if (fCodes.z > 3.5) {
  float coast = smoothstep(.14,.88,st.x + sin(st.y*5.+bend)*.11);
  steel = mix(steel,mix(vec3(.34,.16,.33),vec3(.79,.41,.12),coast),filmMix*1.29);
  forgeRough -= .043;
}
steel = mix(steel,vec3(.64,.68,.71)*(1.-.22*grazing),edge*.58);
forgeRough = mix(forgeRough,.17,edge*.61);
float pulse = fPulse * exp(-abs(vForgePos.x-fHit.x)*9. - abs(vForgePos.y-fHit.y)*20.);
vec3 aura = mix(vec3(.24,.75,.94),vec3(.72,.42,1.),sin(st.x*6.+bend)*.5+.5);
if (fCodes.w > .5) {
  float rank = fLevels.w/3.;
  float sweep = pow(.5+.5*sin(st.x*15. - fClock*3.15 + bend),6.);
  if (fCodes.w < 1.5) forgeGlow += aura * edge * rank * (.11+.22*sweep);
  else if (fCodes.w < 2.5) forgeGlow += vec3(1.,.23,.032) * max(seam,edge*.38) * rank * (.21+.25*sweep);
  else {
    float veil = smoothstep(.35,.83,coarse)*(.03+.19*sweep);
    forgeGlow += aura * rank * (edge*.19 + veil + (rank > .99 ? grazing*.16 : 0.));
  }
}
float grain = forgeBand(st.y*31. + st.x*(3.+mark.g*7.) + coarse*.3,.11);
steel *= 1. + mark.r * (.11 + (grain-.36)*.16);
forgeRough -= mark.r*.17;
float crack = forgeBand(st.x*48. + st.y*3.7 + coarse*.44,.065) * mark.b;
steel *= 1.-crack*.73;
forgeRough += mark.b*.22;
vec3 tapHeat = vec3(1.,.24,.047);
forgeGlow += (pulse*.52+fHeat*fHeat*mix(.08,.52,coarse))*tapHeat;
float shock = max(0.,fWave);
float track = length((vForgePos.xy-fHit.xy)*vec2(1.,2.2));
forgeGlow += aura * exp(-abs(track-(1.-shock)*.72)*31.) * shock * .31;
float source = clamp(dot(diffuseColor.rgb,vec3(.213,.715,.072)),0.,1.);
float wrap = .88 + .13*sin(st.x*(fGripStyle > 2.5 ? 193. : 88.) + st.y*6.);
vec3 hilt = fGrip * (source*.54+.72) * (fGripStyle > 1.5 ? wrap : .91+.19*coarse);
float endBand = max(1.-smoothstep(.055,.095,st.x), smoothstep(.54,.8,1.-vForge.z));
hilt = mix(hilt,fGuard*(.69+.4*source),endBand*.82);
float hiltRough = mix(.57,.28,endBand);
if (fRaw > .5) {
  steel *= .68 + coarse*.50;
  forgeRough += .17 * (1.-fHeat);
}
diffuseColor.rgb = mix(steel,hilt,grip);
forgeRough = clamp(mix(forgeRough,hiltRough,grip),.14,.76);
forgeMetal = mix(forgeMetal,.14+.57*endBand,grip);
forgeGlow *= 1.-grip;
`;

export function makeBladeMaterial(original, uniforms, raw) {
  const material = new T.MeshStandardMaterial({
    color: 0xffffff,
    map: original?.map || null,
    roughness: .32,
    metalness: .9,
    envMapIntensity: 1.22,
  });
  material.userData.forge = uniforms;
  material.customProgramCacheKey = () => 'blade-lab-mineral-heritage-6';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = vertexHead + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + vertexBody);
    shader.fragmentShader = fragmentHead + geology + shader.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + body)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = forgeRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = forgeMetal;')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += forgeGlow;');
  };
  uniforms.fRaw.value = raw ? 1 : 0;
  return material;
}

const oreUniformHead = `
uniform float oreSeed, oreReveal, oreGrade, oreHeat, oreFamily, oreMaterial;
uniform float oreVein, oreFlaw, oreLuster, oreDensity, oreCrust, oreRoughness, oreMetalness;
uniform float orePurity, oreWindow, oreLamp;
uniform vec3 oreTint, oreBaseColor, oreVeinColor, oreCoreColor;
`;

export function makeOreMaterial(original, uniforms, family = 'river') {
  const material = new T.MeshStandardMaterial({
    color: 0xffffff, roughness: .86, metalness: .13, envMapIntensity: .8,
  });
  material.customProgramCacheKey = () => 'bladelab-geological-shell-6';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec3 vOre;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvOre = position;');
    shader.fragmentShader = fragmentHead.slice(fragmentHead.indexOf('float forgeHash')) + geology + oreUniformHead +
      'varying vec3 vOre;\n' + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 p = vOre;
      vec3 v=p+vec3(oreSeed*7.,oreSeed*3.,oreMaterial*.29);
      float n=mineralNoise3(v*4.7)*.72+mineralNoise3(v*11.3)*.28;
      float grain=mineralNoise3(v*52.);
      float micro=mineralNoise3(v*138.);
      float weather=mineralNoise3(v*3.1);
      float pore=smoothstep(.67,.86,grain)*(1.-oreDensity*.68);
      float crack=(1.-smoothstep(.010,.031,abs(weather-.49)))*smoothstep(.46,.66,n)*oreFlaw;
      // Mineral appears only in a few broken windows through the weathered host.
      float exposurePatch=smoothstep(.58,.73,n)*(1.-oreCrust*.65);
      float exposed=exposurePatch*(.18+.62*oreVein);
      float glint=smoothstep(.80,.96,grain)*oreLuster*exposed;
      vec3 stone=oreBaseColor*(.61+n*.60+(grain-.5)*.22+(micro-.5)*.08);
      if(oreFamily < .5) stone=mix(stone,oreBaseColor*.57,smoothstep(.61,.77,weather)*.25);
      else if(oreFamily < 1.5) stone=mix(stone,oreVeinColor*(.64+grain*.32),smoothstep(.53,.75,grain)*exposurePatch*.70);
      else if(oreFamily < 2.5) stone=mix(stone,oreCoreColor*.57,smoothstep(.55,.72,weather)*.29);
      else if(oreFamily < 3.5) stone*=.77+grain*.28;
      else stone=mix(stone,oreVeinColor*.51,smoothstep(.49,.76,weather)*.30);
      stone=mix(stone,oreVeinColor*(.70+grain*.31),exposed*.68);
      stone*=1.-crack*.51-pore*.17;
      float window=(1.-smoothstep(.17,.235,length((p.xy-vec2(.12,.08))*vec2(1.,1.15))))*smoothstep(.15,.35,p.z)*oreWindow;
      float presence=smoothstep(.74-orePurity*.50,.91-orePurity*.45,n);
      // The extra field is evaluated only for an actual scraped window.
      vec4 deposit=vec4(0.,n,grain,0.);
      if(oreWindow>.5)deposit=mineralField(p,oreFamily,oreMaterial,oreSeed);
      vec3 polished=mix(oreBaseColor*.63,oreCoreColor*(.60+.46*deposit.y),presence);
      polished=mix(polished,oreVeinColor*.88,deposit.x*.37);
      stone=mix(stone,polished,window);
      diffuseColor.rgb=stone;
      float oreM=mix(clamp(oreMetalness+exposed*.33+glint*.20,.06,.65),.33,window);
      float oreR=mix(clamp(oreRoughness+pore*.07-exposed*.28-glint*.18,.35,.98),.31,window);
      float rockHeight=((micro-.5)*.00045+(grain-.5)*.004-crack*.005-pore*.003)*(1.-window*.92);
    `).replace('#include <roughnessmap_fragment>', 'float roughnessFactor = oreR;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = oreM;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = rockBump(normal,rockHeight,vViewPosition);')
      .replace('#include <emissivemap_fragment>', `
        float translucent = oreFamily > .5 && oreFamily < 1.5 ? .15 : .025;
        float lampSpot = exp(-length(p.xy-vec2(.1,.04))*4.6) * smoothstep(.03,.45,p.z);
        totalEmissiveRadiance += oreCoreColor*oreLamp*lampSpot*(.12+oreVein*.26)*translucent*3.
          + vec3(.91,.15,.022)*oreHeat*oreHeat*(.08+crack*.27);
      `);
  };
  return material;
}

export function makeMeltMaterial(uniforms) {
  const material = new T.MeshStandardMaterial({ color: 0xff7730, roughness: .3, metalness: .62, envMapIntensity: .85 });
  material.customProgramCacheKey = () => 'blade-lab-molten-2';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec3 vMelt;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvMelt = position;');
    shader.fragmentShader = `uniform float meltClock, meltHeat, meltClean, meltSeed;
      uniform vec3 meltTint;
      varying vec3 vMelt;
    ` + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 p = vMelt;
      float flow = sin(p.y*18.+meltSeed*7.+sin(p.x*13.+meltClock*2.)*1.55+sin(p.z*21.-meltClock*1.7)*1.18);
      float currents = sin(p.x*31.+sin(p.z*12.+p.y*7.)*2.4+meltClock*.65) * .32 + flow*.68;
      float dross = smoothstep(.04,.77,currents) * (1.-meltClean*.92);
      float crust = smoothstep(.56,.94,sin(p.x*53.+p.y*29.)*sin(p.z*41.-p.y*37.));
      vec3 heat = mix(vec3(.23,.018,.005),vec3(.92,.29,.044),meltHeat);
      diffuseColor.rgb = mix(heat*(1.-dross*.91),meltTint,.09)*(1.-crust*dross*.47);
    `).replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += vec3(1.,.18,.018) * meltHeat * (.19 + .98*(1.-dross));');
  };
  return material;
}

export function makeCutMaterial(uniforms) {
  const material = new T.MeshStandardMaterial({
    color: 0xffffff, roughness: .37, metalness: .35, envMapIntensity: 1.05, side: T.DoubleSide,
  });
  material.customProgramCacheKey = () => 'bladelab-matched-mineral-section-7';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = fragmentHead.slice(fragmentHead.indexOf('float forgeHash')) + geology + oreUniformHead + `
      varying vec3 vSection;
      varying float vCutRim;
    ` + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 p=vSection;
      vec4 deposit=mineralField(p,oreFamily,oreMaterial,oreSeed);
      vec3 v=p+vec3(oreSeed*7.,oreSeed*3.,oreMaterial*.29);
      float quality=clamp(oreGrade*.5,0.,1.);
      float n=mineralNoise3(v*4.7)*.72+mineralNoise3(v*11.3)*.28;
      float cloud=mineralNoise3(v*3.1);
      float presence=smoothstep(.73-orePurity*.47,.89-orePurity*.43,n);
      presence=clamp(presence*(.36+quality*.55)+deposit.x*(.13+quality*.20),0.,1.);
      vec3 matrixRock=oreBaseColor*(.48+.39*n+.12*deposit.z);
      vec3 mineral=oreCoreColor*(.59+.43*deposit.y);
      if(oreFamily < .5) mineral=mix(mineral*.69,oreVeinColor,deposit.x*.66);
      else if(oreFamily < 1.5) mineral=mix(oreCoreColor*.44,oreVeinColor,.12+deposit.y*.78);
      else if(oreFamily < 2.5) mineral=mix(oreCoreColor*.43,oreCoreColor*1.10,deposit.x*.81+cloud*.14);
      else if(oreFamily < 3.5) mineral=mix(mineral*.67,oreVeinColor*.95,deposit.x*.79);
      else mineral=mix(oreCoreColor*.58,oreVeinColor,deposit.x*.58);
      vec3 core=mix(matrixRock,mineral,presence);
      float saw=sin(p.z*780.+p.y*.8)*(1.-smoothstep(.8,3.0,fwidth(p.z*780.)));
      core*=.985+saw*.009;
      float flaws=deposit.w*oreFlaw*(1.-orePurity)*.45;
      core*=1.-flaws;
      float rim=smoothstep(.06,.96,vCutRim);
      core=mix(core,oreBaseColor*(.40+.19*n),rim);
      diffuseColor.rgb=core;
      float cutMetal=mix(.16+presence*.39+deposit.x*.11,.08,rim);
      float cutRough=mix(.65-presence*.28-quality*.07+flaws*.2,.91,rim);
      float cutHeight=(deposit.z-.5)*.0004+flaws*.001+rim*.001;
    `).replace('#include <roughnessmap_fragment>', 'float roughnessFactor = cutRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = cutMetal;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = rockBump(normal,cutHeight,vViewPosition);');
    shader.vertexShader = 'varying vec3 vSection;\nattribute float cutRim;\nvarying float vCutRim;\n' +
      shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvSection = position; vCutRim = cutRim;');
  };
  return material;
}
