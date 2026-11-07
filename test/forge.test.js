import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceHeat, appraise, beginRefining, buyOre, fitOptions, finishForge, fractureRisk, freshSave,
  HEAT, heatBand, pourRefining, REFINEMENT_RESULTS, LOT_SIZE, LOOKS, lookVariant, migrateSave, MIN_PRICE, MODELS, offers, REFRESH_PRICE, refreshFittings, restart, strike,
} from '../forge.js';
import { KNIFE_IDS, regionAt } from '../regions.js';

function onAnvil(seed, method = 'good') {
  const save = freshSave(seed);
  save.run.selected = offers(save.run).findIndex(ore => ore.price === MIN_PRICE);
  buyOre(save);
  beginRefining(save.run);
  let blowing = true;
  for (let i = 0; i < 1500 && save.run.phase === 'refine'; i++) {
    const heat = save.run.refining;
    if (heat.step === 'molten') {
      const aim = heatBand(heat).center, predicted = heat.temperature + heat.draft * 3;
      if (predicted >= aim + 1) blowing = false;
      else if (predicted <= aim - 1) blowing = true;
      if (heat.quality >= ({ poor: 29, fair: 50, good: 72, excellent: 94 })[method]) pourRefining(save.run);
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

test('player-controlled casting gives four meaningfully different usable billets', () => {
  for (const result of ['poor', 'fair', 'good', 'excellent']) {
    const { run } = onAnvil(51, result);
    const { purity, stability } = REFINEMENT_RESULTS[result];
    assert.equal(run.phase, 'forge');
    assert.equal(run.refinement.result, result);
    assert.equal(run.purity, Math.min(100, run.ore.purity + purity));
    assert.equal(run.stability, Math.max(0, run.ore.stability + stability));
  }
});

test('unmelted, burnt, frozen and unrefined material really end the paid run', () => {
  for (const reason of ['unmelted', 'burnt', 'frozen', 'slag']) {
    const save = freshSave(51); buyOre(save); beginRefining(save.run);
    const balance = save.credits;
    let blowing = reason !== 'unmelted';
    for (let i = 0; i < 1600 && save.run.phase === 'refine'; i++) {
      const heat = save.run.refining;
      if (heat.step === 'molten' && reason === 'frozen') blowing = false;
      if (heat.step === 'molten' && reason === 'slag') {
        if (heat.temperature >= 61) blowing = false;
        else if (heat.temperature <= 59) blowing = true;
      }
      advanceHeat(save.run, 1 / 60, blowing);
    }
    assert.equal(save.run.phase, 'broken', reason);
    assert.equal(save.run.refinement.result, 'failed');
    assert.equal(save.run.refinement.reason, reason);
    assert.equal(save.run.last.type, 'refine-fail');
    assert.equal(save.credits, balance);
    assert.equal(save.collection.length, 0);
    assert.equal(strike(save.run, 'belly'), null);
    assert.equal(finishForge(save.run), false);
    assert.equal(appraise(save), null);
    const restored = migrateSave(JSON.parse(JSON.stringify(save)));
    assert.equal(restored.run.refinement.reason, reason);
    assert.ok(restart(restored, 52));
    assert.equal(restored.run.phase, 'ore');
    assert.equal(restored.credits, balance);
  }
});

test('short overshoots can be rescued, release retains heat, and casting cannot skip refining', () => {
  const save = freshSave(21); buyOre(save); beginRefining(save.run);
  assert.equal(pourRefining(save.run), false);
  while (save.run.refining.step === 'ore') advanceHeat(save.run, 1 / 60, true);
  const temperature = save.run.refining.temperature;
  advanceHeat(save.run, .12, false);
  assert.ok(save.run.refining.temperature > temperature, 'blower retains momentum after release');
  assert.equal(pourRefining(save.run), false);
  while (save.run.refining.temperature < 87) advanceHeat(save.run, 1 / 120, true);
  advanceHeat(save.run, .15, false);
  assert.equal(save.run.phase, 'refine', 'brief overheat gives recovery time');
  assert.ok(save.run.refining.damage > 0 && save.run.refining.damage < 100);
  let blowing = false;
  while (save.run.phase === 'refine') {
    const h = save.run.refining, target = heatBand(h).center;
    if (h.temperature + h.draft * 3 >= target + 1) blowing = false;
    else if (h.temperature + h.draft * 3 <= target - 1) blowing = true;
    if (h.quality >= 45) pourRefining(save.run);
    advanceHeat(save.run, 1 / 60, blowing);
  }
  assert.equal(save.run.phase, 'forge');
  assert.ok(save.run.refinement.quality >= HEAT.minQuality);
  const completed = JSON.stringify(save);
  assert.equal(pourRefining(save.run), false);
  advanceHeat(save.run, 30, true);
  assert.equal(JSON.stringify(save), completed);
});

test('frame chunking and refresh do not bypass furnace failure or erase a paid billet', () => {
  const a = freshSave(51); buyOre(a); beginRefining(a.run);
  const b = JSON.parse(JSON.stringify(a));
  advanceHeat(a.run, 6, true);
  for (let i = 0; i < 360; i++) advanceHeat(b.run, 1 / 60, true);
  assert.equal(a.run.refinement.reason, 'burnt');
  assert.deepEqual(a.run.refinement, b.run.refinement);
  const original = freshSave(51); buyOre(original); beginRefining(original.run);
  advanceHeat(original.run, 1.7, true);
  const restored = migrateSave(JSON.parse(JSON.stringify(original)));
  assert.deepEqual(restored, original);
  advanceHeat(original.run, 6, false); advanceHeat(restored.run, 6, false);
  assert.deepEqual(restored, original);
  const legacy = freshSave(52); buyOre(legacy); beginRefining(legacy.run);
  legacy.run.refining = { step: 'molten', temperature: 73, elapsed: 6, stable: 3, hot: 0 };
  const paid = legacy.credits, stone = legacy.run.ore;
  migrateSave(legacy);
  assert.equal(legacy.run.refining.step, 'ore');
  assert.equal(legacy.run.refining.damage, 0);
  assert.equal(legacy.credits, paid);
  assert.equal(legacy.run.ore, stone);
});

test('refining quality affects final attributes and early hammer risk on the same ore', () => {
  const best = onAnvil(59, 'excellent'), worst = onAnvil(59, 'poor');
  for (const save of [best, worst]) {
    for (let i = 0; i < 6; i++) strike(save.run, 'belly');
    finishForge(save.run); save.run.fit = fitOptions(save.run)[0].id;
    appraise(save);
  }
  assert.deepEqual(best.run.ore, worst.run.ore);
  assert.ok(best.run.record.score >= worst.run.record.score + 15);
  assert.ok(fractureRisk(best.run) < fractureRisk(worst.run));
  assert.equal(best.run.record.refinement.result, 'excellent');
  assert.equal(worst.run.record.refinement.result, 'poor');
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
  const c = onAnvil(59, 'poor');
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

test('all 41 finishes can be forged at each tier and a strike edits at most one slot', () => {
  const slots = Object.keys(LOOKS);
  const catalogue = slots.map(slot => Object.keys(LOOKS[slot]).filter(id => id !== 'raw' && id !== 'none'));
  assert.deepEqual(catalogue.map(ids => ids.length), [5, 12, 12, 12]);
  const expected = catalogue.flatMap((ids, index) => ids.flatMap(id => [1, 2, 3].map(tier => [slots[index], id, tier].join('/'))));
  const seen = new Set();
  let upgrades = 0, replacements = 0, fades = 0;
  for (let seed = 0; seed < 2200 && seen.size < expected.length; seed++) {
    const save = freshSave(seed);
    buyOre(save);
    const { run } = save;
    run.phase = 'forge';
    run.stability = 76;
    while (run.phase === 'forge' && run.hits < 30) {
      const before = { ...run.skin, levels: { ...run.skin.levels }, variants: { ...run.skin.variants } };
      const event = strike(run, ['belly', 'edge', 'tip'][(seed + run.hits) % 3]);
      const changed = slots.filter(slot => before[slot] !== run.skin[slot] || before.levels[slot] !== run.skin.levels[slot]);
      const slot = event.change?.slot;
      assert.deepEqual(changed, slots.includes(slot) ? [slot] : []);
      if (!slots.includes(slot)) continue;
      const { action, tier } = event.change;
      if (action === 'upgrade') {
        upgrades++;
        assert.deepEqual(run.skin.variants[slot], before.variants[slot]);
      } else if (action === 'replace') replacements++;
      if (action === 'fade') {
        fades++;
        assert.equal(tier, before.levels[slot] - 1);
      }
      if (tier > 0) {
        assert.equal(lookVariant(run.skin, slot).id, run.skin[slot]);
        seen.add([slot, run.skin[slot], tier].join('/'));
      } else assert.equal(run.skin.variants?.[slot], undefined);
    }
  }
  assert.deepEqual(expected.filter(key => !seen.has(key)), []);
  assert.ok(upgrades && replacements && fades);
  assert.equal(LOOKS.film.peacock, '青金光');
  assert.equal(LOOKS.film.doppler, '夜潮');
});

test('archived finishes retain their templates, refinement and purity, with a deterministic legacy fallback', () => {
  const save = onAnvil(28);
  while (save.run.hits < 6) strike(save.run, 'belly');
  assert.equal(finishForge(save.run), true);
  save.run.fit = fitOptions(save.run)[0].id;
  const archived = appraise(save);
  const reloaded = migrateSave(JSON.parse(JSON.stringify(save))).collection[0];
  assert.deepEqual(reloaded.skin, archived.skin);
  assert.deepEqual(reloaded.refinement, save.run.refinement);
  assert.equal(reloaded.purity, save.run.purity);
  assert.deepEqual(reloaded.ore, save.run.ore);

  const legacy = { ...reloaded.skin, film: 'doppler' };
  delete legacy.variants;
  assert.deepEqual(lookVariant(legacy, 'film'), lookVariant({ ...legacy }, 'film'));
  assert.notDeepEqual(lookVariant(legacy, 'film'), lookVariant({ ...legacy, seed: .314 }, 'film'));
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
