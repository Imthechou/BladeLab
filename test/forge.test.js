import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appraise, buyOre, fitOptions, finishForge, fractureRisk, freshSave, MAX_STRIKES, MIN_PRICE,
  offers, REFRESH_PRICE, refine, refreshFittings, restart, strike,
} from '../forge.js';

function onAnvil(seed, temperature = 71) {
  const save = freshSave(seed);
  buyOre(save);
  save.run.phase = 'refine';
  refine(save.run, temperature);
  return save;
}

test('browsing batches and opening ore preserve stable offers and charge once', () => {
  const save = freshSave(17);
  const original = offers(save.run);
  assert.deepEqual(offers(save.run), original);
  assert.equal(original[0].price, MIN_PRICE);
  save.run.batch++;
  assert.equal(offers(save.run)[0].id, 5);
  save.run.selected = 2;
  const wanted = offers(save.run)[2];
  assert.equal(buyOre(save), true);
  assert.equal(save.credits, 76 - wanted.price);
  assert.deepEqual(save.run.ore, wanted);
  assert.equal(buyOre(save), false);
});

test('first six strikes are safe and give a real silhouette and finish', () => {
  for (let seed = 0; seed < 250; seed++) {
    const { run } = onAnvil(seed);
    assert.equal(finishForge(run), false);
    for (let i = 0; i < 6; i++) {
      assert.equal(fractureRisk(run), 0);
      assert.notEqual(strike(run, 'belly').type, 'break');
    }
    assert.equal(run.model, 'straight');
    assert.notEqual(run.skin.metal, 'raw');
    assert.notEqual(run.skin.pattern, 'none');
    assert.equal(finishForge(run), true);
  }
});

test('same ore and input history reproduce the knife, with higher risk for poorer refining', () => {
  const a = onAnvil(59);
  const b = onAnvil(59);
  const c = onAnvil(59, 100);
  for (const zone of ['belly', 'edge', 'tip', 'edge', 'belly', 'edge']) {
    assert.deepEqual(strike(a.run, zone), strike(b.run, zone));
    strike(c.run, zone);
  }
  assert.deepEqual(a.run.skin, b.run.skin);
  assert.ok(fractureRisk(a.run) < fractureRisk(c.run));
  assert.equal(strike(a.run, 'edge').risk, fractureRisk(b.run));
});

test('higher risks can break the blade and a surviving run has a bounded hammer count', () => {
  let foundBroken = false;
  let foundSurvivor = false;
  let changedShape = 0;
  for (let seed = 0; seed < 650; seed++) {
    const { run } = onAnvil(seed);
    while (run.phase === 'forge') {
      assert.ok(run.hits < MAX_STRIKES);
      strike(run, 'tip');
    }
    foundBroken ||= run.phase === 'broken';
    foundSurvivor ||= run.phase === 'fit';
    changedShape += run.changedShape ? 1 : 0;
    assert.equal(strike(run, 'edge'), null);
  }
  assert.ok(foundBroken && foundSurvivor);
  assert.ok(changedShape > 0 && changedShape < 140);
});

test('refreshing yields three different fittings and appraisal credits the wallet once', () => {
  const save = onAnvil(729);
  for (let i = 0; i < 6; i++) strike(save.run, 'belly');
  finishForge(save.run);
  const old = fitOptions(save.run);
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
