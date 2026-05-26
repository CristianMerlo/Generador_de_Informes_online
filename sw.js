const CACHE_NAME = 'mostaza-elite-v12-6';
const assets = ['index.html', 'manifest.json'];

// Instalación: Guardar archivos en caché y forzar activación inmediata
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(assets))
  );
});

// Activación: Limpiar cachés antiguos de versiones anteriores
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Estrategia de Fetch: Network-First para index.html (siempre busca la versión online si hay internet)
self.addEventListener('fetch', e => {
  if (e.request.url.startsWith(self.location.origin)) {
    e.respondWith(
      fetch(e.request)
        .then(response => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(e.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(e.request);
        })
    );
  }
});
