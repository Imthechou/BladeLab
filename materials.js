import { MARK_WIDTH, MARK_HEIGHT, familyOf } from './forge.js?v=3';

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

export function makeOreMaterial(original, uniforms) {
  const material = new T.MeshStandardMaterial({
    color: 0x928a7f, map: original?.map || null, roughness: .91, metalness: .08, envMapIntensity: .57, flatShading: true,
  });
  material.customProgramCacheKey = () => 'blade-lab-stone-strata-3';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `varying vec3 vOre; varying vec3 vOreNormal;\n` +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvOre = position; vOreNormal = normal;');
    shader.fragmentShader = fragmentHead.slice(fragmentHead.indexOf('float forgeHash')) + `
      uniform float oreSeed, oreReveal, oreGrade, oreHeat, oreClue, oreFamily, oreVein, oreFlaw, oreLuster;
      uniform vec3 oreTint;
      varying vec3 vOre, vOreNormal;
    ` + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 p = vOre;
      float grain = forgeNoise(p.xy*vec2(31.,43.)+p.z*18.+oreSeed*17.);
      float grains = forgeHash(floor(p.xy*vec2(183.,209.) + p.z*76. + oreSeed*61.));
      float beds = p.y*36. + sin(p.x*15.+oreSeed*6.)*2. + forgeNoise(p.xz*16.)*2.;
      float layer = forgeBand(beds,.115);
      float jagged = forgeBand(p.y*68. + p.x*29. + sin(p.z*18.+oreSeed*7.)*4.,.05);
      float crystalline = forgeNoise(p.xy*vec2(28.,39.) + p.z*19. + oreSeed*12.);
      float facets = forgeHash(floor(p.xy*32. + p.z*13.));
      float seams = smoothstep(.76,.97,crystalline)*smoothstep(.36,.82,grain);
      float vein = oreVein * (.35 + .65*max(layer,seams));
      float fissure = (1.-smoothstep(.055,.17,abs(sin(beds*.39+p.z*17.)))) * oreFlaw;
      float porous = smoothstep(.66,.92,grain) * (1.-oreLuster*.47);
      float face = clamp(dot(normalize(vOreNormal),normalize(vec3(.24,.72,.52)))*.5+.5,.0,1.);
      vec3 base = mix(vec3(.095,.093,.097),vec3(.29,.27,.265),grain*.76+face*.15);
      float showMetal = .0;
      if (oreFamily < .5) {
        base = mix(base,vec3(.23,.29,.32),.42);
        showMetal = max(layer*.77,seams*.43) * (.20+.66*oreVein);
      } else if (oreFamily < 1.5) {
        base = mix(base,vec3(.19,.31,.32),.44);
        showMetal = max(seams*.95, facets*.30*layer) * (.16+.72*oreVein);
        base += facets*.047;
      } else if (oreFamily < 2.5) {
        base = mix(base,vec3(.27,.19,.16),.46);
        showMetal = max(jagged*.72,seams*.34) * (.18+.64*oreVein);
        base *= 1. - porous*.33;
      } else {
        base = mix(base,vec3(.17,.16,.25),.48);
        showMetal = max(seams*.65,layer*.44) * (.20+.70*oreVein);
        base += smoothstep(.987,.998,grains) * .095;
      }
      float glint = smoothstep(.968,.999,grains) * oreLuster * vein;
      float metal = clamp(showMetal*.66 + glint*.64,0.,.78);
      diffuseColor.rgb = mix(base,oreTint*(.20+.31*grain)+vec3(.026),metal*.77);
      diffuseColor.rgb += oreTint*glint*.14;
      diffuseColor.rgb *= 1. - fissure*(.16+.28*oreFlaw);
      diffuseColor.rgb *= .70 + .19*grain;
    `).replace('#include <roughnessmap_fragment>', `
      float roughnessFactor = clamp(.94 - metal*.37 + fissure*.11 + porous*.09 - glint*.14,.38,.99);
    `).replace('#include <metalnessmap_fragment>', 'float metalnessFactor = mix(.05,.64,metal);')
      .replace('#include <emissivemap_fragment>', `
        totalEmissiveRadiance += oreTint * (glint*.055 + oreReveal*oreGrade*metal*.095)
          + vec3(.91,.15,.022)*oreHeat*oreHeat*(.09+jagged*.62);
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
    color: 0xffffff, roughness: .34, metalness: .64, envMapIntensity: 1.24, side: T.DoubleSide,
  });
  material.customProgramCacheKey = () => 'blade-lab-ore-cross-section-3';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = fragmentHead.slice(fragmentHead.indexOf('float forgeHash')) + `
      uniform float oreSeed, oreGrade, oreFamily, orePurity, oreVein, oreFlaw, oreLuster;
      uniform vec3 oreTint;
      varying vec3 vSection;
    ` + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec2 p = vSection.yz;
      float n = forgeNoise(p*vec2(17.,19.)+oreSeed*12.);
      float facets = forgeHash(floor(p*36.+oreSeed*17.));
      float fine = forgeHash(floor(p*178.+oreSeed*23.));
      float seam = p.y*57. + p.x*22. + sin(p.x*15.+oreSeed*5.)*2.7 + n*2.9;
      float ribbon = forgeBand(seam,.105);
      float twin = forgeBand(seam*.56 + sin(p.y*27.)*.60,.083);
      float crystal = max(forgeBand(p.x*43.+p.y*29.,.06),forgeBand(p.y*52.-p.x*34.,.052));
      float flow = forgeBand(p.y*31. + sin(p.x*22.+oreSeed*7.)*1.7,.048);
      float field = oreFamily < .5 ? max(ribbon,twin*.72)
        : oreFamily < 1.5 ? max(crystal,facets*.24)
        : oreFamily < 2.5 ? max(flow,ribbon*.42) : max(twin*.85,ribbon*.42);
      float matrix = mix(.095,.22,n)*(.86+.20*orePurity);
      float valuable = clamp(field*(.29+.62*oreVein+.11*oreGrade),0.,1.);
      vec3 core = mix(vec3(matrix*.91,matrix*.89,matrix*.88),
        oreTint * (.68+.48*facets)+vec3(.08),valuable);
      core += oreTint*smoothstep(.981,.999,fine)*field*(.22+.22*oreGrade);
      core *= 1.-(1.-orePurity)*smoothstep(.72,.94,n)*.32;
      diffuseColor.rgb = core;
    `).replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(.68 - valuable*.45 + (1.-orePurity)*.11,.19,.85);')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = mix(.17,.86,valuable);')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += oreTint * valuable * oreGrade * .035;');
    shader.vertexShader = 'varying vec3 vSection;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSection = position;');
  };
  return material;
}
