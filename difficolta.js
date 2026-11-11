/* EDT Nav · colori per grado di difficoltà delle sterrate.
   Per la zona inquadrata scarica da OpenStreetMap (Overpass) le sterrate con il loro grado
   (tracktype, oppure smoothness quando manca), le salva sul telefono (IndexedDB, valide 30 giorni)
   e le disegna sopra la mappa: verde scuro = asfaltata/compatta … rosso = pessima.
   La mappa si divide in quadrati di ~10 km (tasselli z12): ogni quadrato si scarica una volta sola. */
(function () {
  const Z = 12, TTL = 30 * 864e5, MAX_VIEW = 8;
  const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
  const COLORS = { 1: '#1b7f2a', 2: '#43b649', 3: '#f2c200', 4: '#f07c00', 5: '#d7261e' };
  const SMOOTH = { excellent: 1, good: 1, intermediate: 2, bad: 3, very_bad: 4, horrible: 5, very_horrible: 5, impassable: 5 };

  // --- tasselli ---
  const lon2x = (lon) => Math.floor((lon + 180) / 360 * 2 ** Z);
  const lat2y = (lat) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** Z); };
  const x2lon = (x) => x / 2 ** Z * 360 - 180;
  const y2lat = (y) => { const n = Math.PI - 2 * Math.PI * y / 2 ** Z; return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };
  function tilesIn(w, s, e, n) {
    const out = [];
    for (let x = lon2x(w); x <= lon2x(e); x++) for (let y = lat2y(n); y <= lat2y(s); y++) out.push(x + '/' + y);
    return out;
  }

  // --- memoria sul telefono ---
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('edt-difficolta', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('t');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }).catch(() => null);
    return dbp;
  }
  async function getT(k) { const d = await db(); if (!d) return null; return new Promise(r => { const q = d.transaction('t').objectStore('t').get(k); q.onsuccess = () => r(q.result || null); q.onerror = () => r(null); }); }
  async function putT(k, v) { const d = await db(); if (!d) return; return new Promise(r => { const tx = d.transaction('t', 'readwrite'); tx.objectStore('t').put(v, k); tx.oncomplete = r; tx.onerror = r; }); }

  // --- scaricamento ---
  function grade(tags) {
    const t = tags.tracktype && /^grade([1-5])$/.exec(tags.tracktype);
    if (t) return +t[1];
    if (tags.smoothness && SMOOTH[tags.smoothness]) return SMOOTH[tags.smoothness];
    return 0;
  }
  async function download(key) {
    const [x, y] = key.split('/').map(Number);
    const s = y2lat(y + 1), n = y2lat(y), w = x2lon(x), e = x2lon(x + 1);
    const q = `[out:json][timeout:25];way["highway"="track"](${s},${w},${n},${e});out tags geom;`;
    let lastErr;
    for (const url of SERVERS) {
      try {
        const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        if (!r.ok) { lastErr = new Error('HTTP ' + r.status); continue; }
        const j = await r.json();
        const feats = [];
        for (const el of j.elements || []) {
          if (!el.geometry || el.geometry.length < 2) continue;
          const g = grade(el.tags || {});
          if (!g) continue;
          feats.push({ type: 'Feature', properties: { g }, geometry: { type: 'LineString', coordinates: el.geometry.map(p => [+p.lon.toFixed(6), +p.lat.toFixed(6)]) } });
        }
        return feats;
      } catch (err) { lastErr = err; }
    }
    throw lastErr || new Error('rete');
  }

  // --- stato ---
  const mem = new Map();          // tassello -> features
  const queue = []; let busy = false; let onChange = () => {};
  let status = { loading: 0, failed: 0 };
  async function ensure(key) {
    if (mem.has(key)) return;
    const c = await getT(key);
    if (c && Date.now() - c.t < TTL) { mem.set(key, c.f); onChange(); return; }
    if (c) mem.set(key, c.f);       // vecchio ma meglio di niente, lo aggiorno
    if (!queue.includes(key)) queue.push(key);
    pump();
  }
  async function pump() {
    if (busy || !queue.length || !navigator.onLine) return;
    busy = true; status.loading = queue.length; onChange();
    const key = queue.shift();
    try { const f = await download(key); mem.set(key, f); await putT(key, { t: Date.now(), f }); status.failed = 0; }
    catch (e) { status.failed++; }
    busy = false; status.loading = queue.length; onChange();
    if (queue.length) setTimeout(pump, status.failed ? 5000 : 1200);
  }

  window.EDTGRADE = {
    COLORS,
    // zona inquadrata (aggiunge in coda solo se la zona non è troppo grande)
    view(b) {
      const keys = tilesIn(b.getWest(), b.getSouth(), b.getEast(), b.getNorth());
      if (keys.length > MAX_VIEW) return keys.filter(k => mem.has(k));
      keys.forEach(ensure); return keys;
    },
    // lungo una traccia GPX: scarica in anticipo per averla offline
    along(pts) {
      const keys = new Set(); pts.forEach(p => keys.add(lon2x(p[1]) + '/' + lat2y(p[0])));
      [...keys].slice(0, 80).forEach(ensure); return keys.size;
    },
    collect(keys) {
      const f = []; keys.forEach(k => { const a = mem.get(k); if (a) f.push(...a); });
      return { type: 'FeatureCollection', features: f };
    },
    status: () => status,
    onChange(fn) { onChange = fn; },
    retry() { pump(); }
  };
  window.addEventListener('online', () => window.EDTGRADE.retry());
})();
