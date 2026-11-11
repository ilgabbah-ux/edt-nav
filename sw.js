// EDT Nav: app sempre disponibile offline + mappe già viste salvate sul telefono
const APP = 'edt-nav-app-v3';
const TILES = 'edt-nav-tiles-v1';
const MAX_TILES = 6000; // circa 100-150 MB al massimo
const SHELL = ['./', './index.html', './manifest.json', './icon.svg',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdn.jsdelivr.net/npm/leaflet-rotate@0.2.8/dist/leaflet-rotate-src.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

const isTile = u => /opentopomap\.org|tile\.openstreetmap\.org|arcgisonline\.com|tile-cyclosm|cartocdn\.com|waymarkedtrails/.test(u);

async function trim() {
  const c = await caches.open(TILES);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', e => {
  const u = e.request.url;
  if (e.request.method !== 'GET') return;
  if (isTile(u)) {
    // mappa: prima dal telefono, altrimenti scarica e salva
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(u);
      if (hit) return hit;
      try {
        const r = await fetch(e.request);
        if (r.ok || r.type === 'opaque') { c.put(u, r.clone()); trim(); }
        return r;
      } catch (err) { return new Response('', { status: 504 }); }
    }));
    return;
  }
  // app: rete se c'è (aggiornamenti), altrimenti copia salvata
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && (u.startsWith(self.location.origin) || u.includes('cdnjs') || u.includes('jsdelivr') || u.includes('fonts.g'))) {
      const cp = r.clone(); caches.open(APP).then(c => c.put(e.request, cp));
    }
    return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});
