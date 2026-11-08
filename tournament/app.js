import {
  STORAGE_KEY, V18_STORAGE_KEYS, WINDOW_PRICE, LOT_SIZE, BATCHES, HEAT, fittingPrice, PHASES, GRADES, ORE_TIERS, rareOdds, oreMaterialOf, MODELS, LOOKS, FITS, STAT_NAMES,
  freshSave, migrateSave, restart, offers, familyOf, stabilityOf, buyOre, beginRefining, advanceHeat, pourRefining, heatBand, refinementRank,
  REFINEMENT_RESULTS, REFINEMENT_FAILURES, fractureRisk, strike, finishForge,
  fitOptions, refreshFittings, appraise, signature, inspectOre, mineralHeritage, oreInspection, oreModelId,
} from './forge.js?v=16';
import { ForgeStage } from './stage.js?v=18';
import { ForgeSound } from './sound.js?v=16';
import { createQaSession } from './qa.js?v=16';
import { workshopPerks, workshopStatus, XP_THRESHOLDS } from './workshop.js';
import { eligibleBlades, masteryOf } from './tournament.js';

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
const fmt = p => (p * 100).toFixed(p === 0 ? 0 : 1) + '%';
const signed = n => (n < 0 ? '−' : n > 0 ? '+' : '') + Math.abs(n);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
let savedText = null;
const save = restore();
let stage;
let stageAttempted = false;
let busy = false;
let queuedHit;
let queuedStop = false;
let resultPause = false;
let revealPending = false;
let heatInput;
let heatHud;
let saveTask;
let drag;
let trayKey;
let webglError = false;
let storageMessage = '';
let inspectionMode = 'natural';
let toolStone = '';
let echoTimer;
let vaultView;
let tournament, tournamentLoad, preferredBlade, vaultBlade;
let inArena = false;

function restore() {
  if (qa) return qa.save;
  for (const key of [STORAGE_KEY, ...V18_STORAGE_KEYS]) {
    try {
      const raw = localStorage.getItem(key);
      if (key === STORAGE_KEY) savedText = raw;
      const existing = migrateSave(JSON.parse(raw));
      if (existing) return existing;
    } catch {}
  }
  return freshSave();
}

function persist(data = save) {
  if (saveTask) {
    if (saveTask.idle) cancelIdleCallback(saveTask.id);
    else clearTimeout(saveTask.id);
    saveTask = null;
  }
  if (qa) return true;
  try {
    if (localStorage.getItem(STORAGE_KEY) !== savedText) {
      return showStorageNotice('存档已在另一标签页更新。请刷新此页，再继续保存。');
    }
    const text = JSON.stringify(data);
    if (text !== savedText) localStorage.setItem(STORAGE_KEY, text);
    savedText = text;
    get('save-notice').hidden = true;
    return true;
  } catch {
    return showStorageNotice('本地存档暂不可用。试刀练习仍可进行。');
  }
}

function showStorageNotice(message) {
  storageMessage = message;
  const notice = get('save-notice');
  notice.textContent = message;
  notice.hidden = false;
  return false;
}

async function commitTournament(change) {
  const apply = () => {
    const draft = structuredClone(save);
    const result = change(draft);
    if (result.error) return result;
    if (!persist(draft)) return { error: storageMessage };
    save.credits = draft.credits;
    save.tournament = draft.tournament;
    renderBalance();
    return result;
  };
  return navigator.locks ? navigator.locks.request(STORAGE_KEY, apply) : apply();
}

function persistWhenIdle() {
  if (qa || saveTask) return;
  const idle = typeof requestIdleCallback === 'function';
  const write = () => { saveTask = null; persist(); };
  saveTask = { idle, id: idle ? requestIdleCallback(write, { timeout: 500 }) : setTimeout(write, 80) };
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
  const combination = signature(run.skin);
  return `<div class="look-list">${fields.map(([slot, names]) => `<span class="look-chip ${run.skin.levels[slot] >= 3 ? 'rarity' : ''}">${names[run.skin[slot]]}${roman[run.skin.levels[slot]] || ''}</span>`).join('')}${combination ? `<span class="look-chip rarity">${combination}</span>` : ''}</div>`;
}

function renderBalance() {
  get('credits').textContent = save.credits;
  get('growth').textContent = '工坊 Lv.' + workshopStatus(save).level;
}

function render() {
  const run = save.run;
  heatHud = null;
  const { phase } = run;
  qa?.phase(phase);
  const failedRefining = run.last?.type === 'refine-fail';
  const navPhase = phase === 'reveal' ? 'ore' : phase === 'broken' ? failedRefining ? 'refine' : 'forge' : phase;
  const idx = PHASES.indexOf(navPhase);
  const ore = phase === 'ore' ? offers(run)[run.selected] : run.ore;
  const fit = FITS.find(item => item.id === run.fit);
  stageBox.dataset.mode = phase;
  if (phase !== 'refine') stageBox.dataset.danger = 'false';
  get('ore-nav').hidden = phase !== 'ore';
  get('ore-position').textContent = '第 ' + (run.batch + 1) + ' 批 · ' + (run.selected + 1) + ' / ' + LOT_SIZE;
  get('steps').innerHTML = stepNames.map((label, n) => `<div class="step ${n === idx ? 'current' : n < idx ? 'past' : ''}" ${n === idx ? 'aria-current="step"' : ''}><i>0${n + 1}</i>${label}</div>`).join('');
  renderBalance();
  get('stage-code').textContent = 'STATION 0' + (idx + 1);
  get('stage-name').textContent = stationNames[idx];
  const status = { ore: '原石在台', reveal: '已开料', refine: '炉温实时', forge: '可自由落锤', fit: '试装预览', appraise: '成品已入藏', broken: '炉次结束' };
  get('stage-state').textContent = webglError ? '3D 暂不可用' : status[phase];
  const hints = {
    ore: '拖动转石', reveal: '同源矿相 · 拖动检视', refine: '松手仍有余热 · 可提前浇注',
    forge: matchMedia('(pointer: coarse)').matches ? '轻点刀身 · 落点影响出纹' : '直接轻点刀身 · 空格落锤', fit: '拖动转刀，比较装配',
    appraise: '拖动检视成刀', broken: failedRefining ? '本炉钢料已报废' : '保留本次锻打记录',
  };
  get('stage-hint').textContent = hints[phase];
  if (phase === 'ore') {
    const family = familyOf(ore.family), mineral = oreMaterialOf(ore);
    title('01 / SELECT A STONE', family.name, mineral.name + ' · ' + ORE_TIERS[ore.tier]);
    readout.innerHTML = `<div class="ore-decision"><span>开料 <b>${ore.price} CR</b></span><span>价位稀质率 <b>${rareOdds(run, ore.tier)}%</b></span></div>`;
    actions.innerHTML = button('buy', '切开原石 · ' + ore.price + ' CR', { off: ore.price > save.credits }) +
      button('next-batch', run.batch === BATCHES - 1 ? '最后一批' : '换一批 · 免费', { kind: 'secondary', off: run.batch === BATCHES - 1 }) +
      `<span class="action-note">${ore.price > save.credits ? '余额不足，请选价格更低的原石' : '余额 ' + save.credits + ' → ' + (save.credits - ore.price) + ' CR · 切开后不能退料'}</span>`;
  } else if (phase === 'reveal') {
    const family = familyOf(ore.family);
    if (revealPending) {
      title('01 / THE CUT', '开石见芯', '');
      readout.innerHTML = `<div class="info-block ore-report ore-suspense">
        <div class="info-line"><small>开料完成 · LOT ${ore.number}</small><b class="readout-number">−${ore.price} CR</b></div>
        <strong>石皮分离中…</strong>
        <div class="ore-suspense-track"><i></i></div>

      </div>`;
      actions.innerHTML = button('to-refine', '切面鉴定中…', { off: true });
    } else {
      const mineral = oreMaterialOf(ore), heritage = mineralHeritage(ore);
      title('01 / INSIDE THE STONE', GRADES[ore.grade] + ' · ' + family.name, '矿相已揭晓');
      readout.innerHTML = `<div class="ore-report ore-result grade-${ore.grade}">
        <div class="ore-grade"><span class="ore-grade-icon">${['◆','✦','✧'][ore.grade]}</span><div><small>${mineral.name}</small><strong>${GRADES[ore.grade]}矿芯</strong></div><small>选料 −${ore.price + Object.keys(run.inspections || {}).length * WINDOW_PRICE} CR</small></div>
        <div class="mineral-meters">
          <div><span>纯净度</span><b id="ore-purity">${ore.purity}</b><i style="--value:${ore.purity}%"></i></div>
          <div><span>稳定性</span><b id="ore-stability">${stabilityOf(ore.stability)}</b><i style="--value:${ore.stability}%"></i></div>
        </div>
        <button type="button" class="heritage-preview" data-action="preview-mineral" aria-pressed="false"><span class="heritage-swatch" style="--core:${heritage.core};--steel:${heritage.tone}"></span><span><small>${heritage.tintName} · ${heritage.clarityName}</small><b>${heritage.name}</b></span><strong>预览刀身 ↗</strong></button>
      </div>`;
      actions.innerHTML = button('to-refine', '送去精炼');
    }
  } else if (phase === 'refine') {
    title('02 / HEAT CONTROL', '控住火候', '追随绿区排渣，满意就浇注。持续过热或凝固会废炉。');
    readout.innerHTML = `<div class="info-block temperature">
      <div class="info-line"><strong id="heat-step">原石升温</strong><span class="heat-clock" id="heat-clock">待点火</span><b class="readout-number" id="heat-number">35°</b></div>
      <div class="thermo" role="progressbar" aria-label="炉温" aria-valuemin="0" aria-valuemax="100" aria-valuenow="35" id="thermo"><i class="thermo-fill" id="heat-fill"></i><i class="thermo-range" id="heat-range"></i><i class="thermo-danger"></i><i class="thermo-needle" id="heat-needle"></i></div>
      <div class="info-line"><small>排渣区 <b id="heat-target"></b></small><small id="heat-draft">按住点火</small></div>
      <div class="info-line"><strong id="heat-rank">尚未成坯</strong><b class="readout-number" id="heat-quality">0 / 100</b></div>
      <div class="heat-progress" role="progressbar" aria-label="精炼质量" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="heat-quality-meter"><span id="heat-progress"></span><i style="left:22%"></i><i style="left:65%"></i><i style="left:86%"></i></div>
      <div class="heat-thresholds"><small>22 成坯</small><small>65 良好</small><small>86 极佳</small></div>
      <div class="info-line"><small>炉料损伤</small><b class="heat-damage-value" id="heat-damage-value">0%</b></div>
      <div class="risk-bar heat-damage"><span id="heat-damage"></span></div>
      <small id="heat-note">先把原石加热到 65°</small>
    </div>`;
    actions.innerHTML = button('heat', '按住鼓风', { id: 'heat-button' }) +
      button('pour-refine', '排渣中…', { kind: 'secondary', id: 'pour-button', off: true });
    heatHud = { nodes: Object.fromEntries(['thermo', 'heat-step', 'heat-number', 'heat-clock', 'heat-fill',
      'heat-needle', 'heat-range', 'heat-target', 'heat-draft', 'heat-rank', 'heat-quality', 'heat-quality-meter',
      'heat-progress', 'heat-damage', 'heat-damage-value', 'heat-note', 'heat-button', 'pour-button'].map(id => [id, get(id)])),
      values: Object.create(null), updated: -Infinity, state: '' };
    drawHeat();
  } else if (phase === 'forge') {
    const risk = fractureRisk(run);
    title('03 / THE ANVIL', '下一锤，怎么打？', run.hits ? '在刀腹找纹，在刃侧找光。喜欢眼前这把刀，就可以收锤。' : '直接点刀胚。刀腹、刃侧和刀尖，能敲出不同方向的变化。');
    readout.innerHTML = `<div class="info-block"><div class="risk-line"><small>下一锤断率</small><strong class="risk-value ${risk >= .075 ? 'alert' : ''}" id="risk">${fmt(risk)}</strong></div><div class="risk-bar"><span style="width:${risk / .9 * 100}%"></span></div><div class="info-line"><small>${MODELS[run.model]} · 纯净 ${run.purity} · ${stabilityOf(run.stability)}</small><b class="readout-number" id="hit-count">${run.hits} 锤</b></div></div>${run.refinement?.quality != null ? `<div class="refinement-result ${run.refinement.result}"><b>${REFINEMENT_RESULTS[run.refinement.result].label} · ${run.refinement.quality}</b><span>纯净 ${signed(run.purity - ore.purity)} · 稳定 ${signed(run.stability - ore.stability)}</span></div>` : ''}${lookChips(run)}`;
    actions.innerHTML = button('finish', '收锤 · 保住这一把', { off: run.hits < 6 }) +
      `<span class="action-note">${run.hits < 6 ? '第 6 锤后可收锤 · 前六锤稳定' : '收锤后直接进入装配'}</span>`;
  } else if (phase === 'fit') {
    title('04 / FITTINGS', '挑一套配件', '点选试装，拖动转刀。查看刀柄可近看材质和端箍。');
    readout.innerHTML = fit ? info('当前试装', fit.name, fit.parts) : info('锻打完成', MODELS[run.model], '已经保留 ' + run.hits + ' 锤的结果。');
    const price = fittingPrice(run);
    actions.innerHTML = button('appraise', '确认装配 · 鉴定', { off: !fit }) +
      button('refresh', run.refreshed ? '本炉已刷新' : '刷新一轮 · ' + price + ' CR', { kind: 'secondary', off: run.refreshed || save.credits < price });
  } else if (phase === 'appraise') {
    const record = run.record;
    title('05 / THE REVEAL', record.name, '第 ' + String(record.id).padStart(2, '0') + ' 号藏刀 · 已收入本地藏刀记录。');
    readout.innerHTML = info('成刀品质', `<span class="result-grade">${esc(record.grade)}</span> · ${esc(record.score)} 分`, record.refinement?.quality != null ? REFINEMENT_RESULTS[record.refinement.result].label + ' · 精炼质量 ' + record.refinement.quality : '', '+' + record.credit + ' CR') +
      lookChips(record) +
      `<div class="stat-list">${record.stats.map((n, i) => `<div class="stat"><span>${STAT_NAMES[i]}</span><span class="stat-track"><i style="width:${Number(n)}%"></i></span><b>${Number(n)}</b></div>`).join('')}</div>`;
    actions.innerHTML = button('enter-tournament', '带此刀参赛') + button('restart', '再开一炉', { kind: 'secondary' }) +
      '<span class="action-note">本次成刀 · 工坊 +10 XP</span>';
  } else {
    if (failedRefining) {
      title('02 / FURNACE LOST', '精炼失败', REFINEMENT_FAILURES[run.refinement.reason]);
      readout.innerHTML = info('炉次报废', '未生成成刀', '本炉选料已消耗 ' + (ore.price + Object.keys(run.inspections || {}).length * WINDOW_PRICE) + ' CR。') +
        info('下次控温', { burnt: '提前松手，留意余热', frozen: '及时鼓风，别让熔钢降到 55°', unmelted: '先按住鼓风，把原石熔化', slag: '跟随绿区排渣，质量至少达到 22' }[run.refinement.reason]);
    } else {
      title('03 / FRACTURE', '这一炉，断了', '锤头落下，裂痕贯穿了刀身。换一块矿，试一条不同的路。');
      readout.innerHTML = info('断裂记录', '第 ' + run.hits + ' 锤 · ' + fmt(run.last.risk), '本炉开料已消耗 ' + ore.price + ' 信用点。');
    }
    actions.innerHTML = button('restart', '再开一炉');
  }
  stage?.sync(run, ore, fit);
  renderGripFocus();
  renderTools(run,ore);
  renderTray(run, fit);
}

function renderGripFocus() {
  const button = get('grip-focus');
  button.hidden = save.run.phase !== 'fit' || !stage || webglError;
  button.setAttribute('aria-pressed', String(Boolean(stage?.gripFocus)));
  button.querySelector('span').textContent = stage?.gripFocus ? '查看全刀' : '查看刀柄';
}

function renderTools(run,ore) {
  get('ore-tools').hidden=run.phase!=='ore';
  stageBox.dataset.inspection=run.phase==='ore' ? inspectionMode : 'natural';
  if(run.phase!=='ore')return;
  const key=run.seed+'|'+ore.id;
  if(toolStone!==key){inspectionMode='natural';toolStone=key;}
  stageBox.dataset.inspection=inspectionMode;
  const checked=oreInspection(ore);
  get('inspection-note').textContent=inspectionMode==='lamp' ? '打灯 · '+checked.lamp : ore.window ? '小窗只是局部，内部仍有未知' : '转动原石，寻找露脉与石皮';
  document.querySelectorAll('[data-action="inspect-light"]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===inspectionMode)));
  const windowButton=get('window-ore');
  windowButton.disabled=ore.window || save.credits<ore.price+WINDOW_PRICE;
  windowButton.querySelector('span').innerHTML=ore.window ? '已擦窗' : '擦窗 <small>'+WINDOW_PRICE+' CR</small>';
  windowButton.setAttribute('aria-label',ore.window ? '这块原石已经擦窗' : '擦开一小块石皮，花费'+WINDOW_PRICE+'信用点');
}

function toggleOreBlade(control) {
  const preview = stage?.toggleMineralPreview();
  control.setAttribute('aria-pressed', String(Boolean(preview)));
  control.querySelector('strong').textContent = preview ? '回看切面 ↩' : '预览刀身 ↗';
  get('stage-hint').textContent = preview ? '同源钢纹预览 · 后续锤击仍会变化' : '同源矿相 · 拖动检视';
}

function renderTray(run, fit) {
  const { phase } = run;
  const key = [phase, run.batch, run.selected, run.refreshed, run.fit, JSON.stringify(run.inspections), phase === 'forge' && run.last?.hit].join('|');
  if (key === trayKey) return;
  trayKey = key;
  if (phase === 'ore') {
    tray.innerHTML = `<div class="ore-grid">${offers(run).map((stone,n) => {
      const rock=familyOf(stone.family);
      return `<button type="button" class="ore-card ${n===run.selected ? 'is-selected' : ''}" data-action="select-ore" data-id="${n}" aria-pressed="${n===run.selected}" aria-label="第${n+1}块 ${rock.name}，${stone.price}信用点，价位稀质率${rareOdds(run, stone.tier)}%">
        <span class="ore-card-top"><b>${stone.number}</b><span>${stone.window ? '已擦窗' : ORE_TIERS[stone.tier]}</span></span>
        <span class="ore-thumbnail"><img data-stone="${stone.id}" alt="${rock.name}实物缩略图"><i></i></span>
        <b class="ore-card-name">${rock.name}</b><span class="ore-card-footer"><strong>${stone.price} CR</strong><span>${rareOdds(run, stone.tier)}%</span></span>
      </button>`;
    }).join('')}</div>`;
    const batch=run.batch;
    for(const stone of offers(run)) stage?.oreThumbnail(stone).then(src => {
      if(save.run.phase!=='ore' || save.run.batch!==batch)return;
      const img=tray.querySelector(`img[data-stone="${stone.id}"]`);
      if(img){img.src=src;img.closest('.ore-thumbnail').classList.add('is-loaded');}
    }).catch(error => console.warn('Specimen preview',error));
  } else if (phase === 'fit') {
    tray.innerHTML = `<div class="tray-head"><h2>挑选配件</h2><small>FITTING TRAY / ${run.refreshed ? '02' : '01'}</small></div><div class="fit-grid">${fitOptions(run).map(item => `<button type="button" class="fit-card" data-action="select-fit" data-id="${item.id}" aria-pressed="${fit?.id === item.id}"><span class="fit-colors"><i style="--sample:${item.color}"></i><i style="--sample:${item.accent}"></i><small>${item.role}</small></span><b>${item.name}</b><small>${item.parts}</small><small class="fit-stats">${item.delta.map((n, i) => n ? STAT_NAMES[i] + ' ' + (n > 0 ? '+' : '−') + Math.abs(n) : '').filter(Boolean).join(' · ')}</small></button>`).join('')}</div>`;
  } else {
    const note = {
      reveal: ['矿石已切开', '工艺倾向来自这块矿。'],
      refine: ['火候与取舍', '追随窄绿区排渣；提前浇注保料，继续控温争取更高质量。'],
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

function drawHeat(now = performance.now(), force = false) {
  const heat = save.run.refining;
  if (!heat || !heatHud) return;
  const { nodes, values } = heatHud;
  const put = (key, value, apply) => { if (values[key] !== value) { values[key] = value; apply(value); } };
  const text = (id, value) => put(id, value, value => { nodes[id].textContent = value; });
  const transform = (id, value) => put(id, value, value => { nodes[id].style.transform = value; });
  const temperature = Math.round(heat.temperature);
  const band = heatBand(heat);
  const green = heat.step === 'molten' && heat.temperature >= band.lower && heat.temperature <= band.upper;
  const danger = heat.step === 'molten' && (heat.temperature >= 82 || heat.temperature <= 58 || heat.damage >= 65);
  const rank = refinementRank(heat.quality);
  const outcome = REFINEMENT_RESULTS[rank];
  const paused = !heatInput && heat.step !== 'cast';
  // Keep motion and the simulation at display cadence, without relaying out the
  // panel. Numeric text is sampled separately and unchanged content is untouched.
  transform('heat-fill', `scaleX(${(heat.temperature / 100).toFixed(4)})`);
  transform('heat-needle', `translateX(${heat.temperature.toFixed(2)}%)`);
  transform('heat-range', `translateX(${band.lower.toFixed(2)}%)`);
  transform('heat-progress', `scaleX(${(heat.quality / 100).toFixed(4)})`);
  transform('heat-damage', `scaleX(${(heat.damage / 100).toFixed(4)})`);
  stage?.setHeat(heat, Boolean(heatInput));
  if (heatInput) {
    if (green && !heatInput.green && performance.now() - (heatInput.lastCue ?? 0) > 450) {
      sound.play('heat');
      heatInput.lastCue = performance.now();
    }
    heatInput.green = green;
  }
  const canPour = heat.step === 'molten' && heat.elapsed >= HEAT.minimum && heat.quality >= HEAT.minQuality;
  const state = [heat.step, danger, rank, paused, Boolean(heatInput?.blowing), canPour].join('|');
  if (!force && state === heatHud.state && now - heatHud.updated < 80) return;
  heatHud.state = state;
  heatHud.updated = now;
  text('heat-step', { ore: '原石升温', molten: '熔球稳温', cast: '浇注成坯' }[heat.step]);
  text('heat-number', temperature + '°');
  text('heat-clock', heat.step === 'cast' ? '浇注中' : paused ? heat.elapsed ? '待续炼' : '待点火' : Math.max(0, (heat.step === 'ore' ? HEAT.preheat : HEAT.window) - heat.elapsed).toFixed(1) + ' s');
  text('heat-target', band.lower.toFixed(0) + '–' + band.upper.toFixed(0) + '°');
  put('lower', band.lower.toFixed(2), value => { nodes.thermo.dataset.lower = value; });
  put('upper', band.upper.toFixed(2), value => { nodes.thermo.dataset.upper = value; });
  text('heat-draft', paused ? heat.elapsed ? '按住续炼' : '按住点火' : heat.draft > .5 ? '余热 ↑' : '散热 ↓');
  text('heat-rank', rank === 'failed' ? '尚未成坯' : outcome.label);
  text('heat-quality', Math.floor(heat.quality) + ' / 100');
  put('quality-aria', Math.floor(heat.quality), value => nodes['heat-quality-meter'].setAttribute('aria-valuenow', value));
  text('heat-damage-value', Math.round(heat.damage) + '%');
  text('heat-note', paused && heat.elapsed ? '火候已保留 · 按住继续，松手散热' : heat.step === 'ore' ? '加热到 65° 熔化 · 松手仍有余热' : heat.step === 'cast' ? outcome.label + ' · 熔钢入模' :
    heat.temperature >= 82 ? '过热烧损 · 立即松手' : heat.temperature <= 58 ? '即将凝固 · 立即鼓风' :
      green ? '绿区排渣中 · 可择机浇注' : '追随绿区 · 提前松手留余热');
  put('temperature-aria', temperature, value => nodes.thermo.setAttribute('aria-valuenow', value));
  put('step', heat.step, value => { stageBox.dataset.heat = value; });
  put('danger', danger, value => { stageBox.dataset.danger = String(value); });
  put('heat-disabled', heat.step === 'cast', value => { nodes['heat-button'].disabled = value; });
  text('heat-button', paused && heat.elapsed ? '按住续炼' : '按住鼓风');
  put('blowing', heat.step !== 'cast' && Boolean(heatInput?.blowing), value => nodes['heat-button'].classList.toggle('heating', value));
  put('pour-disabled', !canPour, value => { nodes['pour-button'].disabled = value; });
  text('pour-button', heat.step === 'cast' ? '浇注中…' : !canPour ? '排渣后浇注' : '浇注 · ' + ({ excellent: '极佳', good: '良好', fair: '普通', poor: '勉强' })[rank]);
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
    if (run.phase !== 'refine') {
      heatInput = null;
      persist();
      render();
      const label = REFINEMENT_RESULTS[run.refinement.result].label;
      const difference = run.purity - run.ore.purity;
      const result = label + (run.phase === 'broken' ? ' · 炉次报废' : ' · 纯净 ' + signed(difference));
      sound.play(run.phase === 'broken' ? 'break' : 'cast');
      say(result, run.refinement.result === 'failed' ? 'scar' : 'surge');
      return;
    }
    if (before !== run.refining.step) {
      stage?.sync(run, run.ore, null);
      sound.play(run.refining.step === 'molten' ? 'melt' : 'cast');
    }
    if (now - heatInput.saved > 1200 || before !== run.refining.step) {
      if (before !== run.refining.step) persist();
      else persistWhenIdle();
      heatInput.saved = now;
    }
    drawHeat(now);
  }
  requestAnimationFrame(heatFrame);
}

function startHeat(blowing) {
  if (save.run.phase !== 'refine' || !save.run.refining || save.run.refining.step === 'cast' && blowing) return;
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
  if (['ore-prev', 'ore-next', 'next-batch', 'buy', 'select-ore', 'window-ore', 'tap-ore', 'inspect-light'].includes(action)) qa?.input();
  const run = save.run;
  let message;
  if (action === 'enter-tournament' && run.phase === 'appraise') {
    enterTournament(run.record);
    return;
  } else if(action==='inspect-light' && run.phase==='ore' && id==='lamp'){
    inspectionMode=inspectionMode===id ? 'natural' : id;
    stage?.setInspection(inspectionMode);renderTools(run,offers(run)[run.selected]);return;
  } else if(action==='tap-ore' && run.phase==='ore'){
    const stone=offers(run)[run.selected];
    stage?.tapOre();sound.inspect(stone);
    const echo=get('ore-echo');
    echo.classList.remove('is-echoing');void echo.offsetWidth;echo.classList.add('is-echoing');
    echo.style.setProperty('--ring',(.35+stone.density/100)+'s');
    get('inspection-note').textContent=stone.density>=70 ? '叩声清亮 · 余音较长' : stone.density<49 ? '叩声低闷 · 余音短' : '叩声偏实 · 回音适中';
    clearTimeout(echoTimer);echoTimer=setTimeout(()=>{echo.classList.remove('is-echoing');if(save.run.phase==='ore')renderTools(save.run,offers(save.run)[save.run.selected]);},1500);return;
  } else if(action==='window-ore' && inspectOre(save)){
    inspectionMode='window';stage?.setInspection('window');
    sound.play('polish',.75);
  } else if(action==='preview-mineral' && run.phase==='reveal' && !revealPending){
    toggleOreBlade(control);
    return;
  } else if (action === 'select-ore' && run.phase === 'ore' && Number.isInteger(Number(id)) && Number(id) >= 0 && Number(id) < LOT_SIZE) {
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
    }, 1050);
  } else if (action === 'to-refine' && !revealPending && beginRefining(run)) {
    sound.prepare();
  } else if (action === 'pour-refine' && pourRefining(run)) {
    releaseHeat();
    startHeat(false);
    sound.play('cast');
  } else if (action === 'finish') {
    closeAnvil();
    return;
  } else if (action === 'focus-grip' && run.phase === 'fit' && stage) {
    stage.setGripFocus(!stage.gripFocus);
    renderGripFocus();
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
window.addEventListener('pagehide', () => persist());
window.addEventListener('storage', event => {
  if (event.key === STORAGE_KEY && event.newValue !== savedText) {
    showStorageNotice('存档已在另一标签页更新。请刷新此页，再继续保存。');
  }
});
document.addEventListener('keydown', event => {
  if (inArena || ![' ', 'Enter'].includes(event.key) || event.repeat || get('vault').open || get('workshop-progress').open) return;
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
  if (vaultView || ['ore', 'reveal', 'fit', 'appraise'].includes(save.run.phase)) {
    canvas.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  } else if (save.run.phase === 'forge') {
    const hit = stage.hit(event.clientX, event.clientY);
    if (hit && qa) {
      const now = performance.now();
      hit.pressedAt = event.timeStamp > 0 && event.timeStamp <= now ? event.timeStamp : now;
    }
    hitBlade(hit);
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
  tournament?.setMuted(muted);
});
get('collection').addEventListener('click', () => {
  tournament?.pause();
  ensureStage();
  const available = stage && !busy && !heatInput && !revealPending;
  const eligible = new Set(eligibleBlades(save).map(blade => blade.id));
  const list = get('vault-list');
  list.innerHTML = save.collection.map((item, index) => {
    const mastery = eligible.has(item.id) ? masteryOf(save, item) : null;
    const label = `<b>${esc(item.name)}</b><span>${esc(item.grade)} · ${Number(item.score)} 分${mastery ? ' · ' + mastery.level : ''}</span>`;
    return available && item.skin?.levels && Object.hasOwn(MODELS, item.model) ?
      `<button type="button" class="brief vault-item" data-blade="${index}" aria-pressed="false">${label}</button>` :
      `<div class="brief">${label}</div>`;
  }).join('') || '<div class="brief"><span>完成第一把刀后，成品会出现在这里。</span></div>';
  get('vault').showModal();
  const first = list.querySelector('[data-blade]');
  if (first && !navigator.connection?.saveData) {
    stage.load(save.collection[Number(first.dataset.blade)].model, 'low').catch(() => {});
  }
});
get('vault-list').addEventListener('click', event => {
  const item = event.target.closest('[data-blade]');
  if (!item) return;
  const blade = save.collection[Number(item.dataset.blade)];
  vaultBlade = blade;
  get('vault-enter').hidden = !eligibleBlades(save).includes(blade);
  vaultView ??= { x: stage.turnX, y: stage.turnY, touched: stage.touched, previewSteel: stage.previewSteel, gripFocus: stage.gripFocus };
  const preview = get('vault-preview');
  const display = get('vault-stage');
  const loading = get('vault-loading');
  const view = vaultView;
  view.item = item;
  preview.hidden = false;
  display.append(canvas);
  const mastery = eligibleBlades(save).includes(blade) ? masteryOf(save, blade) : null;
  get('vault-looks').innerHTML = lookChips(blade) + (mastery ?
    `<p class="vault-mastery">${mastery.level} · 有效出战 ${mastery.matches} 场 · ${mastery.project}专长 +${Math.round(mastery.bonus * 100)}%</p>` : '');
  for (const entry of get('vault-list').querySelectorAll('[data-blade]')) entry.setAttribute('aria-pressed', entry === item);
  stage.turnX = stage.turnY = 0;
  const pending = stage.sync({ ...blade, phase: 'appraise' }, blade.ore, FITS.find(fit => fit.id === blade.fit));
  display.dataset.loading = pending ? 'pending' : 'ready';
  display.setAttribute('aria-busy', String(Boolean(pending)));
  loading.hidden = !pending;
  if (pending) {
    loading.textContent = '刀身载入中';
    pending.then(ready => {
      if (vaultView !== view || view.item !== item) return;
      display.dataset.loading = ready ? 'ready' : 'failed';
      display.setAttribute('aria-busy', 'false');
      loading.hidden = ready;
      if (!ready) loading.textContent = '刀身载入失败';
    });
  }
  stage.resize();
  preview.scrollIntoView({ block: 'nearest' });
});
get('vault').addEventListener('close', () => {
  if (!vaultView) return;
  const view = vaultView;
  vaultView = null;
  vaultBlade = null;
  stageBox.prepend(canvas);
  get('vault-preview').hidden = true;
  stage.resize();
  render();
  if (save.run.phase === 'ore') stage.setInspection(inspectionMode);
  if (save.run.phase === 'reveal' && view.previewSteel) toggleOreBlade(document.querySelector('[data-action="preview-mineral"]'));
  stage.turnX = view.x;
  stage.turnY = view.y;
  stage.touched = view.touched;
  stage.setGripFocus(view.gripFocus);
  renderGripFocus();
});
get('close-vault').addEventListener('click', () => get('vault').close());
get('vault-enter').addEventListener('click', () => {
  const blade = vaultBlade;
  get('vault').close();
  if (blade) enterTournament(blade);
});

get('growth').addEventListener('click', () => {
  tournament?.pause();
  const { level, xp, floor, next } = workshopStatus(save);
  const perks = workshopPerks(level);
  const cost = fittingPrice({ workshopLevel: level });
  const rows = XP_THRESHOLDS.map((threshold, index) => {
    const { discount, riskReduction, rareBonus } = workshopPerks(index + 1);
    return `<li${level === index + 1 ? ' aria-current="true"' : ''}><b>Lv.${index + 1}</b><span>${threshold} XP</span><span>${Math.round(discount * 100)}% / ${Math.round(riskReduction * 100)}% / +${rareBonus}</span></li>`;
  }).join('');
  get('workshop-details').innerHTML = `
    <div class="growth-summary"><b>Lv.${level}</b><span>${xp} XP${next ? ' / ' + next : ' · 已满级'}</span></div>
    <progress aria-label="工坊等级经验" max="${next ? next - floor : 1}" value="${next ? xp - floor : 1}"></progress>
    <p>每次成功成刀获得 10 XP。正式赛事和有效快赛也会积累工坊经验。</p>
    <div class="growth-perks"><span>配件刷新 <b>${cost} CR</b></span><span>下一炉断率 <b>−${Math.round(perks.riskReduction * 100)}%</b></span><span>稀质率 <b>+${perks.rareBonus} 点</b></span></div>
    <details><summary>十级工坊权益</summary><p>配件折扣 / 断率减免 / 稀质率加成，下炉生效。</p><ol>${rows}</ol></details>`;
  get('workshop-progress').showModal();
});
get('close-growth').addEventListener('click', () => get('workshop-progress').close());

function enterTournament(blade) {
  preferredBlade = String(blade.id);
  if (inArena) void route();
  else location.hash = 'arena';
}

async function route() {
  const arena = get('arena');
  inArena = location.hash === '#arena';
  get('forge').hidden = inArena;
  arena.hidden = !inArena;
  for (const link of document.querySelectorAll('[data-tab]')) {
    if ((link.dataset.tab === 'arena') === inArena) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
  renderBalance();
  if (!inArena) {
    tournament?.pause();
    ensureStage();
    stage?.resize();
    render();
    if (save.run.phase === 'refine' && save.run.refining?.step === 'cast') startHeat(false);
    return;
  }
  if (heatInput) {
    heatInput = null;
    drawHeat();
    persist();
  }
  if (!tournament) {
    arena.innerHTML = '<p class="lab-notice" role="status">正在打开赛事大厅…</p>';
    try {
      tournamentLoad ??= import('./arena/view.js?v=1').then(({ mountTournament }) =>
        mountTournament(arena, { getSave: () => save, commit: commitTournament,
          muted: () => get('sound').getAttribute('aria-pressed') === 'true' }));
      tournament = await tournamentLoad;
    } catch {
      tournamentLoad = null;
      arena.innerHTML = '<p class="lab-notice">赛事大厅载入失败，请刷新页面后重试。</p>';
      return;
    }
  }
  if (inArena) tournament.open(preferredBlade);
  preferredBlade = undefined;
}

function showError(error) {
  console.error('3D startup', error);
  webglError = true;
  render();
  say('请在支持 WebGL 的浏览器中打开', 'scar');
}

function ensureStage() {
  if (stageAttempted) return;
  stageAttempted = true;
  try {
    const { run } = save;
    const stones = run.phase === 'ore' ? offers(run) : [];
    const initialModels = stones.length ? [stones[run.selected], ...stones].map(oreModelId) : [];
    stage = new ForgeStage(canvas, initialModels);
    if (qa) stage.observeFrame = qa.frame;
    canvas.tabIndex = 0;
  } catch (error) {
    showError(error);
  }
}
qa?.install();
window.addEventListener('hashchange', () => { void route(); });
void route();
