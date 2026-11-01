const VERSION = '__BUILD_VERSION__';
const ROOT = new URL('./', self.location.href).pathname;
const CACHE = `aksis-portal-${ROOT}-${VERSION}`;
self.addEventListener('install', event => event.waitUntil((async () => {
  const response = await fetch(ROOT + 'offline-assets.json', {cache:'no-store'});
  if (!response.ok) throw new Error('Offline manifest unavailable');
  const assets = await response.json();
  const cache = await caches.open(CACHE);
  await cache.addAll([ROOT, ...assets.map(path => ROOT + path)]);
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith(`aksis-portal-${ROOT}-`) && name !== CACHE) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(ROOT)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (event.request.mode === 'navigate') { try { return await fetch(event.request); } catch { return await cache.match(ROOT) || Response.error(); } }
    return await cache.match(event.request) || await fetch(event.request);
  })());
});
