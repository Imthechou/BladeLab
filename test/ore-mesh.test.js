import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { sectionContour } from '../ore-section.js';
import { buildOreGlb } from '../scripts/ore-geometry.mjs';
import { FAMILIES, ORE_VARIANTS, ORE_MATERIALS, oreModelId, oreMaterialOf, oreSignals, offers, freshSave } from '../forge.js';

// GLB JSON bounds may be serialized with slightly different last digits across
// Node/V8 environments. Compare actual geometry and topology instead of bytes.
function parseGlb(buffer) {
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString());
  const base = 20 + jsonLength + 8;
  const access = index => {
    const accessor = json.accessors[index];
    const view = json.bufferViews[accessor.bufferView];
    const offset = base + (view.byteOffset || 0) + (accessor.byteOffset || 0);
    const components = accessor.type === 'VEC3' ? 3 : 1;
    const values = [];
    for (let k = 0; k < accessor.count * components; k++) {
      values.push(accessor.componentType === 5126
        ? buffer.readFloatLE(offset + 4 * k)
        : buffer.readUInt16LE(offset + 2 * k));
    }
    return values;
  };
  const primitive = json.meshes[0].primitives[0];
  return {
    vertices: access(primitive.attributes.POSITION),
    normals: access(primitive.attributes.NORMAL),
    indices: access(primitive.indices),
  };
}
function validateGeneratedGeometry(committed, generated, name) {
  const a = parseGlb(committed), b = parseGlb(generated);
  assert.deepEqual(a.indices, b.indices, name + ': triangle topology changed');
  for (const key of ['vertices', 'normals']) {
    assert.equal(a[key].length, b[key].length, name + ': ' + key + ' count');
    for (let i = 0; i < a[key].length; i++) {
      assert.ok(Number.isFinite(a[key][i]), name + ': nonfinite ' + key + '[' + i + ']');
      assert.ok(Math.abs(a[key][i] - b[key][i]) < 0.00001,
        name + ': unexpected coordinate drift ' + key + '[' + i + ']');
    }
  }
  const edges = new Map();
  for (let i = 0; i < a.indices.length; i += 3) {
    const face = a.indices.slice(i, i + 3);
    assert.equal(new Set(face).size, 3, name + ': degenerate index triangle');
    for (const [u, v] of [[face[0],face[1]], [face[1],face[2]], [face[2],face[0]]]) {
      const edge = Math.min(u,v) + ':' + Math.max(u,v);
      edges.set(edge, (edges.get(edge) || 0) + 1);
    }
  }
  assert.ok([...edges.values()].every(n => n === 2),
    name + ': mesh must have closed manifold edges for the section cutter');
}

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
      assert.ok(data.length < 28000, id + ': low-poly payload should remain tiny');
      validateGeneratedGeometry(data, Buffer.from(buildOreGlb(family.id, variant)), id);
      assert.equal(data.readUInt32LE(0), 0x46546c67, id + ': GLB magic');
      assert.equal(data.readUInt32LE(4), 2, id + ': glTF version');
      assert.equal(data.readUInt32LE(8), data.length, id + ': total GLB length');
      const jsonLen = data.readUInt32LE(12);
      assert.equal(data.readUInt32LE(16), 0x4e4f534a, id + ': JSON chunk');
      const gltf = JSON.parse(data.subarray(20,20+jsonLen).toString());
      const positions = gltf.accessors[gltf.meshes[0].primitives[0].attributes.POSITION];
      const indices = gltf.accessors[gltf.meshes[0].primitives[0].indices];
      assert.ok(positions.count >= 600 && positions.count < 720, id + ': expected a compact bevel mesh');
      assert.ok(indices.count === 3840, id + ': expected 1280 mobile triangles');
      assert.ok(positions.min[0] < -.4 && positions.max[0] > .4, id + ': cut through x center');
      assert.ok(positions.min[1] < -.22 && positions.max[1] > .25, id + ': visible height');
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

// Every generated specimen must produce a closed, non-collapsed real section.
test('all twenty cut contours follow the actual shell and have finite area', () => {
  for (const family of FAMILIES) for(let variant=0;variant<4;variant++) {
    const mesh=parseGlb(Buffer.from(buildOreGlb(family.id,variant)));
    for(const cut of [-.13,.015,.14]){
      const contour=sectionContour(mesh.vertices,mesh.indices,cut);
      assert.ok(contour.length>25,family.id+': closed section');
      const area=Math.abs(contour.reduce((sum,a,i)=>{
        const b=contour[(i+1)%contour.length];return sum+a[0]*b[1]-b[0]*a[1];
      },0))/2;
      assert.ok(area>.25 && area<2.1,family.id+': plausible section area');
      assert.ok(contour.flat().every(Number.isFinite));
    }
  }
});
