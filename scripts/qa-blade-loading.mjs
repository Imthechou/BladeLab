import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { FITS, buyOre, freshSave, modelCandidates, offers, oreModelId, STORAGE_KEY } from '../forge.js';

const candidate = process.env.QA_ORIGIN || 'http://127.0.0.1:8217/';
const output = process.env.QA_OUTPUT || 'artifacts/blade-loading';
const storageKey = process.env.QA_STORAGE_KEY || STORAGE_KEY;
const network = { offline: false, latency: 70, downloadThroughput: 200000, uploadThroughput: 100000 };
const browser = await chromium.launch({ headless: true,
  args: ['--enable-webgl', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });

async function coldPage() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const session = await page.context().newCDPSession(page);
  await session.send('Network.enable');
  await session.send('Network.setCacheDisabled', { cacheDisabled: true });
  await session.send('Network.emulateNetworkConditions', network);
  return page;
}

function recordRequests(page, errors) {
  const requests = [];
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return requests;
}

async function measure(origin) {
  const errors = [];
  const save = freshSave(975);
  const opened = structuredClone(save);
  buyOre(opened);
  const archive = { phase: 'appraise', id: 1, name: '藏刀回归', grade: '上品', score: 81, fit: 'night',
    model: 'karambit', skin: { ...opened.run.skin, metal: 'pearl', pattern: 'damascus',
      film: 'peacock', fx: 'aurora', levels: { metal: 2, pattern: 2, film: 3, fx: 2 } },
    ore: opened.run.ore, marks: {}, purity: 82, refinement: { quality: 80 } };
  save.collection = [archive];
  const home = await coldPage();
  await home.addInitScript(({ key, save }) => localStorage.setItem(key, JSON.stringify(save)), { key: storageKey, save });
  const firstRequests = recordRequests(home, errors);
  const started = Date.now();
  await home.goto(origin, { waitUntil: 'domcontentloaded' });
  await home.waitForFunction(() => {
    const thumbs = [...document.querySelectorAll('.ore-thumbnail img')];
    return thumbs.length === 3 && thumbs.every(image => image.naturalWidth > 0);
  });
  const oreReadyMs = Date.now() - started;
  const scripts = await home.locator('script[src*="/vendor/three."]').evaluateAll(nodes => nodes.map(node => node.outerHTML).join(''));
  const startup = await home.evaluate(() => performance.getEntriesByType('resource').map(entry => ({
    path: new URL(entry.name).pathname, bytes: entry.encodedBodySize, start: Math.round(entry.startTime),
  })));
  const rendererBytes = startup.filter(entry => /\/vendor\/three\./.test(entry.path)).reduce((sum, entry) => sum + entry.bytes, 0);
  const oreRequests = startup.filter(entry => /\/models\/ore_/.test(entry.path)).map(entry => entry.path.split('/').at(-1));
  await home.waitForTimeout(750);
  const selectionWorkshopRequests = firstRequests.filter(path => /(?:\/(?:molten_sphere|blank_ingot|knife_)|meshopt_decoder)/.test(path));

  await home.locator('#collection').click();
  await home.waitForTimeout(650);
  const vaultClick = await home.evaluate(() => {
    const start = performance.now();
    document.querySelector('.vault-item').click();
    return start;
  });
  await home.waitForSelector('#vault-stage[data-loading="ready"]');
  const vaultPreviewMs = await home.evaluate(async start => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return Math.round(performance.now() - start);
  }, vaultClick);
  await home.locator('#close-vault').click();

  const normal = modelCandidates(opened.run).normal;
  const plannedNames = ['molten_sphere_small', 'blank_ingot_small', `knife_${normal}`];
  const warmStart = await home.evaluate(() => {
    const start = performance.now();
    document.querySelector('[data-action="buy"]').click();
    return start;
  });
  await home.waitForFunction(names => names.every(name => performance.getEntriesByType('resource').some(entry =>
    new URL(entry.name).pathname.endsWith('/' + name + '.glb'))), plannedNames);
  const plannedModels = await home.evaluate(({ start, names }) => names.map(name => {
    const entry = performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname.endsWith('/' + name + '.glb'));
    return { name, requestMs: Math.round(entry.startTime - start), readyMs: Math.round(entry.responseEnd - start) };
  }), { start: warmStart, names: plannedNames });
  const preloadRequests = firstRequests.filter(path => path.includes('/forge-models/'));
  await home.close();

  const page = await coldPage();
  const requests = recordRequests(page, errors);
  const url = new URL('qa-blade-loading.html', origin).href;
  await page.route(url, route => route.fulfill({ contentType: 'text/html',
    body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><canvas style="width:390px;height:330px"></canvas>' +
      scripts,
  }));
  await page.goto(url, { waitUntil: 'load' });
  const models = await page.evaluate(async ({ archive, fit }) => {
    const { ForgeStage } = await import('./stage.js');
    const stage = new ForgeStage(document.querySelector('canvas'));
    stage.reduceMotion = true;
    const rows = [];
    for (const [id, name] of [['molten','molten_sphere_small'], ['blank','blank_ingot_small'], ['straight','knife_straight'], ['karambit','knife_karambit']]) {
      const start = performance.now();
      if (id === archive.model) stage.sync(archive, archive.ore, fit);
      await stage.load(id);
      const readyMs = Math.round(performance.now() - start);
      if (id === archive.model) {
        await new Promise(requestAnimationFrame);
        const gl = stage.renderer.getContext();
        stage.renderer.render(stage.scene, stage.camera);
        gl.finish();
      }
      const resource = performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname.endsWith('/' + name + '.glb'));
      rows.push({ id, bytes: resource?.encodedBodySize, readyMs,
        ...(id === archive.model ? { firstFrameMs: Math.round(performance.now() - start) } : {}) });
    }
    return rows;
  }, { archive, fit: FITS.find(fit => fit.id === 'night') });
  await page.close();
  assert.deepEqual(errors, []);
  return { oreReadyMs, rendererBytes, oreRequests, selectionWorkshopRequests, vaultPreviewMs, plannedModels, preloadRequests, models,
    compactModels: requests.filter(path => path.includes('/forge-models/')),
    legacyModels: requests.filter(path => /\/models\/(?:molten_sphere|blank_ingot|knife_)/.test(path)) };
}

try {
  await mkdir(output, { recursive: true });
  const baseline = process.env.BASELINE_ORIGIN ? await measure(process.env.BASELINE_ORIGIN) : null;
  const current = await measure(candidate);
  assert.deepEqual(current.selectionWorkshopRequests, [], 'ore selection must not compete with workshop asset preloads');
  assert.deepEqual([...current.oreRequests].sort(), offers(freshSave(975).run).map(ore => oreModelId(ore) + '.glb').sort(),
    'only the three offered specimens should load');
  assert.equal(current.preloadRequests.length, 4, 'the vault knife and three planned workshop models should each download once');
  assert.equal(current.compactModels.length, 4);
  assert.deepEqual(current.legacyModels, [], 'Meshopt playback should not fall back to legacy files');
  assert.ok(current.models.every(row => row.bytes > 0 && row.bytes < (['blank', 'molten'].includes(row.id) ? 125000 : 380000)),
    'the native knife atlases and compact workshop meshes must fit their transfer budgets');
  const result = { network, baseline, candidate: current };
  await writeFile(`${output}/loading.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
