export const STORAGE_KEY = 'bladelab.ore-v5.preview.1';
export const MIN_PRICE = 14;
export const REFRESH_PRICE = 12;
export const WINDOW_PRICE = 3;
export const LOT_SIZE = 3;
export const BATCHES = 3;
export const MARK_WIDTH = 24;
export const MARK_HEIGHT = 8;
export const PHASES = ['ore', 'refine', 'forge', 'fit', 'appraise'];

export const FAMILIES = [
  { id: 'river', name: '河床叠钢', short: '层钢', color: '#8ea8b6', dark: '#334f62', metal: 'silver', pattern: 'damascus', film: 'oxide', hint: '石皮下露出平行的细脉，适合打出层叠纹路。' },
  { id: 'frost', name: '霜晶矿', short: '晶矿', color: '#89cbc7', dark: '#345d5d', metal: 'pearl', pattern: 'crystal', film: 'rainbow', hint: '斜光下有细碎反光，内里可能有清晰的晶区。' },
  { id: 'coal', name: '熔渣铁', short: '暗钢', color: '#e0956a', dark: '#69433a', metal: 'obsidian', pattern: 'ember', film: 'oxide', hint: '断口露出暖色矿脉，可能保留少量熔纹。' },
  { id: 'meteor', name: '陨星黑矿', short: '陨铁', color: '#aaa1e6', dark: '#413862', metal: 'gunmetal', pattern: 'nebula', film: 'doppler', hint: '带浅熔蚀坑的深色熔壳，细看可能见到金属碎屑。' },
  { id: 'ochre', name: '赭铁层矿', short: '赭铁', color: '#b58a69', dark: '#684735', metal: 'silver', pattern: 'damascus', film: 'gold', hint: '黄褐石皮呈层状剥落，铁质结核常藏在厚皮之内。' },
];

export const LOOKS = {
  metal: { raw: '粗钢', silver: '银钢', pearl: '霜银', gunmetal: '枪灰', obsidian: '黑曜钢' },
  pattern: { none: '', damascus: '大马士革', crystal: '冰晶纹', ember: '熔脉', nebula: '星砂' },
  film: { none: '', oxide: '淬蓝', doppler: '深海 Doppler', rainbow: '极光虹膜', gold: '赤金热带' },
  fx: { none: '', edge: '刃光', ember: '余烬', aurora: '流光' },
};
export const MODELS = {
  blank: '刀胚', straight: '直刀', tangdao: '唐刀', karambit: '爪子刀',
  survival: '求生匕首', bayonet: '刺刀', balisong: '蝴蝶刀', folding: '折叠刀',
  gladius: '短剑', kris: '马来剑', machete: '开山刀', saber: '弯刀', skull: '骷髅匕首',
};
export const GRADES = ['普通', '良质', '稀质'];
export const ORE_TIERS = ['工坊料', '精选料', '珍藏料'];
export const RARE_ODDS = [5, 12, 22];

// Independent low-poly shapes: one base plus three subtle, authored silhouette variants.
export const ORE_VARIANTS = ['原型', '横卧', '棱脊', '偏心'];
export const ORE_MATERIALS = Object.freeze([
  { id: 'river_gray', family: 'river', name: '河磨灰岩', base: '#687474', vein: '#bbc8c7', core: '#a9bfc7', steel: '#869eac', style: 0, roughness: .83, metalness: .10 },
  { id: 'river_silver', family: 'river', name: '银砂铁石', base: '#536064', vein: '#d4d7c8', core: '#ced2bd', steel: '#aeb4a2', style: 1, roughness: .79, metalness: .25 },
  { id: 'river_banded', family: 'river', name: '青灰层铁', base: '#4f626b', vein: '#9faeae', core: '#8aa9ba', steel: '#7190aa', style: 2, roughness: .85, metalness: .15 },
  { id: 'frost_quartz', family: 'frost', name: '霜白石英', base: '#899d98', vein: '#cce7de', core: '#73c7b7', steel: '#87bcb6', style: 3, roughness: .65, metalness: .08 },
  { id: 'frost_mica', family: 'frost', name: '青蓝云母', base: '#506f7a', vein: '#a2d4e1', core: '#70a8ca', steel: '#6d9ebc', style: 4, roughness: .72, metalness: .20 },
  { id: 'coal_slag', family: 'coal', name: '黑熔渣', base: '#454342', vein: '#cb9666', core: '#d7945a', steel: '#af856c', style: 5, roughness: .91, metalness: .15 },
  { id: 'coal_oxide', family: 'coal', name: '赤锈铁皮', base: '#6d493b', vein: '#e0a374', core: '#c77b52', steel: '#b37e70', style: 6, roughness: .89, metalness: .12 },
  { id: 'meteor_fusion', family: 'meteor', name: '暗陨熔壳', base: '#424d55', vein: '#a5afc5', core: '#929bc3', steel: '#939bb9', style: 7, roughness: .78, metalness: .30 },
  { id: 'meteor_nickel', family: 'meteor', name: '镍铁陨壳', base: '#576168', vein: '#cec4a5', core: '#c1b898', steel: '#b0aaa0', style: 8, roughness: .70, metalness: .39 },
  { id: 'ochre_limonite', family: 'ochre', name: '黄褐褐铁', base: '#96734b', vein: '#dfbd81', core: '#c69b5b', steel: '#b3a078', style: 9, roughness: .92, metalness: .08 },
  { id: 'ochre_red', family: 'ochre', name: '赤铁结核', base: '#815447', vein: '#d4a289', core: '#b97f68', steel: '#af9188', style: 10, roughness: .88, metalness: .16 },
  { id: 'ochre_layer', family: 'ochre', name: '砂岩铁层', base: '#9a8969', vein: '#dfcaaa', core: '#d0b98c', steel: '#bdad8f', style: 11, roughness: .92, metalness: .08 },
]);
export const oreMaterialOf = ore => ORE_MATERIALS.find(item => item.id === ore?.material) ||
  ORE_MATERIALS.find(item => item.family === ore?.family) || ORE_MATERIALS[0];

// Mineral colour, surface exposure and optical clarity are independent of the
// host-rock family. A plain dark stone can conceal a clear, brightly coloured core.
export const ORE_TINTS = Object.freeze([
  { id:'jade', name:'翠绿', core:'#56bb93', steel:'#579e87' },
  { id:'teal', name:'碧青', core:'#3fa69d', steel:'#588b88' },
  { id:'azure', name:'冰蓝', core:'#5dadd2', steel:'#5e8fac' },
  { id:'cobalt', name:'钴蓝', core:'#526ed1', steel:'#586da5' },
  { id:'amethyst', name:'紫晶', core:'#9472c7', steel:'#8e76ab' },
  { id:'rose', name:'烟粉', core:'#d590bd', steel:'#b17f9d' },
  { id:'garnet', name:'绛红', core:'#ae535d', steel:'#995c6b' },
  { id:'copper', name:'赤铜', core:'#cc8556', steel:'#ad7c5d' },
  { id:'amber', name:'琥珀', core:'#e2ac4e', steel:'#b69857' },
  { id:'gold', name:'浅金', core:'#d8c786', steel:'#b2a77a' },
  { id:'olive', name:'橄榄', core:'#a6b873', steel:'#8c9970' },
  { id:'forest', name:'松绿', core:'#5e987a', steel:'#5a836e' },
  { id:'ivory', name:'霜白', core:'#d7dfdc', steel:'#b0c1c0' },
  { id:'silver', name:'银灰', core:'#aebfcb', steel:'#91a7b5' },
  { id:'ink', name:'墨蓝', core:'#4c6488', steel:'#4c617e' },
  { id:'obsidian', name:'曜黑', core:'#4e4b60', steel:'#5a566f' },
]);
export const ORE_EXPOSURES = Object.freeze([
  { id:'hidden', name:'藏矿', value:0 },
  { id:'veiled', name:'隐露', value:.27 },
  { id:'open', name:'外露', value:1 },
]);
export const oreOptics = ore => {
  const material=oreMaterialOf(ore);
  const tint=ORE_TINTS.find(t => t.id===ore?.tint);
  const exposure=ORE_EXPOSURES.find(e=>e.id===ore?.exposure);
  const clarity=Number.isFinite(ore?.clarity) ? Math.max(0,Math.min(1,ore.clarity/100)) : .50;
  return {
    tint:tint?.id || 'legacy', name:tint?.name || material.name,
    core:tint?.core || material.core, steel:tint?.steel || material.steel,
    exposure:exposure?.value ?? .55, exposureName:exposure?.name || '露矿', clarity,
    clarityName:clarity<.35 ? '浑浊' : clarity<.70 ? '雾润' : '清透',
  };
};
export const oreModelId = ore => `ore_${FAMILIES.some(f => f.id === ore?.family) ? ore.family : 'river'}_${Math.max(0, Math.min(3, Math.floor(ore?.variant || 0)))}`;
export const mineralHeritage = ore => {
  const mineral = oreMaterialOf(ore);
  const optics = oreOptics(ore);
  return {
    family: FAMILIES.findIndex(f => f.id === mineral.family), style: mineral.style,
    seed: ore?.figure ?? .5, tone: optics.steel, core: optics.core,
    tint: optics.tint, tintName: optics.name, clarity: optics.clarity, clarityName: optics.clarityName,
    trace: (ore?.vein ?? 52) / 100,
    name: ['水纹层钢', '霜晶钢纹', '赤铜熔脉', '陨铁镍纹', '赭金叠层'][FAMILIES.findIndex(f => f.id === mineral.family)],
  };
};
export const oreSignals = ore => {
  const vein = ore?.vein ?? Math.round((ore?.purity ?? 62) * .8);
  const flaw = ore?.flaw ?? Math.round(90 - (ore?.stability ?? 60));
  const luster = ore?.luster ?? 45;
  const density = ore?.density ?? Math.round(ore?.stability ?? 60);
  const crust = ore?.crust ?? 50;
  return {
    vein: vein >= 72 ? '矿脉清晰' : vein >= 48 ? '矿脉可辨' : '矿脉隐约',
    shell: flaw >= 55 ? '裂隙较多' : flaw >= 35 ? '可见细裂' : '裂隙较少',
    glow: luster >= 69 ? '亮点明显' : luster >= 43 ? '局部微光' : '表面暗哑',
    density: density >= 73 ? '颗粒密实' : density >= 49 ? '密实中等' : '质地疏松',
    crust: crust >= 70 ? '石皮厚重' : crust >= 42 ? '石皮适中' : '石皮较薄',
  };
};
export const STAT_NAMES = ['强度', '韧性', '锋利', '工艺', '设计', '灵性'];
export const FITS = [
  { id: 'walnut', role: '沉稳', name: '赤木束柄', parts: '胡桃木 · 铜色端箍', color: '#673424', accent: '#bc8555', grip: 1, delta: [0, 5, 0, 3, 2, 0] },
  { id: 'night', role: '轻巧', name: '夜行纤维', parts: '黑纤维 · 枪灰端箍', color: '#252c32', accent: '#687988', grip: 2, delta: [1, 0, 5, 3, 0, 0] },
  { id: 'ivory', role: '衬纹', name: '霜白骨柄', parts: '骨白握柄 · 雾银端箍', color: '#b5a889', accent: '#bfcbd2', grip: 3, delta: [0, 1, 0, 1, 5, 3] },
  { id: 'copper', role: '沉稳', name: '炉心铜座', parts: '棕皮 · 赤铜端箍', color: '#694031', accent: '#d69e5b', grip: 2, delta: [6, 1, -2, 0, 2, 2] },
  { id: 'ink', role: '轻巧', name: '墨蓝缠线', parts: '深蓝缠柄 · 冷银端箍', color: '#233b58', accent: '#82a4c3', grip: 3, delta: [0, 4, 4, 0, 1, 0] },
  { id: 'jade', role: '衬纹', name: '苍玉包柄', parts: '黛绿握柄 · 玉色嵌线', color: '#31685a', accent: '#7eb8a2', grip: 1, delta: [-1, 0, 1, 2, 4, 5] },
];

const anchors = [[6, 0], [10, .006], [14, .017], [18, .034], [22, .068], [25, .128], [27, .231], [30, .5], [35, .66], [40, .8], [45, .9]];
const priceBands = [[14, 18, .67, .95], [22, 28, .50, .88], [32, 40, .38, .78]];
const purityBands = [[42, 64], [58, 78], [72, 88]];
const centers = { river: 68, frost: 58, coal: 62, meteor: 49, ochre: 65 };
const standardModels = ['straight', 'survival', 'bayonet'];
const strangeModels = Object.keys(MODELS).filter(id => id !== 'blank' && !standardModels.includes(id));
export const HEAT = Object.freeze({ initial: 35, melt: 65, lower: 65, upper: 78, danger: 86, preheat: 3.5, window: 7.5, good: 3, minimum: .8, burn: 1.2, cast: 1 });
const refineDelta = { good: [12, 12], fair: [4, 0], failed: [-12, -18] };
const freshHeat = () => ({ step: 'ore', temperature: HEAT.initial, elapsed: 0, stable: 0, hot: 0, result: null });
const slotWeights = {
  belly: [30, 48, 16, 6],
  edge: [8, 15, 53, 24],
  tip: [13, 30, 27, 30],
};
const grades = ['未鉴定', '合格', '良作', '精品', '大师'];
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function rngFor(...parts) {
  let state = 2166136261;
  for (const char of parts.join('|')) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ state >>> 15, state | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const pick = (array, roll) => array[Math.floor(roll() * array.length)];

export function freshSave(seed = Date.now()) {
  return { version: 2, credits: 76, collection: [], count: 0, run: freshRun(seed) };
}

export function freshRun(seed) {
  return {
    seed, phase: 'ore', batch: 0, selected: 0, inspections: {}, ore: null, purity: 0, stability: 60, refining: null, refinement: null,
    hits: 0, work: 0, cracks: 0, changedShape: false, model: 'blank', marks: {}, highlights: [],
    fit: null, refreshed: false, last: null, record: null,
    skin: { metal: 'raw', pattern: 'none', film: 'none', fx: 'none', levels: { metal: 1, pattern: 0, film: 0, fx: 0 }, seed: rngFor(seed, 'surface')() },
  };
}

export function migrateSave(save) {
  if (!save || ![1, 2].includes(save.version) || !Number.isFinite(save.credits) || !Array.isArray(save.collection) ||
    ![...PHASES, 'reveal', 'broken'].includes(save.run?.phase) || !save.run.skin?.levels) return null;
  if (save.version === 2) return save;
  const run = save.run;
  if (run.ore) {
    const [low, high] = purityBands[run.ore.grade] || purityBands[0];
    run.ore = { ...run.ore, purity: Math.round((low + high) / 2), stability: centers[run.ore.family] || 60, tier: 0 };
  }
  run.batch = clamp(run.batch || 0, 0, BATCHES - 1);
  run.selected = (run.selected || 0) % LOT_SIZE;
  run.stability = clamp((run.ore?.stability ?? 60) + ((run.purity || 65) - 65) * .45, 0, 100);
  run.refining = run.phase === 'refine' ? freshHeat() : null;
  run.legacyFittings = run.phase === 'fit';
  run.refinement = null;
  run.marks = {};
  run.highlights = [];
  save.version = 2;
  return save;
}

export function restart(save, seed) {
  if (!['appraise', 'broken'].includes(save.run.phase)) return false;
  save.credits = Math.max(MIN_PRICE, save.credits);
  save.run = freshRun(seed);
  return true;
}

export function offers(run) {
  const order = rngFor(run.seed, 'batch', run.batch);
  const priceShift = Math.floor(order() * LOT_SIZE);
  const familyShift = Math.floor(order() * FAMILIES.length);
  return Array.from({ length: LOT_SIZE }, (_, index) => {
    const id = run.batch * LOT_SIZE + index;
    const tier = (index + priceShift) % LOT_SIZE;
    const roll = rngFor(run.seed, 'tray-v2', id);
    const family = FAMILIES[(familyShift + index) % FAMILIES.length];
    const [low, high, ordinary, good] = priceBands[tier];
    const price = tier === 0 ? MIN_PRICE : low + Math.floor(roll() * (high - low + 1));
    const quality = roll();
    const grade = quality < ordinary ? 0 : quality < good ? 1 : 2;
    const [lo, hi] = purityBands[grade];
    const figure = roll();
    const purity = lo + Math.floor(roll() * (hi - lo + 1));
    const stability = centers[family.id] + Math.floor(roll() * 19) - 9;
    // Surface indications track the hidden deposit with overlap: inspecting matters,
    // but the true grade, purity and stability are never guaranteed by appearance.
    const vein = clamp(Math.round(purity * .78 + grade * 5 + (roll() - .5) * 43), 9, 98);
    const flaw = clamp(Math.round(77 - stability * .66 + (roll() - .5) * 37), 5, 92);
    const luster = clamp(Math.round(purity * .63 + grade * 8 + (roll() - .5) * 44), 8, 98);
    const clue = vein >= 72 ? 2 : vein >= 48 ? 1 : 0;
    const density = clamp(Math.round(stability * .77 + (roll() - .5) * 40 + 13), 8, 98);
    const crust = clamp(Math.round(69 - purity * .33 + (roll() - .5) * 48 + 12), 7, 96);
    const choices = ORE_MATERIALS.filter(material => material.family === family.id);
    const material = choices[Math.floor(roll() * choices.length)].id;
    const variant = Math.floor(roll() * ORE_VARIANTS.length);
    // A separate stream preserves the existing price, quality and forging rolls.
    const optical=rngFor(run.seed,'ore-optics-v1',id);
    const tint=ORE_TINTS[Math.floor(optical()*ORE_TINTS.length)].id;
    const exposureRoll=optical();
    const exposure=exposureRoll<.34 ? 'hidden' : exposureRoll<.70 ? 'veiled' : 'open';
    const clarity=Math.round(8+optical()*86);
    return { id, family: family.id, material, variant, price, grade, clue, figure, purity, stability, tier,
      vein, flaw, luster, density, crust, tint, exposure, clarity,
      window: Boolean(run.inspections?.[id]), number: String(id + 1).padStart(2, '0') };
  });
}

export const familyOf = (id) => FAMILIES.find(family => family.id === id) || FAMILIES[0];
export const stabilityOf = value => value < 50 ? '偏脆' : value >= 70 ? '稳定' : '中等';

// A small window reveals a real local sample, never a guaranteed quality label.
// Refuse optional spending that would leave this stone unaffordable.
export function inspectOre(save) {
  const run = save.run;
  if (run.phase !== 'ore') return false;
  const ore = offers(run)[run.selected];
  if (!ore || ore.window || save.credits < ore.price + WINDOW_PRICE) return false;
  save.credits -= WINDOW_PRICE;
  (run.inspections ??= {})[ore.id] = true;
  return true;
}

export function modelCandidates(run) {
  const family = FAMILIES.findIndex(item => item.id === run.ore?.family);
  const normal = standardModels[Math.floor(rngFor(run.seed, 'initial-model')() * standardModels.length)];
  const roll = rngFor(run.seed, 'rare-models', family);
  const rare = [...strangeModels];
  for (let i = rare.length - 1; i > 0; i--) {
    const j = Math.floor(roll() * (i + 1));
    [rare[i], rare[j]] = [rare[j], rare[i]];
  }
  return { normal, rare: rare.slice(0, 2) };
}

export function buyOre(save) {
  const run = save.run;
  if (run.phase !== 'ore') return false;
  const ore = offers(run)[run.selected];
  if (!ore || save.credits < ore.price) return false;
  save.credits -= ore.price;
  run.ore = ore;
  // Identical decisions on two distinct stones no longer produce identical grain.
  run.skin.seed = rngFor(run.seed, 'ore-grain', ore.id, ore.family, ore.material, ore.variant, ore.figure)();
  run.phase = 'reveal';
  return true;
}

export function beginRefining(run) {
  if (run.phase !== 'reveal') return false;
  run.phase = 'refine';
  run.refining = freshHeat();
  return true;
}

export function advanceHeat(run, seconds, blowing) {
  if (run.phase !== 'refine' || !run.refining || seconds <= 0) return;
  const heat = run.refining;
  if (heat.step === 'cast') {
    heat.elapsed += seconds;
    if (heat.elapsed >= HEAT.cast) {
      const [purity, stability] = refineDelta[heat.result];
      run.purity = clamp(run.ore.purity + purity, 0, 100);
      run.stability = clamp(run.ore.stability + stability, 0, 100);
      run.refinement = { result: heat.result, purity: run.purity, stability: run.stability };
      run.refining = null;
      run.phase = 'forge';
    }
    return;
  }
  heat.elapsed += seconds;
  heat.temperature = clamp(heat.temperature + seconds * (blowing ? 30 : -22), 0, 100);
  if (heat.step === 'ore') {
    if (heat.temperature >= HEAT.melt || heat.elapsed >= HEAT.preheat) {
      heat.result = heat.temperature < HEAT.melt ? 'failed' : null;
      heat.temperature = Math.max(HEAT.melt, heat.temperature);
      heat.step = 'molten';
      heat.elapsed = 0;
    }
    return;
  }
  if (heat.temperature >= HEAT.lower && heat.temperature <= HEAT.upper) heat.stable += seconds;
  if (heat.temperature >= HEAT.danger) heat.hot += seconds;
  if (heat.hot >= HEAT.burn || heat.elapsed >= (heat.result ? .6 : HEAT.window)) {
    heat.result ||= heat.hot >= HEAT.burn || heat.stable < HEAT.minimum ? 'failed' : heat.stable >= HEAT.good ? 'good' : 'fair';
    heat.step = 'cast';
    heat.elapsed = 0;
  }
}

export function fractureRisk(run) {
  const next = run.hits + 1;
  if (next <= 6) return 0;
  if (next >= 45) return .9;
  const hi = anchors.findIndex(([hit]) => hit >= next);
  const [a, pa] = anchors[hi - 1];
  const [b, pb] = anchors[hi];
  const baseline = pa + (pb - pa) * ((next - a) / (b - a));
  const stability = run.stability < 50 ? 1.25 : run.stability >= 70 ? .8 : 1;
  const blend = clamp((30 - next) / 12, 0, 1);
  return Math.round(baseline * (1 + (stability - 1) * blend) * 1000) / 1000;
}

function chooseSlot(run, zone, type, roll) {
  const keys = Object.keys(LOOKS);
  const choices = keys.map((slot, index) => ({
    slot,
    weight: slotWeights[zone][index] * (run.skin[slot] === 'none' ? 1.45 : 1),
  })).filter(({ slot }) => (slot !== 'film' || run.hits >= 7) &&
    (slot !== 'fx' || run.hits >= (type === 'surge' ? 9 : 12)) &&
    (type === 'surge' || run.skin.levels[slot] < 2));
  if (!choices.length) return null;
  let point = roll() * choices.reduce((sum, item) => sum + item.weight, 0);
  return choices.find(({ weight }) => (point -= weight) < 0)?.slot || choices.at(-1).slot;
}

function mutate(run, slot, type, roll, guaranteed = false) {
  if (!slot) return null;
  const family = familyOf(run.ore.family);
  const original = run.skin[slot];
  const level = run.skin.levels[slot];
  const nextLevel = type === 'surge' && run.hits >= 13 ? 3 : 2;
  if (!guaranteed && original !== 'none' && original !== 'raw' && level < nextLevel && (type !== 'surge' || roll() < .71)) {
    run.skin.levels[slot]++;
    return { slot, label: LOOKS[slot][original] + '强化', action: 'upgrade', tier: run.skin.levels[slot] };
  }
  const familyChoice = family[slot] ?? ({ coal: 'ember', meteor: 'aurora' }[family.id] || 'edge');
  const options = Object.keys(LOOKS[slot]).filter(id => id !== 'none' && id !== 'raw' && id !== original &&
    !(slot === 'film' && id === 'rainbow' && run.skin.pattern === 'ember') &&
    !(slot === 'pattern' && id === 'ember' && run.skin.film === 'rainbow'));
  const affinity = slot === 'pattern' ? 2.5 : slot === 'film' ? 1.5 : 2;
  const premium = run.ore.tier === 2 && slot === 'film' ? .7 : 0;
  let point = roll() * options.reduce((total, key) => total + (key === familyChoice ? affinity + premium : 1), 0);
  const next = guaranteed && slot === 'metal' && options.includes(familyChoice) ? familyChoice :
    options.find(key => (point -= key === familyChoice ? affinity + premium : 1) < 0);
  if (!next) return null;
  run.skin[slot] = next;
  run.skin.levels[slot] = type === 'surge' && run.hits >= 13 ? (roll() < .34 ? 3 : 2) : 1;
  return { slot, label: LOOKS[slot][next], action: original === 'none' || original === 'raw' ? 'add' : 'replace', tier: run.skin.levels[slot] };
}

export function signature(skin) {
  if (skin.pattern === 'damascus' && skin.film === 'oxide') return '霜潮层钢';
  if (skin.pattern === 'crystal' && skin.film === 'rainbow') return '极光晶刃';
  if (skin.pattern === 'nebula' && skin.film === 'doppler') return '深空星砂';
  if (skin.pattern === 'ember' && skin.fx === 'ember') return '炉脉余烬';
  return null;
}

function workSurface(run, type, position) {
  const x = Math.floor(clamp(position.u, 0, .9999) * MARK_WIDTH);
  const y = Math.floor(clamp(position.v, 0, .9999) * MARK_HEIGHT);
  const key = y * MARK_WIDTH + x;
  const before = run.marks[key] || 0;
  const oldPolish = before & 15;
  const oldGrain = (before >> 4) & 15;
  const oldScar = (before >> 8) & 15;
  const polish = clamp(oldPolish + (type === 'scar' ? -4 : type === 'surge' ? 5 : 3), 0, 15);
  const grain = (oldGrain + 3) & 15;
  const scar = clamp(oldScar + (type === 'scar' ? 7 : -1), 0, 15);
  run.marks[key] = polish | (grain << 4) | (scar << 8);
  return { u: position.u, v: position.v };
}

export function strike(run, zone, position = { u: .67, v: zone === 'edge' ? .12 : .48 }) {
  if (run.phase !== 'forge' || !Object.hasOwn(slotWeights, zone)) return null;
  const risk = fractureRisk(run);
  const hit = ++run.hits;
  const roll = rngFor(run.seed, 'work', hit);
  if (rngFor(run.seed, 'fracture', hit)() < risk) {
    run.phase = 'broken';
    return run.last = { type: 'break', hit, zone, risk, label: '刀身断裂', mark: position };
  }
  const before = signature(run.skin);
  const draw = roll();
  let type = draw < .08 && hit > 6 ? 'scar' : draw >= .88 ? 'surge' : draw >= .38 ? 'shift' : 'polish';
  let change = null;
  if (hit === 2 || hit === 4 || hit === 6) {
    type = 'shift';
    if (hit === 4) {
      run.model = modelCandidates(run).normal;
      change = { slot: 'model', label: MODELS[run.model] + '成型', action: 'form', tier: 1 };
    } else if (hit === 2 || run.skin.pattern === 'none') {
      change = mutate(run, hit === 2 ? 'metal' : 'pattern', type, roll, true);
    }
  }
  if (type === 'scar') {
    run.cracks = Math.min(4, run.cracks + 1);
    if (run.skin.fx !== 'none' && hit >= 15 && roll() < .44) {
      run.skin.levels.fx--;
      if (!run.skin.levels.fx) run.skin.fx = 'none';
      change = { slot: 'fx', label: '特效退档', action: 'fade', tier: run.skin.levels.fx };
    }
  } else if (!change && type === 'surge' && hit >= 12 && !run.changedShape && rngFor(run.seed, 'shape-trigger', hit)() < .14) {
    run.model = pick(modelCandidates(run).rare, rngFor(run.seed, 'shape-pick', hit));
    run.changedShape = true;
    change = { slot: 'model', label: '异形 · ' + MODELS[run.model], action: 'form', tier: 3 };
  } else if (!change && (type === 'surge' || type === 'shift') && run.model !== 'blank') {
    change = mutate(run, chooseSlot(run, zone, type, roll), type, roll);
  }
  const mark = workSurface(run, type, position);
  run.work += ({ scar: -.6, polish: .8, shift: 1.35, surge: 2.4 })[type];
  const after = signature(run.skin);
  const fusion = after !== before ? after : null;
  const notable = Boolean(fusion || change?.tier === 3 || change?.action === 'fade');
  const label = change?.label || (type === 'scar' ? '崩口 · 裂痕显现' : type === 'surge' ? '暴发 · 局部精抛' : '整面 · 钢面抛光');
  if (change || fusion || type === 'scar') run.highlights = [...run.highlights, { hit, label: fusion || label }].slice(-8);
  return run.last = { type, hit, zone, risk, change, fusion, notable, label, mark };
}

export function finishForge(run) {
  if (run.phase !== 'forge' || run.hits < 6) return false;
  run.phase = 'fit';
  return true;
}

export function fitOptions(run) {
  if (!run.legacyFittings) {
    return ['轻巧', '沉稳', '衬纹'].map(role => {
      const options = FITS.filter(fit => fit.role === role);
      const first = rngFor(run.seed, 'fitting-role', role)() < .5 ? 0 : 1;
      return options[run.refreshed ? 1 - first : first];
    });
  }
  const roll = rngFor(run.seed, 'fittings');
  const ordered = FITS.map(fit => ({ fit, sort: roll() })).sort((a, b) => a.sort - b.sort).map(item => item.fit);
  return run.refreshed ? ordered.slice(3) : ordered.slice(0, 3);
}

export function refreshFittings(save) {
  const run = save.run;
  if (run.phase !== 'fit' || run.refreshed || save.credits < REFRESH_PRICE) return false;
  save.credits -= REFRESH_PRICE;
  run.refreshed = true;
  run.fit = null;
  return true;
}

export function appraise(save) {
  const run = save.run;
  const fit = FITS.find(item => item.id === run.fit);
  if (run.phase !== 'fit' || !fit) return null;
  const roll = rngFor(run.seed, 'review');
  const base = 41 + run.ore.grade * 5 + run.purity * .19 + run.work * .94 - run.cracks * 2.9;
  const stats = fit.delta.map((delta, index) => clamp(Math.round(base + delta + (roll() - .5) * 12 + (index > 3 ? run.skin.levels.fx * 2 : 0)), 20, 100));
  const score = Math.round(stats.reduce((sum, stat) => sum + stat, 0) / stats.length);
  const grade = score >= 90 ? 4 : score >= 80 ? 3 : score >= 66 ? 2 : 1;
  const trait = signature(run.skin) || LOOKS.fx[run.skin.fx] || LOOKS.pattern[run.skin.pattern] || '原钢锻面';
  const credit = [0, 16, 23, 32, 48][grade];
  run.record = {
    id: ++save.count, name: trait + ' · ' + MODELS[run.model], grade: grades[grade], stats, score, credit,
    hits: run.hits, model: run.model, fit: run.fit, skin: run.skin, marks: run.marks,
    ore: run.ore, refinement: run.refinement, highlights: run.highlights,
  };
  save.credits += credit;
  save.collection = [run.record, ...save.collection].slice(0, 20);
  run.phase = 'appraise';
  return run.record;
}
