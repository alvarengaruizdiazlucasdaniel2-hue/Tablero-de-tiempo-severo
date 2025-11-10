// Service Worker básico para cache estático.
// No es obligatorio para el funcionamiento online del tablero.

const CACHE_NAME = "tablero-meteo-severo-v1";
const URLS_TO_CACHE = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(URLS_TO_CACHE);
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return null;
        })
      );
    })
  );
});

self.addEventListener("fetch", function (event) {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) {
        return cached;
      }
      return fetch(request);
    })
  );
});
