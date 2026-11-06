import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const root=process.env.QA_ORIGIN || 'http://127.0.0.1:8217/';
const out=process.env.QA_OUTPUT || 'artifacts/ore-inspection';
const families=process.env.QA_QUICK ? ['frost'] : ['river','frost','coal','meteor','ochre'];
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1.5,isMobile:true,hasTouch:true});
const errors=[],metrics=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const click=(action,id)=>page.locator(`button[data-action="${action}"][data-id="${id}"]`).click();
const wait=()=>page.waitForTimeout(240);
const snapshot=name=>page.locator('.scene').screenshot({path:`${out}/${name}.png`,animations:'disabled'});
// Copy actual rendered WebGL pixels, omitting the HTML captions and backdrop.
const pixels=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>{
  const source=document.querySelector('canvas');
  const stage=window.oreReview?.stage;
  if(stage)stage.renderer.render(stage.scene,stage.camera);
  const canvas=document.createElement('canvas');canvas.width=144;canvas.height=Math.round(144*source.height/source.width);
  const ctx=canvas.getContext('2d');ctx.drawImage(source,0,0,canvas.width,canvas.height);
  resolve([...ctx.getImageData(0,0,canvas.width,canvas.height).data]);
})));
function difference(a,b){
 let total=0,count=0;
 for(let i=0;i<a.length;i+=4)if(a[i+3]>200 && b[i+3]>200){
  total+=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);count++;
 }
 assert.ok(count>250,'a visible ore must be rendered');return total/(count*765);
}
function brightness(a){
 const values=[];
 for(let i=0;i<a.length;i+=4)if(a[i+3]>200)values.push((a[i]*.213+a[i+1]*.715+a[i+2]*.072)/255);
 values.sort((x,y)=>x-y);return {max:values.at(-1),median:values[Math.floor(values.length*.5)],mean:values.reduce((s,v)=>s+v,0)/values.length};
}
try{
 await page.goto(root+'ore-catalog.html',{waitUntil:'load'});
 await page.waitForFunction(()=>window.oreReview?.stage.mesh);
 for(const family of families){
  await click('family',family);await click('grade','0');await click('tint','jade');await click('exposure','hidden');await click('clarity','55');
  await click('inspection','natural');await wait();
  const natural=await pixels();await snapshot(family+'-natural');
  await click('inspection','side');await page.waitForTimeout(1050);
  const side=await pixels();await snapshot(family+'-side');
  await click('inspection','lamp');await wait();
  const lamp=await pixels();await snapshot(family+'-lamp');
  const sideDelta=difference(natural,side),lampDelta=difference(natural,lamp),lit=brightness(lamp);
  assert.ok(sideDelta>.065,`${family}: side illumination must be visibly different (${sideDelta})`);
  assert.ok(lampDelta>.075,`${family}: lamp illumination must be visibly different (${lampDelta})`);
  assert.ok(lit.max>.68 && lit.max-lit.median>.12,`${family}: a clearly localized lamp hotspot is required`);
  assert.ok(lit.mean>.11,`${family}: inspection must not simply black out the ore`);
  await click('inspection','natural');await wait();
  const restored=difference(natural,await pixels());
  assert.ok(restored<.004,`${family}: leaving inspection must restore natural light (${restored})`);
  await click('grade','2');await click('clarity','15');await click('inspection','lamp');await wait();
  const opaque=await pixels();await snapshot(family+'-lamp-opaque');
  const low=await page.evaluate(()=>oreReview.stage.oreUniforms.oreTransmission.value);
  await click('clarity','90');await wait();
  const clear=await pixels();await snapshot(family+'-lamp-clear');
  const high=await page.evaluate(()=>oreReview.stage.oreUniforms.oreTransmission.value);
  const opticalDelta=difference(opaque,clear);
  assert.ok(high>low+.35 && opticalDelta>.02,`${family}: clear and opaque cores need distinguishable light responses (${opticalDelta})`);
  metrics.push({family,sideDelta,lampDelta,restored,opticalDelta,brightness:lit});
 }
 // Also exercise the actual player buttons, free cost, toggle-off and stone switching.
 await page.goto(root,{waitUntil:'load'});await page.waitForSelector('.ore-card');
 await page.waitForFunction(()=>[...document.querySelectorAll('.ore-thumbnail img')].every(img=>img.naturalWidth>0));
 const credits=await page.locator('#credits').innerText();
 for(const width of [390,320]){
  await page.setViewportSize({width,height:844});await wait();
  await page.locator('[data-action="inspect-light"][data-id="side"]').click();await page.waitForTimeout(1000);
  assert.equal(await page.locator('#stage').getAttribute('data-inspection'),'side');
  assert.match(await page.locator('#inspection-note').innerText(),/侧光.*裂/);
  await page.screenshot({path:`${out}/player-${width}-side.png`,animations:'disabled'});
  await page.locator('[data-action="inspect-light"][data-id="lamp"]').click();await wait();
  assert.equal(await page.locator('#stage').getAttribute('data-inspection'),'lamp');
  assert.match(await page.locator('#inspection-note').innerText(),/打灯/);
  await page.screenshot({path:`${out}/player-${width}-lamp.png`,animations:'disabled'});
  await page.locator('[data-action="inspect-light"][data-id="lamp"]').click();await wait();
  assert.equal(await page.locator('#stage').getAttribute('data-inspection'),'natural');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=2);
 }
 await page.locator('[data-action="inspect-light"][data-id="side"]').click();
 await page.locator('.ore-card').nth(1).click();
 assert.equal(await page.locator('#stage').getAttribute('data-inspection'),'natural');
 assert.equal(await page.locator('#credits').innerText(),credits,'inspection lighting must be free');
 assert.deepEqual(errors,[],'inspection must render without JS or WebGL errors');
 await writeFile(out+'/metrics.json',JSON.stringify({ok:true,root,metrics,errors},null,2));
 console.log(JSON.stringify({ok:true,root,families:families.length,metrics,errors}));
}catch(error){await page.screenshot({path:out+'/99-failure.png'}).catch(()=>{});console.error(errors.slice(0,4));throw error;}
finally{await browser.close();}
