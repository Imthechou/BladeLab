import { advanceHeat, beginRefining, buyOre, freshSave, strike } from './forge.js?v=3';

const scenarios = { full: '完整一炉', rare: '下一锤异形', break: '下一锤断裂' };

function preparedSave(mode) {
  if (mode === 'full') return freshSave();
  for (let seed = 0; seed < 200; seed++) {
    const save = freshSave(seed);
    buyOre(save);
    beginRefining(save.run);
    for (let tick = 0; tick < 500 && save.run.phase === 'refine'; tick++) {
      advanceHeat(save.run, .03, tick < 50);
    }
    while (save.run.phase === 'forge' && save.run.hits < 30) {
      const snapshot = JSON.stringify(save);
      const result = strike(save.run, 'belly');
      if (mode === 'break' && result.type === 'break' ||
          mode === 'rare' && result.change?.slot === 'model' && result.notable) return JSON.parse(snapshot);
    }
  }
  throw new Error('无法准备验收场景');
}

function addBounded(list, value, limit) {
  list.push(value);
  if (list.length > limit) list.shift();
}

function p95(values) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return Math.round(ordered[Math.ceil(ordered.length * .95) - 1] * 10) / 10;
}

export function createQaSession(mode) {
  if (!Object.hasOwn(scenarios, mode)) return null;
  const save = preparedSave(mode);
  const starts = [], queuedStarts = [], frames = [], events = [], durations = [];
  let firstInput, hiddenAt, paused = 0, lastSwing;
  let finished = false;
  let skipNextFrame = false;
  return {
    save,
    input() {
      firstInput ??= performance.now();
    },
    phase(phase) {
      if (document.hidden || firstInput == null || finished || !['appraise', 'broken'].includes(phase)) return;
      finished = true;
      if (mode === 'full') addBounded(durations, Math.round((performance.now() - firstInput - paused) / 1000), 8);
    },
    reset() {
      firstInput = undefined;
      paused = 0;
      finished = false;
    },
    result(event) {
      addBounded(events, { 锤序: event.hit, 落点: event.zone, 结果: event.fusion || event.label, 断率: event.risk }, 36);
    },
    frame(time, delta, phase, swing) {
      if (!skipNextFrame && phase === 'forge' && delta > 0) addBounded(frames, delta, 1500);
      skipNextFrame = false;
      if (!swing || lastSwing === swing || swing.hit.pressedAt == null) return;
      lastSwing = swing;
      addBounded(swing.hit.buffered ? queuedStarts : starts, time - swing.hit.pressedAt, 120);
    },
    install() {
      const panel = document.createElement('details');
      panel.id = 'device-qa';
      panel.open = true;
      panel.innerHTML = `<summary>真机验收 · ${scenarios[mode]}</summary>
        <p>这里是独立试玩，信用点和藏刀与正常游戏分开。</p>
        <nav aria-label="验收场景">${Object.entries(scenarios).map(([key, label]) => `<a href="?qa=${key}">${label}</a>`).join('')}<a href="?v=2.1">返回正常游戏</a></nav>
        <p>${mode === 'full' ? '从选料玩到收锤、装配和入藏。可以连续玩三炉。' : '在当前刀身点一锤，观察起手、撞击声和结果演出。'}</p>
        <button type="button" class="secondary">生成并复制验收记录</button>
        <textarea hidden readonly aria-label="真机验收记录" spellcheck="false"></textarea>
        <p>绘制提交时间是浏览器测量值。请另记手机型号、内放听感、是否掉帧，以及撞击声和画面是否对得上。</p>`;
      document.querySelector('.footer').before(panel);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) hiddenAt = performance.now();
        else if (hiddenAt != null) {
          if (firstInput != null && !finished) paused += performance.now() - hiddenAt;
          hiddenAt = undefined;
          skipNextFrame = true;
        }
      });
      const button = panel.querySelector('button');
      const output = panel.querySelector('textarea');
      button.addEventListener('click', async () => {
        output.value = JSON.stringify({
          场景: scenarios[mode],
          浏览器: navigator.userAgent,
          视口: [innerWidth, innerHeight],
          直接落锤样本数: starts.length,
          '点按到首个绘制提交 p95 毫秒': p95(starts),
          '排队落锤 p95 毫秒': p95(queuedStarts),
          锻打帧样本数: frames.length,
          '锻打绘制间隔 p95 毫秒': p95(frames),
          完整炉次耗时秒: durations,
          近期锤击: events,
        }, null, 2);
        output.hidden = false;
        output.select();
        try {
          await navigator.clipboard.writeText(output.value);
          button.textContent = '已复制 · 再次点按可更新';
        } catch {
          button.textContent = '记录已生成，可长按复制';
        }
      });
    },
  };
}
