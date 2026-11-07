import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { KNIFE_IDS } from '../regions.js';

async function inspect(directory, id) {
  const file = await readFile(new URL('../assets/' + directory + '/knife_' + id + '.glb', import.meta.url));
  const jsonLength = file.readUInt32LE(12);
  const gltf = JSON.parse(file.toString('utf8', 20, 20 + jsonLength));
  const dataStart = 28 + jsonLength;
  const material = gltf.materials[0];
  const maps = [material.pbrMetallicRoughness.baseColorTexture, material.normalTexture,
    material.pbrMetallicRoughness.metallicRoughnessTexture].map(({ index }) => {
    const image = gltf.images[gltf.textures[index].source];
    const { byteOffset = 0, byteLength } = gltf.bufferViews[image.bufferView];
    return file.subarray(dataStart + byteOffset, dataStart + byteOffset + byteLength);
  });
  const indices = gltf.meshes.flatMap(mesh => mesh.primitives).map(primitive => gltf.accessors[primitive.indices].count);
  return { maps, indices, bytes: file.length, compression: gltf.extensionsRequired?.includes('EXT_meshopt_compression') };
}

test('all compact knife models retain the authored grip atlases and triangle counts', async () => {
  for (const id of KNIFE_IDS) {
    const [source, packed] = await Promise.all([inspect('models', id), inspect('forge-models', id)]);
    assert.deepEqual(packed.indices, source.indices, id + ' triangle count');
    assert.deepEqual(packed.maps, source.maps, id + ' original color, normal and roughness atlases');
    assert.ok(packed.compression && packed.bytes < 380000, id + ' transfer budget');
  }
});
