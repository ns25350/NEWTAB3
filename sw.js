/* Only the local application shell is cached. External API calls remain uncached. */
'use strict';
const CACHE='newtab-original-shell-glass-4';
const RELEASE='20261016-glass-4';
const SHELL=['./','./index.html',...['style.css','features.css','settings.css','glass.css','drawer.js','core.js','app.js'].map(path=>'./'+path+'?v='+RELEASE),'./icon.svg','./assets/landscape.svg','./assets/landscape-dark.svg','./assets/wallpaper.png','./vendor/cupertino-pane/cupertino-pane.min.js?v=1.5.4'];
const shellPaths=new Set(SHELL.map(path=>new URL(path,self.location.href).pathname));
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('newtab-original-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||!shellPaths.has(url.pathname))return;
 event.respondWith(fetch(request,{cache:'no-cache'}).then(response=>{
  if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)))}
  return response;
 }).catch(async()=>{
  const cache=await caches.open(CACHE);
  return await cache.match(request,{ignoreSearch:true})||(request.mode==='navigate'?await cache.match('./index.html'):null)||Response.error();
 }));
});
