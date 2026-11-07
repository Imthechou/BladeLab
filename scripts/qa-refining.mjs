import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { freshSave, buyOre, beginRefining, offers, MIN_PRICE } from '../forge.js';

const root = process.env.QA_ORIGIN || 'http://127.0.0.1:8217/';
const storageKey = process.env.QA_STORAGE_KEY || 'bladelab.forge.1';
const out = process.env.QA_OUTPUT || 'artifacts/refining';
const quick = process.env.QA_QUICK === '1';
await mkdir(out, { recursive: true });
if (process.env.QA_ORIGIN) {
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) {
    try { ready = (await (await fetch(root + '?refining-revision=' + Date.now())).text()).includes('app.js?v=15'); } catch {}
    if (!ready) await new Promise(resolve => setTimeout(resolve, 3000));
  }
  assert.ok(ready, 'published V15 must be active before browser acceptance');
}
const browser = await chromium.launch({ headless: true,
  args: ['--enable-webgl', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
const errors = [], results = [], surfaces = {};
let page;
const mode = () => page.locator('#stage').getAttribute('data-mode');
const shot = name => page.screenshot({ path: `${out}/${name}.png`, animations: 'disabled' });
const stored = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);

async function openFurnace(width = 390, lowWallet = false) {
  await page?.close();
  page = await browser.newPage({ viewport: { width, height: width === 320 ? 740 : 844 },
    deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  // Begin with a valid paid stone, then use the actual input controls for every
  // temperature change and outcome. Reload never overwrites the current save.
  const save = freshSave(975);
  if (lowWallet) save.credits = offers(save.run)[0].price + 2;
  buyOre(save); beginRefining(save.run);
  await page.addInitScript(({ key, save }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(save));
  }, { key: storageKey, save });
  await page.goto(root + '?v=15', { waitUntil: 'load' });
  await page.waitForSelector('#heat-quality');
  assert.equal(await mode(), 'refine');
  assert.equal(await page.locator('#pour-button').isDisabled(), true);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
  return save;
}

async function operate(policy, stopQuality = Infinity) {
  const button = page.locator('#heat-button');
  await button.scrollIntoViewIfNeeded();
  const bounds = await button.boundingBox();
  assert.ok(bounds);
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  let down = false, seenMolten = false, warned = false, resumed = false;
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    const reading = await page.evaluate(() => ({
      mode: document.querySelector('#stage').dataset.mode,
      step: document.querySelector('#heat-step')?.textContent,
      temperature: Number(document.querySelector('#heat-number')?.textContent?.replace('°', '')),
      target: (Number(document.querySelector('#thermo')?.dataset.lower) + Number(document.querySelector('#thermo')?.dataset.upper)) / 2,
      quality: Number(document.querySelector('#heat-quality')?.textContent?.split(' / ')[0]),
      damage: Number(document.querySelector('#heat-damage-value')?.textContent?.replace('%', '')),
      canPour: document.querySelector('#pour-button')?.disabled === false,
      warning: document.querySelector('#stage').dataset.danger === 'true',
    }));
    if (reading.mode !== 'refine') break;
    seenMolten ||= reading.step === '熔球稳温';
    warned ||= reading.warning;
    if (reading.quality >= stopQuality && reading.canPour) {
      if (down) { await page.mouse.up(); down = false; }
      // Auto-pouring can start between the last reading and the real click.
      // Accept that transition, but never force a disabled control.
      try { await page.locator('#pour-button').click({ timeout: 900 }); }
      catch (error) {
        const current = await page.evaluate(() => ({ mode: document.querySelector('#stage').dataset.mode,
          step: document.querySelector('#heat-step')?.textContent }));
        if (current.mode === 'refine' && current.step !== '浇注成坯') throw error;
      }
      await shot(policy + '-pouring');
      await page.waitForFunction(() => document.querySelector('#stage').dataset.mode !== 'refine');
      break;
    }
    if (policy === 'excellent' && reading.quality >= 50 && !resumed) {
      if (down) { await page.mouse.up(); down = false; }
      const before = await stored();
      await page.reload({ waitUntil: 'load' });
      await page.waitForSelector('#heat-quality');
      const after = await stored();
      assert.equal(after.credits, before.credits);
      assert.equal(after.run.ore.figure, before.run.ore.figure);
      assert.ok(after.run.refining.quality >= before.run.refining.quality - 3, 'refresh preserves earned refining quality');
      await page.waitForTimeout(500);
      assert.deepEqual((await stored()).run.refining, after.run.refining, 'loading stays paused until the player resumes');
      assert.equal(await page.locator('#heat-button').innerText(), '按住续炼');
      await shot('excellent-paused-continue');
      resumed = true;
      await page.locator('#heat-button').scrollIntoViewIfNeeded();
      const newBounds = await page.locator('#heat-button').boundingBox();
      await page.mouse.move(newBounds.x + newBounds.width / 2, newBounds.y + newBounds.height / 2);
      await page.mouse.down(); down = true;
      continue;
    }
    let desired;
    if (policy === 'burnt') desired = true;
    else if (policy === 'unmelted') desired = !down && !seenMolten && reading.temperature === 35 && !resumed;
    else if (policy === 'frozen') desired = !seenMolten;
    else if (reading.step === '浇注成坯') desired = false;
    else if (!seenMolten) desired = true;
    else {
      const aim = policy === 'slag' ? 60 : reading.target;
      desired = down ? reading.temperature < aim - .6 : reading.temperature <= aim - 1.3;
    }
    if (policy === 'unmelted' && down) resumed = true;
    if (desired && !down) { await page.mouse.down(); down = true; }
    else if (!desired && down) { await page.mouse.up(); down = false; }
    await page.waitForTimeout(75);
  }
  if (down) await page.mouse.up();
  assert.notEqual(await mode(), 'refine', 'furnace completes without hanging: ' + policy);
  const save = await stored();
  results.push({ policy, phase: save.run.phase, refinement: save.run.refinement, warned });
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(600);
  await shot(policy + '-result');
  return { save, warned, resumed };
}

async function surfacePixels(name) {
  const png = await page.locator('#scene').screenshot({ path: `${out}/${name}-billet.png` });
  return page.evaluate(async base64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + base64; await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96;
    const context = canvas.getContext('2d'); context.drawImage(img, 0, 0, 96, 96);
    return Array.from(context.getImageData(0, 0, 96, 96).data);
  }, png.toString('base64'));
}

try {
  for (const policy of quick ? ['excellent', 'burnt'] : ['poor', 'fair', 'good', 'excellent', 'burnt', 'frozen', 'unmelted', 'slag']) {
    const initial = await openFurnace(policy === 'poor' ? 320 : 390, policy === 'burnt');
    if (policy === 'poor') await shot('320-ready');
    const { save, warned, resumed } = await operate(policy, ({ poor: 26, fair: 47, good: 70, excellent: 91 })[policy]);
    assert.equal(save.credits, initial.credits, 'the furnace cannot charge the paid stone twice');
    assert.deepEqual(save.run.ore, initial.run.ore, 'source mineral identity survives every outcome');
    if (['poor', 'fair', 'good', 'excellent'].includes(policy)) {
      assert.equal(save.run.phase, 'forge');
      assert.equal(save.run.refinement.result, policy);
      assert.ok((await page.locator('.refinement-result').innerText()).includes('纯净'));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
      if (policy === 'excellent') assert.ok(resumed, 'mid-run save was resumed');
      if (policy === 'poor') { await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(250); }
      if (policy === 'poor' || policy === 'excellent') surfaces[policy] = await surfacePixels(policy);
    } else {
      assert.equal(save.run.phase, 'broken');
      assert.equal(save.run.refinement.reason, policy);
      assert.equal(save.collection.length, 0);
      assert.equal(await page.locator('#title').innerText(), '精炼失败');
      assert.equal((await page.locator('.step.current').innerText()).replace(/\s/g, ''), '02精炼');
      assert.equal(await page.locator('[data-action="finish"]').count(), 0);
      if (policy === 'burnt' || policy === 'frozen') assert.ok(warned, 'danger warning precedes material loss');
      await page.reload({ waitUntil: 'load' });
      assert.equal(await page.locator('#title').innerText(), '精炼失败');
      assert.equal((await stored()).run.refinement.reason, policy);
      await page.locator('[data-action="restart"]').click();
      assert.equal(await mode(), 'ore');
      assert.ok((await stored()).credits >= MIN_PRICE, 'a failed low-wallet run can start again');
    }
  }
  if (!quick) {
    let difference = 0, channels = 0;
    for (let i = 0; i < surfaces.poor.length; i++) if (i % 4 !== 3) {
      difference += Math.abs(surfaces.poor[i] - surfaces.excellent[i]); channels++;
    }
    difference /= channels * 255;
    assert.ok(difference > .003, 'same mineral produces visibly different billet surfaces');
    results.push({ surfaceDifference: difference });
  }
  assert.deepEqual(errors, [], 'no JavaScript or WebGL shader errors');
  await writeFile(`${out}/results.json`, JSON.stringify({ ok: true, results }, null, 2));
  console.log(JSON.stringify({ ok: true, results }));
} catch (error) {
  await shot('99-failure').catch(() => {});
  console.error(JSON.stringify({ results, errors: errors.slice(0, 8) }));
  throw error;
} finally { await browser.close(); }
