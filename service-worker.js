const CACHE_NAME = "pondypos-offline-20260526-cart-controls";
const APP_SHELL = [
  "/",
  "/index.html",
  "/src/styles.css",
  "/src/app.js",
  "/public/firebase-config.js",
  "/public/manifest.webmanifest",
  "/public/pondy-mark-light-app.png",
  "/public/pondy-mark-dark-app.png",
  "/public/pondy-logo-light-app.png",
  "/public/pondy-logo-dark-app.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/index.html")))
  );
});
