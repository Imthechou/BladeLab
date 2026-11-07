import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  freshSave, offers, inspectOre, WINDOW_PRICE, MIN_PRICE, mineralHeritage, migrateSave, appraise, fitOptions, buyOre, beginRefining, advanceHeat, heatBand, ORE_TIERS,
  RARE_ODDS, oreSignals, familyOf, strike, finishForge,
} from '../forge.js';

function refine(save) {
  let blowing = true;
  for (let i = 0; i < 1500 && save.run.phase === 'refine'; i++) {
    const heat = save.run.refining;
    const target = heatBand(heat).center, predicted = heat.temperature + heat.draft * 3;
    if (heat.step === 'molten') {
      if (predicted >= target + 1) blowing = false;
      else if (predicted <= target - 1) blowing = true;
    }
    advanceHeat(save.run, 1 / 60, blowing);
  }
}

test('three stones have inspectable but non-spoiling traits across price tiers', () => {
  for (let seed = 0; seed < 300; seed++) {
    const save = freshSave(seed);
    const stones = offers(save.run);
    assert.equal(stones.length, 3);
    assert.deepEqual(offers(save.run), stones);
    assert.equal(new Set(stones.map(stone => stone.tier)).size, 3);
    for (const ore of stones) {
      assert.ok(ore.price >= 14 && ore.price <= 40);
      assert.ok(ore.vein >= 0 && ore.vein <= 100);
      assert.ok(ore.flaw >= 0 && ore.flaw <= 100);
      assert.ok(ore.luster >= 0 && ore.luster <= 100);
      assert.ok(ore.family && familyOf(ore.family));
      assert.ok(ORE_TIERS[ore.tier]);
      assert.ok(RARE_ODDS[ore.tier] > 0);
      const signs = oreSignals(ore);
      assert.ok(signs.vein.length && signs.shell.length && signs.glow.length);
      assert.ok(!JSON.stringify(signs).includes('稀质'));
    }
  }
});

test('visible veins probabilistically correlate with actual purity, not guaranteed rank', () => {
  const tiers = [0, 1, 2].map(() => ({ total: 0, rare: 0 }));
  let good = 0, weak = 0, countGood = 0, countWeak = 0;
  for (let seed = 0; seed < 1500; seed++) {
    for (const ore of offers(freshSave(seed).run)) {
      const tier = tiers[ore.tier];
      tier.total++;
      tier.rare += ore.grade === 2 ? 1 : 0;
      if (ore.grade === 2) { good += ore.vein; countGood++; }
      else if (ore.grade === 0) { weak += ore.vein; countWeak++; }
    }
  }
  for (let i = 0; i < tiers.length; i++) {
    const pct = 100 * tiers[i].rare / tiers[i].total;
    assert.ok(Math.abs(pct - RARE_ODDS[i]) < 5, `tier ${i}: ${pct}% rare`);
  }
  assert.ok(good / countGood > weak / countWeak + 12);
});

test('opening costs exactly once and persists origin identity through refining and strikes', () => {
  const a = freshSave(345), b = freshSave(345);
  a.run.selected = b.run.selected = 2;
  const original = offers(a.run)[2];
  assert.ok(buyOre(a));
  assert.ok(buyOre(b));
  assert.deepEqual(a.run.ore, original);
  assert.equal(a.credits, 76 - original.price);
  assert.equal(buyOre(a), false);
  assert.equal(a.credits, 76 - original.price);
  assert.equal(a.run.skin.seed, b.run.skin.seed);
  beginRefining(a.run);
  refine(a);
  assert.equal(a.run.phase, 'forge');
  assert.equal(a.run.ore.family, original.family);
  const originSeed = a.run.skin.seed;
  for (let i = 0; i < 6; i++) strike(a.run, 'belly');
  assert.equal(a.run.skin.seed, originSeed);
  assert.equal(a.run.ore.vein, original.vein);
  assert.ok(finishForge(a.run));
});

test('window samples charge once per stone, persist, and never price the inspected stone out', () => {
  const save=freshSave(892), run=save.run;
  const original=offers(run)[0],credits=save.credits;
  assert.equal(inspectOre(save),true);
  assert.equal(save.credits,credits-WINDOW_PRICE);
  assert.equal(inspectOre(save),false);
  const opened=offers(run)[0];
  assert.equal(opened.window,true);
  assert.deepEqual({...opened,window:false},original);
  run.selected=1; assert.equal(offers(run)[1].window,false);
  const restored=migrateSave(JSON.parse(JSON.stringify(save)));
  restored.run.selected=0;assert.equal(offers(restored.run)[0].window,true);
  run.selected=2;const selected=offers(run)[2];save.credits=selected.price+WINDOW_PRICE-1;
  const balance=save.credits;
  assert.equal(inspectOre(save),false);assert.equal(save.credits,balance);
  save.credits=MIN_PRICE;run.selected=offers(run).findIndex(o=>o.price===MIN_PRICE);
  assert.equal(inspectOre(save),false);assert.equal(buyOre(save),true);
  assert.equal(inspectOre(save),false);
});

test('mineral identity survives refining, six hits, appraisal and archive reload', () => {
  const save=freshSave(390);buyOre(save);
  const source=mineralHeritage(save.run.ore);
  beginRefining(save.run);
  refine(save);
  for(let i=0;i<6;i++)strike(save.run,'belly');
  assert.deepEqual(mineralHeritage(save.run.ore),source);
  finishForge(save.run);save.run.fit=fitOptions(save.run)[0].id;appraise(save);
  const loaded=migrateSave(JSON.parse(JSON.stringify(save)));
  assert.deepEqual(mineralHeritage(loaded.collection[0].ore),source);
  assert.equal(new Set(['river_gray','river_silver','river_banded','frost_quartz','frost_mica',
    'coal_slag','coal_oxide','meteor_fusion','meteor_nickel','ochre_limonite','ochre_red','ochre_layer']
    .map(material=>JSON.stringify(mineralHeritage({material,figure:.35,vein:60})))).size,12);
});
