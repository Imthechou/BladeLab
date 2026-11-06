import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { freshSave, buyOre, beginRefining, advanceHeat, heatBand, strike, finishForge, fitOptions, appraise } from '../forge.js';

const out = process.env.QA_OUTPUT || 'artifacts/performance';
const roots = { baseline: process.env.BASELINE_ORIGIN || 'http://127.0.0.1:8218/', candidate: process.env.QA_ORIGIN || 'http://127.0.0.1:8217/' };
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true,
  args: ['--enable-webgl', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
const errors = [], results = [];
const quantile = (array, percentile) => {
  const ordered = [...array].sort((a, b) => a - b);
  return ordered.length ? ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * percentile))] : 0;
};

function refinedSave() {
  const save = freshSave(975); buyOre(save); beginRefining(save.run);
  let down = true;
  for (let i = 0; i < 1800 && save.run.phase === 'refine'; i++) {
    const h = save.run.refining, aim = heatBand(h).center;
    if (h.step === 'molten') {
      if (h.temperature + h.draft * 3 > aim + 1) down = false;
      else if (h.temperature + h.draft * 3 < aim - 1) down = true;
    }
    advanceHeat(save.run, 1 / 60, down);
  }
  return save;
}
const archive = refinedSave();
for (let i = 0; i < 6; i++) strike(archive.run, 'belly');
finishForge(archive.run); archive.run.fit = fitOptions(archive.run)[0].id; appraise(archive);

function fixture(phase) {
  const save = phase === 'forge' ? refinedSave() : freshSave(975);
  if (phase === 'refine') { buyOre(save); beginRefining(save.run); }
  save.count = 20;
  save.collection = Array.from({ length: 20 }, (_, i) => ({ ...structuredClone(archive.run.record), id: i + 1 }));
  return save;
}

async function measure(version, phase, width) {
  const page = await browser.newPage({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 2,
    isMobile: width < 600, hasTouch: true });
  page.on('pageerror', error => errors.push(version + ': ' + error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(version + ': ' + message.text()); });
  const models = new Set();
  page.on('response', response => { if (/\.glb(?:\?|$)/.test(response.url())) models.add(response.url().split('/').at(-1)); });
  await page.addInitScript(save => {
    localStorage.setItem('bladelab.forge.1', JSON.stringify(save));
    const p = window.__frameProfile = { active: false, frames: [], costs: [], inputs: [], writes: 0, textWrites: 0,
      draws: 0, saves: 0, saveMs: 0, serializeMs: 0, longTasks: [], renderer: '' };
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = function (callback) {
      return raf.call(window, time => {
        const start = performance.now();
        if (p.active && callback.name === 'frame') p.frames.push(start);
        callback(time);
        if (p.active && ['frame', 'heatFrame'].includes(callback.name)) p.costs.push({ name: callback.name, ms: performance.now() - start });
      });
    };
    const context = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args) {
      const gl = context.apply(this, args);
      if (gl && args[0].startsWith('webgl') && !gl.__profiled) {
        gl.__profiled = true;
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        p.renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'WebGL';
        for (const method of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
          const original = gl[method];
          gl[method] = function (...values) { if (p.active) p.draws++; return original.apply(this, values); };
        }
      }
      return gl;
    };
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (...args) {
      const start = performance.now(); const result = write.apply(this, args);
      if (p.active) { p.saves++; p.saveMs += performance.now() - start; }
      return result;
    };
    const stringify = JSON.stringify;
    JSON.stringify = function (...args) {
      const start = performance.now(), result = stringify.apply(this, args);
      if (p.active && args[0]?.run && Array.isArray(args[0]?.collection)) p.serializeMs += performance.now() - start;
      return result;
    };
    try { new PerformanceObserver(list => { if (p.active) p.longTasks.push(...list.getEntries().map(e => e.duration)); }).observe({ type: 'longtask', buffered: false }); } catch {}
    document.addEventListener('DOMContentLoaded', () => {
      new MutationObserver(records => {
        if (!p.active) return;
        for (const record of records) {
          const node = record.target.nodeType === 1 ? record.target : record.target.parentElement;
          if (!node?.closest('#readout, #actions')) continue;
          p.writes++;
          if (record.type === 'childList' || record.type === 'characterData') p.textWrites++;
        }
      }).observe(document.body, { attributes: true, childList: true, characterData: true, subtree: true });
    });
    for (const type of ['pointerdown', 'pointerup', 'keydown']) document.addEventListener(type, event => {
      if (!p.active || !['scene', 'heat-button'].includes(event.target.id)) return;
      const pressed = performance.now();
      raf.call(window, () => { if (p.active) p.inputs.push(performance.now() - pressed); });
    }, true);
  }, fixture(phase));
  const session = await page.context().newCDPSession(page);
  await session.send('Performance.enable');
  const opened = Date.now();
  await page.goto(roots[version], { waitUntil: 'load' });
  await page.waitForFunction(expected => document.querySelector('#stage')?.dataset.mode === expected, phase, { timeout: 20000 });
  if (phase === 'ore') await page.waitForFunction(() => [...document.querySelectorAll('.ore-thumbnail img')].every(img => img.naturalWidth > 0));
  else await page.waitForSelector(phase === 'refine' ? '#heat-button' : '#hit-count');
  await page.waitForTimeout(2200);
  assert.equal(await page.locator('#stage').getAttribute('data-mode'), phase);
  const startupMs = Date.now() - opened;
  const metrics = async () => Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const before = await metrics();
  const started = Date.now();
  await page.evaluate(() => { window.__frameProfile.active = true; });
  if (phase === 'refine') {
    await page.locator('#heat-button').scrollIntoViewIfNeeded();
    const rect = await page.locator('#heat-button').boundingBox();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    let down = false;
    while (Date.now() - started < 8500) {
      const state = await page.evaluate(() => ({
        phase: document.querySelector('#stage').dataset.mode, step: document.querySelector('#heat-step')?.textContent,
        t: Number(document.querySelector('#heat-number')?.textContent.replace('°', '')),
        aim: (Number(document.querySelector('#thermo')?.dataset.lower) + Number(document.querySelector('#thermo')?.dataset.upper)) / 2,
      }));
      assert.equal(state.phase, 'refine', 'profile must not compare a failed furnace with a working one');
      const desired = state.step === '原石升温' || (down ? state.t < state.aim - .6 : state.t <= state.aim - 1.3);
      if (desired && !down) { await page.mouse.down(); down = true; }
      else if (!desired && down) { await page.mouse.up(); down = false; }
      await page.waitForTimeout(75);
    }
    if (down) await page.mouse.up();
  } else if (phase === 'forge') {
    await page.locator('#scene').focus();
    for (let i = 0; i < 6; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(650); }
    assert.equal(await page.locator('#hit-count').innerText(), '6 锤');
    await page.waitForTimeout(600);
  } else {
    await page.waitForTimeout(2500);
  }
  await page.evaluate(() => { window.__frameProfile.active = false; });
  const seconds = (Date.now() - started) / 1000, after = await metrics();
  const profile = await page.evaluate(() => ({ ...window.__frameProfile,
    scale: document.querySelector('#scene').width / document.querySelector('#scene').clientWidth }));
  const deltas = profile.frames.slice(1).map((v, i) => v - profile.frames[i]);
  const heatCosts = profile.costs.filter(c => c.name === 'heatFrame').map(c => c.ms);
  const frameCosts = profile.costs.filter(c => c.name === 'frame').map(c => c.ms);
  const result = { version, phase, width, seconds, startupMs, models: models.size,
    drawsPerSecond: profile.draws / seconds, textWritesPerSecond: profile.textWrites / seconds,
    mutationsPerSecond: profile.writes / seconds, frameP95Ms: quantile(deltas, .95), frameCpuP95Ms: quantile(frameCosts, .95),
    heatCpuP95Ms: quantile(heatCosts, .95), inputP95Ms: quantile(profile.inputs, .95), inputSamples: profile.inputs.length,
    layouts: after.LayoutCount - before.LayoutCount, layoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000,
    scriptMs: (after.ScriptDuration - before.ScriptDuration) * 1000, saves: profile.saves,
    saveMs: profile.saveMs, serializeMs: profile.serializeMs, longTasks: profile.longTasks.length,
    longTaskMax: Math.max(0, ...profile.longTasks), scale: profile.scale, renderer: profile.renderer };
  if (version === 'candidate') await page.screenshot({ path: `${out}/${phase}-${width}.png` });
  await page.close();
  results.push(result);
  console.log(JSON.stringify(result));
}

try {
  for (const width of [390, 1280]) for (const phase of ['ore', 'refine', 'forge']) {
    await measure('baseline', phase, width);
    await measure('candidate', phase, width);
  }
  const comparisons = results.filter(r => r.version === 'candidate').map(candidate => {
    const base = results.find(b => b.version === 'baseline' && b.phase === candidate.phase && b.width === candidate.width);
    return { phase: candidate.phase, width: candidate.width, textWorkRatio: candidate.textWritesPerSecond / (base.textWritesPerSecond || 1),
      drawWorkRatio: candidate.drawsPerSecond / (base.drawsPerSecond || 1), frameP95Ratio: candidate.frameP95Ms / (base.frameP95Ms || 1) };
  });
  for (const comparison of comparisons) {
    if (comparison.phase === 'refine') assert.ok(comparison.textWorkRatio < .6, 'reduce repeated panel writes: ' + JSON.stringify(comparison));
    if (comparison.phase === 'ore') assert.ok(comparison.drawWorkRatio < .3, 'static stone should not redraw continuously');
  }
  assert.deepEqual(errors, [], 'no JavaScript or shader errors while profiling');
  await writeFile(`${out}/comparison.json`, JSON.stringify({ ok: true, baseline: '7a2c342', results, comparisons }, null, 2));
} finally { await browser.close(); }
