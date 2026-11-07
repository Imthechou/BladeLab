import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { FITS, LOOKS, buyOre, freshSave } from '../forge.js';

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
const errors = [], samples = [], unreadable = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

try {
  // One real production stage, consistent lighting and camera. Render each
  // slot by itself before checking composition and mineral inheritance.
  const url = new URL('qa-blade-looks.html', origin).href;
  await page.route(url, route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}canvas{width:390px;height:330px;display:block}</style><canvas></canvas>' +
      '<script src="assets/vendor/three.bundle.js"></script><script src="assets/vendor/three.addons.js"></script>',
  }));
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(async ({ run, fit }) => {
    const { ForgeStage } = await import('./stage.js?v=14');
    const stage = new ForgeStage(document.querySelector('canvas'));
    stage.reduceMotion = true;
    const frames = new Map();
    const gl = stage.renderer.getContext();
    window.captureBladeLook = async ({ key, run, compare, angle, time }) => {
      stage.sync(run, run.ore, fit);
      await stage.load(run.model);
      stage.show(run.model);
      stage.turnY = angle;
      await new Promise(requestAnimationFrame);
      stage.active.uniforms.fClock.value = time;
      stage.renderer.render(stage.scene, stage.camera);
      const { width, height } = stage.canvas;
      const rgba = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      frames.set(key, rgba);
      const differences = compare.map(name => {
        const other = frames.get(name);
        let pixels = 0, noticeable = 0, sum = 0;
        // Compare the visible blade rather than the fitted handle or clear canvas.
        for (let i = 0; i < rgba.length; i += 4) {
          if (rgba[i + 3] < 230 || other[i + 3] < 230 || i / 4 % width < width * .49) continue;
          const d = (Math.abs(rgba[i] - other[i]) + Math.abs(rgba[i + 1] - other[i + 1]) + Math.abs(rgba[i + 2] - other[i + 2])) / 3;
          pixels++;
          if (d >= 8) noticeable++;
          sum += d;
        }
        return { from: name, pixels, mean: +(sum / Math.max(1, pixels)).toFixed(3),
          visible: +(noticeable / Math.max(1, pixels)).toFixed(3) };
      });
      return { png: stage.canvas.toDataURL().split(',')[1], differences };
    };
    await stage.load(run.model);
  }, { run: base, fit: FITS.find(fit => fit.id === 'night') });

  async function sample(key, run, compare = [], angle = 0, time = .82) {
    const { png, differences } = await page.evaluate(args => window.captureBladeLook(args), { key, run, compare, angle, time });
    await writeFile(`${out}/${key}.png`, Buffer.from(png, 'base64'));
    const stats = { key, differences };
    samples.push(stats);
    return stats;
  }

  await sample('base', base);
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

  const full = structuredClone(base);
  Object.assign(full.skin, { metal: 'copper', pattern: 'crystal', film: 'peacock', fx: 'vein' });
  for (const slot of Object.keys(LOOKS)) full.skin.levels[slot] = 3;
  await sample('four-slots', full, ['base']);
  const newTint = structuredClone(full);
  newTint.ore.tint = 'garnet';
  assert.ok((await sample('four-slots-garnet', newTint, ['four-slots'])).differences[0].mean > 1);
  const poor = structuredClone(full);
  poor.refinement.quality = 23;
  assert.ok((await sample('four-slots-poor', poor, ['four-slots'])).differences[0].mean > .8);
  const variant = sampleRun('pattern', 'damascus', 1);
  variant.skin.variants.pattern = { id: 'damascus', layout: 2, seed: .816 };
  assert.ok((await sample('damascus-alternate', variant, ['pattern-damascus-1'])).differences[0].mean > 2);
  await sample('four-slots-turned', full, [], .72);
  await sample('four-slots-animation', full, ['four-slots'], 0, 1.58);
  assert.deepEqual(unreadable, [], 'every tier and every pair of first-tier styles must differ');
  assert.deepEqual(errors, []);
  console.log('Real WebGL: 123 appearances, all first-tier pairs, templates, ore tint, refining and four-slot layering');
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify({ samples, unreadable, errors }, null, 2));
  await browser.close();
}
