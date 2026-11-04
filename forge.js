export const STORAGE_KEY = 'bladelab.forge.1';
export const MAX_STRIKES = 26;
export const MIN_PRICE = 14;
export const REFRESH_PRICE = 12;
export const PHASES = ['ore', 'refine', 'forge', 'fit', 'appraise'];

export const FAMILIES = [
  { id: 'river', name: '河床叠钢', short: '层钢', color: '#8ea8b6', dark: '#334f62', metal: 'silver', pattern: 'damascus', film: 'oxide', hint: '石皮下露出平行的细脉，适合打出层叠纹路。' },
  { id: 'frost', name: '霜晶矿', short: '晶矿', color: '#89cbc7', dark: '#345d5d', metal: 'pearl', pattern: 'crystal', film: 'rainbow', hint: '斜光下有细碎反光，内里可能有清晰的晶区。' },
  { id: 'coal', name: '熔渣铁', short: '暗钢', color: '#e0956a', dark: '#69433a', metal: 'obsidian', pattern: 'ember', film: 'oxide', hint: '断口露出暖色矿脉，可能保留少量熔纹。' },
  { id: 'meteor', name: '陨星黑矿', short: '陨铁', color: '#aaa1e6', dark: '#413862', metal: 'gunmetal', pattern: 'nebula', film: 'doppler', hint: '石皮发黑，边缘泛出冷光，里面的颜色仍未知。' },
];

export const LOOKS = {
  metal: { raw: '粗钢', silver: '银钢', pearl: '霜银', gunmetal: '枪灰', obsidian: '黑曜钢' },
  pattern: { none: '', damascus: '大马士革', crystal: '冰晶纹', ember: '熔脉', nebula: '星砂' },
  film: { none: '', oxide: '淬蓝', doppler: '深海 Doppler', rainbow: '极光虹膜', gold: '赤金热带' },
  fx: { none: '', edge: '刃光', ember: '余烬', aurora: '流光' },
};
export const MODELS = { blank: '刀胚', straight: '直刀', tangdao: '唐刀', karambit: '爪子刀' };
export const GRADES = ['普通', '良质', '稀质'];
export const STAT_NAMES = ['强度', '韧性', '锋利', '工艺', '设计', '灵性'];
export const FITS = [
  { id: 'walnut', name: '赤木束柄', parts: '胡桃木 · 磷化护手 · 铜钉', color: '#673424', accent: '#bc8555', grip: 1, delta: [0, 5, 0, 3, 2, 0] },
  { id: 'night', name: '夜行纤维', parts: '黑纤维 · 枪灰护手 · 黑铆', color: '#252c32', accent: '#687988', grip: 2, delta: [1, 0, 5, 3, 0, 0] },
  { id: 'ivory', name: '霜白骨柄', parts: '骨白握柄 · 银护手 · 雾银钉', color: '#b5a889', accent: '#bfcbd2', grip: 3, delta: [0, 1, 0, 1, 5, 3] },
  { id: 'copper', name: '炉心铜座', parts: '棕皮 · 暖铜护手 · 赤铜尾帽', color: '#694031', accent: '#d69e5b', grip: 2, delta: [6, 1, -2, 0, 2, 2] },
  { id: 'ink', name: '墨蓝缠线', parts: '深蓝缠柄 · 冷银护手 · 银钉', color: '#233b58', accent: '#82a4c3', grip: 3, delta: [0, 4, 4, 0, 1, 0] },
  { id: 'jade', name: '苍玉包柄', parts: '黛绿握柄 · 烟银护手 · 玉嵌', color: '#31685a', accent: '#7eb8a2', grip: 1, delta: [-1, 0, 1, 2, 4, 5] },
];

const anchors = [[6, 0], [7, .01], [10, .021], [14, .037], [16, .053], [18, .08], [21, .125], [24, .206], [26, .29]];
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
  return { version: 1, credits: 76, collection: [], count: 0, run: freshRun(seed) };
}

export function freshRun(seed) {
  return {
    seed, phase: 'ore', batch: 0, selected: 0, ore: null, purity: 0,
    hits: 0, work: 0, cracks: 0, idle: 0, changedShape: false, model: 'blank',
    fit: null, refreshed: false, last: null, record: null,
    skin: { metal: 'raw', pattern: 'none', film: 'none', fx: 'none', levels: { metal: 1, pattern: 0, film: 0, fx: 0 }, seed: rngFor(seed, 'surface')() },
  };
}

export function restart(save, seed) {
  if (!['appraise', 'broken'].includes(save.run.phase)) return false;
  save.credits = Math.max(MIN_PRICE, save.credits);
  save.run = freshRun(seed);
  return true;
}

export function offers(run) {
  return Array.from({ length: 5 }, (_, index) => {
    const id = run.batch * 5 + index;
    const roll = rngFor(run.seed, 'tray', id);
    const family = pick(FAMILIES, roll);
    const price = index === 0 ? MIN_PRICE : 17 + Math.floor(roll() * 24);
    const chance = .08 + (price - MIN_PRICE) * .0065;
    const gradeRoll = roll();
    const grade = gradeRoll < chance ? 2 : gradeRoll < .48 + (price - MIN_PRICE) * .003 ? 1 : 0;
    const clue = Math.floor(roll() * 3);
    const figure = roll();
    return { id, family: family.id, price, grade, clue, figure, number: String(id + 1).padStart(2, '0') };
  });
}

export const familyOf = (id) => FAMILIES.find(family => family.id === id) || FAMILIES[0];

export function buyOre(save) {
  const run = save.run;
  if (run.phase !== 'ore') return false;
  const ore = offers(run)[run.selected];
  if (!ore || save.credits < ore.price) return false;
  save.credits -= ore.price;
  run.ore = ore;
  run.phase = 'reveal';
  return true;
}

export function refine(run, temperature) {
  if (run.phase !== 'refine') return false;
  const purity = clamp(1 - Math.abs(71 - temperature) / (temperature > 71 ? 37 : 78), .32, 1);
  run.purity = Math.round(purity * 100);
  run.phase = 'forge';
  return true;
}

export function fractureRisk(run) {
  const next = run.hits + 1;
  if (next <= 6) return 0;
  const hi = anchors.findIndex(([hit]) => hit >= next);
  const [a, pa] = anchors[Math.max(0, hi - 1)];
  const [b, pb] = anchors[hi < 0 ? anchors.length - 1 : hi];
  const baseline = a === b || hi < 0 ? pb : pa + (pb - pa) * ((next - a) / (b - a));
  const refineFactor = 1.19 - run.purity * .0035;
  const oreFactor = 1 - run.ore.grade * .055;
  return Math.min(.36, Math.round((baseline * refineFactor * oreFactor + run.cracks * .0065) * 1000) / 1000);
}

function chooseSlot(run, zone, type, roll) {
  const keys = Object.keys(LOOKS);
  const choices = keys.map((slot, index) => ({
    slot,
    weight: slotWeights[zone][index] * (run.skin[slot] === 'none' ? 1.45 : 1),
  })).filter(({ slot }) => (slot !== 'film' || run.hits >= 7) && (slot !== 'fx' || run.hits >= (type === 'surge' ? 9 : 12)));
  let point = roll() * choices.reduce((sum, item) => sum + item.weight, 0);
  return choices.find(({ weight }) => (point -= weight) < 0)?.slot || choices.at(-1).slot;
}

function mutate(run, slot, type, roll, guaranteed = false) {
  const family = familyOf(run.ore.family);
  const original = run.skin[slot];
  const level = run.skin.levels[slot];
  const nextLevel = type === 'surge' && run.hits >= 13 ? 3 : 2;
  if (!guaranteed && original !== 'none' && original !== 'raw' && level < nextLevel && roll() < .57) {
    run.skin.levels[slot]++;
    return { slot, label: LOOKS[slot][original] + '强化', action: 'upgrade', tier: run.skin.levels[slot] };
  }
  const familyChoice = family[slot] ?? ({ coal: 'ember', meteor: 'aurora' }[family.id] || 'edge');
  const options = Object.keys(LOOKS[slot]).filter(id => id !== 'none' && id !== 'raw' && id !== original);
  const next = (guaranteed || roll() < .52) && options.includes(familyChoice) ? familyChoice : pick(options, roll);
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

export function strike(run, zone) {
  if (run.phase !== 'forge' || run.hits >= MAX_STRIKES || !(zone in slotWeights)) return null;
  const risk = fractureRisk(run);
  const hit = ++run.hits;
  const roll = rngFor(run.seed, 'strike', hit);
  if (roll() < risk) {
    run.phase = 'broken';
    return run.last = { type: 'break', hit, zone, risk, label: '刀身断裂' };
  }
  const before = signature(run.skin);
  const draw = roll();
  let type = draw < .11 && hit > 6 ? 'scar' : draw > .88 ? 'surge' : draw > .34 ? 'shift' : 'polish';
  let change = null;
  if (hit === 2 || hit === 4 || hit === 6) {
    type = 'shift';
    if (hit === 4) {
      run.model = 'straight';
      change = { slot: 'model', label: '直刀成型', action: 'form', tier: 1 };
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
  } else if (!change && type === 'surge' && hit >= 12 && !run.changedShape && roll() < .14) {
    run.model = roll() < .62 ? 'tangdao' : 'karambit';
    run.changedShape = true;
    change = { slot: 'model', label: '异形 · ' + MODELS[run.model], action: 'form', tier: 3 };
  } else if (!change && (type === 'surge' || (type === 'shift' && (run.idle >= 2 || roll() < .74)))) {
    change = mutate(run, chooseSlot(run, zone, type, roll), type, roll);
  }
  run.idle = change ? 0 : run.idle + 1;
  run.work += ({ scar: -.6, polish: .8, shift: 1.35, surge: 2.4 })[type];
  const after = signature(run.skin);
  if (hit === MAX_STRIKES) run.phase = 'fit';
  return run.last = { type, hit, zone, risk, change, fusion: after !== before ? after : null, label: change?.label || (type === 'scar' ? '受损 · 裂痕显现' : '整面 · 钢面抛光') };
}

export function finishForge(run) {
  if (run.phase !== 'forge' || run.hits < 6) return false;
  run.phase = 'fit';
  return true;
}

export function fitOptions(run) {
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
  run.record = { id: ++save.count, name: trait + ' · ' + MODELS[run.model], grade: grades[grade], stats, score, credit, hits: run.hits, model: run.model, fit: run.fit, skin: run.skin };
  save.credits += credit;
  save.collection = [run.record, ...save.collection].slice(0, 20);
  run.phase = 'appraise';
  return run.record;
}
