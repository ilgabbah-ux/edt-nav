// EDT Nav: app sempre disponibile offline + mappe già viste salvate sul telefono
const APP = 'edt-nav-app-v43';
const TILES = 'edt-nav-tiles-v1';
const MAX_TILES = 8000; // mappe vettoriali e rilievo: qualche centinaio di MB al massimo
const SHELL = ['./', './index.html', './mappa.js?v=23', './difficolta.js?v=24', './percorso.js?v=23', './musica.js?v=1', './profili/moto-off-facile.brf', './profili/moto-off-medio.brf', './profili/moto-off-hard.brf', './manifest.json', './icon-192.png', './icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.css'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('edt-nav-app') && k !== APP).map(k => caches.delete(k)))).then(() => self.clients.claim())));

// tasselli mappa: cache prima, poi rete (funzionano anche senza campo una volta visti)
const isTile = u => /edt-nav\/musica\/|edt-nav\/grade\/|openfreemap\.org\/planet\/.+\.pbf|openfreemap\.org\/fonts|elevation-tiles-prod|opentopomap\.org|tile\.openstreetmap\.org|arcgisonline\.com|tile-cyclosm|waymarkedtrails/.test(u);

async function trim() {
  const c = await caches.open(TILES);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]);
}
let trimT = null, puts = 0;
const tileCache = caches.open(TILES);

self.addEventListener('fetch', e => {
  const u = e.request.url;
  if (e.request.method !== 'GET') return;
  if (isTile(u)) {
    e.respondWith(tileCache.then(async c => {
      const hit = await c.match(u);
      if (hit) return hit;
      try {
        // le canzoni le scarico intere (non a pezzi) così restano sul telefono
        const r = await fetch(/\/musica\//.test(u) ? u : e.request);
        if (r.ok && r.status === 200) { c.put(u, r.clone()); if (++puts % 300 === 0) { clearTimeout(trimT); trimT = setTimeout(trim, 20000); } }
        return r;
      } catch (err) { return new Response('', { status: 504 }); }
    }));
    return;
  }
  // app e elenco tasselli (planet): rete se c'è, altrimenti copia salvata
  // i file dell'app li chiedo sempre freschi (salta la cache del browser di 10 minuti)
  const same = u.startsWith(self.location.origin);
  e.respondWith(fetch(same ? new Request(u, { cache: 'no-cache', credentials: 'same-origin' }) : e.request).then(r => {
    if (r.ok && (u.startsWith(self.location.origin) || u.includes('cdnjs') || u.includes('fonts.g') || u.endsWith('openfreemap.org/planet'))) {
      const cp = r.clone(); caches.open(APP).then(c => c.put(e.request, cp));
    }
    return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});
