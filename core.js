/* Pure data, migrations and placement rules. Original implementation. */
(function(root){
'use strict';
const VERSION=4, KEY='newtab.original.v4';
const WIDGETS=['clock','timetable','weather','search','gallery'];
const LABELS={clock:'時計',timetable:'時間割',weather:'天気',search:'検索',gallery:'イラスト検索'};
const ENGINES={google:'https://www.google.com/search?q=',bing:'https://www.bing.com/search?q=',duckduckgo:'https://duckduckgo.com/?q=',youtube:'https://www.youtube.com/results?search_query=',maps:'https://www.google.com/maps/search/?api=1&query='};
const TIMES={50:[['08:40','09:30'],['09:40','10:30'],['10:40','11:30'],['11:40','12:30'],['13:15','14:05'],['14:15','15:05'],['15:15','16:05']],45:[['08:40','09:25'],['09:35','10:20'],['10:30','11:15'],['11:25','12:10'],['12:55','13:40'],['13:50','14:35'],['14:45','15:30']]};
const CLASSES=[...Array.from({length:10},(_,i)=>String(101+i)),'201','202','203','204','205/6文','205理','206理','207','208','209','210',...Array.from({length:10},(_,i)=>String(301+i))];
const clone=v=>JSON.parse(JSON.stringify(v));
const uid=()=>globalThis.crypto?.randomUUID?.()||('id-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
const clamp=(n,a,b,d=a)=>Number.isFinite(Number(n))?Math.max(a,Math.min(b,Number(n))):d;
const str=(v,d='',n=100)=>typeof v==='string'?v.slice(0,n):d;
const color=(v,d='#1870db')=>/^#[0-9a-f]{6}$/i.test(v)?v:d;
function url(v){try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null}catch{return null}}
function defaults(){
 const shortcuts=[['google','Google','https://www.google.com/','#f4f7fe'],['youtube','YouTube','https://www.youtube.com/','#fff8f8'],['classroom','Classroom','https://classroom.google.com/','#e0f4d6'],['drive','Drive','https://drive.google.com/','#f4fafb'],['gmail','Gmail','https://mail.google.com/','#fff8f8'],['github','GitHub','https://github.com/','#25303d']].map(([id,name,url,color])=>({id,name,url,color}));
 return {version:VERSION,grid:{columns:12,rowHeight:60,gap:20},appearance:{theme:'silver',autoTheme:true,opacity:84,blur:28,radius:28,shadow:12,shade:10,motion:70,palette:null},widgets:Object.fromEntries(WIDGETS.map(k=>[k,{enabled:k!=='gallery',style:null}])),clock:{analog:false,h24:true},search:{engine:'google',historyEnabled:false,history:[]},timetable:{className:'101',autoSwitch:true,switchTime:'16:00',preset:'50',customTimes:clone(TIMES[50])},weather:{name:'金沢市',lat:36.5613,lon:136.6562},gallery:{provider:'pixiv',recent:[]},shortcuts,folders:[],pages:[{id:'home',name:'ホーム',items:[{id:'clock',x:0,y:0,w:4,h:3},{id:'timetable',x:4,y:0,w:4,h:3},{id:'weather',x:8,y:0,w:4,h:3},{id:'search',x:2,y:3,w:8,h:1},...shortcuts.map((s,i)=>({id:'s:'+s.id,x:i*2,y:4,w:2,h:2}))]},{id:'space',name:'フリースペース',items:[]}],activePage:'home',layouts:[]};
}
function overlaps(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y}
function canPlace(items,box,cols,except){return box.x>=0&&box.y>=0&&box.w>=1&&box.h>=1&&box.x+box.w<=cols&&box.y+box.h<=4096&&!items.some(i=>i.id!==except&&overlaps(i,box))}
function freeSpot(items,w,h,cols){w=Math.min(w,cols);for(let y=0;y<=4096-h;y++)for(let x=0;x<=cols-w;x++){let b={x,y,w,h};if(canPlace(items,b,cols))return b}return null}
function pack(items,cols,oldCols=cols){const result=[];for(const it of items){let b={...it,w:Math.min(it.w,cols),x:Math.min(Math.round(it.x*cols/oldCols),cols-Math.min(it.w,cols))};if(!canPlace(result,b,cols))b={...it,...freeSpot(result,b.w,b.h,cols)};if(canPlace(result,b,cols))result.push(b)}return result}
function minutes(s){if(!/^\d{2}:\d{2}$/.test(s))return NaN;const[h,m]=s.split(':').map(Number);return h<24&&m<60?h*60+m:NaN}
function validTimes(v){return Array.isArray(v)&&v.length===7&&v.every((t,i)=>Array.isArray(t)&&t.length===2&&Number.isFinite(minutes(t[0]))&&minutes(t[0])<minutes(t[1])&&(!i||minutes(v[i-1][1])<=minutes(t[0])))}
function lessonStatus(times,now){const n=now.getHours()*60+now.getMinutes();const current=times.findIndex(t=>n>=minutes(t[0])&&n<minutes(t[1]));const next=times.findIndex(t=>minutes(t[0])>n);return{current,next,remaining:current>=0?minutes(times[current][1])-n:next>=0?minutes(times[next][0])-n:0}}
function dayOffset(settings,now){return settings.autoSwitch&&now.getHours()*60+now.getMinutes()>=minutes(settings.switchTime)?1:0}
function queryTarget(input,engine='google'){let q=input.trim();const m=q.match(/^(g|b|ddg|yt|map)\s+(.+)$/i);if(m){engine={g:'google',b:'bing',ddg:'duckduckgo',yt:'youtube',map:'maps'}[m[1].toLowerCase()];q=m[2]}else{const direct=url(q)||(!/\s/.test(q)&&/^(localhost(?::\d+)?|[\w-]+(?:\.[\w-]+)+)(?::\d+)?(?:[/?#].*)?$/.test(q)?url('https://'+q):null);if(direct)return direct}return (ENGINES[engine]||ENGINES.google)+encodeURIComponent(q)}
function weatherHourIndex(data,nowMs=Date.now()){const seconds=Math.floor(nowMs/1000);const a=data.hourly?.time||[];let i=a.findIndex(t=>Number(t)>seconds);if(i<0)return Math.max(0,a.length-1);return i>0?i-1:0}
function migrate(old){
 if(!old||typeof old!=='object'||Array.isArray(old))throw Error('設定の形式が正しくありません。');
 if(Number(old.version)>VERSION)throw Error('この設定は新しいバージョン用です。');
 if(old.pages?.some(p=>Array.isArray(p.order))){
  const d=defaults(),o=old;d.grid={...d.grid,...o.grid};d.shortcuts=o.shortcuts||[];d.folders=(o.folders||[]).map(f=>({id:f.id,name:f.name,children:f.shortcutIds||[]}));
  d.pages=o.pages.map(p=>({id:p.id,name:p.name,items:(p.order||[]).map(id=>({id:id.replace(/^shortcut:/,'s:').replace(/^folder:/,'f:'),...(p.layout?.[id]||{x:0,y:0,w:2,h:2})}))}));d.activePage=o.activePageId;
  if(o.appearance){const a=o.appearance;d.appearance={...d.appearance,theme:a.manualTheme||'silver',autoTheme:a.autoTheme!==false,opacity:a.widgetOpacity??84,shade:a.wallpaperShade??10,motion:a.motionStrength??70,palette:a.autoPalette||null}}
  for(const k of WIDGETS){d.widgets[k].enabled=o[k]?.enabled??(k!=='gallery');const z=o.widgetStyles?.[k];if(z?.enabled)d.widgets[k].style={opacity:z.opacity,blur:z.blur,radius:z.radius,shadow:z.shadow,text:z.text,accent:z.accent}}
  d.clock={analog:o.clock?.type==='analog',h24:o.clock?.is24Hour!==false};d.search={engine:o.search?.engine||'google',historyEnabled:!!o.search?.saveHistory,history:o.search?.history||[]};
  d.timetable={...d.timetable,...o.timetable,preset:o.timetable?.lessonPreset||'50'};if(o.weather)d.weather={name:o.weather.locationName,lat:o.weather.latitude,lon:o.weather.longitude};if(o.gallery)d.gallery=o.gallery;
  d.layouts=(o.savedLayouts||[]).slice(0,20).map(l=>({id:l.id||uid(),name:l.name||'保存した配置',pages:(l.pages||[]).map(p=>({id:p.id,name:p.name,items:(p.order||[]).map(id=>({id:id.replace(/^shortcut:/,'s:').replace(/^folder:/,'f:'),...(p.layout?.[id]||{x:0,y:0,w:2,h:2})}))})),grid:l.grid||d.grid}));return d;
 }
 return old;
}
function normalize(raw){
 const o=migrate(raw),d=defaults();
 d.grid={columns:Math.round(clamp(o.grid?.columns,6,16,12)),rowHeight:Math.round(clamp(o.grid?.rowHeight,40,120,60)),gap:Math.round(clamp(o.grid?.gap,8,40,20))};
 const a=o.appearance||{};d.appearance={theme:['silver','ocean','rose','dark'].includes(a.theme)?a.theme:'silver',autoTheme:a.autoTheme!==false,opacity:clamp(a.opacity,0,100,84),blur:clamp(a.blur,0,60,28),radius:clamp(a.radius,8,44,28),shadow:clamp(a.shadow,0,60,12),shade:clamp(a.shade,0,65,10),motion:clamp(a.motion,0,100,70),palette:a.palette&&typeof a.palette==='object'?{dark:!!a.palette.dark,accent:color(a.palette.accent),label:color(a.palette.label,'#ffffff')}:null};
 for(const k of WIDGETS){const v=o.widgets?.[k];d.widgets[k].enabled=v?.enabled??(k!=='gallery');if(v?.style)d.widgets[k].style={opacity:clamp(v.style.opacity,0,100,84),blur:clamp(v.style.blur,0,60,28),radius:clamp(v.style.radius,8,44,28),shadow:clamp(v.style.shadow,0,60,12),text:color(v.style.text,'#182638'),accent:color(v.style.accent)}}
 d.clock={analog:!!o.clock?.analog,h24:o.clock?.h24!==false};d.search={engine:Object.hasOwn(ENGINES,o.search?.engine)?o.search.engine:'google',historyEnabled:!!o.search?.historyEnabled,history:Array.isArray(o.search?.history)&&o.search.historyEnabled?o.search.history.filter(x=>typeof x==='string').slice(0,30).map(x=>x.slice(0,200)):[]};
 const t=o.timetable||{};d.timetable={className:CLASSES.includes(String(t.className))?String(t.className):'101',autoSwitch:t.autoSwitch!==false,switchTime:Number.isFinite(minutes(t.switchTime))?t.switchTime:'16:00',preset:['45','50','custom'].includes(String(t.preset))?String(t.preset):'50',customTimes:validTimes(t.customTimes)?clone(t.customTimes):clone(TIMES[50])};
 d.weather={name:str(o.weather?.name,'金沢市',80),lat:clamp(o.weather?.lat,-90,90,36.5613),lon:clamp(o.weather?.lon,-180,180,136.6562)};
 d.gallery={provider:['pixiv','x','google'].includes(o.gallery?.provider)?o.gallery.provider:'pixiv',recent:Array.isArray(o.gallery?.recent)?o.gallery.recent.filter(x=>typeof x==='string').slice(0,12).map(x=>x.slice(0,80)):[]};
 const ids=new Set();d.shortcuts=(Array.isArray(o.shortcuts)?o.shortcuts:defaults().shortcuts).slice(0,200).filter(s=>s&&url(s.url)&&typeof s.id==='string'&&s.id.length<=100&&!ids.has(s.id)&&ids.add(s.id)).map(s=>({id:str(s.id,'',100),name:str(s.name,'サイト',40),url:url(s.url),color:color(s.color,'#347dd8')}));
 const sids=new Set(d.shortcuts.map(s=>s.id)),used=new Set(),fids=new Set();d.folders=(Array.isArray(o.folders)?o.folders:[]).slice(0,60).filter(f=>f&&typeof f.id==='string'&&f.id.length<=100&&!fids.has(f.id)&&fids.add(f.id)).map(f=>({id:str(f.id),name:str(f.name,'フォルダ',40),children:(Array.isArray(f.children)?f.children:[]).filter(id=>sids.has(id)&&!used.has(id)&&used.add(id))})).filter(f=>f.children.length);
 const valid=new Set([...WIDGETS,...d.shortcuts.filter(s=>!used.has(s.id)).map(s=>'s:'+s.id),...d.folders.map(f=>'f:'+f.id)]),placed=new Set(),pids=new Set();
 function cleanItems(items,seen){return(Array.isArray(items)?items:[]).slice(0,250).filter(i=>i&&valid.has(i.id)&&!seen.has(i.id)&&seen.add(i.id)).map(i=>({id:i.id,x:Math.round(clamp(i.x,0,15)),y:Math.round(clamp(i.y,0,4084)),w:Math.round(clamp(i.w,1,d.grid.columns,2)),h:Math.round(clamp(i.h,1,12,2))}))}
 d.pages=(Array.isArray(o.pages)&&o.pages.length?o.pages:defaults().pages).slice(0,6).map(p=>({id:typeof p.id==='string'&&!pids.has(p.id)&&pids.add(p.id)?p.id:uid(),name:str(p.name,'ページ',40),items:pack(cleanItems(p.items,placed),d.grid.columns)}));
 for(const id of valid){if(WIDGETS.includes(id)&&!d.widgets[id].enabled)continue;if(!placed.has(id)){const b=freeSpot(d.pages[0].items,WIDGETS.includes(id)?4:2,id==='search'?1:WIDGETS.includes(id)?3:2,d.grid.columns);if(b)d.pages[0].items.push({id,...b})}}
 d.activePage=d.pages.some(p=>p.id===o.activePage)?o.activePage:d.pages[0].id;
 d.layouts=(Array.isArray(o.layouts)?o.layouts:[]).slice(0,20).map(l=>{const seen=new Set();return{id:str(l.id,uid()),name:str(l.name,'配置',40),widgets:Object.fromEntries(WIDGETS.map(k=>[k,{enabled:l.widgets?.[k]?.enabled??d.widgets[k].enabled,style:d.widgets[k].style}])),grid:{columns:Math.round(clamp(l.grid?.columns,6,16,12)),rowHeight:clamp(l.grid?.rowHeight,40,120,60),gap:clamp(l.grid?.gap,8,40,20)},pages:(Array.isArray(l.pages)?l.pages:[]).slice(0,6).map(p=>({id:str(p.id,uid()),name:str(p.name,'ページ',40),items:cleanItems(p.items,seen)}))}}).filter(l=>l.pages.length);
 return d;
}
root.NewTabCore={VERSION,KEY,WIDGETS,LABELS,ENGINES,TIMES,CLASSES,clone,uid,clamp,str,color,url,defaults,overlaps,canPlace,freeSpot,pack,minutes,validTimes,lessonStatus,dayOffset,queryTarget,weatherHourIndex,migrate,normalize};
})(typeof window==='undefined'?globalThis:window);
