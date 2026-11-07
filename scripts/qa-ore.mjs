import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const output = process.env.QA_OUTPUT || 'artifacts/ore-mobile';
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:8217/';
const storageKey=process.env.QA_STORAGE_KEY || 'bladelab.forge.1';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true, reducedMotion: 'no-preference',
});
const errors = [];
page.on('pageerror', error => errors.push('JS: ' + error.message));
page.on('console', msg => {
  if (msg.type() === 'error') errors.push('Console: ' + msg.text());
});
const image = name => page.screenshot({ path: `${output}/${name}.png`, animations: 'disabled' });
const step = () => page.locator('#stage').getAttribute('data-mode');
const overflow = async () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
try {
  await page.goto(origin+'?v=16', { waitUntil: 'load' });
  await page.waitForSelector('.ore-grid .ore-card');
  await page.waitForFunction(()=>[...document.querySelectorAll('.ore-thumbnail img')].every(img=>img.naturalWidth>0));
  await page.waitForTimeout(600);
  assert.equal(await step(), 'ore');
  assert.equal(await page.locator('.ore-card').count(), 3);
  assert.ok((await overflow()) <= 2, 'selection causes horizontal overflow');
  await image('01-inspect-390');
  for(const size of [{width:320,height:740},{width:1280,height:900}]){
    await page.setViewportSize(size);await page.waitForTimeout(200);
    assert.ok((await overflow())<=2,'inspection overflow '+size.width);
    const button=await page.locator('[data-action="buy"]').boundingBox();
    assert.ok(button && button.x>=0 && button.x+button.width<=size.width+1);
    await image('01-layout-'+size.width);
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('.ore-card').nth(1).click();
  await page.waitForTimeout(240);
  await page.evaluate(() => scrollTo(0,0));
  await image('01b-second-stone-390');
  await page.locator('.ore-card').nth(2).click();
  await page.waitForTimeout(240);
  await page.evaluate(() => scrollTo(0,0));
  await image('01c-third-stone-390');
  await page.locator('.ore-card').nth(1).click();
  assert.match(await page.locator('#ore-position').innerText(), /2 \/ 3/);
  const freeBalance=Number(await page.locator('#credits').innerText());
  assert.equal(await page.locator('[data-action="inspect-light"]').count(),1,'only flashlight inspection remains');
  assert.equal(await page.locator('[data-action="inspect-light"][data-id="side"]').count(),0);
  await page.locator('[data-action="inspect-light"][data-id="lamp"]').click();
  await page.waitForTimeout(350);
  await image('01e-mineral-lamp');
  await page.locator('[data-action="tap-ore"]').click();
  assert.ok((await page.locator('#inspection-note').innerText()).includes('叩声'));
  assert.equal(Number(await page.locator('#credits').innerText()),freeBalance);
  await page.locator('[data-action="window-ore"]').click();
  assert.equal(Number(await page.locator('#credits').innerText()),freeBalance-3);
  assert.ok(await page.locator('[data-action="window-ore"]').isDisabled());
  assert.equal(await page.locator('#ore-purity').count(),0,'window must not disclose exact purity');
  await page.waitForTimeout(500);await image('01f-paid-window');
  await page.reload({waitUntil:'load'});
  await page.waitForFunction(()=>[...document.querySelectorAll('.ore-thumbnail img')].every(img=>img.naturalWidth>0));
  assert.equal(Number(await page.locator('#credits').innerText()),freeBalance-3);
  assert.ok(await page.locator('[data-action="window-ore"]').isDisabled());
  const paid = Number((await page.locator('[data-action="buy"]').innerText()).match(/(\d+) CR/)?.[1]);
  const before = Number(await page.locator('#credits').innerText());
  assert.ok(paid >= 14 && paid <= 40);
  await page.locator('[data-action="buy"]').click();
  assert.equal(await step(), 'reveal');
  await page.waitForSelector('.ore-result', { timeout: 7000 });
  assert.equal(Number(await page.locator('#credits').innerText()), before - paid);
  assert.equal(await page.locator('.ore-grade').count(), 1);
  await page.waitForTimeout(1100);
  await image('02-split-reveal-390');

  await page.setViewportSize({ width: 375, height: 812 });
  assert.ok((await overflow()) <= 2, 'reveal causes horizontal overflow at 375px');
  await image('03-split-reveal-375');
  await page.locator('[data-action="preview-mineral"]').click();
  assert.equal(await page.locator('[data-action="preview-mineral"]').getAttribute('aria-pressed'),'true');
  await page.waitForTimeout(700);await image('03b-source-steel-375');
  await page.locator('[data-action="preview-mineral"]').click();
  assert.equal(await page.locator('[data-action="preview-mineral"]').getAttribute('aria-pressed'),'false');
  const source=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).run.ore,storageKey);
  await page.locator('[data-action="to-refine"]').click();
  assert.equal(await step(), 'refine');
  await image('04-refining-375');

  // Hold/release the actual HTML button; regulate heat from what a player sees.
  const heat = page.locator('#heat-button');
  const rect = await heat.boundingBox();
  assert.ok(rect, 'furnace button visible');
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  let down = false;
  for (let n = 0; n < 310 && await step() === 'refine'; n++) {
    // A cast can finish between two DOM reads; sample phase and temperature atomically.
    const reading = await page.evaluate(() => ({
      mode: document.querySelector('#stage')?.dataset.mode,
      phase: document.querySelector('#heat-step')?.textContent ?? '',
      temperature: Number(document.querySelector('#heat-number')?.textContent?.replace('°', '') ?? NaN),
      target: (Number(document.querySelector('#thermo')?.dataset.lower) + Number(document.querySelector('#thermo')?.dataset.upper)) / 2,
    }));
    if (reading.mode !== 'refine') break;
    const desired = reading.phase === '原石升温' ||
      (reading.phase === '熔球稳温' && (down ? reading.temperature < reading.target - .6 : reading.temperature <= reading.target - 1.3));
    if (desired && !down) { await page.mouse.down(); down = true; }
    else if (!desired && down) { await page.mouse.up(); down = false; }
    await page.waitForTimeout(75);
  }
  if (down) await page.mouse.up();
  assert.equal(await step(), 'forge', 'furnace should reach the anvil through real controls');
  assert.ok((await overflow()) <= 2, 'forge causes horizontal overflow');

  // The first strike uses real touch; keyboard input completes a reliable QA path.
  const stage = page.locator('#scene');
  const box = await stage.boundingBox();
  assert.ok(box);
  await page.touchscreen.tap(box.x + box.width * .70, box.y + box.height * .51);
  await page.waitForTimeout(470);
  await stage.focus();
  while (await page.locator('#hit-count').innerText() !== '6 锤') {
    const hit = Number((await page.locator('#hit-count').innerText()).split(' ')[0]);
    assert.ok(hit <= 6, 'hits must advance');
    await page.keyboard.press('Space');
    await page.waitForTimeout(460);
  }
  await image('05-anvil-375');
  await page.locator('[data-action="finish"]').click();
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.mode === 'fit', { timeout: 6000 });
  await page.locator('.fit-card').first().click();
  await page.locator('#grip-focus').click();
  assert.equal(await page.locator('#grip-focus').getAttribute('aria-pressed'), 'true');
  await page.waitForTimeout(250);
  await image('05b-fitted-grip-375');
  await page.locator('#grip-focus').click();
  assert.equal(await page.locator('#grip-focus').getAttribute('aria-pressed'), 'false');
  await page.locator('[data-action="appraise"]').click();
  assert.equal(await step(), 'appraise');
  await image('06-appraised-375');
  const archived=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).collection[0],storageKey);
  assert.equal(archived.ore.material,source.material);assert.equal(archived.ore.figure,source.figure);
  assert.equal(archived.ore.window,true);
  for(const key of ['tint','exposure','clarity'])assert.equal(archived.ore[key],source[key],key+' survives the complete journey');
  await page.reload({waitUntil:'load'});await page.waitForTimeout(600);
  assert.equal(await step(),'appraise');
  await page.locator('#collection').click();
  assert.ok((await page.locator('#vault-list .brief').count()) >= 1);
  if (await page.locator('#vault-stage').count()) {
    await page.locator('#vault-list [data-blade]').first().click();
    await page.locator('#vault-stage #scene').waitFor();
    assert.match(await page.locator('#vault-looks').innerText(), / I/);
    await page.waitForTimeout(400);
    await image('07-vault-375');
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).collection[0].skin, storageKey), archived.skin);
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).collection[0].fit, storageKey), archived.fit);
  }
  await page.locator('#close-vault').click();
  await page.locator('#stage #scene').waitFor();
  const glStatus = await page.locator('#stage-state').innerText();
  assert.ok(!glStatus.includes('3D 暂不可用'), '3D did not initialize');
  assert.deepEqual(errors, [], 'browser/GLSL console errors');
  console.log(JSON.stringify({ ok: true, viewports: ['320x740','390x844','375x812','1280x900'], openedPrice: paid, finalCredits: await page.locator('#credits').innerText(), errors, screenshots: output }));
} catch (error) {
  await image('99-failure').catch(() => {});
  console.error('Journey error:', error);
  throw error;
} finally {
  if (errors.length) console.error(JSON.stringify({ errors: errors.slice(0, 8), count: errors.length }));
  await browser.close();
}
