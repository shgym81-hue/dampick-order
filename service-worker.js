const CACHE_NAME = "dampick-v6-mobile-orders";

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (cacheNames) {
      return Promise.all(
        cacheNames.map(function (cacheName) {
          if (cacheName.startsWith("dampick-") && cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );

  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(event.request, requestUrl.pathname.endsWith(".html") || requestUrl.pathname.endsWith("/")
      ? { cache: "no-store" }
      : undefined)
      .then(function (response) {
        if (
          response &&
          response.status === 200
        ) {
          const responseCopy =
            response.clone();

          caches
            .open(CACHE_NAME)
            .then(function (cache) {
              cache.put(
                event.request,
                responseCopy
              );
            });
        }

        return response;
      })
      .catch(function () {
        return caches
          .match(event.request)
          .then(function (cachedResponse) {
            return (
              cachedResponse ||
              Response.error()
            );
          });
      })
  );
});
