const CACHE_NAME = "racebox-cache-v6";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/app.js",
  "./js/auth.js",
  "./js/firebase-config.js",
  "./js/storage.js",
  "./js/speedometer.js",
  "./js/dragmeter.js",
  "./js/history.js",
  "./js/settings.js",
  "./js/router.js",
  "./icons/icon-192.svg",
  "./icons/icon-512.svg",
  "./icons/apple-touch-icon.svg",
  "./icons/favicon-32.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin || event.request.method !== "GET") return;
  const networkFirst = event.request.mode === "navigate"
    || /\/(?:index\.html|js\/.*\.js|css\/.*\.css)$/.test(requestUrl.pathname);
  if (networkFirst) {
    event.respondWith(fetch(event.request).then(async (response) => {
      if (response.ok) {
        try {
          await caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
        } catch (error) {
          console.warn("Cache aplikasi gagal diperbarui:", error);
        }
      }
      return response;
    }).catch(async (error) => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === "navigate") {
        const offlinePage = await caches.match(new URL("./index.html", self.registration.scope).href);
        if (offlinePage) return offlinePage;
      }
      console.warn("Aset aplikasi tidak tersedia saat offline:", requestUrl.pathname, error);
      return Response.error();
    }));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
    }
    return response;
  })));
});
