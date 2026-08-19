/* MUKMAP — Service Worker v1.0 */
const VERSION = 'mukmap-v1.0.32';
const PRECACHE = ['/', '/manifest.webmanifest'];
/* Cache statique versionné : chaque déploiement crée un nouveau cache,
 * les anciens sont purgés à l'activation → jamais de JS périmé. */
const STATIC_CACHE = 'mukmap-static-' + VERSION;
const PAGE_CACHE = 'mukmap-pages-v2';
/* Bibliothèques CDN (MapLibre, Turf, Lucide) précachées pour le mode
 * hors connexion : la carte reste utilisable sans réseau. */
const LIB_CACHE = 'mukmap-libs-v1';
/* Tuiles raster (fond de carte) : cache-avant — une zone une fois
 * téléchargée (parcourue) est consultable hors connexion. */
const TILE_CACHE = 'mukmap-tiles-v1';

const LIBS = [
  'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js',
  'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css',
  'https://unpkg.com/@turf/turf@6/turf.min.js',
  'https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js',
  'https://unpkg.com/lucide@0.460.0/dist/lucide.css',
];

const staticRequest = (req) => {
  const url = new URL(req.url);
  return req.method === 'GET' &&
    url.origin === location.origin &&
    /\.(js|css|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf)$/.test(url.pathname);
};

/* Demande de tuile de fond de carte (fichier image raster). */
const tileRequest = (url) => {
  const h = url.hostname.replace(/^www\./, '');
  const serveursTuiles = /(^|[.-])(cartocdn|openstreetmap|mapbox|maptiler|mapstyle|raster-tiles|basemaps?|arcgisonline|arcgis|esri|opentopomap|eox\.at|earthdata|gibs|mrdata|usgs|brgm|fao)\b/i.test(h);
  const motifTuile = /\b\d{1,3}\/\d{1,3}(\/[a-z0-9@._-]*)?\.(png|jpg|jpeg|webp)([?#].*)?$/i.test(url.pathname);
  /* Tuiles ArcGIS/Esri : /tile/{z}/{y}/{x} sans extension (même hôte) */
  const motifArc = /(^|[.-])(arcgisonline|arcgis|esri)\b/i.test(h) && /\/tile\/\d+\/\d+\/\d+$/.test(url.pathname);
  return serveursTuiles || motifTuiles || motifArc;
};

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    try {
      await cache.addAll(PRECACHE);
    } catch (e) { /* page hors-ligne au premier lancement : ignorée */ }
    const libs = await caches.open(LIB_CACHE);
    await Promise.allSettled(LIBS.map((u) => fetch(u).then((r) => r.ok && libs.put(u, r))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    /* Purge uniquement les caches statiques périmés. LIB_CACHE et
     * TILE_CACHE (hors connexion) sont conservés : la zone téléchargée
     * et les bibliothèques restent disponibles à chaque mise à jour. */
    await Promise.all(keys.filter((k) =>
      /^mukmap-static-/.test(k) && k !== STATIC_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* Bibliothèques CDN : cache d'abord, réseau au manque (même politique que les statiques). */
  if (url.origin !== location.origin && LIBS.indexOf(req.url) !== -1) {
    event.respondWith((async () => {
      const cache = await caches.open(LIB_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      const rep = await fetch(req);
      if (rep.ok) cache.put(req, rep.clone());
      return rep;
    })());
    return;
  }

  /* Tuiles raster : cache d'abord. Une tuile déjà affichée est réutilisable hors connexion. */
  if (url.origin !== location.origin && tileRequest(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(TILE_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const rep = await fetch(req);
        if (rep.ok) cache.put(req, rep.clone());
        return rep;
      } catch (e) {
        return new Response('', { status: 404 });
      }
    })());
    return;
  }

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