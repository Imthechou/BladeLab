import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const root = process.env.QA_ORIGIN || 'https://imthechou.github.io/BladeLab/preview/ore-v5/';
const browser = await chromium.launch({headless:true,args:[
 '--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
const page = await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
const errors=[],missing=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
page.on('response',r=>{if(r.status()>=400&&(/\.glb(?:\?|$)/.test(r.url())||/preview\/ore-v5\//.test(r.url())))missing.push(r.status()+': '+r.url())});
try{
 await page.goto(root,{waitUntil:'load',timeout:30000});
 await page.waitForSelector('.ore-grid .ore-card',{timeout:25000});
 await page.waitForFunction(()=>[...document.querySelectorAll('.ore-thumbnail img')].every(img=>img.naturalWidth>0));
 assert.equal(await page.locator('.ore-card').count(),3);
 await page.locator('.ore-card').nth(1).click();
 await page.waitForTimeout(500);
 await page.locator('[data-action="buy"]').click();
 await page.waitForSelector('.ore-result',{timeout:7000});
 assert.equal(await page.locator('.ore-grade').count(),1);
 await page.locator('[data-action="preview-mineral"]').click();await page.waitForTimeout(500);
 assert.equal(await page.locator('[data-action="preview-mineral"]').getAttribute('aria-pressed'),'true');
 assert.ok(!(/暂不可用/.test(await page.locator('#stage-state').innerText())));
 await page.goto(root+'ore-catalog.html',{waitUntil:'load',timeout:30000});
 await page.waitForSelector('button[data-action="material"]',{timeout:15000});
 assert.equal(await page.locator('button[data-action="material"]').count(),12);
 await page.locator('button[data-action="family"][data-id="ochre"]').click();
 await page.waitForTimeout(400);
 await page.locator('button[data-action="toggle"]').click();
 await page.waitForTimeout(750);
 assert.deepEqual(errors,[], 'no script or WebGL errors');
 assert.deepEqual(missing,[], 'no missing preview models or JS');
 console.log(JSON.stringify({ok:true,preview:root,models:20,materials:12,device:'390x844',errors,missing}));
}catch(e){console.error(JSON.stringify({errors:errors.slice(0,7),missing:missing.slice(0,7)}));throw e}finally{await browser.close()}
