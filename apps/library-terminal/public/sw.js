const BASE = new URL(self.registration.scope).pathname;
const CACHE = `aksis-portal-${BASE}-v4`;
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const response = await fetch(BASE, { cache: "reload" });
    if (!response.ok) throw new Error("Shell unavailable");
    const html = await response.clone().text();
    await cache.put(BASE, response);
    const assets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
      .map(match => new URL(match[1], self.registration.scope))
      .filter(url => url.origin === self.location.origin && url.pathname.startsWith(BASE) && /\.(js|css|png|webmanifest)$/.test(url.pathname));
    await cache.addAll([...new Set([...assets.map(url => url.href), `${BASE}icon-192.png`, `${BASE}icon-512.png`])]);
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(`aksis-portal-${BASE}-`) && key !== CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)
    || url.pathname.includes("/api/") || url.searchParams.has("token")) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, response.clone())));
    return response;
  }).catch(async () => (await caches.match(event.request)) || (event.request.mode === "navigate" ? await caches.match(BASE) : undefined) || Response.error()));
});
