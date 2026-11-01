const CACHE = "aksis-admin-shell-v2";
const SHELL = ["/", "/index.html", "/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("aksis-admin-shell-") && key !== CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

const PWA_PREFIXES = [
  "/attendance/",
  "/waste/",
  "/library/",
  "/extracurricular/",
  "/parent/",
  "/led/",
  "/command/",
  "/card-writer/",
  "/operations/",
  "/api/"
];

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== "GET" || requestUrl.origin !== self.location.origin) return;

  // Never intercept PWA portals, camera scans, or backend API calls
  if (PWA_PREFIXES.some((prefix) => requestUrl.pathname.startsWith(prefix))) return;

  // For SPA navigation in Admin Web: network-first, fallback to /index.html if offline
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/index.html").then((res) => res || caches.match("/")))
    );
    return;
  }

  // For admin static assets (JS, CSS, SVG, etc.): cache-first, cache new assets on 200
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (
          response.ok &&
          (requestUrl.pathname.startsWith("/assets/") ||
            /\.(js|css|svg|png|webp|ico|woff2?)$/.test(requestUrl.pathname))
        ) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy)));
        }
        return response;
      });
    })
  );
});

