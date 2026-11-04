import {
  STORAGE_KEY, MAX_STRIKES, REFRESH_PRICE, PHASES, GRADES, MODELS, LOOKS, FITS, STAT_NAMES,
  freshSave, restart, offers, familyOf, buyOre, refine, fractureRisk, strike, finishForge,
  fitOptions, refreshFittings, appraise, signature, rngFor,
} from './forge.js';
import { ForgeStage } from './stage.js';
import { ForgeSound } from './sound.js';

const get = id => document.getElementById(id);
const canvas = get('scene');
const stageBox = get('stage');
const actions = get('actions');
const tray = get('tray');
const readout = get('readout');
const msg = get('stage-message');
const sound = new ForgeSound();
const stepNames = ['选料', '精炼', '锻打', '装配', '鉴定'];
const stationNames = ['原石检视台', '精炼炉口', '锻造铁砧', '装配工作台', '成刀展台'];
const roman = ['', ' I', ' II', ' III'];
const clues = ['旧石皮', '自然断面', '露出矿脉'];
const fmt = p => (p * 100).toFixed(p === 0 ? 0 : 1) + '%';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
let save = restore();
let stage;
let busy = false;
let queuedHit;
let queuedStop = false;
let heatInput;
let drag;
let trayKey;
let webglError = false;
let storageFailed = false;

function restore() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (data?.version === 1 && Number.isFinite(data.credits) && Array.isArray(data.collection) &&
      [...PHASES, 'reveal', 'broken'].includes(data.run?.phase) && data.run.skin?.levels) return data;
  } catch {}
  return freshSave();
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch {
    if (!storageFailed) get('announcer').textContent = '浏览器限制本地存档，本页可继续试玩。';
    storageFailed = true;
  }
}

function button(action, label, { kind = 'primary', off = false, id = '' } = {}) {
  return `<button type="button" class="${kind}" data-action="${action}" ${id ? `id="${id}"` : ''} ${off ? 'disabled' : ''}>${label}</button>`;
}

function title(eyebrow, heading, copy) {
  get('eyebrow').textContent = eyebrow;
  get('title').textContent = heading;
  get('description').textContent = copy;
}

function info(label, text, copy = '', side = '') {
  return `<div class="info-block"><div class="info-line"><small>${label}</small>${side && `<b class="readout-number">${side}</b>`}</div><strong>${text}</strong>${copy && `<p>${copy}</p>`}</div>`;
}

function lookChips(run) {
  const fields = Object.entries(LOOKS).filter(([slot]) => LOOKS[slot][run.skin[slot]]);
  return `<div class="look-list">${fields.map(([slot, names]) => `<span class="look-chip ${run.skin.levels[slot] >= 3 ? 'rarity' : ''}">${names[run.skin[slot]]}${roman[run.skin.levels[slot]]}</span>`).join('')}${signature(run.skin) ? `<span class="look-chip rarity">${signature(run.skin)}</span>` : ''}</div>`;
}

function render() {
  const run = save.run;
  const { phase } = run;
  const navPhase = phase === 'reveal' ? 'ore' : phase === 'broken' ? 'forge' : phase;
  const idx = PHASES.indexOf(navPhase);
  const ore = phase === 'ore' ? offers(run)[run.selected] : run.ore;
  const fit = FITS.find(item => item.id === run.fit);
  stageBox.dataset.mode = phase;
  get('steps').innerHTML = stepNames.map((label, n) => `<div class="step ${n === idx ? 'current' : n < idx ? 'past' : ''}" ${n === idx ? 'aria-current="step"' : ''}><i>0${n + 1}</i>${label}</div>`).join('');
  get('credits').textContent = save.credits;
  get('stage-code').textContent = 'STATION 0' + (idx + 1);
  get('stage-name').textContent = stationNames[idx];
  const status = { ore: '原石在台', reveal: '已开料', refine: '炉温实时', forge: '可自由落锤', fit: '试装预览', appraise: '成品已入藏', broken: '炉次结束' };
  get('stage-state').textContent = webglError ? '3D 暂不可用' : status[phase];
  const hints = {
    ore: '拖动原石查看石皮', reveal: '拖动查看矿脉断面', refine: '松手锁定温度',
    forge: matchMedia('(pointer: coarse)').matches ? '轻点刀身 · 落点影响出纹' : '直接轻点刀身 · 空格落锤', fit: '拖动转刀，比较装配',
    appraise: '拖动检视成刀', broken: '保留本次锻打记录',
  };
  get('stage-hint').textContent = hints[phase];
  if (phase === 'ore') {
    const family = familyOf(ore.family);
    title('01 / ROUGH STOCK', '翻石见钢', '转动原石，看一眼裂口和露色。只带走一块，切开才知道内里。');
    readout.innerHTML = info('LOT ' + ore.number + ' / ' + clues[ore.clue], family.name, family.hint, ore.price + ' CR');
    actions.innerHTML = button('buy', '开这块 · ' + ore.price + ' CR', { off: ore.price > save.credits }) +
      button('next-batch', '看看下一批', { kind: 'secondary', off: run.batch === 2 }) +
      `<span class="action-note">${ore.price > save.credits ? '信用点不足，可以看看本批最低价料。' : '批次 ' + (run.batch + 1) + ' / 3 · 换批免费'}</span>`;
  } else if (phase === 'reveal') {
    title('01 / CUT OPEN', GRADES[ore.grade] + '原料', familyOf(ore.family).name + '的内层已经打开，矿脉会影响第一道刀纹。');
    readout.innerHTML = info('LOT ' + ore.number + ' / 已开料', ['细夹杂，纹路淡', '矿脉清晰，钢质稳定', '连贯矿脉，内层稀质'][ore.grade], '', '−' + ore.price + ' CR');
    actions.innerHTML = button('to-refine', '送进炉口');
  } else if (phase === 'refine') {
    title('02 / HEAT CONTROL', '控住火候', '按住鼓风，把热度推到浅绿区再松手。温度越贴近中心，后面越稳。');
    readout.innerHTML = `<div class="info-block temperature"><div class="info-line"><small>目标温区 62–79</small><b class="readout-number" id="heat-number">0°</b></div><div class="thermo" role="progressbar" aria-label="炉温" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="thermo"><i class="thermo-fill" id="heat-fill"></i><i class="thermo-range"></i></div></div>`;
    actions.innerHTML = button('heat', '按住升温 · 松手进砧', { id: 'heat-button' });
  } else if (phase === 'forge') {
    const risk = fractureRisk(run);
    title('03 / THE ANVIL', '下一锤，怎么打？', run.hits ? '在刀腹找纹，在刃侧找光。喜欢眼前这把刀，就可以收锤。' : '直接点刀胚。刀腹、刃侧和刀尖，能敲出不同方向的变化。');
    readout.innerHTML = `<div class="info-block"><div class="risk-line"><small>下一锤断率</small><strong class="risk-value ${risk >= .075 ? 'alert' : ''}" id="risk">${fmt(risk)}</strong></div><div class="risk-bar"><span style="width:${Math.min(100, risk / .30 * 100)}%"></span></div><div class="info-line"><small>${MODELS[run.model]} · 纯净度 ${run.purity}%</small><b class="readout-number" id="hit-count">${run.hits}/${MAX_STRIKES}</b></div></div>${lookChips(run)}`;
    actions.innerHTML = button('finish', '收锤 · 保住这一把', { off: run.hits < 6 }) +
      `<span class="action-note">${run.hits < 6 ? '第 6 锤后可收锤 · 前六锤稳定' : '收锤后直接进入装配'}</span>`;
  } else if (phase === 'fit') {
    title('04 / FITTINGS', '挑一套配件', '三套配件各有取向。点选时，刀具会立即换上整套外观。');
    readout.innerHTML = fit ? info('当前试装', fit.name, fit.parts) : info('锻打完成', MODELS[run.model], '已经保留 ' + run.hits + ' 锤的结果。');
    actions.innerHTML = button('appraise', '确认装配 · 鉴定', { off: !fit }) +
      button('refresh', run.refreshed ? '本炉已刷新' : '刷新一轮 · ' + REFRESH_PRICE + ' CR', { kind: 'secondary', off: run.refreshed || save.credits < REFRESH_PRICE });
  } else if (phase === 'appraise') {
    const record = run.record;
    title('05 / THE REVEAL', record.name, '第 ' + String(record.id).padStart(2, '0') + ' 号藏刀 · 已收入本地藏刀记录。');
    readout.innerHTML = info('成刀品质', `<span class="result-grade">${esc(record.grade)}</span> · ${esc(record.score)} 分`, '', '+' + record.credit + ' CR') +
      `<div class="stat-list">${record.stats.map((n, i) => `<div class="stat"><span>${STAT_NAMES[i]}</span><span class="stat-track"><i style="width:${Number(n)}%"></i></span><b>${Number(n)}</b></div>`).join('')}</div>`;
    actions.innerHTML = button('restart', '再开一炉');
  } else {
    title('03 / FRACTURE', '这一炉，断了', '锤头落下，裂痕贯穿了刀身。换一块矿，试一条不同的路。');
    readout.innerHTML = info('断裂记录', '第 ' + run.hits + ' 锤 · ' + fmt(run.last.risk), '本炉开料已消耗 ' + ore.price + ' 信用点。');
    actions.innerHTML = button('restart', '再开一炉');
  }
  renderTray(run, ore, fit);
  stage?.sync(run, ore, fit);
}

function renderTray(run, ore, fit) {
  const { phase } = run;
  const key = [phase, run.batch, run.selected, run.refreshed, run.fit, phase === 'forge' && run.last?.hit].join('|');
  if (key === trayKey) return;
  trayKey = key;
  if (phase === 'ore') {
    const scroll = tray.querySelector('.ore-grid')?.scrollLeft || 0;
    const stones = offers(run);
    tray.innerHTML = `<div class="tray-head"><h2>本批原石</h2><small>BATCH 0${run.batch + 1} / 03</small></div><div class="ore-grid">${stones.map((stone, i) =>
      `<button type="button" class="ore-card" data-action="select-ore" data-index="${i}" aria-pressed="${i === run.selected}"><span class="lot"><span>LOT ${stone.number}</span><span class="price">${stone.price} CR</span></span><canvas width="184" height="91" aria-hidden="true"></canvas><b>${familyOf(stone.family).name}</b><small>${clues[stone.clue]}</small></button>`).join('')}</div>`;
    tray.querySelector('.ore-grid').scrollLeft = scroll;
    tray.querySelectorAll('canvas').forEach((thumb, i) => paintStone(thumb, stones[i]));
  } else if (phase === 'fit') {
    tray.innerHTML = `<div class="tray-head"><h2>挑选配件</h2><small>FITTING TRAY / ${run.refreshed ? '02' : '01'}</small></div><div class="fit-grid">${fitOptions(run).map(item => `<button type="button" class="fit-card" data-action="select-fit" data-id="${item.id}" aria-pressed="${fit?.id === item.id}"><span class="fit-colors"><i style="--sample:${item.color}"></i><i style="--sample:${item.accent}"></i></span><b>${item.name}</b><small>${item.parts}</small><small class="fit-stats">${item.delta.map((n, i) => n >= 4 ? STAT_NAMES[i] + ' +' + n : '').filter(Boolean).join(' · ')}</small></button>`).join('')}</div>`;
  } else {
    const note = {
      reveal: ['矿石已切开', '工艺倾向来自这块矿。'],
      refine: ['炉温提示', '温度落在绿色区时松手。'],
      forge: [run.last ? (run.last.fusion || run.last.label) : '铁砧已就位', run.last ? '最近一锤 · ' + String(run.hits).padStart(2, '0') : '刀腹偏纹 · 刃侧偏光 · 刀尖易显异变'],
      appraise: ['本地藏刀记录', '这一炉的刀面和装配已留档。'],
      broken: ['钢料损失', '连续失手后，最低价工坊矿仍可用。'],
    }[phase];
    tray.innerHTML = `<div class="brief"><b>${note[0]}</b><span>${note[1]}</span></div>`;
  }
}

function paintStone(canvas, ore) {
  const ctx = canvas.getContext('2d');
  const family = familyOf(ore.family);
  const roll = rngFor(ore.figure, 'thumb');
  const outer = [];
  ctx.translate(92, 48);
  const shadow = ctx.createRadialGradient(0, 27, 0, 0, 27, 48);
  shadow.addColorStop(0, '#070607d9');
  shadow.addColorStop(1, '#07060700');
  ctx.fillStyle = shadow;
  ctx.scale(1, .83);
  ctx.fillRect(-54, -14, 108, 66);
  const twist = .3 + roll();
  const scale = .8 + roll() * .19;
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2 + twist;
    const radius = (30 + roll() * 13) * scale;
    outer.push([Math.cos(a) * radius * (1.15 + ore.clue * .05), Math.sin(a) * radius]);
  }
  ctx.beginPath();
  outer.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  ctx.closePath();
  ctx.fillStyle = family.dark;
  ctx.fill();
  ctx.save();
  ctx.clip();
  const center = [-9 + roll() * 20, -7 + roll() * 13];
  for (let i = 0; i < outer.length; i++) {
    const a = outer[i], b = outer[(i + 1) % outer.length];
    const brightness = Math.round(18 + 51 * roll() + (i > 4 ? 12 : 0));
    ctx.beginPath();
    ctx.moveTo(...center);
    ctx.lineTo(...a);
    ctx.lineTo(...b);
    ctx.closePath();
    ctx.fillStyle = `rgb(${brightness + 6} ${brightness + 3} ${brightness} / .78)`;
    ctx.fill();
  }
  for (let i = 0; i < 4 + ore.clue; i++) {
    const y = -24 + i * 8 + roll() * 4;
    ctx.beginPath();
    ctx.moveTo(-53, y);
    ctx.bezierCurveTo(-13, y + 24 * roll(), 9, y - 20 * roll(), 55, y - 12);
    ctx.strokeStyle = family.color;
    ctx.globalAlpha = .15 + roll() * (ore.clue ? .53 : .31);
    ctx.lineWidth = .6 + roll() * 1.65;
    ctx.stroke();
  }
  ctx.restore();
}

function say(text, type = '') {
  msg.className = 'stage-message ' + type;
  msg.textContent = text;
  void msg.offsetWidth;
  msg.classList.add('show');
  get('announcer').textContent = text;
}

function charge() {
  if (save.run.phase !== 'refine' || heatInput) return;
  sound.unlock();
  const start = performance.now();
  heatInput = { start, value: 0 };
  get('heat-button').classList.add('heating');
  const cycle = now => {
    if (!heatInput || heatInput.start !== start) return;
    const elapsed = now - start;
    const value = Math.min(100, elapsed / 21);
    heatInput.value = value;
    get('heat-number').textContent = Math.round(value) + '°';
    get('heat-fill').style.width = value + '%';
    get('thermo').setAttribute('aria-valuenow', Math.round(value));
    if (stage) stage.heat = value / 100;
    if (elapsed >= 2650) releaseHeat();
    else requestAnimationFrame(cycle);
  };
  requestAnimationFrame(cycle);
}

function releaseHeat() {
  if (!heatInput) return;
  const value = Math.min(100, (performance.now() - heatInput.start) / 21);
  heatInput = null;
  if (refine(save.run, value)) {
    persist();
    sound.play(value >= 62 && value <= 79 ? 'surge' : 'polish');
    render();
    say('纯净度 ' + save.run.purity + '%', value >= 62 && value <= 79 ? 'surge' : '');
  }
}

function hitBlade(hit) {
  if (!hit || save.run.phase !== 'forge' || queuedStop) return;
  if (busy) {
    if (stage.blow?.landed) queuedHit = hit;
    return;
  }
  sound.unlock();
  const result = strike(save.run, hit.zone);
  if (!result) return;
  busy = true;
  persist();
  stage.swing(hit, () => {
    sound.impact(result);
    render();
    stage.impact(hit, result);
    if (result.type === 'break' || result.type === 'scar' || result.fusion || result.change) {
      say(result.fusion || result.label, result.fusion ? 'surge' : result.type);
    }
  }, () => {
    busy = false;
    const next = queuedHit;
    queuedHit = null;
    if (queuedStop) {
      queuedStop = false;
      closeAnvil();
    } else if (next) hitBlade(next);
  });
}

function closeAnvil() {
  if (!finishForge(save.run)) return;
  sound.play('polish');
  persist();
  render();
}

document.addEventListener('click', event => {
  const control = event.target.closest('[data-action]');
  if (!control) return;
  if (busy) {
    if (control.dataset.action === 'finish' && save.run.phase === 'forge' && save.run.hits >= 6) {
      queuedStop = true;
      queuedHit = null;
      control.textContent = '正在收锤…';
    }
    return;
  }
  sound.unlock();
  const { action, index, id } = control.dataset;
  const run = save.run;
  let message;
  if (action === 'select-ore' && run.phase === 'ore') {
    run.selected = Number(index);
  } else if (action === 'next-batch' && run.phase === 'ore' && run.batch < 2) {
    run.batch++;
    run.selected = 0;
    tray.querySelector('.ore-grid').scrollLeft = 0;
  } else if (action === 'buy' && buyOre(save)) {
    sound.play('ore');
    message = GRADES[run.ore.grade] + '原料';
    stage?.reveal();
  } else if (action === 'to-refine' && run.phase === 'reveal') {
    run.phase = 'refine';
  } else if (action === 'finish') {
    closeAnvil();
    return;
  } else if (action === 'select-fit' && run.phase === 'fit' && fitOptions(run).some(item => item.id === id)) {
    run.fit = id;
  } else if (action === 'refresh' && refreshFittings(save)) {
    sound.play('polish');
  } else if (action === 'appraise' && appraise(save)) {
    sound.play('appraise');
    message = run.record.grade + ' · ' + run.record.score;
  } else if (action === 'restart' && restart(save, Date.now() + save.count)) {
    message = '新一炉';
  } else return;
  persist();
  render();
  if (message) say(message, 'surge');
  if (action === 'select-ore' || action === 'select-fit') tray.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
});

document.addEventListener('pointerdown', event => {
  if (event.target.id !== 'heat-button' || !event.isPrimary) return;
  event.preventDefault();
  event.target.setPointerCapture(event.pointerId);
  charge();
});
document.addEventListener('pointerup', event => {
  if (event.isPrimary && heatInput && event.target.id === 'heat-button') releaseHeat();
});
document.addEventListener('pointercancel', event => {
  if (event.target.id === 'heat-button' && heatInput) {
    heatInput = null;
    if (stage) stage.heat = 0;
    render();
  }
});
document.addEventListener('keydown', event => {
  if (![' ', 'Enter'].includes(event.key) || event.repeat || get('vault').open) return;
  if (event.target.id === 'heat-button') {
    event.preventDefault();
    charge();
  } else if (event.key === ' ' && save.run.phase === 'forge' && event.target.tagName !== 'BUTTON') {
    event.preventDefault();
    hitBlade(stage?.keyboardHit());
  }
});
document.addEventListener('keyup', event => {
  if ([' ', 'Enter'].includes(event.key) && heatInput && event.target.id === 'heat-button') releaseHeat();
});

canvas.addEventListener('pointerdown', event => {
  if (!event.isPrimary || !stage) return;
  if (save.run.phase === 'forge') {
    hitBlade(stage.hit(event.clientX, event.clientY));
  } else if (['ore', 'reveal', 'fit', 'appraise'].includes(save.run.phase)) {
    canvas.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }
});
canvas.addEventListener('pointermove', event => {
  if (drag?.id !== event.pointerId) return;
  stage.turn(event.clientX - drag.x, event.clientY - drag.y);
  drag.x = event.clientX;
  drag.y = event.clientY;
});
canvas.addEventListener('lostpointercapture', () => { drag = null; });

get('sound').addEventListener('click', event => {
  const muted = sound.toggle();
  event.currentTarget.setAttribute('aria-pressed', muted);
  event.currentTarget.setAttribute('aria-label', muted ? '开启声音' : '静音');
});
get('collection').addEventListener('click', () => {
  get('vault-list').innerHTML = save.collection.map(item => `<div class="brief"><b>${esc(item.name)}</b><span>${esc(item.grade)} · ${Number(item.score)} 分</span></div>`).join('') || '<div class="brief"><span>完成第一把刀后，成品会出现在这里。</span></div>';
  get('vault').showModal();
});
get('close-vault').addEventListener('click', () => get('vault').close());

function showError(error) {
  console.error('3D startup', error);
  webglError = true;
  render();
  say('请在支持 WebGL 的浏览器中打开', 'scar');
}

try {
  stage = new ForgeStage(canvas);
  stage.prepare().catch(showError);
  canvas.tabIndex = 0;
} catch (error) {
  showError(error);
}
render();
