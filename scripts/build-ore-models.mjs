import { mkdirSync, writeFileSync } from 'node:fs';
import { ORE_SHAPE_FAMILIES, ORE_SHAPE_VARIANTS, buildOreGlb } from './ore-geometry.mjs';

// Regenerate the checked-in 20 small GLBs. Run: node scripts/build-ore-models.mjs
mkdirSync('assets/models',{recursive:true});
for(const family of ORE_SHAPE_FAMILIES){
  for(let variant=0;variant<ORE_SHAPE_VARIANTS.length;variant++){
    const filename=`assets/models/ore_${family}_${variant}.glb`;
    const bytes=buildOreGlb(family,variant);
    writeFileSync(filename,Buffer.from(bytes));
    console.log(filename, bytes.length+'B');
  }
}
