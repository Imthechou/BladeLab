import { LOOKS } from './forge.js?v=15';

export const lookCodes = Object.fromEntries(Object.entries(LOOKS).map(([slot, names]) =>
  [slot, Object.fromEntries(Object.keys(names).map((id, index) => [id, index]))]));

const { metal, pattern, film, fx } = lookCodes;

// The shader uses length and local width along the blade, so a layout wraps
// around each knife model without changing its seed when the model changes.
export const bladeLooksGLSL = `
uniform vec4 fMetalLayout, fPatternLayout, fFilmLayout, fFxLayout;
uniform vec3 fOreCore;
uniform float fBladeRoot;
const float forgeTurn = 6.2831853;

vec2 lookPoint(vec2 uv, vec4 variant) {
  return vec2((uv.x - variant.x) * variant.z, uv.y - .5 + (uv.x - variant.x) * variant.y);
}

float lookLine(float distance, float width) {
  float soft = max(fwidth(distance) * .66, .002 + (1. - fRefine) * .009);
  return 1. - smoothstep(width, width + soft, abs(distance));
}

vec3 mineralAccent(vec3 color, float amount) {
  float peak = max(fOreCore.r, max(fOreCore.g, fOreCore.b));
  vec3 tint = fOreCore / max(.29, peak);
  return mix(color, tint, amount * (.76 + .24 * fOreClarity));
}

vec3 lookSteel(int style, float tier, vec2 uv, float edge, float coarse, inout float rough) {
  vec2 p = lookPoint(uv, fMetalLayout);
  float mid = step(1.5, tier), high = step(2.5, tier);
  float glint = .5 + .5 * sin(p.x * 7.5 + fMetalLayout.w * forgeTurn);
  if (style == ${metal.silver}) {
    float polish = 1.-smoothstep(.12,.48,abs(p.y));
    rough = .252 - mid * .048 - high * (edge*.041+polish*.048);
    return vec3(.56, .60, .65) * (1. + (.043+mid*.09)*glint + high*(edge*.16+polish*.12));
  }
  if (style == ${metal.pearl}) {
    float satin = smoothstep(.04, .51, abs(p.y));
    rough = .335 + .076 * satin - mid * .035 - high * edge * .105;
    return mix(vec3(.48,.59,.65), vec3(.67,.75,.77), (1.-satin)*.55 + high*edge*.30);
  }
  if (style == ${metal.gunmetal}) {
    float silk = forgeBand(uv.y*22. + p.x*1.6 + fMetalLayout.w, .14);
    float bevel = forgeBand((uv.y-p.x*.61)*37., .095) * edge;
    rough = .32 + (silk-.45)*(.055+.052*mid) - bevel*.11*high;
    return vec3(.24,.32,.43) * (1. + silk*(.16+.22*mid) + bevel*.24*high);
  }
  if (style == ${metal.obsidian}) {
    float rim = max(edge,smoothstep(.77,.99,uv.y));
    rough = .264 - glint*.031 - mid*.054 - high*rim*.047;
    return mix(vec3(.105,.095,.137), vec3(.44,.41,.48), rim*(.10+.45*high));
  }
  if (style == ${metal.copper}) {
    float dents = smoothstep(.27,.73,forgeNoise(vec2(p.x*26.,p.y*12.)+fMetalLayout.w*19.));
    float burnish = 1.-smoothstep(.07,.29,abs(p.y-p.x*.27+.06));
    rough = .296 + dents*.070 - mid*.043 - high*burnish*.083;
    return mix(vec3(.47,.253,.126),vec3(.73,.46,.22),dents*(.24+.13*mid)+burnish*high*.28);
  }
  rough = .32;
  return vec3(.35,.38,.40) * (.95+.10*coarse);
}

#ifdef BLADE_DECORATION
vec2 lookWeb(vec2 p) {
  float angle = atan(p.y, p.x + .00001);
  float distance = length(p);
  float rings = forgeBand(distance*9. + abs(sin(angle*3.5))*.17, .06);
  float spokes = lookLine(sin(angle*3.5)*distance,.010);
  return vec2(max(rings,spokes),distance);
}

vec2 lookHex(vec2 p) {
  const vec2 lattice = vec2(1.,1.73205);
  vec2 a = mod(p,lattice)-lattice*.5;
  vec2 b = mod(p-lattice*.5,lattice)-lattice*.5;
  vec2 local = dot(a,a)<dot(b,b) ? a : b;
  float rim = max(abs(local.x),dot(abs(local),vec2(.5,.866025)));
  return vec2(rim,forgeHash(floor((p-local)*2. + .25)));
}

vec2 lookDot(vec2 p, float seed, float radius) {
  vec2 cell = floor(p);
  float hash = forgeHash(cell+seed*23.);
  vec2 center = vec2(hash,forgeHash(cell+vec2(seed*11.,13.)));
  float d = length(fract(p)-mix(vec2(.27),vec2(.73),center));
  return vec2(lookLine(d,radius),hash);
}

vec2 lookPattern(int style, float tier, vec2 uv, float coarse, inout vec3 steel, inout float rough, out float seam) {
  vec2 p = lookPoint(uv, fPatternLayout);
  float phase = fPatternLayout.w * forgeTurn;
  float mid = step(1.5,tier), high = step(2.5,tier);
  float ink = 0., foil = 0.;
  vec3 dark = steel*.22, bright = mineralAccent(vec3(.67,.73,.79),.18);
  seam = 0.;

  if (style == ${pattern.damascus}) {
    float flow = p.y*4.55 + sin(p.x*7.+phase)*.68 + sin(p.x*16.-phase)*.27;
    float crossFlow = p.y*7.1 - sin(p.x*6.+phase)*.80 + p.x*2.9;
    float whirl = length(p*vec2(1.,.56))*11. + atan(p.y*.56,p.x+.00001)*.52;
    flow = mix(flow,whirl,high*(1.-smoothstep(.09,.22,length(p*vec2(1.,.64)))));
    ink = max(smoothstep(.13,.67,cos(flow*forgeTurn))*.82,forgeBand(crossFlow,.075)*mid*.69);
    foil = max(forgeBand(flow-.29,.102),forgeBand(crossFlow-.27,.061)*mid*.76);
  } else if (style == ${pattern.crystal}) {
    vec2 cell = vec2(p.x*6.3+p.y*2.1,p.x*2.2-p.y*4.6)+coarse*.24;
    float shard = forgeHash(floor(cell));
    float strip = mid*(1.-smoothstep(.14,.25,abs(p.y+.65*p.x-.06)));
    float cut = max(forgeBand(cell.x+.5,.028),forgeBand(cell.y+.5,.030));
    float splinter = max(forgeBand(cell.x*2.9+.5,.043),forgeBand(cell.y*2.1+.5,.040));
    ink = mix(.22+.69*shard, .28+.53*forgeHash(floor(cell*2.8)), strip*.73);
    foil = max(cut*.84,splinter*strip*.82) + (1.-smoothstep(.24,.55,shard))*.66 + high*forgeBand(cell.y+.38,.065)*.56;
    dark = mix(steel*.20,mineralAccent(vec3(.06,.13,.22),.27),.58);
    bright = mineralAccent(vec3(.48,.72,.88),.23);
  } else if (style == ${pattern.ember}) {
    float channel = p.y + sin(p.x*10.+phase)*.18 + sin(p.x*23.-phase)*.067;
    float fork = channel + p.x*.49 + .11*sin(p.x*17.+phase);
    seam = max(lookLine(channel,.049),lookLine(fork,.028)*smoothstep(-.37,.09,p.x));
    seam = max(seam,mid*lookLine(p.y-.26*sin(p.x*13.+phase),.033)*smoothstep(.16,.47,coarse));
    foil = max(seam,high*lookLine(channel-.109,.032)*.74);
    ink = .50 + .38 * smoothstep(.17,.72,coarse);
    dark = mix(steel*.24,vec3(.092,.052,.049),.54);
    bright = mineralAccent(vec3(.78,.195,.063),.14);
  } else if (style == ${pattern.nebula}) {
    float ribbon = p.y-p.x*.67-.16*sin(p.x*8.+phase);
    float cloud = 1.-smoothstep(.22,.41,abs(ribbon));
    vec2 sand = lookDot(vec2(uv.x*34.,uv.y*12.),fPatternLayout.w,.22);
    float core = 1.-smoothstep(.09,.26,abs(ribbon-.04));
    ink = cloud*(.66+.17*coarse+core*mid*.15);
    foil = sand.x*step(.54-mid*.11,sand.y)*cloud;
    foil = max(foil, high*lookLine(ribbon+.18+.10*sin(p.x*15.),.024)*.82);
    dark = mineralAccent(vec3(.08,.074,.19),.30)*.55;
    bright = vec3(.72,.77,.84);
  } else if (style == ${pattern.feather}) {
    float axis = p.y + .05*sin(p.x*8.+phase);
    float feather = p.x*10.4 - abs(axis)*(2.9 + mid*smoothstep(-.06,.17,axis)*2.6);
    ink = smoothstep(.22,.88,cos(feather*forgeTurn))*.90;
    foil = max(forgeBand(feather-.29,.112),lookLine(axis,.029)*(.38+.57*high));
    foil = max(foil,high*forgeBand(feather*2.14+.17,.078)*smoothstep(.20,.62,ink)*.72);
  } else if (style == ${pattern.scales}) {
    float count = 1. + mid*smoothstep(.48,.93,uv.x)*.50;
    vec2 cell = vec2(p.x*7.2,uv.y*3.45)*count;
    cell.x += mod(floor(cell.y),2.)*.5;
    vec2 scale = fract(cell)-vec2(.5,.08);
    float rim = length(scale*vec2(1.,.71))-.47;
    ink = (1.-smoothstep(-.19,.022,rim))*(.62+.25*scale.y);
    foil = max(lookLine(rim,.055),high*lookLine(rim+.115,.038)*.79);
  } else if (style == ${pattern.fan}) {
    vec2 origin = p+vec2(.13,.65);
    float ray = atan(origin.x,origin.y)*5.9;
    float fan = smoothstep(.14,.85,cos(ray*forgeTurn));
    float twinRay = atan(p.x-.28, .68-p.y)*6.4;
    float twin = forgeBand(twinRay,.126)*smoothstep(-.16,.27,p.x)*mid;
    ink = max(fan*.76,twin*.86);
    foil = max(forgeBand(ray-.24,.098),twin*.65);
    float crest = abs(p.x-.18)*1.7+abs(p.y+.09)*.85;
    ink = max(ink,high*(1.-smoothstep(.10,.19,crest))*.83);
    foil = max(foil,high*lookLine(crest-.167,.044));
    bright = mineralAccent(vec3(.66,.65,.54),.22);
  } else if (style == ${pattern.web}) {
    vec2 lattice = lookWeb(p*vec2(1.,.60));
    vec2 second = lookWeb((p-vec2(p.x<0.?-.38:.38,.29))*vec2(1.,.64));
    ink = max(lattice.x*(1.-smoothstep(.36,.67,lattice.y)),mid*second.x*.74);
    foil = lattice.x*.29+high*max(lattice.x*second.x, lookLine(lattice.y-.27,.032)*lattice.x);
    dark = steel*.18;
  } else if (style == ${pattern.rings}) {
    float r = length((p+vec2(.10,-.04))*vec2(1.2,.70))*10.1 + coarse*.19;
    float knot = length((p-vec2(.34,.19))*vec2(1.37,.74));
    r = mix(r,knot*12.3+coarse*.15,mid*(1.-smoothstep(.19,.30,knot)));
    ink = smoothstep(.16,.86,cos(r*forgeTurn))*.82;
    foil = max(forgeBand(r+.24,.102),high*forgeBand(r*2.03+.28,.071)*.67);
    dark = mix(steel*.34,mineralAccent(vec3(.15,.094,.064),.31)*.64,.44);
    bright = mineralAccent(vec3(.61,.47,.32),.29);
  } else if (style == ${pattern.braid}) {
    float wave = sin(p.x*17.2+phase)*.215;
    float strandA = lookLine(p.y-wave,.126), strandB = lookLine(p.y+wave,.126);
    float overlap = min(strandA,strandB);
    ink = .79*(1.-max(strandA,strandB))+overlap*.70*mid;
    foil = max(lookLine(p.y-wave-.047,.067),lookLine(p.y+wave+.047,.067));
    foil = max(foil*(1.-overlap*.69*mid),high*lookLine(abs(p.y)-.34-.041*sin(p.x*38.),.041)*.77);
  } else if (style == ${pattern.strata}) {
    float slab = p.x*5.3 + p.y*.64 + floor((p.y+.55)*3.)*.39;
    float cut = forgeBand(slab,.069);
    float facet = forgeHash(vec2(floor(slab+.5),floor(p.y*3.+1.5)));
    ink = max(cut,facet*.65);
    foil = (1.-smoothstep(.23,.62,facet))*.35 + mid*forgeBand(slab-.135,.056)+high*smoothstep(.52,.78,facet)*.66;
    dark = mix(steel*.24,vec3(.10,.125,.16),.46);
  } else if (style == ${pattern.honeycomb}) {
    vec2 hex = lookHex(vec2(p.x*10.,p.y*4.3)*(1.+mid*(1.-smoothstep(.07,.42,uv.y))*.68));
    float inset = 1.-smoothstep(.42,.56,abs(p.y+p.x*.66));
    ink = inset*max(smoothstep(.39,.49,hex.x)*.88,hex.y*.38);
    foil = inset*(lookLine(hex.x-.347,.039)*.78+high*step(.57,hex.y)*(1.-smoothstep(.23,.37,hex.x))*.77);
  }

  ink = clamp(ink,0.,1.);
  foil = min(1.,foil);
  steel = mix(steel,dark,ink*(.76+.12*fRefine));
  steel = mix(steel,bright,foil*(.62+.10*fRefine));
  rough += ink*.142 - foil*.097;
  return vec2(ink,foil);
}

void lookFilm(int style, float tier, vec2 uv, float view, float edge, vec2 relief, float focus, inout vec3 steel, inout float rough) {
  vec2 p = lookPoint(uv, fFilmLayout);
  float phase = fFilmLayout.w * forgeTurn;
  float mid = step(1.5,tier), high = step(2.5,tier);
  float cover = 1., gloss = .19, inherit = .16;
  vec3 coat = steel;

  if (style == ${film.oxide}) {
    float temper = abs(p.x + sin(p.y*7.+phase)*.13)-.21;
    if (fFilmLayout.x < .39) temper = uv.y-.40+.11*sin(uv.x*10.+phase);
    if (fFilmLayout.x > .62) temper = .53-uv.x+.12*sin(p.y*8.+phase);
    float blue = 1.-smoothstep(-.055,.065,temper);
    float island = mid*lookLine(temper-.15+.035*sin(p.y*22.),.042);
    coat = mix(vec3(.43,.215,.105),vec3(.073,.235,.63),blue);
    coat = mix(coat,vec3(.70,.429,.17),island*.65);
    coat = mix(coat,vec3(.29,.125,.56),high*lookLine(temper,.049)*.85);
    cover = .61+.39*max(blue,island);
  } else if (style == ${film.doppler}) {
    float tide = sin(p.x*9.2 + sin(p.y*4.5+phase)*1.46 + p.y*.9);
    coat = mix(vec3(.036,.082,.218),vec3(.32,.096,.41),smoothstep(-.42,.55,tide));
    float current = lookLine(tide-.21,.19);
    float island = (1.-smoothstep(.20,.67,abs(tide+view*1.11-.57)))*(.48+.52*smoothstep(.03,.32,view+.09*uv.y));
    coat = mix(coat,vec3(.045,.39,.54),max(mid*current*.57,high*island*.89));
    gloss = .159 - high*island*.039;
  } else if (style == ${film.rainbow}) {
    float center = p.y - sin(p.x*6.+phase)*.19;
    float prism = uv.x*5.5 + uv.y*2.3 + view*5.5 + phase*.47;
    prism += mid*smoothstep(-.09,.13,p.x)*1.30 + high*smoothstep(.02,.22,p.y)*(1.75+view*4.);
    coat = vec3(.30) + .229*cos(prism+vec3(0.,2.094,4.188));
    cover = .21 + .79*(1.-smoothstep(.24,.47,abs(center)));
    gloss = .18;
  } else if (style == ${film.gold}) {
    float sunset = uv.x + (.5-fFilmLayout.x)*.52 + .034*sin(phase) + p.y*(.12+.39*mid);
    coat = mix(vec3(.24,.076,.24),vec3(.65,.125,.112),smoothstep(.05,.53,sunset));
    coat = mix(coat,vec3(.83,.44,.085),smoothstep(.40,.96,sunset));
    coat += high*vec3(.22,.17,.062)*lookLine(sunset-.65-view*.27,.077);
    cover = .83+.17*smoothstep(.21,.72,sunset);
    gloss = .164;
  } else if (style == ${film.silverline}) {
    float track = p.y+p.x*.22 - sin(p.x*7.+phase)*.082 - (view-.12)*.39;
    float mirror = lookLine(track,.078);
    mirror = max(mirror,mid*lookLine(track+.26,.052)*.84);
    mirror = max(mirror,high*lookLine(track+(uv.x-.62)*.96,.062)*smoothstep(.44,.75,uv.x));
    coat = mix(vec3(.16,.23,.33),vec3(.76,.82,.91),mirror);
    cover = .30+.70*mirror;
    gloss = mix(.34,.11,mirror);
    inherit = .10;
  } else if (style == ${film.nacre}) {
    float ribbon = p.y-.19*sin(p.x*5.+phase)+(view-.13)*.27;
    float pearl = 1.-smoothstep(.09,.42,abs(ribbon));
    float rim = lookLine(abs(ribbon)-.22,.080);
    vec3 pearlTint = mix(vec3(.66,.55,.62),vec3(.45,.68,.66),smoothstep(.07,.42,view+.10*p.x));
    coat = mix(vec3(.32,.44,.47),vec3(.70,.66,.62),pearl);
    coat = mix(coat,pearlTint,rim*(.38+.24*mid));
    float innerPearl = lookLine(ribbon-.084+view*.30,.12)*high;
    coat = mix(coat,mineralAccent(vec3(.70,.52,.64),.38),innerPearl*(.50+.42*smoothstep(.04,.39,view)));
    cover = .38+.62*max(pearl,rim);
    gloss = .324-.08*pearl;
  } else if (style == ${film.peacock}) {
    float tilt = uv.y*.62 + view*(1.32+mid*.65) + p.x*.27;
    tilt += mid*sin(p.x*10.+phase)*.12;
    tilt += high*(smoothstep(.10,.28,uv.y)-.5)*(.46-view*.63);
    float flip = smoothstep(.36,.62,tilt);
    coat = mix(vec3(.60,.333,.072),vec3(.033,.30,.245),flip);
    gloss = mix(.198,.245,flip);
    cover = .93;
  } else if (style == ${film.smoke}) {
    float band = p.y-p.x*.36+(view-.16)*.56;
    float window = mid*lookLine(band,.096);
    float silver = max(edge*.83,high*lookLine(band-.16,.076)*.89);
    coat = mix(vec3(.055,.053,.065),vec3(.32,.35,.42),max(window*.70,silver));
    cover = .71+.15*(1.-smoothstep(.23,.51,abs(band)))+.14*silver;
    gloss = .18 - silver*.07;
  } else if (style == ${film.verdigris}) {
    float patina = forgeNoise(vec2(p.x*8.9,p.y*3.6)+phase);
    float island = smoothstep(.44,.60,patina);
    float rim = lookLine(patina-.53,.060);
    coat = mix(vec3(.058,.33,.226),vec3(.58,.267,.091),island);
    coat = mix(coat,vec3(.16,.47,.31),rim*mid*.59);
    coat += vec3(.31,.151,.047)*rim*high*(.36+.64*smoothstep(.08,.55,view+.12));
    gloss = mix(.44,.22,island);
    cover = .92;
  } else if (style == ${film.ceramic}) {
    float boundary = p.y + p.x*.28 + .19;
    float porcelain = smoothstep(-.043,.030,boundary);
    cover = porcelain*(.84 + high*.13*smoothstep(.06,.35,boundary));
    cover -= mid*lookLine(boundary-.017,.042)*.27*porcelain;
    coat = mix(vec3(.40,.55,.65),vec3(.73,.75,.73),smoothstep(.035,.26,boundary));
    gloss = .43 - .11*lookLine(boundary-.038,.037);
    inherit = .09;
  } else if (style == ${film.satin}) {
    float bevel = max(edge,1.-smoothstep(.17,.29,uv.y + p.x*.082));
    float spine = mid*smoothstep(.75,.95,uv.y);
    float shine = max(bevel,spine*.64);
    coat = mix(vec3(.17,.26,.34),vec3(.69,.74,.78),shine);
    float seam = lookLine(uv.y-.34-p.x*.13 + view*.28,.070);
    coat += high*vec3(.24,.23,.20)*max(seam*.91,mix(view,1.-view,bevel)*.46);
    cover = .63 + .37*shine;
    gloss = mix(.45,.118,shine);
  } else if (style == ${film.halo}) {
    float outer = length(p*vec2(1.,.57));
    float inner = length((p-vec2(.29,-.13))*vec2(1.,.64));
    float ring = max(lookLine(outer-.234,.052),lookLine(outer-.131,.037)*.72);
    float companion = mid*lookLine(inner-.169,.044);
    float hue = outer*19.+phase+view*(3.4+high*5.);
    coat = vec3(.36)+.26*cos(hue+vec3(0.,2.094,4.188)+high*companion*1.6);
    cover = .11 + .82*max(ring,companion);
    gloss = .253-.085*ring;
  }

  coat = mineralAccent(coat, inherit) * (1. - relief.x*.56);
  // The film tints the metal reflection. Foil edges keep some of their
  // original steel and the recessed lines keep their roughness.
  float blend = clamp(cover*(.65+.07*mid+.052*high)*(1.-focus*.34)*(1.-relief.y*.43),0.,.77);
  steel = mix(steel,coat,blend);
  rough = mix(rough, gloss+(1.-fRefine)*.143+relief.x*.087-relief.y*.043, blend);
}

vec4 lookEffect(int style, float tier, vec2 uv, float edge, float coarse, float seam) {
  vec2 p = lookPoint(uv, fFxLayout);
  float phase = fFxLayout.w*forgeTurn;
  float time = fClock*(.78+.24*fFxLayout.z)+fFxLayout.w;
  float mid = step(1.5,tier), high = step(2.5,tier);
  float motif = 0., motion = 0., accent = 0., inherit = .33;
  vec3 light = vec3(.20,.69,1.);
  float sweep = .5+.5*cos((uv.x-time*.58)*forgeTurn + phase);
  float wash = smoothstep(.32,.96,sweep);

  if (style == ${fx.edge}) {
    float span = smoothstep(.11,.25,uv.x)*(1.-smoothstep(.75,.98,uv.x));
    motif = edge * mix(span,1.,mid) + mid*lookLine(uv.y-.18,.027)*.21;
    motion = motif * wash;
    accent = high*lookLine(uv.y-.21-.035*sin(uv.x*7.+phase),.026)
      * smoothstep(.22,.97,.5+.5*sin((uv.x+time*.72)*forgeTurn));
  } else if (style == ${fx.ember}) {
    float fissure = p.y+.21*sin(p.x*10.4+phase)+.062*sin(p.x*26.);
    float fire = max(seam,lookLine(fissure,.028));
    motif = max(fire*.77,mid*lookLine(fissure-p.x*.60-.095,.027)*.68);
    motion = motif*(.26+.74*wash);
    vec2 mote = lookDot(uv*vec2(31.,10.),fFxLayout.w,.18);
    accent = high*max(mote.x*step(.58,mote.y)*lookLine(fissure,.17),lookLine(fissure-.062,.023)*.79)*wash;
    light = vec3(1.,.215,.052);
    inherit = .14;
  } else if (style == ${fx.aurora}) {
    float path = p.y + sin(p.x*8.+phase)*.21;
    float stream = lookLine(path,.089+.038*mid);
    float tail = fract(time*.41+fFxLayout.w-uv.x);
    float head = min(tail,1.-tail);
    motif = stream * (.45+.55*(1.-smoothstep(.32,.65,abs(p.x))));
    motion = stream*exp(-head*(12.-5.*mid));
    float taper = 1.-smoothstep(.21,.52,abs(p.x));
    float ribbon = lookLine(path-.153-.061*sin(p.x*9.+phase),.052)*taper;
    accent = high*ribbon*(.38+.62*exp(-head*5.));
    light = mix(vec3(.20,.72,.89),vec3(.68,.31,.88),smoothstep(.10,.92,uv.x+high*ribbon*.24));
    inherit = .42;
  } else if (style == ${fx.tip}) {
    vec2 q = (uv-vec2(.82 + p.x*.065,.51+p.y*.08))*vec2(1.,.38);
    float ray = atan(q.y,q.x+.00001);
    float lengthToTip = length(q);
    float star = lookLine(sin(ray*2.)*lengthToTip,.018);
    star = max(star,mid*lookLine(sin(ray*4.)*lengthToTip,.011)*.75);
    float burst = .38+.62*wash;
    float reach = .131+mid*.051+high*.077*burst;
    motif = star*(1.-smoothstep(.059,reach,lengthToTip))*.97;
    motion = motif*(.32+.68*wash);
    float rays = lookLine(abs(q.y)-abs(q.x)*.28,.013)*(1.-smoothstep(.095,.232,lengthToTip));
    accent = high*max(1.-smoothstep(.013,.054,lengthToTip),rays*.83)*burst;
    light = vec3(1.,.77,.44);
    inherit = .26;
  } else if (style == ${fx.flame}) {
    float tongue = (.5+.5*sin(p.x*24.-time*4.+phase))*(.54+.46*sin(p.x*13.+time*2.));
    float tongueBase = .77 - .15*tongue - mid*.061;
    float wisps = smoothstep(tongueBase-.038,tongueBase+.073,uv.y)*(1.-smoothstep(.85,.99,uv.y));
    motif = wisps*.54;
    motion = wisps*(.22+.57*smoothstep(.35,.93,tongue));
    accent = high*lookLine(uv.y-tongueBase+.023,.020)*wash;
    light = vec3(.20,.62,1.);
  } else if (style == ${fx.vein}) {
    float root = p.y+sin(p.x*12.+phase)*.13;
    float fork = root - max(0.,p.x+.21)*(.51+.30*sin(p.x*7.));
    float twig = root + max(0.,p.x-.05)*.76;
    motif = max(lookLine(root,.036),lookLine(fork,.022)*.78);
    motif = max(motif,mid*lookLine(twig,.026)*.80);
    motion = motif*wash;
    accent = high*lookLine(twig+.08*sin(uv.x*20.),.020)*(1.-wash)*smoothstep(.02,.32,p.x);
    light = vec3(.29,.87,.78);
  } else if (style == ${fx.arc}) {
    float zig = abs(fract(p.x*8.8+fFxLayout.w)-.5)*.54;
    float arc = p.y + zig-.11-.092*sin(p.x*11.+phase);
    float fork = arc + p.x*.67+.095;
    motif = max(lookLine(arc,.034),lookLine(fork,.021)*(.47+.38*mid)*smoothstep(-.23,.36,p.x));
    motion = motif*smoothstep(.29,.92,.5+.5*cos(p.x*19.-time*9.));
    accent = high*lookLine(fork+.102,.020)*smoothstep(.40,.96,.5+.5*sin(time*8.+uv.x*21.));
    light = vec3(.37,.55,1.);
  } else if (style == ${fx.wave}) {
    float d = length(p*vec2(1.,.49));
    float radius = fract(time*.57)*(.40+.14*mid)+.049;
    float brokenRing = .59+.41*smoothstep(-.66,.66,sin(p.y*11.+p.x*15.+phase));
    motif = lookLine(d-.196,.014)*.34;
    motion = (lookLine(d-radius,.021)*.82+lookLine(d-radius,.051)*.18)*brokenRing*(1.-smoothstep(.39,.59,radius));
    float echo = fract(time*.57-.22)*(.40+.14*mid)+.049;
    accent = high*lookLine(d-echo,.018)*brokenRing*(1.-smoothstep(.30,.54,echo));
    light = vec3(.21,.74,.82);
  } else if (style == ${fx.vortex}) {
    vec2 q = p*vec2(1.,.51);
    float r = length(q);
    float rotation = atan(q.y,q.x+.00001)/forgeTurn;
    float spiral = rotation+r*4.1-time*.30;
    float disk = 1.-smoothstep(.17+.04*mid,.27+.047*mid,r);
    motif = forgeBand(spiral,.070)*disk*(.56+.36*wash);
    motion = max(motif*wash,mid*forgeBand(spiral+.48,.045)*disk*.66);
    accent = high*forgeBand(rotation-r*7.+time*.38,.085)*(1.-smoothstep(.062,.161,r));
    light = vec3(.64,.38,.93);
  } else if (style == ${fx.stardust}) {
    vec2 dotA = lookDot(uv*vec2(20.,8.),fFxLayout.w,.19);
    vec2 dotB = lookDot(uv*vec2(34.,12.),fFxLayout.w+.37,.15);
    float belt = 1.-smoothstep(.20,.44,abs(p.y+p.x*.42));
    motif = belt*dotA.x*step(.57,dotA.y);
    motion = motif*(.24+.76*pow(.5+.5*sin(time*4.+dotA.y*46.),3.));
    motion = max(motion,mid*dotB.x*step(.71,dotB.y)*belt*.69);
    accent = high*motif*wash;
    light = vec3(.64,.79,1.);
  } else if (style == ${fx.frost}) {
    vec2 cells = uv*vec2(14.,6.)+fFxLayout.w;
    float frozen = forgeHash(floor(cells));
    vec2 local = fract(cells)-vec2(.38+frozen*.24,.39+fract(frozen*7.9)*.22);
    float flake = abs(local.x+local.y*.32)+abs(local.y)*(.52+frozen*.49);
    float spread = smoothstep(.47-.21*mid,.81,uv.y+.19*sin(p.x*7.+phase));
    motif = lookLine(flake-.21,.035)*spread*step(.35,frozen)*(.51+.47*frozen);
    motion = motif*smoothstep(.10,.84,.5+.5*cos(frozen*11.-time*2.7));
    accent = high*lookLine(flake,.17)*spread*smoothstep(.57,.94,.5+.5*sin(time*2.7-uv.x*5.));
    light = vec3(.58,.83,1.);
  } else if (style == ${fx.shards}) {
    vec2 cell = vec2(p.x*6.5+p.y*2.4+coarse*.47,p.x*1.9-p.y*4.1+coarse*.27) + fFxLayout.w;
    float facet = forgeHash(floor(cell));
    float ridge = max(forgeBand(cell.x+.5,.030),forgeBand(cell.y+.5,.030));
    float inset = smoothstep(.47-.11*mid,.86,facet)*(1.-ridge);
    float plane = .24+.76*smoothstep(.08,.71,fract(cell.x)+fract(cell.y)*.31);
    motif = inset*.46*plane;
    motion = inset*plane*pow(.5+.5*cos(time*3.3+facet*17.),3.);
    accent = high*ridge*smoothstep(.46,.84,facet)*(.34+.66*wash);
    light = vec3(.69,.78,.91);
  }

  float clarity = mix(.59+.28*smoothstep(.20,.68,coarse),1.,fRefine);
  float strength = min(.64, motif*.28 + motion*.39*clarity + accent*.26) * smoothstep(-.06,.025,uv.x);
  return vec4(mineralAccent(light,inherit)*strength,clamp(strength*1.61,0.,1.));
}
#endif
`;
