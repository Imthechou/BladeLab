import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceHeat, appraise, beginRefining, buyOre, fitOptions, finishForge, fractureRisk, freshSave,
  HEAT, LOT_SIZE, migrateSave, MIN_PRICE, MODELS, offers, REFRESH_PRICE, refreshFittings, restart, strike,
} from '../forge.js';
import { KNIFE_IDS, regionAt } from '../regions.js';

function onAnvil(seed, method = 'good') {
  const save = freshSave(seed);
  save.run.selected = offers(save.run).findIndex(ore => ore.price === MIN_PRICE);
  buyOre(save);
  beginRefining(save.run);
  let blowing = true;
  for (let i = 0; i < 900 && save.run.phase === 'refine'; i++) {
    const heat = save.run.refining;
    if (method !== 'failed' && heat.step === 'molten') {
      if (heat.temperature >= 76 || (method === 'fair' && heat.stable > 1.2)) blowing = false;
      else if (heat.temperature <= 67) blowing = true;
      if (method === 'fair' && heat.stable > 1.2) blowing = false;
    }
    advanceHeat(save.run, 1 / 60, blowing);
  }
  return save;
}

test('browsing batches and opening ore preserve stable offers and charge once', () => {
  const save = freshSave(17);
  const original = offers(save.run);
  assert.deepEqual(offers(save.run), original);
  assert.equal(original.length, LOT_SIZE);
  assert.equal(Math.min(...original.map(ore => ore.price)), MIN_PRICE);
  assert.equal(new Set(original.map(ore => ore.family)).size, 3);
  save.run.batch++;
  assert.equal(offers(save.run)[0].id, 3);
  save.run.selected = 2;
  const wanted = offers(save.run)[2];
  assert.equal(buyOre(save), true);
  assert.equal(save.credits, 76 - wanted.price);
  assert.deepEqual(save.run.ore, wanted);
  assert.equal(buyOre(save), false);
});

test('continuous thermal input reaches molten and cast, with three distinct outcomes', () => {
  for (const [result, purity, stability] of [['good', 12, 12], ['fair', 4, 0], ['failed', -12, -18]]) {
    const { run } = onAnvil(51, result);
    assert.equal(run.phase, 'forge');
    assert.equal(run.refinement.result, result);
    assert.equal(run.purity, Math.min(100, run.ore.purity + purity));
    assert.equal(run.stability, Math.max(0, run.ore.stability + stability));
  }
  const save = freshSave(21);
  buyOre(save);
  beginRefining(save.run);
  advanceHeat(save.run, HEAT.preheat, false);
  assert.equal(save.run.refining.step, 'molten');
  advanceHeat(save.run, .61, false);
  assert.equal(save.run.refining.step, 'cast');
  advanceHeat(save.run, HEAT.cast, false);
  assert.equal(save.run.refinement.result, 'failed');
});

test('first six strikes are safe and give a real silhouette and finish', () => {
  for (let seed = 0; seed < 250; seed++) {
    const { run } = onAnvil(seed);
    assert.equal(finishForge(run), false);
    for (let i = 0; i < 6; i++) {
      assert.equal(fractureRisk(run), 0);
      assert.notEqual(strike(run, 'belly').type, 'break');
    }
    assert.ok(['straight', 'survival', 'bayonet'].includes(run.model));
    assert.notEqual(run.skin.metal, 'raw');
    assert.notEqual(run.skin.pattern, 'none');
    assert.ok(Object.keys(run.marks).length);
    assert.equal(finishForge(run), true);
  }
});

test('same ore and input history reproduce the knife, with higher risk for poorer refining', () => {
  const a = onAnvil(59);
  const b = onAnvil(59);
  const c = onAnvil(59, 'failed');
  for (const zone of ['belly', 'edge', 'tip', 'edge', 'belly', 'edge']) {
    assert.deepEqual(strike(a.run, zone), strike(b.run, zone));
    strike(c.run, zone);
  }
  assert.deepEqual(a.run.skin, b.run.skin);
  assert.ok(fractureRisk(a.run) <= fractureRisk(c.run));
  assert.equal(strike(a.run, 'edge').risk, fractureRisk(b.run));
});

test('three stability bands converge at 30 and the capped risk keeps the anvil open', () => {
  let foundBroken = false;
  let foundSurvivor = false;
  for (const stability of [40, 60, 80]) {
    let previous = 0;
    for (let hit = 1; hit <= 100; hit++) {
      const current = fractureRisk({ hits: hit - 1, stability });
      assert.ok(current >= previous);
      if (hit === 30) assert.equal(current, .5);
      if (hit >= 45) assert.equal(current, .9);
      previous = current;
    }
  }
  for (const hit of [26, 30, 46]) {
    foundBroken = foundSurvivor = false;
    for (let seed = 0; seed < 80; seed++) {
      const { run } = onAnvil(seed);
      run.hits = hit - 1;
      run.model = 'straight';
      const risk = fractureRisk(run);
      const event = strike(run, 'tip');
      assert.equal(event.risk, risk);
      assert.equal(event.hit, hit);
      foundBroken ||= run.phase === 'broken';
      foundSurvivor ||= run.phase === 'forge';
      if (run.phase === 'broken') assert.equal(finishForge(run), false);
      else assert.equal(finishForge(run), true);
    }
    assert.ok(foundBroken && foundSurvivor);
  }
});

test('several hits at one point change real bounded surface data and rare shapes occur', () => {
  const seen = new Set();
  for (let seed = 0; seed < 200; seed++) {
    const { run } = onAnvil(seed);
    while (run.phase === 'forge' && run.hits < 32) {
      const before = JSON.stringify(run.marks);
      const event = strike(run, 'tip', { u: .87, v: .23 });
      if (event.type !== 'break') assert.notEqual(JSON.stringify(run.marks), before);
      if (event.change?.slot === 'model') seen.add(run.model);
    }
    assert.ok(Object.keys(run.marks).length <= 1);
  }
  assert.ok(seen.size >= 8);
});

test('all twelve model IDs have conserved region weights and can cover a grip', () => {
  assert.equal(KNIFE_IDS.length, 12);
  assert.deepEqual([...KNIFE_IDS].sort(), Object.keys(MODELS).filter(id => id !== 'blank').sort());
  for (const model of KNIFE_IDS) {
    assert.ok(regionAt(model, .1, .5).grip > .95);
    assert.ok(regionAt(model, .9, .5).blade > .95);
    for (let i = 0; i <= 10; i++) {
      const { blade, guard, grip } = regionAt(model, i / 10, .6);
      assert.ok(Math.abs(blade + guard + grip - 1) < .00001);
    }
  }
});

test('saved v1 credit, paid ore and archived knives survive migration', () => {
  const legacy = freshSave(40);
  buyOre(legacy);
  legacy.version = 1;
  legacy.run.phase = 'refine';
  legacy.collection = [{ id: 1, name: '旧藏刀', skin: { seed: .23 } }];
  const amount = legacy.credits;
  const bought = legacy.run.ore.id;
  const migrated = migrateSave(legacy);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.credits, amount);
  assert.equal(migrated.run.ore.id, bought);
  assert.equal(migrated.run.refining.step, 'ore');
  assert.equal(migrated.collection[0].name, '旧藏刀');
});

test('refreshing yields three different fittings and appraisal credits the wallet once', () => {
  const save = onAnvil(729);
  for (let i = 0; i < 6; i++) strike(save.run, 'belly');
  finishForge(save.run);
  const old = fitOptions(save.run);
  assert.deepEqual(old.map(fit => fit.role), ['轻巧', '沉稳', '衬纹']);
  assert.equal(refreshFittings(save), true);
  assert.equal(save.credits, 76 - MIN_PRICE - REFRESH_PRICE);
  const options = fitOptions(save.run);
  assert.ok(options.every(fit => !old.includes(fit)));
  assert.equal(refreshFittings(save), false);
  save.run.fit = options[0].id;
  const record = appraise(save);
  assert.equal(record.stats.length, 6);
  assert.equal(appraise(save), null);
  assert.equal(save.credits, 76 - MIN_PRICE - REFRESH_PRICE + record.credit);
  assert.deepEqual(save.collection, [record]);
  save.credits = 1;
  assert.equal(restart(save, 23), true);
  assert.equal(save.credits, MIN_PRICE);
  assert.equal(save.run.phase, 'ore');
});
