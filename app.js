import {
  STORAGE_KEY, LOT_SIZE, BATCHES, HEAT, REFRESH_PRICE, PHASES, GRADES, ORE_TIERS, RARE_ODDS, oreSignals, MODELS, LOOKS, FITS, STAT_NAMES,
  freshSave, migrateSave, restart, offers, familyOf, stabilityOf, buyOre, beginRefining, advanceHeat, fractureRisk, strike, finishForge,
  fitOptions, refreshFittings, appraise, signature,
} from './forge.js?v=3';
import { ForgeStage } from './stage.js?v=3';
import { ForgeSound } from './sound.js?v=2';
import { createQaSession } from './qa.js?v=2.1';

const get = id => document.getElementById(id);
const canvas = get('scene');
const stageBox = get('stage');
const actions = get('actions');
const tray = get('tray');
const readout = get('readout');
const msg = get('stage-message');
const sound = new ForgeSound();
const qa = createQaSession(new URLSearchParams(location.search).get('qa'));
const stepNames = ['选料', '精炼', '锻打', '装配', '鉴定'];
const stationNames = ['原石检视台', '精炼炉口', '锻造铁砧', '装配工作台', '成刀展台'];
const roman = ['', ' I', ' II', ' III'];
const clues = ['隐脉', '浅脉', '显脉'];
const fmt = p => (p * 100).toFixed(p === 0 ? 0 : 1) + '%';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
let save = restore();
let stage;
let busy = false;
let queuedHit;
let queuedStop = false;
let resultPause = false;
let revealPending = false;
let heatInput;
let drag;
let trayKey;
let webglError = false;
let storageFailed = false;

function restore() {
  if (qa) return qa.save;
  try {
    return migrateSave(JSON.parse(localStorage.getItem(STORAGE_KEY))) || freshSave();
  } catch {}
  return freshSave();
}

function persist() {
  if (qa) return;
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
  qa?.phase(phase);
  const navPhase = phase === 'reveal' ? 'ore' : phase === 'broken' ? 'forge' : phase;
  const idx = PHASES.indexOf(navPhase);
  const ore = phase === 'ore' ? offers(run)[run.selected] : run.ore;
  const fit = FITS.find(item => item.id === run.fit);
  stageBox.dataset.mode = phase;
  get('ore-nav').hidden = phase !== 'ore';
  get('ore-position').textContent = '第 ' + (run.batch + 1) + ' 批 · ' + (run.selected + 1) + ' / ' + LOT_SIZE;
  get('steps').innerHTML = stepNames.map((label, n) => `<div class="step ${n === idx ? 'current' : n < idx ? 'past' : ''}" ${n === idx ? 'aria-current="step"' : ''}><i>0${n + 1}</i>${label}</div>`).join('');
  get('credits').textContent = save.credits;
  get('stage-code').textContent = 'STATION 0' + (idx + 1);
  get('stage-name').textContent = stationNames[idx];
  const status = { ore: '原石在台', reveal: '已开料', refine: '炉温实时', forge: '可自由落锤', fit: '试装预览', appraise: '成品已入藏', broken: '炉次结束' };
  get('stage-state').textContent = webglError ? '3D 暂不可用' : status[phase];
  const hints = {
    ore: '左右翻料 · 拖动转石', reveal: '拖动查看矿脉断面', refine: '按住鼓风 · 松手散热',
    forge: matchMedia('(pointer: coarse)').matches ? '轻点刀身 · 落点影响出纹' : '直接轻点刀身 · 空格落锤', fit: '拖动转刀，比较装配',
    appraise: '拖动检视成刀', broken: '保留本次锻打记录',
  };
  get('stage-hint').textContent = hints[phase];
  if (phase === 'ore') {
    const family = familyOf(ore.family);
    const signs = oreSignals(ore);
    title('01 / ROUGH STOCK', '看石皮，赌内芯', '观察裂口和矿脉，比较本批三块原石。外观提供线索，但切开前谁都不知道成色。');
    readout.innerHTML = `<div class="info-block ore-inspection">
      <div class="info-line"><small>LOT ${ore.number} · ${ORE_TIERS[ore.tier]}</small><b class="readout-number">${ore.price} CR</b></div>
      <strong>${family.name} <small>· ${clues[ore.clue]}</small></strong>
      <div class="ore-signals"><span>${signs.vein}</span><span>${signs.shell}</span><span>${signs.glow}</span></div>
      <div class="ore-odds"><span>该价位稀质概率</span><b>${RARE_ODDS[ore.tier]}%</b><small>按价位分布 · 非单块保证</small></div>
      <p>${family.hint}</p>
    </div>`;
    actions.innerHTML = button('buy', '切开 ' + ore.number + ' 号 · 支付 ' + ore.price + ' CR', { off: ore.price > save.credits }) +
      button('next-batch', run.batch === BATCHES - 1 ? '已到最后一批' : '免费换一批', { kind: 'secondary', off: run.batch === BATCHES - 1 }) +
      `<span class="action-note">${ore.price > save.credits ? '信用点不足，可看本批更便宜的矿。' : '余额 ' + save.credits + ' → ' + (save.credits - ore.price) + ' CR · 一刀开出，不可退料'}</span>`;
  } else if (phase === 'reveal') {
    const family = familyOf(ore.family);
    if (revealPending) {
      title('01 / THE CUT', '正在切开原石…', '石皮已经破开，等切面完全露出后才能确认矿芯品质。');
      readout.innerHTML = `<div class="info-block ore-report ore-suspense">
        <div class="info-line"><small>开料完成 · LOT ${ore.number}</small><b class="readout-number">−${ore.price} CR</b></div>
        <strong>剖开矿芯，读取矿相</strong>
        <div class="ore-suspense-track"><i></i></div>
        <small>正在显露纯度、稳定性与矿脉</small>
      </div>`;
      actions.innerHTML = button('to-refine', '切面鉴定中…', { off: true });
    } else {
      const signs = oreSignals(ore);
      title('01 / CUT OPEN', family.name + ' · ' + GRADES[ore.grade], '翻动切面检查矿芯。矿脉色泽会留在钢坯中，精炼可改善纯度和稳定性。');
      readout.innerHTML = `<div class="info-block ore-report ore-result grade-${ore.grade}">
        <div class="info-line"><small>LOT ${ore.number} · ${ORE_TIERS[ore.tier]}</small><b class="readout-number">−${ore.price} CR</b></div>
        <div class="ore-grade"><span class="ore-grade-icon">${['◆','✦','✧'][ore.grade]}</span><div><small>切石结果</small><strong>${GRADES[ore.grade]}矿芯</strong></div><small>已扣费 · 不可退料</small></div>
        <div class="report-row"><span>纯净度</span><b id="ore-purity">${ore.purity}</b><small>${ore.purity >= 73 ? '内芯纯净，易成好钢' : '精炼有提升空间'}</small></div>
        <div class="report-row"><span>稳定性</span><b id="ore-stability">${stabilityOf(ore.stability)}</b><small>决定锻打断裂风险</small></div>
        <div class="report-vein"><i class="vein-sample" style="--vein:${family.color};--vein-dark:${family.dark}"></i><span><small>矿脉遗传 · ${signs.vein}</small><strong>${LOOKS.pattern[family.pattern]} / ${LOOKS.film[family.film]}</strong></span></div>
      </div>`;
      actions.innerHTML = button('to-refine', '确认矿芯 · 送去精炼');
    }
  } else if (phase === 'refine') {
    title('02 / HEAT CONTROL', '控住火候', '把原石熔化，再让熔球尽量留在绿区。温度升得太快就松手。');
    readout.innerHTML = `<div class="info-block temperature">
      <div class="info-line"><strong id="heat-step">原石升温</strong><b class="readout-number" id="heat-number">35°</b></div>
      <div class="thermo" role="progressbar" aria-label="炉温" aria-valuemin="0" aria-valuemax="100" aria-valuenow="35" id="thermo"><i class="thermo-fill" id="heat-fill"></i><i class="thermo-range"></i><i class="thermo-danger"></i></div>
      <div class="info-line"><small>稳温累计</small><b class="readout-number" id="heat-stable">0.0 / 3.0 秒</b></div>
      <div class="risk-bar heat-progress"><span id="heat-progress"></span></div>
      <small id="heat-note">先把原石加热到 65°</small>
    </div>`;
    actions.innerHTML = button('heat', '按住鼓风 · 松手散热', { id: 'heat-button' });
    drawHeat();
  } else if (phase === 'forge') {
    const risk = fractureRisk(run);
    title('03 / THE ANVIL', '下一锤，怎么打？', run.hits ? '在刀腹找纹，在刃侧找光。喜欢眼前这把刀，就可以收锤。' : '直接点刀胚。刀腹、刃侧和刀尖，能敲出不同方向的变化。');
    readout.innerHTML = `<div class="info-block"><div class="risk-line"><small>下一锤断率</small><strong class="risk-value ${risk >= .075 ? 'alert' : ''}" id="risk">${fmt(risk)}</strong></div><div class="risk-bar"><span style="width:${risk / .9 * 100}%"></span></div><div class="info-line"><small>${MODELS[run.model]} · 纯净 ${run.purity} · ${stabilityOf(run.stability)}</small><b class="readout-number" id="hit-count">${run.hits} 锤</b></div></div>${lookChips(run)}`;
    actions.innerHTML = button('finish', '收锤 · 保住这一把', { off: run.hits < 6 }) +
      `<span class="action-note">${run.hits < 6 ? '第 6 锤后可收锤 · 前六锤稳定' : '收锤后直接进入装配'}</span>`;
  } else if (phase === 'fit') {
    title('04 / FITTINGS', '挑一套配件', '点选在同一机位试装，再点已选的一套可恢复原钢。');
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
  renderTray(run, fit);
  stage?.sync(run, ore, fit);
}

function renderTray(run, fit) {
  const { phase } = run;
  const key = [phase, run.batch, run.selected, run.refreshed, run.fit, phase === 'forge' && run.last?.hit].join('|');
  if (key === trayKey) return;
  trayKey = key;
  if (phase === 'ore') {
    tray.innerHTML = `<div class="tray-head"><h2>本批三块原石</h2><small>点选对比 · 价格决定稀质概率</small></div>
      <div class="ore-grid">${offers(run).map((stone, n) => {
        const rock = familyOf(stone.family), signs = oreSignals(stone);
        return `<button type="button" class="ore-card ${n === run.selected ? 'is-selected' : ''}" data-action="select-ore" data-id="${n}" aria-pressed="${n === run.selected}" aria-label="第${n + 1}块 ${rock.name} ${stone.price}信用点，${signs.vein}、${signs.shell}">
          <span class="ore-card-top"><b>LOT ${stone.number}</b><span>${ORE_TIERS[stone.tier]}</span></span>
          <span class="ore-card-body"><i class="ore-chip" style="--stone:${rock.color};--stone-dark:${rock.dark};--veins:${stone.vein/100};--cracks:${stone.flaw/100}"></i><span><b>${rock.name}</b><small>${signs.vein} · ${signs.shell}</small></span></span>
          <span class="ore-card-footer"><strong>${stone.price} CR</strong><span>稀质 ${RARE_ODDS[stone.tier]}%</span></span>
        </button>`;
      }).join('')}</div>`;
  } else if (phase === 'fit') {
    tray.innerHTML = `<div class="tray-head"><h2>挑选配件</h2><small>FITTING TRAY / ${run.refreshed ? '02' : '01'}</small></div><div class="fit-grid">${fitOptions(run).map(item => `<button type="button" class="fit-card" data-action="select-fit" data-id="${item.id}" aria-pressed="${fit?.id === item.id}"><span class="fit-colors"><i style="--sample:${item.color}"></i><i style="--sample:${item.accent}"></i><small>${item.role}</small></span><b>${item.name}</b><small>${item.parts}</small><small class="fit-stats">${item.delta.map((n, i) => n ? STAT_NAMES[i] + ' ' + (n > 0 ? '+' : '−') + Math.abs(n) : '').filter(Boolean).join(' · ')}</small></button>`).join('')}</div>`;
  } else {
    const note = {
      reveal: ['矿石已切开', '工艺倾向来自这块矿。'],
      refine: ['炉温提示', '绿区累计时间，过热则减少成坯品质。'],
      forge: [run.last ? (run.last.fusion || run.last.label) : '铁砧已就位', run.last ? '最近一锤 · ' + String(run.hits).padStart(2, '0') : '刀腹偏纹 · 刃侧偏膜 · 刀尖偏特效'],
      appraise: ['本地藏刀记录', '这一炉的刀面和装配已留档。'],
      broken: ['钢料损失', '连续失手后，最低价工坊矿仍可用。'],
    }[phase];
    tray.innerHTML = `<div class="brief"><b>${note[0]}</b><span>${note[1]}</span></div>`;
  }
}

function say(text, type = '') {
  msg.className = 'stage-message ' + type;
  msg.textContent = text;
  void msg.offsetWidth;
  msg.classList.add('show');
  get('announcer').textContent = text;
}

function drawHeat() {
  const heat = save.run.refining;
  const thermo = get('thermo');
  if (!heat || !thermo) return;
  const temperature = Math.round(heat.temperature);
  const green = heat.step === 'molten' && temperature >= HEAT.lower && temperature <= HEAT.upper;
  const danger = heat.step === 'molten' && temperature >= HEAT.danger;
  get('heat-step').textContent = { ore: '原石升温', molten: '熔球稳温', cast: '浇注成坯' }[heat.step];
  get('heat-number').textContent = temperature + '°';
  get('heat-fill').style.width = temperature + '%';
  get('heat-stable').textContent = heat.stable.toFixed(1) + ' / 3.0 秒';
  get('heat-progress').style.width = Math.min(100, heat.stable / HEAT.good * 100) + '%';
  get('heat-note').textContent = heat.step === 'ore' ? '先把原石加热到 65°' : heat.step === 'cast' ? '熔钢入模，稍候冷却' :
    danger ? '过热 · 松手散热' : (green ? '绿区内正在排渣' : '稳在 65–78°') + ' · 剩 ' + Math.max(0, HEAT.window - heat.elapsed).toFixed(1) + ' 秒';
  thermo.setAttribute('aria-valuenow', temperature);
  stageBox.dataset.heat = heat.step;
  stageBox.dataset.danger = String(danger);
  const button = get('heat-button');
  button.disabled = heat.step === 'cast';
  button.classList.toggle('heating', Boolean(heatInput?.blowing));
  stage?.setHeat(heat);
  if (heatInput) {
    if (green && !heatInput.green && performance.now() - (heatInput.lastCue ?? 0) > 450) {
      sound.play('heat');
      heatInput.lastCue = performance.now();
    }
    heatInput.green = green;
  }
}

function heatFrame(now) {
  if (!heatInput || save.run.phase !== 'refine') return;
  const previous = heatInput.now;
  heatInput.now = now;
  if (!document.hidden) {
    const run = save.run;
    const before = run.refining.step;
    let remaining = Math.min(.18, Math.max(0, (now - previous) / 1000));
    while (remaining > 0 && run.phase === 'refine') {
      const frame = Math.min(remaining, 1 / 60);
      advanceHeat(run, frame, heatInput.blowing);
      remaining -= frame;
    }
    if (run.phase === 'forge') {
      heatInput = null;
      persist();
      render();
      const label = { good: '精炼良好', fair: '精炼合格', failed: '火候失控' }[run.refinement.result];
      const difference = run.purity - run.ore.purity;
      const result = label + ' · 纯净 ' + (difference < 0 ? '−' : '+') + Math.abs(difference);
      sound.play(run.refinement.result === 'failed' ? 'scar' : 'cast');
      say(result, run.refinement.result === 'failed' ? 'scar' : 'surge');
      return;
    }
    if (before !== run.refining.step) {
      stage?.sync(run, run.ore, null);
      sound.play(run.refining.step === 'molten' ? 'melt' : 'cast');
    }
    if (now - heatInput.saved > 450 || before !== run.refining.step) {
      persist();
      heatInput.saved = now;
    }
    drawHeat();
  }
  requestAnimationFrame(heatFrame);
}

function startHeat(blowing) {
  if (save.run.phase !== 'refine' || save.run.refining.step === 'cast' && blowing) return;
  if (!heatInput) {
    heatInput = { now: performance.now(), saved: 0, blowing };
    requestAnimationFrame(heatFrame);
  }
  heatInput.blowing = blowing;
  drawHeat();
}

function charge() {
  sound.unlock();
  sound.prepare();
  startHeat(true);
}

function releaseHeat() {
  if (!heatInput) return;
  heatInput.blowing = false;
  drawHeat();
}

function hitBlade(hit) {
  if (!hit || save.run.phase !== 'forge' || queuedStop) return;
  if (busy) {
    if (stage.blow?.landed && !resultPause) {
      if (qa) hit.buffered = true;
      queuedHit = hit;
    }
    return;
  }
  sound.unlock();
  const result = strike(save.run, hit.zone, hit.position);
  if (!result) return;
  qa?.input();
  qa?.result(result);
  busy = true;
  persist();
  resultPause = result.notable;
  sound.play('swish');
  stage.swing(hit, result, () => {
    if (result.notable || result.type === 'break') queuedHit = null;
    sound.impact(result, save.run.purity);
    stage.impact(hit, result);
    render();
    if (save.run.phase === 'forge' && [.10, .25, .50].some(level => result.risk < level && fractureRisk(save.run) >= level)) {
      sound.play('tension', 1, .12);
    }
    if (result.type === 'break' || result.type === 'scar' || result.fusion || result.change) {
      say(result.fusion || result.label, result.fusion ? 'surge' : result.type);
    }
  }, () => {
    busy = false;
    resultPause = false;
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
  const { action, id } = control.dataset;
  if (['ore-prev', 'ore-next', 'next-batch', 'buy', 'select-ore'].includes(action)) qa?.input();
  const run = save.run;
  let message;
  if (action === 'select-ore' && run.phase === 'ore' && Number.isInteger(Number(id)) && Number(id) >= 0 && Number(id) < LOT_SIZE) {
    run.selected = Number(id);
  } else if (['ore-prev', 'ore-next'].includes(action) && run.phase === 'ore') {
    run.selected = (run.selected + (action === 'ore-next' ? 1 : LOT_SIZE - 1)) % LOT_SIZE;
  } else if (action === 'next-batch' && run.phase === 'ore' && run.batch < BATCHES - 1) {
    run.batch++;
    run.selected = 0;
  } else if (action === 'buy' && buyOre(save)) {
    revealPending = true;
    sound.play('ore');
    stage?.reveal();
    window.setTimeout(() => {
      if (save.run.phase !== 'reveal') return;
      revealPending = false;
      render();
      sound.play(run.ore.grade === 2 ? 'surge' : 'shift');
      say(GRADES[run.ore.grade] + '矿芯 · 纯净 ' + run.ore.purity, run.ore.grade === 2 ? 'surge' : '');
    }, 790);
  } else if (action === 'to-refine' && !revealPending && beginRefining(run)) {
    sound.prepare();
  } else if (action === 'finish') {
    closeAnvil();
    return;
  } else if (action === 'select-fit' && run.phase === 'fit' && fitOptions(run).some(item => item.id === id)) {
    run.fit = run.fit === id ? null : id;
  } else if (action === 'refresh' && refreshFittings(save)) {
    sound.play('polish');
  } else if (action === 'appraise' && appraise(save)) {
    sound.play('appraise');
    message = run.record.grade + ' · ' + run.record.score;
  } else if (action === 'restart' && restart(save, Date.now() + save.count)) {
    qa?.reset();
    message = '新一炉';
  } else return;
  persist();
  render();
  if (message) say(message, 'surge');
  if (action === 'select-fit') tray.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
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
  if (event.target.id === 'heat-button') releaseHeat();
});
document.addEventListener('lostpointercapture', event => {
  if (event.target.id === 'heat-button') releaseHeat();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && heatInput) {
    releaseHeat();
    persist();
  }
});
window.addEventListener('blur', releaseHeat);
document.addEventListener('keydown', event => {
  if (![' ', 'Enter'].includes(event.key) || event.repeat || get('vault').open) return;
  if (event.target.id === 'heat-button') {
    event.preventDefault();
    charge();
  } else if (event.key === ' ' && save.run.phase === 'forge' && event.target.tagName !== 'BUTTON') {
    event.preventDefault();
    const hit = stage?.keyboardHit();
    if (hit && qa) hit.pressedAt = performance.now();
    hitBlade(hit);
  }
});
document.addEventListener('keyup', event => {
  if ([' ', 'Enter'].includes(event.key) && heatInput && event.target.id === 'heat-button') releaseHeat();
});

canvas.addEventListener('pointerdown', event => {
  if (!event.isPrimary || !stage) return;
  if (save.run.phase === 'forge') {
    const hit = stage.hit(event.clientX, event.clientY);
    if (hit && qa) {
      const now = performance.now();
      hit.pressedAt = event.timeStamp > 0 && event.timeStamp <= now ? event.timeStamp : now;
    }
    hitBlade(hit);
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
  if (qa) stage.observeFrame = qa.frame;
  stage.prepare().catch(showError);
  canvas.tabIndex = 0;
} catch (error) {
  showError(error);
}
render();
qa?.install();
if (save.run.phase === 'refine' && (save.run.refining.elapsed > 0 || save.run.refining.step !== 'ore')) startHeat(false);
