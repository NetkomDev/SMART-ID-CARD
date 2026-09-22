const CACHE="aksis-parent-shell-v1",SHELL=["/","/index.html","/icon.svg","/manifest.webmanifest"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)));self.skipWaiting()});
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(e.request.method!=="GET"||u.pathname.startsWith("/api/"))return;e.respondWith(fetch(e.request).then(r=>{if(r.ok&&u.origin===self.location.origin)e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,r.clone())));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match("/"))))});
