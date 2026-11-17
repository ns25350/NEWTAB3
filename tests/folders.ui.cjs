/* Folder collections, compact edit affordances and transactional pointer moves. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
require('../core.js');const C=globalThis.NewTabCore;
const baseURL=process.env.NEWTAB_TEST_URL||'http://127.0.0.1:8000';
let checks=0;
const pass=name=>{checks++;console.log('PASS '+name)};
function fixture({single=false,clock=false,many=false}={}){
 const state=C.defaults();Object.values(state.widgets).forEach(w=>w.enabled=false);
 if(many)state.shortcuts.push(...Array.from({length:18},(_,i)=>({id:'doc'+i,name:'資料 '+i,url:'https://example.com/'+i,color:'#c84b84',symbol:'auto'})));
 const children=many?state.shortcuts.map(s=>s.id):single?['google']:['google','youtube','classroom'];state.folders=[{id:'study',name:'学習と資料',children}];
 state.pages=[{id:'home',name:'ホーム',items:[{id:'f:study',x:0,y:0,w:2,h:2}]}];state.activePage='home';
 if(clock){state.widgets.clock.enabled=true;state.pages[0].items.push({id:'clock',x:4,y:0,w:4,h:3})}
 for(const [i,s]of state.shortcuts.filter(s=>!children.includes(s.id)).entries())state.pages[0].items.push({id:'s:'+s.id,x:(i%6)*2,y:3+Math.floor(i/6)*2,w:2,h:2});
 return C.normalize(state);
}
async function open(browser,width=1440,height=1000,touch=false,options={}){
 const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,timezoneId:'Asia/Tokyo'});
 await context.addInitScript(({key,state})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(state))},{key:C.KEY,state:fixture(options)});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(baseURL).origin?r.continue():r.abort());
 await page.goto(baseURL,{waitUntil:'domcontentloaded'});await page.locator('[data-key="f:study"]').waitFor();
 const cdp=touch?await context.newCDPSession(page):null;
 async function down(point){if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});else{await page.mouse.move(point.x,point.y);await page.mouse.down()}}
 async function move(point){if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point]});else await page.mouse.move(point.x,point.y,{steps:10})}
 async function up(){if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up()}
 async function hold(id){const p=await center(page.locator('#folder-items [data-shortcut="'+id+'"] .shortcut-face'));await down(p);if(touch)await page.waitForTimeout(550);return p}
 return {context,page,errors,touch,cdp,down,move,up,hold};
}
async function center(locator){const r=await locator.boundingBox();assert(r,'Missing pointer target');return{x:r.x+r.width/2,y:r.y+r.height/2}}
const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),C.KEY);
async function homeTarget(page){return page.locator('.grid').evaluate(n=>{const s=getComputedStyle(n),r=n.getBoundingClientRect(),col=parseFloat(s.gridTemplateColumns),gap=parseFloat(s.columnGap),row=parseFloat(s.gridAutoRows),rg=parseFloat(s.rowGap),h=2*row+rg,line=parseFloat(getComputedStyle(document.documentElement).fontSize)*.8125*1.5;return{x:r.left+(2*col+gap)/2,y:r.top+5*(row+rg)+(h-8-line)/2}})}
async function openFolder(run){await run.page.locator('[data-key="f:study"]').click();await run.page.locator('#folder-sheet[open]').waitFor()}
function complete(state){const ids=[...state.pages.flatMap(p=>p.items.filter(i=>i.id.startsWith('s:')).map(i=>i.id.slice(2))),...state.folders.flatMap(f=>f.children)];assert.equal(new Set(ids).size,state.shortcuts.length);assert.equal(ids.length,state.shortcuts.length)}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  for(const [width,height]of [[1440,1000],[320,720],[844,390],[740,360]]){
   const run=await open(browser,width,height),p=run.page;
   const before=await p.locator('#home .shortcut-face').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().toJSON()));
   await p.locator('#home').focus();await p.keyboard.press('Control+e');
   const edit=await p.locator('#home .shortcut').evaluateAll(nodes=>nodes.map(n=>{const face=n.querySelector('.shortcut-face').getBoundingClientRect(),remove=n.querySelector('.remove').getBoundingClientRect(),configure=n.querySelector('.configure').getBoundingClientRect();return{face:face.toJSON(),noCellOutline:getComputedStyle(n).outlineStyle==='none',hiddenName:getComputedStyle(n.querySelector('.app-label')).visibility==='hidden',left:Math.abs(remove.x+remove.width/2-face.x)<1&&Math.abs(remove.y+remove.height/2-face.y)<1,right:Math.abs(configure.x+configure.width/2-face.right)<1&&Math.abs(configure.y+configure.height/2-face.y)<1,small:parseFloat(getComputedStyle(n.querySelector('.remove'),'::before').left)===12}}));
   assert.deepEqual(edit.map(e=>e.face),before);assert(edit.every(e=>e.noCellOutline&&e.hiddenName&&e.left&&e.right&&e.small&&e.face.width===60&&e.face.height===60));
   assert.equal(await p.locator('#home .shortcut :is(.resize,.grip,.size)').count(),0);
   await p.locator('[data-key="f:study"] .configure').click();assert.equal(await p.locator('#sheet-body input').count(),1);assert.equal(await p.locator('#sheet-body select,#sheet-body input[type=number]').count(),0);
   await p.getByRole('textbox',{name:'フォルダ名',exact:true}).fill('調べものとノート');await p.getByRole('button',{name:'保存',exact:true}).click();
   await p.locator('#home').focus();await p.keyboard.press('Control+e');
   await openFolder(run);assert.equal(await p.locator('#folder-title').textContent(),'調べものとノート');
   assert.equal(await p.locator('#folder-items .icon-artwork').count(),3);assert.equal(await p.locator('#folder-actions,.extract,.reorder').count(),0);
   assert.match(await p.locator('.folder-panel').evaluate(n=>getComputedStyle(n).backgroundImage),/gradient/);
   const mini=await p.locator('#home .glass-folder-icon .mini').first().evaluate(n=>({w:getComputedStyle(n).width,h:getComputedStyle(n).height}));assert(Math.abs(parseFloat(mini.w)-parseFloat(mini.h))<1);
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(width===1440)await p.screenshot({path:'/tmp/newtab-folder-final.png'});
   assert.deepEqual(run.errors,[]);await run.context.close();
  }
  pass('Fixed monochrome icons: icon-only edit frames, small left/right badges, rename-only folders and glass collections at desktop/compact/landscape widths');
  for(const [width,height,touch]of [[1440,1000,false],[390,844,true],[844,390,true]]){
   const run=await open(browser,width,height,touch),p=run.page;await openFolder(run);
   await run.hold('google');await run.move(await center(p.locator('#folder-items [data-shortcut=youtube] .shortcut-face')));await run.up();
   assert.deepEqual((await saved(p)).folders[0].children,['youtube','google','classroom']);
   await p.keyboard.press('Control+z');assert.deepEqual((await saved(p)).folders[0].children,['google','youtube','classroom']);
   await run.hold('youtube');await run.move({x:2,y:32});assert.equal(await p.locator('#folder-sheet.extracting').count(),1);
   const target=await homeTarget(p);if(target.y>height-170){await p.locator('#home').evaluate(n=>n.scrollTop=250)}
   await run.move(await homeTarget(p));assert.equal(await p.locator('.ghost.invalid').count(),0);const ghost=await p.locator('.ghost').boundingBox();assert.equal(ghost.width,60);assert.equal(ghost.height,60);
   if(touch&&height>800)await p.screenshot({path:'/tmp/newtab-folder-drag-touch.png'});
   await run.up();assert.equal(await p.locator('#folder-sheet').isVisible(),false);
   const state=await saved(p);assert.deepEqual(state.folders[0].children,['google','classroom']);assert.equal(state.pages[0].items.filter(i=>i.id==='s:youtube').length,1);assert.deepEqual(state.dock,[]);complete(state);
   const displayed=await p.locator('[data-key="s:youtube"] .shortcut-face').boundingBox(),scroll=await p.locator('#home').evaluate(n=>n.scrollTop);await p.reload({waitUntil:'domcontentloaded'});await p.locator('#home').evaluate((n,top)=>n.scrollTop=top,scroll);assert.deepEqual(await p.locator('[data-key="s:youtube"] .shortcut-face').boundingBox(),displayed);complete(await saved(p));
   assert.deepEqual(run.errors,[]);await run.context.close();
  }
  pass('Mouse and touch: reorder directly, undo, drag outside the glass folder, drop on the home grid and preserve placement after reload');
  for(const touch of [false,true]){
   const run=await open(browser,touch?390:1440,touch?844:1000,touch,{clock:true}),p=run.page;await openFolder(run);const before=await saved(p);
   await run.hold('google');await run.move({x:2,y:32});await run.move(await center(p.locator('[data-key=clock]')));assert.equal(await p.locator('.ghost.invalid').count(),1);await run.up();
   assert.deepEqual(await saved(p),before);assert.equal(await p.locator('#folder-sheet').isVisible(),true);assert.equal(await p.locator('#folder-sheet.extracting').count(),0);
   await run.hold('google');await run.move({x:2,y:32});
   if(touch)await run.cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});else{await p.keyboard.press('Escape');await run.up()}
   assert.equal(await p.locator('.ghost,.folder-drag-preview,.drag-preview').count(),0);assert.equal(await p.locator('#folder-sheet').isVisible(),true);assert.deepEqual(await saved(p),before);complete(await saved(p));
   assert.deepEqual(run.errors,[]);await run.context.close();
  }
  pass('Overlapping drops, Escape and touch cancellation restore every folder member without losing or duplicating a shortcut');
  const last=await open(browser,1440,1000,false,{single:true}),lp=last.page;await openFolder(last);
  await last.hold('google');await last.move({x:2,y:32});await last.move(await center(lp.locator('.dock-surface')));assert.equal(await lp.locator('.dock-surface.drop-target').count(),1);await last.up();
  const dockState=await saved(lp);assert.equal(dockState.folders.length,0);assert.equal(dockState.pages[0].items.some(i=>i.id==='f:study'),false);assert.equal(dockState.pages[0].items.filter(i=>i.id==='s:google').length,1);assert.deepEqual(dockState.dock,['google']);complete(dockState);
  await lp.locator('#home').focus();await lp.keyboard.press('Control+z');assert.deepEqual((await saved(lp)).folders[0].children,['google']);assert.deepEqual((await saved(lp)).dock,[]);complete(await saved(lp));
  await openFolder(last);const entry=lp.locator('#folder-items .folder-entry[data-shortcut=google]');await entry.focus();await lp.keyboard.press('Shift+F10');await lp.getByRole('button',{name:'ホームへ取り出す',exact:true}).click();assert.equal((await saved(lp)).folders.length,0);complete(await saved(lp));
  assert.deepEqual(last.errors,[]);await last.context.close();
  pass('Last-child extraction cleans up the empty folder; Dock drop, Undo and keyboard extraction all preserve shortcut identity');
  const large=await open(browser,390,844,true,{many:true}),mp=large.page;await openFolder(large);
  const panel=await mp.locator('.folder-panel').boundingBox();await large.down({x:panel.x+panel.width/2,y:panel.y+panel.height-70});for(let i=1;i<=6;i++){await large.move({x:panel.x+panel.width/2,y:panel.y+panel.height-70-i*40});await mp.waitForTimeout(18)}await large.up();await mp.waitForTimeout(150);
  assert(await mp.locator('.folder-panel').evaluate(n=>n.scrollTop>0));assert.equal(await mp.locator('.folder-drag-preview').count(),0);assert.equal((await saved(mp)).folders[0].children.length,24);
  await mp.locator('#folder-items .folder-entry[data-shortcut=doc17]').scrollIntoViewIfNeeded();await large.hold('doc17');await large.move({x:2,y:32});await large.move(await homeTarget(mp));await large.up();
  assert.equal((await saved(mp)).folders[0].children.length,23);assert.equal((await saved(mp)).pages[0].items.filter(i=>i.id==='s:doc17').length,1);complete(await saved(mp));assert.deepEqual(large.errors,[]);await large.context.close();
  pass('Large folders scroll normally by touch and let the last icon drag out without changing other members');
  const enlarged=await open(browser,320,844),ep=enlarged.page;await ep.addStyleTag({content:'html{font-size:200%}'});await ep.evaluate(()=>dispatchEvent(new Event('resize')));await ep.waitForTimeout(220);await openFolder(enlarged);
  await ep.locator('#folder-rename').click();await ep.getByRole('textbox',{name:'フォルダ名',exact:true}).fill('あ'.repeat(40));await ep.getByRole('button',{name:'保存',exact:true}).click();assert((await ep.locator('.folder-panel').boundingBox()).height>100);await ep.locator('#folder-sheet .close-dialog').click();
  assert.equal(await ep.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(enlarged.errors,[]);await enlarged.context.close();
  pass('200% text and long Japanese folder names keep rename and close actions reachable at 320px');
  console.log(`${checks} folder browser checks passed.`);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
