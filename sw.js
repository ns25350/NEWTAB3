/* Offline shell only: never cache external searches, positions or API calls here. */
'use strict';
const CACHE='newtab-original-shell-1';
const SHELL=['./','./index.html','./style.css','./features.css','./core.js','./app.js','./icon.svg','./assets/wallpaper.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('newtab-original-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin)return;const base=new URL('./',self.location.href);if(!SHELL.some(path=>new URL(path,base).pathname===url.pathname))return;event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)))}return response}).catch(()=>caches.match(request).then(cached=>cached||(request.mode==='navigate'?caches.match('./index.html'):Response.error()))))});
