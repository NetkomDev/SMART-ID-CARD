const BASE = new URL(self.registration.scope).pathname;
const CACHE = `aksis-portal-${BASE}-v10`;

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      const response = await fetch(BASE, { cache: "reload" });
      if (response.ok) {
        await cache.put(BASE, response.clone());
        const html = await response.text();
        const assets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
          .map(match => new URL(match[1], self.registration.scope))
          .filter(url => url.origin === self.location.origin && url.pathname.startsWith(BASE) && /\.(js|css|png|webmanifest|svg)$/.test(url.pathname));
        
        const urlsToCache = [...new Set([...assets.map(url => url.href), `${BASE}icon-192.png`, `${BASE}icon-512.png`, `${BASE}manifest.webmanifest`])];
        await Promise.allSettled(urlsToCache.map(url => cache.add(url).catch(() => undefined)));
      }
    } catch {
      /* Fallback gracefully so Service Worker install never fails */
    }
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(key => key.startsWith(`aksis-portal-${BASE}-`) && key !== CACHE).map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !url.pathname.startsWith(BASE) ||
    url.pathname.includes("/api/") ||
    url.searchParams.has("token")
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, clone)));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate") {
          const shell = await caches.match(BASE);
          if (shell) return shell;
        }
        return Response.error();
      })
  );
});
