import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ORE_TINTS,ORE_EXPOSURES,FAMILIES,oreOptics,oreMaterialOf,mineralHeritage,freshSave,offers,buyOre,inspectOre,migrateSave } from '../forge.js';

const fixtures=JSON.parse(readFileSync(new URL('./fixtures/ore-v5-offers.json',import.meta.url),'utf8'));

test('optical variation preserves V5 offer prices, grades, purity, stability and shape rolls',()=>{
  for(const {seed,batch,offers:expected} of fixtures){
    const run={...freshSave(seed).run,batch};
    offers(run).forEach((ore,i)=>{
      const {tint,exposure,clarity,...original}=ore;
      assert.deepEqual(original,expected[i]);
      assert.ok(ORE_TINTS.some(t=>t.id===tint));
      assert.ok(ORE_EXPOSURES.some(e=>e.id===exposure));
      assert.ok(clarity>=8 && clarity<=94);
    });
  }
});

test('every family can hide all sixteen colours and clarity is not a quality grade',()=>{
  const colours=Object.fromEntries(FAMILIES.map(f=>[f.id,new Set()]));
  const modes=new Set();let ordinaryClear=false,rareCloudy=false;
  for(let seed=0;seed<1200;seed++)for(const ore of offers(freshSave(seed).run)){
    colours[ore.family].add(ore.tint);modes.add(ore.exposure);
    ordinaryClear ||= ore.grade===0 && ore.clarity>=80;
    rareCloudy ||= ore.grade===2 && ore.clarity<=25;
  }
  assert.ok(Object.values(colours).every(s=>s.size===16));
  assert.equal(modes.size,3);assert.ok(ordinaryClear && rareCloudy);
});

test('probing and a save reload preserve the exact hidden colour and optical identity',()=>{
  const save=freshSave(975);const source=offers(save.run)[0];
  assert.ok(inspectOre(save));
  assert.deepEqual(mineralHeritage(offers(save.run)[0]),mineralHeritage(source));
  assert.ok(buyOre(save));
  const restored=migrateSave(JSON.parse(JSON.stringify(save)));
  for(const key of ['tint','exposure','clarity'])assert.equal(restored.run.ore[key],source[key]);
  assert.deepEqual(mineralHeritage({...source,exposure:'hidden'}),mineralHeritage({...source,exposure:'open'}));
});

test('previously bought ores retain their material colours and invalid optics have finite fallbacks',()=>{
  const legacy=fixtures.find(f=>f.seed===390 && f.batch===0).offers[0];
  const material=oreMaterialOf(legacy),optical=oreOptics(legacy);
  assert.equal(optical.core,material.core);assert.equal(optical.steel,material.steel);
  assert.equal(mineralHeritage(legacy).tone,material.steel);
  assert.equal(oreOptics({...legacy,clarity:Infinity,tint:'missing',exposure:'missing'}).clarity,.5);
  assert.equal(oreOptics({...legacy,clarity:-15}).clarity,0);
  assert.equal(oreOptics({...legacy,clarity:120}).clarity,1);
});

test('actual blade uniforms inherit each mineral colour and clarity through the shared material path',async()=>{
  globalThis.window={};await import('../assets/vendor/three.bundle.js');globalThis.THREE=window.THREE;
  const {surfaceUniforms,setSurface}=await import('../materials.js');
  const save=freshSave(572);buyOre(save);const uniforms=surfaceUniforms();
  for(const tint of ORE_TINTS){
    save.run.ore={...save.run.ore,tint:tint.id,clarity:88};
    setSurface(uniforms,save.run,null);
    assert.equal(uniforms.fOreTone.value.getHexString(),new THREE.Color(tint.steel).getHexString());
    assert.equal(uniforms.fOreClarity.value,.88);
  }
  uniforms.fMarks.value.dispose();
});
