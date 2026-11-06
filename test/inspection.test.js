import {test} from 'node:test';
import assert from 'node:assert/strict';
import {oreInspection} from '../forge.js';

test('inspection distinguishes opaque thick shells, clear thin shells and a scraped window',()=>{
  const opaque={family:'frost',clarity:12,crust:88,exposure:'hidden',flaw:62};
  const clear={...opaque,clarity:92,crust:18,flaw:15};
  const a=oreInspection(opaque),b=oreInspection(clear);
  assert.ok(a.transmission<.12);assert.ok(b.transmission>.70);
  assert.match(a.lamp,/未透出/);assert.match(b.lamp,/内层较清/);
  assert.match(a.side,/裂隙密集/);assert.match(b.side,/裂隙稀少/);
  assert.ok(oreInspection({...opaque,window:true}).transmission>a.transmission);
});

test('inspection describes observed properties without revealing or depending on the grade',()=>{
  const source={family:'coal',clarity:55,crust:45,exposure:'veiled',flaw:35};
  assert.deepEqual(oreInspection({...source,grade:0}),oreInspection({...source,grade:2}));
  assert.ok(Number.isFinite(oreInspection(null).transmission));
  assert.match(oreInspection(source).side,/细裂可见/);
});
