// EDT Nav: app sempre disponibile offline + mappe già viste salvate sul telefono
const APP = 'edt-nav-app-v10';
const TILES = 'edt-nav-tiles-v1';
const MAX_TILES = 8000; // mappe vettoriali e rilievo: qualche centinaio di MB al massimo
const SHELL = ['./', './index.html', './mappa.js', './difficolta.js', './manifest.json', './icon.svg',
  'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.css'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('edt-nav-app') && k !== APP).map(k => caches.delete(k)))).then(() => self.clients.claim())));

// tasselli mappa: cache prima, poi rete (funzionano anche senza campo una volta visti)
const isTile = u => /edt-nav\/grade\/|openfreemap\.org\/planet\/.+\.pbf|openfreemap\.org\/fonts|elevation-tiles-prod|opentopomap\.org|tile\.openstreetmap\.org|arcgisonline\.com|tile-cyclosm|waymarkedtrails/.test(u);

async function trim() {
  const c = await caches.open(TILES);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]);
}
let trimT = null;

self.addEventListener('fetch', e => {
  const u = e.request.url;
  if (e.request.method !== 'GET') return;
  if (isTile(u)) {
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(u);
      if (hit) return hit;
      try {
        const r = await fetch(e.request);
        if (r.ok) { c.put(u, r.clone()); clearTimeout(trimT); trimT = setTimeout(trim, 5000); }
        return r;
      } catch (err) { return new Response('', { status: 504 }); }
    }));
    return;
  }
  // app e elenco tasselli (planet): rete se c'è, altrimenti copia salvata
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && (u.startsWith(self.location.origin) || u.includes('cdnjs') || u.includes('fonts.g') || u.endsWith('openfreemap.org/planet'))) {
      const cp = r.clone(); caches.open(APP).then(c => c.put(e.request, cp));
    }
    return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});
