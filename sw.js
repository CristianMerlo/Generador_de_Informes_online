/* Service Worker del Generador V13 — actualización transparente sin reinstalar.
   Estrategia (desde V13.7.2):
   - Navegación / index.html: SIEMPRE red primero (la app abierta muestra la
     versión recién publicada en el primer intento; la caché es solo respaldo
     offline). Esto rompe el ciclo anterior donde el index podrido registraba
     el sw podrido y nadie chequeaba novedades.
   - Assets con ?v= (los carga index con MTZ_VERSION): cache-first con
     revalidación; al cambiar la versión cambia la URL y nunca se lee viejo.
   - El SW nuevo se activa inmediatamente (skipWaiting + clients.claim) y la
     app recarga sola al detectar el controllerchange (ver js/app.js). */
const VERSION = 'mostaza-informes-v13-10-3';
const ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'css/app.css',
  'img/logo.png',
  'vendor/jspdf.umd.min.js',
  'js/config.js',
  'js/db.js',
  'js/locales.js',
  'js/almacen.js',
  'js/agua.js',
  'js/firmas.js',
  'js/pdf.js',
  'js/app.js'
];

self.addEventListener('install', e => {
  self.skipWaiting(); // no esperar a que se cierren las pestañas
  e.waitUntil(
    caches.open(VERSION).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== VERSION).map(key => caches.delete(key))
    )).then(() => self.clients.claim()) // tomar el control de las pestañas abiertas ya
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // fuentes/CDNs: pasar directo a la red

  const esNavegacion = e.request.mode === 'navigate' ||
    url.pathname === '/' || url.pathname.endsWith('/index.html');

  if (esNavegacion) {
    // Red primero: con señal, siempre la última versión publicada.
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).then(res => {
        const clone = res.clone();
        caches.open(VERSION).then(c => c.put(e.request, clone)).catch(() => {});
        return res;
      }).catch(() =>
        // Offline: la última copia conocida del index, venga como venga URL.
        caches.match('index.html', { ignoreSearch: true })
      )
    );
    return;
  }

  // Resto de assets: stale-while-revalidate (instantáneo + actualización de fondo).
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(VERSION).then(cache => cache.put(e.request, clone)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
