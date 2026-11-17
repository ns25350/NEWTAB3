/* Real file-chooser uploads, image bytes, IndexedDB persistence and replacement safety. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
require('../core.js');const C=globalThis.NewTabCore;
const baseURL=process.env.NEWTAB_TEST_URL||'http://127.0.0.1:8000';
let checks=0;const pass=name=>{checks++;console.log('PASS '+name)};
async function open(browser,width){
 const context=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo'}),seed=C.defaults();Object.values(seed.widgets).forEach(w=>w.enabled=false);
 await context.addInitScript(({key,seed})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed))},{key:C.KEY,seed});
 const page=await context.newPage(),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().startsWith('http'))requests.push(r.url())});
 await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(baseURL).origin?r.continue():r.abort());
 await page.goto(baseURL,{waitUntil:'domcontentloaded'});await appearance(page);return{page,context,errors,requests};
}
async function appearance(page){
 await page.locator('#home').focus();await page.keyboard.press('Control+,');await page.locator('#sheet[data-pane-ready=true]').waitFor();
 if(!await page.locator('#appearance-preview').count())await page.locator('#sheet-body [data-section=appearance]').click();
 await page.getByRole('button',{name:'写真を選ぶ',exact:true}).waitFor();
}
async function imageFile(page,mime,width,height,color){
 const data=await page.evaluate(({mime,width,height,color})=>{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,width,height);return canvas.toDataURL(mime,.95)},{mime,width,height,color});
 assert(data.startsWith('data:'+mime+';base64,'));return{name:'background.'+{'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[mime],mimeType:mime,buffer:Buffer.from(data.split(',')[1],'base64')};
}
const background=page=>page.locator('#wallpaper').evaluate(n=>n.style.backgroundImage);
async function choose(page,file){
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'写真を選ぶ',exact:true}).click();await(await chooser).setFiles(file);
 assert.equal(await page.locator('#wallpaper-file').inputValue(),'');
}
async function upload(page,file){
 const previous=await background(page);await choose(page,file);
 await page.waitForFunction(previous=>{const image=document.querySelector('#wallpaper').style.backgroundImage,toast=document.querySelector('#toast');return(image.includes('blob:')&&image!==previous)||(!toast.hidden&&/保存できません|20MB以下/.test(toast.textContent))},previous);
 const current=await background(page);assert(current.includes('blob:')&&current!==previous,'Valid image upload failed: '+await page.locator('#toast').textContent());
 await page.getByText('壁紙を変更しました。',{exact:true}).waitFor();assert.equal(await page.locator('.wallpaper-caption strong').textContent(),'選択した写真');
 assert.equal(await page.locator('#appearance-preview').evaluate(n=>n.style.backgroundImage),current);
 assert.equal(await page.locator('#wallpaper').evaluate(n=>getComputedStyle(n).backgroundImage),current);
 return current;
}
async function asset(page){
 return page.evaluate(async()=>{
  const record=await new Promise((resolve,reject)=>{const request=indexedDB.open('newtab.original.assets',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('images'),get=tx.objectStore('images').get('wallpaper');let value;get.onsuccess=()=>value=get.result;tx.oncomplete=()=>{db.close();resolve(value)};tx.onerror=()=>{db.close();reject(tx.error)}}});
  if(!record)return null;const url=URL.createObjectURL(record.blob),image=new Image();try{image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=1;canvas.getContext('2d').drawImage(image,0,0,1,1);return{width:image.naturalWidth,height:image.naturalHeight,type:record.blob.type,bytes:record.blob.size,palette:record.palette,pixel:[...canvas.getContext('2d').getImageData(0,0,1,1).data]}}finally{URL.revokeObjectURL(url)}
 });
}
async function reloadWithPhoto(page){await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#wallpaper').style.backgroundImage.includes('blob:'));await appearance(page)}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  for(const width of [1440,390]){
   const run=await open(browser,width),p=run.page;
   const png=await imageFile(p,'image/png',160,100,'#e08040'),first=await upload(p,png),initial=await asset(p);
   assert.equal(initial.width,160);assert.equal(initial.height,100);assert(initial.bytes>0&&initial.pixel[0]>initial.pixel[1]&&initial.pixel[1]>initial.pixel[2]);
   assert.deepEqual(await p.evaluate(key=>JSON.parse(localStorage.getItem(key)).appearance.palette,C.KEY),initial.palette);
   await reloadWithPhoto(p);assert.deepEqual(await asset(p),initial);
   pass(width+'px: the actual photo picker saves a small PNG, updates the preview and restores the saved image/palette after reload');
   const jpeg=await imageFile(p,'image/jpeg',3200,1800,'#3050d0');const old=await background(p);await upload(p,jpeg);const resized=await asset(p);
   assert.equal(resized.width,2560);assert.equal(resized.height,1440);assert(resized.pixel[2]>resized.pixel[0]&&resized.pixel[2]>resized.pixel[1]);
   const oldURL=old.match(/url\("(.*)"\)/)[1];assert.equal(await p.evaluate(async url=>{try{await fetch(url);return true}catch{return false}},oldURL),false);
   await reloadWithPhoto(p);assert.deepEqual(await asset(p),resized);
   pass(width+'px: JPEG replacement resizes to 2560px, releases the old object URL and persists the new image');
   const webp=await imageFile(p,'image/webp',320,240,'#171717');await upload(p,webp);const dark=await asset(p);
   assert.equal(dark.width,320);assert.equal(dark.height,240);assert.equal(dark.palette.dark,true);assert.equal(dark.palette.label,'#ffffff');assert.equal(await p.locator('html').getAttribute('data-appearance'),'dark');
   await reloadWithPhoto(p);assert.deepEqual(await asset(p),dark);assert.equal(await p.locator('html').getAttribute('data-appearance'),'dark');
   await upload(p,webp);assert.deepEqual(await asset(p),dark);
   pass(width+'px: WebP uploads, automatic dark appearance and re-selecting the same file work');
   const preserved=await background(p);await choose(p,{name:'corrupt.png',mimeType:'image/png',buffer:Buffer.from('broken image')});
   await p.getByText('画像を保存できませんでした。小さい画像でお試しください。',{exact:true}).waitFor();assert.equal(await background(p),preserved);assert.deepEqual(await asset(p),dark);
   await choose(p,{name:'oversize.png',mimeType:'image/png',buffer:Buffer.alloc(20*1024*1024+1)});await p.getByText('20MB以下のJPEG・PNG・WebP画像を選んでください。',{exact:true}).waitFor();assert.equal(await background(p),preserved);assert.deepEqual(await asset(p),dark);
   pass(width+'px: invalid and oversized files preserve the current image and IndexedDB record');
   await p.getByRole('button',{name:'オリジナルの壁紙に戻す',exact:true}).click();await p.getByText('初期の壁紙に戻しました。',{exact:true}).waitFor();assert.equal(await background(p),'');assert.equal(await asset(p),null);
   assert.equal(await p.evaluate(key=>JSON.parse(localStorage.getItem(key)).appearance.palette,C.KEY),null);await p.reload({waitUntil:'domcontentloaded'});assert.equal(await background(p),'');assert.equal(await asset(p),null);
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(run.errors,[]);assert(run.requests.every(url=>new URL(url).origin===new URL(baseURL).origin));await run.context.close();
   pass(width+'px: restoring the default clears the photo and palette; no upload bytes leave the browser');
  }
  console.log(`${checks} wallpaper browser checks passed.`);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
