const CACHE_NAME = "sai-sai-v3";

self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  // Never serve stale JavaScript/CSS from an old app version.
  const url = new URL(event.request.url);
  if (url.pathname.endsWith(".js") || url.pathname.endsWith(".css") || url.pathname.endsWith(".html")) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => undefined);
      return response;
    }).catch(() => caches.match(event.request).then(cached => cached || caches.match("/")))
  );
});