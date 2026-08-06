/* MUKMAP — Service Worker v1.0 */
const VERSION = 'mukmap-v1.0.27';
const PRECACHE = ['/', '/manifest.webmanifest'];
/* Cache statique versionné : chaque déploiement crée un nouveau cache,
 * les anciens sont purgés à l'activation → jamais de JS périmé. */
const STATIC_CACHE = 'mukmap-static-' + VERSION;
const PAGE_CACHE = 'mukmap-pages-v2';

const staticRequest = (req) => {
  const url = new URL(req.url);
  return req.method === 'GET' &&
    url.origin === location.origin &&
    /\.(js|css|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf)$/.test(url.pathname);
};

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    try {
      await cache.addAll(PRECACHE);
    } catch (e) { /* page hors-ligne au premier lancement : ignorée */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== STATIC_CACHE && k !== PAGE_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const rep = await fetch(req);
        const cache = await caches.open(PAGE_CACHE);
        cache.put(req, rep.clone());
        return rep;
      } catch (e) {
        const cache = await caches.open(PAGE_CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;
        const root = await caches.match('/');
        if (root) return root;
        return new Response('Hors ligne — MUKMAP non disponible.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }
  if (staticRequest(req)) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const rep = await fetch(req);
        if (rep.ok) cache.put(req, rep.clone());
        return rep;
      } catch (e) {
        return cached || new Response('', { status: 404 });
      }
    })());
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
