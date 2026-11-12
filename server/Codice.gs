/**
 * EDT Nav · servizio posizioni in tempo reale.
 * Ogni telefono chiama ?a=ping con la sua posizione e riceve quelle degli altri dello stesso gruppo.
 * Le posizioni stanno solo in memoria temporanea (CacheService, max 6 ore): nessun foglio, nessuno storico.
 * Pubblicazione: Distribuisci > Nuova distribuzione > App web, esegui come "Me", accesso "Chiunque".
 */
var TTL = 6 * 60 * 60;          // le posizioni spariscono dopo 6 ore
var STALE = 3 * 60 * 60 * 1000; // chi non si fa vivo da 3 ore esce dalla lista
var TRAIL = 45 * 60 * 1000;     // la scia senza campo resta visibile 45 minuti

function doGet(e) {
  var p = e.parameter || {};
  var out;
  try {
    if (p.a === 'ping') out = ping(p);
    else if (p.a === 'bye') out = bye(p);
    else out = { ok: true, msg: 'EDT Nav server attivo' };
  } catch (err) {
    out = { ok: false, error: String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function clean(s, n) { return String(s || '').replace(/[^\w\-\s.àèéìòù]/gi, '').slice(0, n); }
function key(g) { return 'g_' + clean(g, 30).toLowerCase().replace(/\s+/g, '_'); }
function num(v) { var x = parseFloat(v); return isFinite(x) ? x : null; }

function ping(p) {
  var id = clean(p.id, 40), g = key(p.g || 'EDT');
  if (!id) throw 'id mancante';
  var lat = num(p.lat), lon = num(p.lon);
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var cache = CacheService.getScriptCache();
    var all = JSON.parse(cache.get(g) || '{}');
    var now = Date.now();
    if (lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      // scia: dove è passato mentre era senza campo (arriva tutta insieme quando torna il segnale)
      var tr = (all[id] && all[id].tr) || [];
      if (p.tr) String(p.tr).split(';').slice(0, 60).forEach(function (q) {
        var a = q.split(','), la = num(a[0]), lo = num(a[1]), ag = num(a[2]);
        if (la !== null && lo !== null && ag !== null && Math.abs(la) <= 90 && Math.abs(lo) <= 180) tr.push([Math.round(la * 1e5) / 1e5, Math.round(lo * 1e5) / 1e5, now - ag * 1000]);
      });
      tr = tr.filter(function (x) { return now - x[2] < TRAIL; }).sort(function (a, b) { return a[2] - b[2]; }).slice(-80);
      all[id] = {
        n: clean(p.n, 20) || 'Pilota', no: clean(p.no, 4),
        lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6,
        s: num(p.s), h: num(p.h), sos: p.sos === '1', r: clean(p.r, 14), t: now
      };
      if (tr.length) all[id].tr = tr;
    }
    for (var k in all) if (now - all[k].t > STALE) delete all[k];
    cache.put(g, JSON.stringify(all), TTL);
    var others = [];
    for (var k2 in all) if (k2 !== id) { var r = all[k2]; r.id = k2; if (r.tr) { r.tr = r.tr.filter(function (x) { return now - x[2] < TRAIL; }).map(function (x) { return [x[0], x[1]]; }); if (!r.tr.length) delete r.tr; } r.ago = Math.round((now - r.t) / 1000); others.push(r); }
    return { ok: true, now: now, riders: others };
  } finally {
    lock.releaseLock();
  }
}

function bye(p) {
  var id = clean(p.id, 40), g = key(p.g || 'EDT');
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var cache = CacheService.getScriptCache();
    var all = JSON.parse(cache.get(g) || '{}');
    delete all[id];
    cache.put(g, JSON.stringify(all), TTL);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}
