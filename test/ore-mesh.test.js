import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildOreGlb } from '../scripts/ore-geometry.mjs';
import { FAMILIES, ORE_VARIANTS, ORE_MATERIALS, oreModelId, oreMaterialOf, oreSignals, offers, freshSave } from '../forge.js';

test('twenty independent GLBs provide five watertight mineral families with three extra variants each', () => {
  assert.equal(FAMILIES.length, 5);
  assert.equal(ORE_VARIANTS.length, 4);
  const hashes = new Set();
  for (const family of FAMILIES) {
    const local = new Set();
    for (let variant = 0; variant < ORE_VARIANTS.length; variant++) {
      const id = oreModelId({ family: family.id, variant });
      assert.equal(id, `ore_${family.id}_${variant}`);
      const data = readFileSync(new URL(`../assets/models/${id}.glb`, import.meta.url));
      assert.ok(data.length < 12000, id + ': low-poly payload should remain tiny');
      assert.deepEqual(data,Buffer.from(buildOreGlb(family.id,variant)),id+': committed model is reproducible from source');
      assert.equal(data.readUInt32LE(0), 0x46546c67, id + ': GLB magic');
      assert.equal(data.readUInt32LE(4), 2, id + ': glTF version');
      assert.equal(data.readUInt32LE(8), data.length, id + ': total GLB length');
      const jsonLen = data.readUInt32LE(12);
      assert.equal(data.readUInt32LE(16), 0x4e4f534a, id + ': JSON chunk');
      const gltf = JSON.parse(data.subarray(20,20+jsonLen).toString());
      const positions = gltf.accessors[gltf.meshes[0].primitives[0].attributes.POSITION];
      const indices = gltf.accessors[gltf.meshes[0].primitives[0].indices];
      assert.ok(positions.count >= 80 && positions.count < 240, id + ': expected ~162 vertices');
      assert.ok(indices.count >= 240 && indices.count <= 1200, id + ': expected 320 low-poly triangles');
      assert.ok(positions.min[0] < -.4 && positions.max[0] > .4, id + ': cut through x center');
      assert.ok(positions.min[1] < -.3 && positions.max[1] > .3, id + ': visible height');
      assert.equal(data.readUInt32LE(20+jsonLen+4),0x004e4942,id+': BIN chunk');
      const hash = createHash('sha256').update(data).digest('hex');
      assert.ok(!hashes.has(hash), id + ': expected a genuinely distinct mesh');
      hashes.add(hash);
      local.add(id);
    }
    assert.equal(local.size,4);
  }
  assert.equal(hashes.size,20);
});

test('twelve actual rock surface presets and five cues occur across offers and remain deterministic', () => {
  assert.equal(ORE_MATERIALS.length,12);
  assert.equal(new Set(ORE_MATERIALS.map(m => m.id)).size,12);
  assert.equal(new Set(ORE_MATERIALS.map(m => m.style)).size,12);
  const materials = new Set(), families = new Set(), variations = new Set();
  for (let seed=0;seed<700;seed++){
    const run = freshSave(seed).run;
    for(let batch=0;batch<3;batch++){
      run.batch=batch;
      const a=offers(run),b=offers(run);
      assert.deepEqual(a,b);
      for(const ore of a){
        materials.add(ore.material);families.add(ore.family);variations.add(ore.variant);
        const material=oreMaterialOf(ore);
        assert.equal(material.id,ore.material);
        assert.equal(material.family,ore.family);
        assert.ok(material.base.startsWith('#') && material.vein.startsWith('#'));
        for(const key of ['vein','flaw','luster','density','crust'])
          assert.ok(Number.isFinite(ore[key]) && ore[key]>=0 && ore[key]<=100, key);
        assert.equal(Object.keys(oreSignals(ore)).length,5);
      }
    }
  }
  assert.equal(materials.size,12);
  assert.equal(families.size,5);
  assert.equal(variations.size,4);
});
