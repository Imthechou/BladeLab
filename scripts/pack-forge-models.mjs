// npm install --no-save @gltf-transform/core@4.2.1 @gltf-transform/extensions@4.2.1 @gltf-transform/functions@4.2.1 meshoptimizer@0.24.0
import { mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { prune, quantize, reorder } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const source = new URL('../assets/models/', import.meta.url);
const output = new URL('../assets/forge-models/', import.meta.url);
await mkdir(output, { recursive: true });

const files = (await readdir(source)).filter(name => /^(knife_[a-z]+|blank_ingot_small|molten_sphere_small)\.glb$/.test(name)).sort();
for (const file of files) {
  const document = await io.read(fileURLToPath(new URL(file, source)));
  const root = document.getRoot();
  const hasFittings = file.startsWith('knife_');
  // The fittings use the authored color, normal and surface-response atlases
  // at native resolution. The billet and molten metal use procedural shaders.
  if (!hasFittings) {
    for (const material of root.listMaterials()) {
      material.setBaseColorTexture(null).setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null);
    }
    for (const mesh of root.listMeshes()) {
      for (const primitive of mesh.listPrimitives()) primitive.setAttribute('TEXCOORD_0', null);
    }
  }
  await document.transform(prune(), quantize({ pattern: /^(NORMAL|TEXCOORD_0)$/,
    quantizeNormal: hasFittings ? 13 : 11, quantizeTexcoord: 15 }),
    reorder({ encoder: MeshoptEncoder, target: 'size' }));
  // All workshop models use the same local coordinate range. Quantizing in
  // that range preserves their origins and avoids a compensating node matrix.
  for (const mesh of root.listMeshes()) for (const primitive of mesh.listPrimitives()) {
    const position = primitive.getAttribute('POSITION');
    const values = position.getArray();
    if (values.some(n => Math.abs(n) > 1)) throw new Error(file + ' exceeds the workshop coordinate range');
    position.setArray(Int16Array.from(values, n => Math.round(n * 32767))).setNormalized(true);
  }
  document.createExtension(EXTMeshoptCompression).setRequired(true);
  await io.write(fileURLToPath(new URL(file, output)), document);
}
