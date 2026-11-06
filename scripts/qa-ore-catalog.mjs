import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const out='artifacts/ore-mobile/catalog';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,
 args:['--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,
 isMobile:true,hasTouch:true});
const errors=[];
page.on('pageerror',e=>errors.push('JS '+e.message));
page.on('console',m=>{if(m.type()==='error')errors.push('Console '+m.text());});
const families=['river','frost','coal','meteor','ochre'];
try{
 await page.goto('http://127.0.0.1:8217/ore-catalog.html',{waitUntil:'load'});
 await page.waitForSelector('button[data-action="material"]');
 await page.waitForFunction(()=>window.oreReview?.stage.mesh);
 await page.waitForTimeout(450);
 assert.equal(await page.locator('button[data-action="material"]').count(),12);
 assert.equal(await page.locator('button[data-action="variant"]').count(),4);
 assert.equal(await page.locator('button[data-action="family"]').count(),5);
 const glb=await page.evaluate(async()=>{
   const loader=new window.THREE.GLTFLoader();
   const models=['river','frost','coal','meteor','ochre'].flatMap(fam=>[0,1,2,3].map(v=>`ore_${fam}_${v}`));
   return Promise.all(models.map(async id=>{
     const obj=await loader.loadAsync(`./assets/models/${id}.glb`);
     let vertices=0,triangles=0;
     obj.scene.traverse(node=>{if(node.isMesh){
       vertices+=node.geometry.attributes.position.count;
       triangles+=(node.geometry.index?.count ?? node.geometry.attributes.position.count)/3;
     }});
     return {id,vertices,triangles};
   }));
 });
 assert.equal(glb.length,20);
 assert.ok(glb.every(g=>g.vertices>=600 && g.vertices<720 && g.triangles===1280));
 for(const family of families){
   await page.locator(`button[data-action="family"][data-id="${family}"]`).click();
   await page.waitForTimeout(350);
   await page.evaluate(() => scrollTo(0,0));
   const shot=`${out}/rock-${family}.png`;
   await page.screenshot({path:shot,animations:'disabled'});
   for(let variant=0;variant<4;variant++){
     await page.locator(`button[data-action="variant"][data-id="${variant}"]`).click();
     await page.waitForTimeout(180);
     await page.locator('.scene').screenshot({path:`${out}/shape-${family}-v${variant}.png`,animations:'disabled'});
   }
 }
 const materialIds=await page.locator('button[data-action="material"]').evaluateAll(
   buttons=>buttons.map(b=>b.dataset.id));
 const steelPrints=[];
 for(const id of materialIds){
   await page.locator(`button[data-action="material"][data-id="${id}"]`).click();
   assert.equal(await page.locator(`button[data-action="material"][data-id="${id}"]`).getAttribute('aria-pressed'),'true');
   await page.waitForTimeout(220);
   await page.locator('.scene').screenshot({path:`${out}/material-${id}-shell.png`,animations:'disabled'});
   await page.locator('button[data-action="grade"][data-id="2"]').click();
   await page.locator('button[data-action="toggle"]').click();
   await page.waitForTimeout(850);
   await page.locator('.scene').screenshot({path:`${out}/material-${id}-cut.png`,animations:'disabled'});
   await page.locator('button[data-action="steel"]').click();
   await page.waitForFunction(()=>window.oreReview.stage.shown==='straight');
   await page.waitForTimeout(300);
   const inherited=await page.evaluate(()=>{
     const stage=window.oreReview.stage,u=stage.active.uniforms;
     return {style:u.fOreStyle.value,family:u.fOreFamily.value,seed:u.fOreSeed.value};
   });
   assert.equal(inherited.style,materialIds.indexOf(id));
   assert.equal(inherited.seed,.54);
   const image=await page.locator('.scene').screenshot({path:`${out}/material-${id}-steel.png`,animations:'disabled'});
   steelPrints.push(image.toString('base64'));

 }
 assert.equal(new Set(steelPrints).size,12,'twelve mineral fingerprints must render differently');
 // Optical variation: hidden cores must not leak colour through natural light.
 await page.locator('button[data-action="material"][data-id="frost_quartz"]').click();
 await page.locator('button[data-action="exposure"][data-id="hidden"]').click();
 const opticShot=async name=>page.locator('.scene').screenshot({path:`${out}/optics-${name}.png`,animations:'disabled'});
 const waitFrame=()=>page.waitForTimeout(240);
 const tintButton=id=>page.locator(`button[data-action="tint"][data-id="${id}"]`);
 await tintButton('azure').click();await waitFrame();const hiddenBlue=await opticShot('hidden-blue');
 await tintButton('garnet').click();await waitFrame();const hiddenRed=await opticShot('hidden-red');
 assert.equal(hiddenBlue.toString('base64'),hiddenRed.toString('base64'),'opaque host must conceal its hidden core colour');
 await page.locator('button[data-action="exposure"][data-id="veiled"]').click();await waitFrame();await opticShot('veiled-red');
 await page.locator('button[data-action="exposure"][data-id="open"]').click();await waitFrame();
 const exposedRed=await opticShot('open-red');assert.notEqual(exposedRed.toString('base64'),hiddenRed.toString('base64'));
 await tintButton('azure').click();await waitFrame();const exposedBlue=await opticShot('open-blue');
 assert.notEqual(exposedBlue.toString('base64'),exposedRed.toString('base64'));
 const tints=await page.evaluate(async()=>(await import('./forge.js?v=13')).ORE_TINTS.map(t=>({id:t.id,steel:t.steel})));
 assert.equal(tints.length,16);
 const colourPrints=[];
 for(const tint of tints){
   if(await page.evaluate(()=>oreReview.stage.mode==='reveal'))await page.locator('button[data-action="toggle"]').click();
   await tintButton(tint.id).click();
   await page.locator('button[data-action="clarity"][data-id="90"]').click();
   await page.locator('button[data-action="toggle"]').click();await page.waitForTimeout(820);
   await opticShot(tint.id+'-cut');
   await page.locator('button[data-action="steel"]').click();
   await page.waitForFunction(()=>oreReview.stage.shown==='straight');await waitFrame();
   const values=await page.evaluate(()=>({
     tone:'#'+oreReview.stage.active.uniforms.fOreTone.value.getHexString(),
     clarity:oreReview.stage.active.uniforms.fOreClarity.value,
   }));
   assert.equal(values.tone,tint.steel);assert.equal(values.clarity,.9);
   colourPrints.push((await opticShot(tint.id+'-steel')).toString('base64'));
 }
 assert.equal(new Set(colourPrints).size,16,'sixteen base colours must render as sixteen distinct steel surfaces');
 await page.locator('button[data-action="toggle"]').click();await tintButton('jade').click();
 await page.locator('button[data-action="toggle"]').click();await page.waitForTimeout(820);
 const clarityPrints=[];
 for(const clarity of [15,55,90]){
   await page.locator(`button[data-action="clarity"][data-id="${clarity}"]`).click();await waitFrame();
   clarityPrints.push((await opticShot('jade-clarity-'+clarity)).toString('base64'));
 }
 assert.equal(new Set(clarityPrints).size,3,'the same colour must show cloudy, misty and clear interiors');
 await page.locator('button[data-action="material"][data-id="frost_quartz"]').click();

 for(const [grade,label] of [[0,'ordinary'],[1,'good'],[2,'rare']]){
   await page.locator(`button[data-action="grade"][data-id="${grade}"]`).click();
   if(grade===0)await page.locator('button[data-action="toggle"]').click();
   await page.waitForTimeout(760);
   await page.evaluate(() => scrollTo(0,0));
   await page.screenshot({path:`${out}/split-${label}.png`,animations:'disabled'});
 }
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
 assert.ok(overflow<=2,'catalog horizontal overflow');
 assert.deepEqual(errors,[], 'GLB loading / WebGL shader should have no errors');
 console.log(JSON.stringify({ok:true,loadedGlbs:glb.length,verticesPerMesh:glb[0].vertices,
   trisPerMesh:glb[0].triangles,materials:materialIds.length,families:families.length,
   variants:4,tints:16,exposureModes:3,clarityLevels:3,viewports:'390x844',errors}));
}catch(e){
 await page.screenshot({path:`${out}/99-catalog-failure.png`}).catch(()=>{});
 console.error(e);
 throw e;
}finally{if(errors.length)console.error(errors.slice(0,12));await browser.close();}
