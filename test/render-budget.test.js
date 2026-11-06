import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RenderBudget } from '../render-budget.js';

test('smooth play and isolated loading spikes retain the full rendering resolution', () => {
  const budget = new RenderBudget(1.5);
  for (let i = 1; i <= 600; i++) assert.equal(budget.sample(i % 150 === 0 ? 90 : 1000 / 60, i * 17), null);
  assert.equal(budget.ratio, 1.5);
});

test('sustained slow play adapts within a second without rapid reallocations or undersampling', () => {
  const budget = new RenderBudget(1.5), changes = [];
  for (let i = 1; i <= 240; i++) if (budget.sample(33.3, i * 33.3) != null) changes.push(i * 33.3);
  assert.ok(changes[0] < 1000);
  assert.equal(changes.length, 2);
  assert.ok(changes[1] - changes[0] >= 1200);
  assert.equal(budget.ratio, 1);
});

test('background gaps and a zoomed-out screen do not lower or raise the pixel budget', () => {
  const budget = new RenderBudget(.8);
  for (let i = 0; i < 50; i++) assert.equal(budget.sample(1000, i * 1000), null);
  for (let i = 0; i < 100; i++) assert.equal(budget.sample(40, i * 40), null);
  assert.equal(budget.ratio, .8);
});
