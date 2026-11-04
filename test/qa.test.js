import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strike } from '../forge.js';
import { createQaSession } from '../qa.js';

test('device verification is opt-in and its full loop starts on a fresh wallet', () => {
  assert.equal(createQaSession(null), null);
  assert.equal(createQaSession('unexpected'), null);
  const session = createQaSession('full');
  assert.equal(session.save.run.phase, 'ore');
  assert.equal(session.save.credits, 76);
  assert.deepEqual(session.save.collection, []);
});

test('one hit in the selected fixture reproduces fracture or a rare model in any region', () => {
  for (const zone of ['belly', 'edge', 'tip']) {
    const broken = createQaSession('break').save.run;
    assert.equal(strike(broken, zone).type, 'break');
    const rare = createQaSession('rare').save.run;
    const result = strike(rare, zone);
    assert.equal(result.change?.slot, 'model');
    assert.equal(result.notable, true);
    assert.equal(rare.changedShape, true);
  }
});
