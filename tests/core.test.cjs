const assert=require('node:assert/strict');
require('../core.js');
const C=globalThis.NewTabCore;let checks=0;
function test(name,fn){fn();checks++;console.log('PASS '+name)}
function noOverlap(state){for(const p of state.pages)for(const item of p.items)assert(C.canPlace(p.items,item,state.grid.columns,item.id),'invalid placement '+item.id)}
test('Default state survives validation without moving the default layout',()=>{const d=C.defaults(),n=C.normalize(d);assert.deepEqual(n.pages,d.pages);noOverlap(n);assert.equal(n.search.historyEnabled,false);assert.equal(n.widgets.gallery.enabled,false)});
test('Collision rejection and adjacent placement',()=>{const items=[{id:'a',x:0,y:0,w:4,h:3}];assert(!C.canPlace(items,{x:3,y:0,w:2,h:2},12));assert(C.canPlace(items,{x:4,y:0,w:2,h:2},12));assert(!C.canPlace(items,{x:11,y:0,w:2,h:2},12))});
test('Compact layouts remain collision-free with every item present',()=>{const d=C.defaults();for(const cols of [6,8,12,16]){const packed=C.pack(d.pages[0].items,cols,12);assert.equal(packed.length,d.pages[0].items.length);noOverlap({grid:{columns:cols},pages:[{items:packed}]})}});
test('Large shortcut collections do not disappear during import or grid changes',()=>{const d=C.defaults();d.grid.columns=6;d.shortcuts=Array.from({length:200},(_,i)=>({id:'test'+i,name:'Site '+i,url:'https://example.com/'+i,color:'#4488cc'}));d.pages=[{id:'p',name:'p',items:[]}];const n=C.normalize(d);assert.equal(n.shortcuts.length,200);assert.equal(n.pages.flatMap(p=>p.items).filter(i=>i.id.startsWith('s:')).length,200);noOverlap(n)});
test('Unsafe URLs and CSS values are rejected',()=>{for(const u of ['javascript:alert(1)','data:text/html,abc','file:///etc/passwd','https://user:secret@example.com'])assert.equal(C.url(u),null);assert.equal(C.color('red;position:fixed'),'#1870db');assert.equal(C.url('https://example.com/a?q=1'),'https://example.com/a?q=1')});
test('Import clamps numbers, deduplicates identities, and caps pages',()=>{const d=C.defaults();d.grid.columns=1000;d.appearance.opacity=-99;d.pages=Array.from({length:9},()=>C.clone(d.pages[0]));d.shortcuts.push(d.shortcuts[0]);const n=C.normalize(d);assert.equal(n.grid.columns,16);assert.equal(n.appearance.opacity,0);assert.equal(n.pages.length,6);assert.equal(new Set(n.pages.map(p=>p.id)).size,6);assert.equal(n.shortcuts.length,6);noOverlap(n)});
test('Newer setting versions are not silently destroyed',()=>assert.throws(()=>C.normalize({version:99}),/新しいバージョン/));
test('Class data migration preserves shortcuts and placements',()=>{const old={version:3,grid:{columns:12,rowHeight:78,gap:14},shortcuts:[{id:'g',name:'Google',url:'https://google.com',color:'#ffffff'}],folders:[],pages:[{id:'p',name:'Home',order:['clock','shortcut:g'],layout:{clock:{x:0,y:0,w:4,h:3},'shortcut:g':{x:4,y:0,w:2,h:2}}}],activePageId:'p',timetable:{className:'205/6文',lessonPreset:'45'},search:{saveHistory:false},clock:{type:'analog'}};const n=C.normalize(old);assert.equal(n.timetable.className,'205/6文');assert.equal(n.timetable.preset,'45');assert(n.clock.analog);assert(n.pages[0].items.some(i=>i.id==='s:g'));noOverlap(n)});
test('Folders deduplicate children and exclude them from home items',()=>{const d=C.defaults();d.folders=[{id:'f',name:'Study',children:['google','google','gmail','missing']}];const n=C.normalize(d);assert.deepEqual(n.folders[0].children,['google','gmail']);assert(!n.pages.flatMap(p=>p.items).some(i=>i.id==='s:google'));assert(n.pages.flatMap(p=>p.items).some(i=>i.id==='f:f'))});
test('Lesson presets are ordered, with overlap and invalid time rejected',()=>{assert(C.validTimes(C.TIMES[45]));assert(C.validTimes(C.TIMES[50]));const t=C.clone(C.TIMES[50]);t[1][0]='09:20';assert(!C.validTimes(t));t[1][0]='99:00';assert(!C.validTimes(t))});
test('Current, break, and finished lesson boundaries',()=>{const date=new Date(2026,8,7,8,40);let s=C.lessonStatus(C.TIMES[50],date);assert.equal(s.current,0);assert.equal(s.remaining,50);date.setHours(9,30);s=C.lessonStatus(C.TIMES[50],date);assert.equal(s.current,-1);assert.equal(s.next,1);assert.equal(s.remaining,10);date.setHours(17,0);assert.equal(C.lessonStatus(C.TIMES[50],date).next,-1)});
test('Automatic tomorrow selection can be disabled',()=>{const d=C.defaults(),date=new Date(2026,8,7,16,0);assert.equal(C.dayOffset(d.timetable,date),1);d.timetable.autoSwitch=false;assert.equal(C.dayOffset(d.timetable,date),0)});
test('Queries support commands, direct URLs, and escaped search terms',()=>{assert.equal(C.queryTarget('example.com'),'https://example.com/');assert.equal(C.queryTarget('yt 猫 動画'),C.ENGINES.youtube+encodeURIComponent('猫 動画'));assert.equal(C.queryTarget('javascript:alert(1)'),C.ENGINES.google+encodeURIComponent('javascript:alert(1)'));assert.equal(C.queryTarget('a&b'),C.ENGINES.google+'a%26b')});
test('Weather hour selection uses UTC epoch and handles exact-hour boundaries',()=>{const h={hourly:{time:[1000,4600,8200]}};assert.equal(C.weatherHourIndex(h,4600*1000),1);assert.equal(C.weatherHourIndex(h,6400*1000),1);assert.equal(C.weatherHourIndex(h,50*1000),0)});
test('Saved layout widget visibility survives export and import',()=>{const d=C.defaults();d.layouts=[{id:'simple',name:'Simple',grid:d.grid,pages:d.pages,widgets:{...d.widgets,weather:{enabled:false,style:null}}}];const n=C.normalize(d);assert.equal(n.layouts[0].widgets.weather.enabled,false)});
test('Material choices and legacy settings preserve user layouts and appearance overrides',()=>{const d=C.defaults();d.appearance.material='solid';d.appearance.opacity=67;d.widgets.clock.style={opacity:72,blur:20,radius:30,shadow:8,text:'#112233',accent:'#336699'};const n=C.normalize(C.clone(d));assert.equal(n.appearance.material,'solid');assert.equal(n.appearance.opacity,67);assert.deepEqual(n.pages,d.pages);assert.deepEqual(n.widgets.clock.style,d.widgets.clock.style);delete d.appearance.material;const legacy=C.normalize(d);assert.equal(legacy.appearance.material,'glass');assert.deepEqual(legacy.pages,d.pages);assert.equal(legacy.appearance.opacity,67)});
test('Shortcut labels reserve a complete line in tight grids and enlarged text without collisions',()=>{
 for(const [row,gap,font] of [[40,8,16],[48,14,16],[60,20,16],[136,20,32]]){
  const d=C.defaults(),items=d.pages[0].items.map(i=>i.id.startsWith('s:')?{...i,h:1}:i),packed=C.displayItems(items,4,12,row,gap,font);
  assert.equal(packed.length,items.length);noOverlap({grid:{columns:4},pages:[{items:packed}]});
  for(const i of packed.filter(i=>i.id.startsWith('s:')))assert(i.h*row+(i.h-1)*gap>=84+font*.8125*1.5);
 }
});
test('Compact edits round-trip through saved columns without shifting the drop or shrinking wide widgets',()=>{
 for(const cols of [6,8,12,16]){
  const original=C.defaults().pages[0].items,shown=C.displayItems(original,4,12,60,20),moved=shown.map(i=>i.id==='clock'?{...i,x:0,y:16}:i);
  const stored=C.restoreColumns(moved,original,4,cols),again=C.displayItems(stored,4,cols,60,20);
  for(const i of moved)assert.deepEqual(again.find(j=>j.id===i.id),i);
  assert.equal(stored.find(i=>i.id==='search').w,Math.min(cols,8));
  noOverlap({grid:{columns:cols},pages:[{items:stored}]});
 }
});
console.log(`${checks} checks passed.`);
