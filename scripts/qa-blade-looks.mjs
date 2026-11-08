import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { FITS, LOOKS, appraise, buyOre, freshSave } from '../forge.js';
import { KNIFE_IDS } from '../regions.js';

const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:8217/';
const out = process.env.QA_OUTPUT || 'artifacts/blade-looks';
await mkdir(out, { recursive: true });

const save = freshSave(975);
buyOre(save);
const base = save.run;
Object.assign(base, { phase: 'fit', model: 'straight', hits: 12, purity: 82, refinement: { quality: 72 } });
Object.assign(base.ore, { family: 'river', material: 'river_gray', tint: 'azure', clarity: 80 });
Object.assign(base.skin, { metal: 'silver', levels: { metal: 1, pattern: 0, film: 0, fx: 0 }, variants: {} });
const variants = Object.keys(LOOKS).map(slot => [slot, Object.keys(LOOKS[slot]).filter(id => id !== 'none' && id !== 'raw')]);

function sampleRun(slot, id, tier) {
  const run = structuredClone(base);
  run.skin[slot] = id;
  run.skin.levels[slot] = tier;
  run.skin.variants[slot] = { id, layout: 1, seed: .473 };
  return run;
}

const browser = await chromium.launch({ headless: true,
  args: ['--enable-webgl', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const errors = [], samples = [], unreadable = [], modelRequests = [], roughness = {};
page.on('request', request => {
  if (new URL(request.url()).pathname.endsWith('.glb')) modelRequests.push(request.url());
});
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

try {
  // One real production stage, consistent lighting and camera. Render each
  // slot by itself before checking composition and mineral inheritance.
  const url = new URL('qa-blade-looks.html', origin).href;
  await page.route(url, route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}canvas{width:390px;height:330px;display:block}</style><canvas></canvas>' +
      '<script src="assets/vendor/three.runtime.js?v=18"></script>',
  }));
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(async ({ run, kits }) => {
    const { ForgeStage } = await import('./stage.js?v=18');
    const stage = new ForgeStage(document.querySelector('canvas'));
    stage.reduceMotion = true;
    const frames = new Map();
    const gl = stage.renderer.getContext();
    async function show(run, kit, close, angle, time) {
      stage.sync(run, run.ore, kits.find(item => item.id === kit));
      await stage.load(run.model);
      stage.show(run.model);
      stage.setGripFocus(close);
      stage.turnY = angle;
      await new Promise(requestAnimationFrame);
      stage.active.uniforms.fClock.value = time;
    }
    function readFrame() {
      const drawStart = performance.now();
      stage.renderer.render(stage.scene, stage.camera);
      const { width, height } = stage.canvas;
      const rgba = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      const drawMs = +(performance.now() - drawStart).toFixed(2);
      return { rgba, width, drawMs };
    }
    window.captureBladeLook = async ({ key, run, compare, angle, time, kit = 'night', close = false, part = close ? 'whole' : 'blade' }) => {
      await show(run, kit, close, angle, time);
      if (run.phase === 'forge') stage.anvil.visible = stage.hammer.visible = false;
      const { rgba, width, drawMs } = readFrame();
      frames.set(key, rgba);
      const differences = compare.map(name => {
        const other = frames.get(name);
        let pixels = 0, noticeable = 0, sum = 0;
        for (let i = 0; i < rgba.length; i += 4) {
          const x = i / 4 % width / width;
          if (rgba[i + 3] < 230 || other[i + 3] < 230 || (part === 'blade' && x < .54) || (part === 'grip' && x > .40)) continue;
          const d = (Math.abs(rgba[i] - other[i]) + Math.abs(rgba[i + 1] - other[i + 1]) + Math.abs(rgba[i + 2] - other[i + 2])) / 3;
          pixels++;
          if (d >= 8) noticeable++;
          sum += d;
        }
        return { from: name, pixels, mean: +(sum / Math.max(1, pixels)).toFixed(3),
          visible: +(noticeable / Math.max(1, pixels)).toFixed(3) };
      });
      return { png: stage.canvas.toDataURL().split(',')[1], differences, drawMs, calls: stage.renderer.info.render.calls,
        programs: stage.renderer.info.programs.length, hardware: Boolean(stage.active.hardware?.visible) };
    };
    window.sampleRoughness = async ({ run, qualities }) => {
      await show(run, 'night', false, 0, .82);
      const material = stage.mesh.material;
      const shader = material.onBeforeCompile, key = material.customProgramCacheKey;
      material.onBeforeCompile = program => {
        shader(program);
        program.fragmentShader = program.fragmentShader.replace('#include <opaque_fragment>',
          'outgoingLight = vec3(forgeRough);\n#include <opaque_fragment>');
      };
      material.customProgramCacheKey = () => key() + '-qa-roughness';
      material.toneMapped = false;
      material.needsUpdate = true;
      const results = [];
      try {
        for (const quality of qualities) {
          await show({ ...run, refinement: { quality } }, 'night', false, 0, .82);
          const { rgba, width } = readFrame();
          let total = 0, pixels = 0;
          for (let i = 0; i < rgba.length; i += 4) {
            if (rgba[i + 3] < 230 || i / 4 % width < width * .57) continue;
            const value = rgba[i] / 255;
            total += value <= .04045 ? value / 12.92 : Math.pow((value + .055) / 1.055, 2.4);
            pixels++;
          }
          results.push({ quality, pixels, mean: +(total / pixels).toFixed(4) });
        }
      } finally {
        material.onBeforeCompile = shader;
        material.customProgramCacheKey = key;
        material.toneMapped = true;
        material.needsUpdate = true;
      }
      return results;
    };
    await stage.load(run.model);
  }, { run: base, kits: FITS });

  async function sample(key, run, compare = [], angle = 0, time = .82, options = {}) {
    const { png, ...render } = await page.evaluate(args => window.captureBladeLook(args), { key, run, compare, angle, time, ...options });
    await writeFile(`${out}/${key}.png`, Buffer.from(png, 'base64'));
    const stats = { key, ...render };
    samples.push(stats);
    return stats;
  }

  const reference = await sample('base', base);
  assert.deepEqual(errors, [], 'reference blade shader must compile');
  const bare = structuredClone(base);
  bare.skin.metal = 'raw';
  await sample('raw', bare);
  const firstTier = { metal: [], pattern: [], film: [], fx: [] };
  for (const [slot, ids] of variants) {
    for (const id of ids) {
      for (const tier of [1, 2, 3]) {
        const key = `${slot}-${id}-${tier}`;
        const compare = tier === 1 ? [slot === 'metal' ? 'raw' : 'base', ...firstTier[slot]] : [`${slot}-${id}-${tier - 1}`];
        const stats = await sample(key, sampleRun(slot, id, tier), compare);
        for (const difference of stats.differences) {
          if (difference.pixels <= 500 || difference.mean < .12) unreadable.push({ key, ...difference });
        }
        if (tier === 1) firstTier[slot].push(key);
      }
    }
  }
  assert.equal(samples.length - 2, 123);
  assert.equal(modelRequests.length, 1, 'changing finish and tier must reuse the loaded model');
  assert.ok(samples.every(row => row.programs === reference.programs), 'finish changes must reuse the same shader program');

  const full = structuredClone(base);
  Object.assign(full.skin, { metal: 'copper', pattern: 'crystal', film: 'peacock', fx: 'vein' });
  for (const slot of Object.keys(LOOKS)) full.skin.levels[slot] = 3;
  await sample('four-slots', full, ['base']);
  const withoutPattern = structuredClone(full);
  withoutPattern.skin.pattern = 'none';
  withoutPattern.skin.levels.pattern = 0;
  assert.ok((await sample('four-slots-without-pattern', withoutPattern, ['four-slots'])).differences[0].mean > 2,
    'the stacked film and effect must leave the pattern visible');
  const newTint = structuredClone(full);
  newTint.ore.tint = 'garnet';
  assert.ok((await sample('four-slots-garnet', newTint, ['four-slots'])).differences[0].mean > 1);
  const poor = structuredClone(full);
  poor.refinement.quality = 23;
  assert.ok((await sample('four-slots-poor', poor, ['four-slots'])).differences[0].mean > .8);
  const variant = sampleRun('pattern', 'damascus', 1);
  variant.skin.variants.pattern = { id: 'damascus', layout: 2, seed: .816 };
  assert.ok((await sample('damascus-alternate', variant, ['pattern-damascus-1'])).differences[0].mean > 2);
  const doppler = sampleRun('film', 'doppler', 3);
  doppler.skin.variants.film = { id: 'doppler', layout: 0, seed: .076 };
  assert.ok((await sample('doppler-alternate', doppler, ['film-doppler-3'])).differences[0].mean > 2);
  const worn = sampleRun('film', 'oxide', 3);
  worn.hits = 24;
  worn.marks = Object.fromEntries([13, 14, 15, 16, 39, 40, 41, 42, 62, 63, 64].map(index => [index, 15]));
  assert.ok((await sample('oxide-worn', worn, ['film-oxide-3'])).differences[0].mean > .25);
  await sample('four-slots-turned', full, [], .72);
  await sample('four-slots-animation', full, ['four-slots'], 0, 1.58);
  for (const id of variants.find(([slot]) => slot === 'fx')[1]) {
    const frame = await sample('moving-' + id, sampleRun('fx', id, 3), ['fx-' + id + '-3'], 0, 1.58);
    assert.ok(frame.differences[0].mean > .12, id + ' must visibly animate');
  }
  for (const model of KNIFE_IDS) {
    const shape = await sample('model-' + model, { ...full, model }, [], .18);
    assert.ok(shape.hardware && shape.calls <= 2, model + ' should fit its hardware in one draw');
  }
  const handles = [];
  for (const { id } of FITS) {
    const key = 'grip-' + id;
    const row = await sample(key, full, handles, 0, .82, { kit: id, close: true });
    assert.ok(row.hardware && row.differences.every(pair => pair.pixels > 2000 && pair.mean > 2), id + ' grip material');
    handles.push(key);
  }
  const forge = { ...full, phase: 'forge', seed: undefined };
  const forged = await sample('whole-knife-forged', forge, [], 0, .82, { part: 'grip' });
  assert.equal(forged.hardware, false, 'forge must ignore a fitting passed in from a prior view');
  for (const [slot, empty] of Object.entries({ metal: 'raw', pattern: 'none', film: 'none', fx: 'none' })) {
    const without = { ...forge, skin: { ...forge.skin, [slot]: empty } };
    const { differences: [change] } = await sample('forged-without-' + slot, without, ['whole-knife-forged'], 0, .82, { part: 'grip' });
    assert.ok(change.pixels > 500 && change.mean > .30, slot + ' must be visible on the unassembled handle');
  }
  for (const [pattern, film, fx] of [['damascus', 'rainbow', 'aurora'], ['strata', 'verdigris', 'arc']]) {
    const stack = { ...full, skin: { ...full.skin, pattern, film, fx } };
    const key = 'stack-' + film;
    await sample(key, stack);
    const without = { ...stack, skin: { ...stack.skin, pattern: 'none' } };
    const row = await sample(key + '-without-pattern', without, [key]);
    assert.ok(row.differences[0].mean > 2, film + ' must preserve engraving in a four-slot stack');
  }
  const bareFitting = await sample('before-fitting', full, [], 0, .82, { kit: null });
  assert.equal(bareFitting.hardware, false);
  const assembled = await sample('assembled', { ...full, fit: 'walnut' }, ['before-fitting'], 0, .82, { kit: 'walnut' });
  assert.ok(assembled.hardware);
  assert.equal(assembled.differences[0].mean, 0, 'selecting a grip must leave the blade pixels identical');
  const removed = await sample('fitting-removed', full, ['before-fitting', 'assembled'], 0, .82, { kit: null, part: 'grip' });
  assert.equal(removed.hardware, false);
  assert.equal(removed.differences[0].mean, 0, 'removing a grip must restore the forged handle');
  assert.ok(removed.differences[1].mean > 2, 'selecting a grip must visibly replace the handle');
  const saved = freshSave(975);
  saved.run = { ...full, fit: 'walnut' };
  const record = appraise(saved);
  const recalled = await sample('recalled', { ...JSON.parse(JSON.stringify(record)), phase: 'fit' }, ['assembled'], 0, .82, { kit: record.fit });
  assert.equal(recalled.differences[0].mean, 0, 'recalled surface must match the assembled blade under identical light');
  for (const [name, recipe] of Object.entries({ silver: base, pearl: sampleRun('metal', 'pearl', 1),
    polishedFilm: sampleRun('film', 'silverline', 3), matteFilm: sampleRun('film', 'ceramic', 3) })) {
    roughness[name] = await page.evaluate(args => window.sampleRoughness(args), { run: recipe, qualities: [24, 52, 73, 94] });
    assert.ok(roughness[name].every((row, index, rows) => row.pixels > 1000 && (index === 0 || row.mean < rows[index - 1].mean - .01)),
      name + ' must get finer through all four refinement bands');
  }
  assert.ok(roughness.pearl[3].mean > roughness.silver[3].mean + .08, 'high quality pearl steel should remain satin');
  assert.ok(roughness.matteFilm[3].mean > roughness.polishedFilm[3].mean + .06, 'high quality films should retain their finish');
  assert.deepEqual(unreadable, [], 'every tier and every pair of first-tier styles must differ');
  assert.deepEqual(errors, []);
  console.log('Real WebGL: 123 appearances, 12 animated effects and knife shapes, whole-knife forging, six grip-only fittings and archive parity');
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify({ samples, roughness, unreadable, errors }, null, 2));
  await browser.close();
}
