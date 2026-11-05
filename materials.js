import { MARK_WIDTH, MARK_HEIGHT, familyOf } from './forge.js?v=4';

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
  uniforms.fOreTone.value.set(familyOf(run.ore?.family).color);
  uniforms.fOreTrace.value = (run.ore?.vein ?? 52) / 100;
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
uniform float fClock, fSeed, fHeat, fPurity, fPulse, fWave, fGripStyle, fFitted, fRaw, fOreTrace;
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
// The mineral's original hue and grain survive refining, hammering and fittings.
float inheritedGrain = forgeBand(fp.y*42. + sin(fp.x*13.+bend)*1.2 + coarse*.6, .08) * fOreTrace;
steel = mix(steel, steel*(.73 + fOreTone*.59), .095 + inheritedGrain*.23);
forgeRough += inheritedGrain*.032;
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
  material.customProgramCacheKey = () => 'blade-lab-layered-2';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = vertexHead + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + vertexBody);
    shader.fragmentShader = fragmentHead + shader.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + body)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = forgeRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = forgeMetal;')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += forgeGlow;');
  };
  uniforms.fRaw.value = raw ? 1 : 0;
  return material;
}

export function makeOreMaterial(original, uniforms, family = 'river') {
  const material = new T.MeshStandardMaterial({
    color: 0xffffff, roughness: .9, metalness: .1, envMapIntensity: .57,
    flatShading: family === 'coal' || family === 'frost' || family === 'ochre',
  });
  material.customProgramCacheKey = () => 'bladelab-ore-twelve-minerals-4';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec3 vOre; varying vec3 vOreNormal;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvOre = position; vOreNormal = normal;');
    shader.fragmentShader = fragmentHead.slice(fragmentHead.indexOf('float forgeHash')) + `
      uniform float oreSeed, oreReveal, oreGrade, oreHeat, oreFamily, oreMaterial;
      uniform float oreVein, oreFlaw, oreLuster, oreDensity, oreCrust, oreRoughness, oreMetalness;
      uniform vec3 oreTint, oreBaseColor, oreVeinColor;
      varying vec3 vOre, vOreNormal;
    ` + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 p = vOre;
      float n = forgeNoise(p.xy*vec2(5.5,8.5) + p.z*4. + oreSeed*18.);
      float fine = forgeNoise(p.xy*vec2(19.,27.)+p.z*9. + oreSeed*22.);
      float dust = forgeHash(floor(p.xy*vec2(94.,117.) + p.z*45. + oreSeed*67.));
      float ripple = p.y*25. + sin(p.x*8. + oreSeed*6.)*1.4 + n*1.8;
      float layer = forgeBand(ripple,.12);
      float shard = max(forgeBand(p.y*35.+p.x*36.+oreSeed*9.,.055),
                        forgeBand(p.y*43.-p.x*27.+oreSeed*8.,.06));
      float crack = forgeBand(p.y*18. + p.x*7. + sin(p.z*22. + oreSeed*5.)*1.7,.037);
      crack *= (oreFlaw*.83) * smoothstep(.28,.69,n);
      float pore = smoothstep(.68,.9,fine) * (1.-oreDensity*.78);
      float fleck = smoothstep(.985,.999,dust)*oreLuster;
      float veinLine = layer*.48;
      float rust = 0.;
      float grainExtra = 0.;
      float shiny = 0.;
      if (oreMaterial < 1.5) {
        veinLine = max(layer*.6, fine*.16);
        shiny = oreMaterial > .5 ? fleck*.62 : fleck*.18;
      } else if (oreMaterial < 2.5) {
        veinLine = layer*.96;
        grainExtra = .13 * abs(sin(ripple*1.4));
      } else if (oreMaterial < 4.5) {
        veinLine = shard * (oreMaterial < 3.5 ? .9 : .55);
        shiny = fleck * (oreMaterial > 3.5 ? .85 : .42);
        grainExtra = .08 * forgeHash(floor(p.xy*17. + oreSeed*4.));
      } else if (oreMaterial < 6.5) {
        veinLine = max(layer*.24,crack*.36);
        pore *= 1.5;
        rust = smoothstep(.51,.82,n)*.17 + (oreMaterial>5.5 ? .10 : 0.);
      } else if (oreMaterial < 8.5) {
        veinLine = max(shard*.22, layer*.30);
        shiny = fleck*(oreMaterial>7.5 ? 1.0 : .3);
        pore *= .75;
      } else {
        veinLine = layer * (oreMaterial>10.5 ? .80 : .43);
        rust = smoothstep(.38,.77,n) * (oreMaterial>9.5 ? .18 : .08);
        grainExtra = (1.-fine)*.14;
      }
      float coat = .36 + oreCrust*.34;
      float oreExpose = clamp((veinLine*.77 + shiny*.28)*oreVein*(1.-coat*.57),0.,.77);
      vec3 stone = oreBaseColor * (.78 + n*.30 + fine*.10 - pore*.10);
      stone = mix(stone,stone*vec3(1.10,.77,.55),rust);
      stone *= 1.-grainExtra*.35;
      stone = mix(stone, oreVeinColor*(.64+.28*fine),oreExpose);
      stone += oreVeinColor*shiny*.065;
      stone *= 1.-crack*(.26+.20*oreFlaw);
      diffuseColor.rgb = stone;
      float oreM = clamp(oreMetalness + oreExpose*.40 + shiny*.11 - coat*.09,.04,.62);
      float oreR = clamp(oreRoughness + pore*.055 + coat*.06 - shiny*.13 - oreExpose*.24,.43,.99);
    `).replace('#include <roughnessmap_fragment>', 'float roughnessFactor = oreR;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = oreM;')
      .replace('#include <emissivemap_fragment>', `
        totalEmissiveRadiance += oreVeinColor * (shiny*.018 + oreReveal*oreGrade*oreExpose*.023)
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
    shader.fragmentShader = `uniform float meltClock, meltHeat, meltClean;
      uniform vec3 meltTint;
      varying vec3 vMelt;
    ` + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 p = vMelt;
      float flow = sin(p.y*18.+sin(p.x*13.+meltClock*2.)*1.55+sin(p.z*21.-meltClock*1.7)*1.18);
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
    color: 0xffffff, roughness: .42, metalness: .45, envMapIntensity: .91, side: T.DoubleSide,
  });
  material.customProgramCacheKey = () => 'bladelab-ore-sawn-core-4';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = fragmentHead.slice(fragmentHead.indexOf('float forgeHash')) + `
      uniform float oreSeed, oreGrade, oreMaterial, oreFamily, orePurity, oreVein, oreFlaw, oreLuster, oreCrust;
      uniform vec3 oreBaseColor, oreVeinColor;
      varying vec3 vSection;
    ` + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec2 p = vSection.yz;
      float n = forgeNoise(p*vec2(8.,11.)+oreSeed*9.);
      float fine = forgeNoise(p*vec2(33.,47.)-oreSeed*17.);
      float speck = forgeHash(floor(p*136.+oreSeed*12.));
      float bands = p.y*25. + sin(p.x*9.+oreSeed*9.)*1.05 + n*2.0;
      float layer = max(forgeBand(bands,.11),forgeBand(bands*.52+oreSeed*3.,.06)*.63);
      float crystal = max(forgeBand(p.x*19.+p.y*13.+oreSeed*4.,.12),
                          forgeBand(p.x*16.-p.y*21.+oreSeed*6.,.11));
      float fleck = smoothstep(.978,.999,speck);
      float band = oreFamily < .5 ? layer :
        oreFamily < 1.5 ? crystal :
        oreFamily < 2.5 ? max(layer*.46,fleck*.58) :
        oreFamily < 3.5 ? max(layer*.53,crystal*.29) :
        max(layer*.78,crystal*.14);
      float center = 1.-smoothstep(.14,.48,length(p*vec2(1.13,1.35)));
      float deposit = center * (oreGrade*.13 + orePurity*.13);
      float mineral = clamp(band * (.18 + oreVein*.53 + oreGrade*.15) + deposit,0.,.96);
      float cavity = smoothstep(.71,.92,n) * (1.-orePurity)*(.14+.22*oreFlaw);
      vec3 stone = oreBaseColor*(.95+.23*n+.09*fine);
      stone *= 1.-cavity*.85;
      float rich = clamp(.20+.19*oreGrade+.25*orePurity,.15,.83);
      vec3 core = mix(stone,oreVeinColor*(.70+.33*fine)+vec3(.024),mineral*rich);
      float trace = fleck * band * (oreGrade*.22+.10) * oreLuster;
      core += oreVeinColor * trace*.19;
      diffuseColor.rgb = core;
      float cutMetal = clamp(.14+mineral*rich*.58+trace*.13,.12,.74);
      float cutRough = clamp(.78-mineral*rich*.42+(.85-orePurity)*.10,.27,.88);
    `).replace('#include <roughnessmap_fragment>', 'float roughnessFactor = cutRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = cutMetal;')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += oreVeinColor * trace * oreGrade * .035;');
    shader.vertexShader = 'varying vec3 vSection;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSection = position;');
  };
  return material;
}
