/**
 * EDT Nav · servizio posizioni in tempo reale.
 * Ogni telefono chiama ?a=ping con la sua posizione e riceve quelle degli altri dello stesso gruppo.
 * Le posizioni stanno solo in memoria temporanea (CacheService, max 6 ore): nessun foglio, nessuno storico.
 * Pubblicazione: Distribuisci > Nuova distribuzione > App web, esegui come "Me", accesso "Chiunque".
 */
var TTL = 6 * 60 * 60;          // le posizioni spariscono dopo 6 ore
var STALE = 3 * 60 * 60 * 1000; // chi non si fa vivo da 3 ore esce dalla lista
var MSG = 10 * 60 * 1000;       // i messaggi veloci restano 10 minuti
var TRAIL = 45 * 60 * 1000;     // la scia senza campo resta visibile 45 minuti

function doGet(e) {
  var p = e.parameter || {};
  var out;
  try {
    if (p.a === 'ping') out = ping(p);
    else if (p.a === 'bye') out = bye(p);
    else if (p.a === 'tget') out = trackGet(p);
    else if (p.a === 'lead') out = leadGet(p);
    else if (p.a === 'stats') out = statsGet(p);
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
      var old = all[id];
      var tr = (old && old.tr) || [];
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
      if (old && old.m && now - old.m.t < MSG) all[id].m = old.m;          // messaggio veloce ancora valido
      if (p.m) all[id].m = { c: clean(p.m, 14), t: now };
      if (p.ro === 'A' || p.ro === 'S') all[id].ro = p.ro;
    }
    for (var k in all) if (now - all[k].t > STALE) delete all[k];
    cache.put(g, JSON.stringify(all), TTL);
    // punto di ritrovo del gruppo
    var rv = JSON.parse(cache.get(g + '_rv') || 'null');
    if (p.rv === 'x') { rv = null; cache.remove(g + '_rv'); }
    else if (p.rv) {
      var a = String(p.rv).split(','), rl = num(a[0]), ro = num(a[1]);
      if (rl !== null && ro !== null && Math.abs(rl) <= 90 && Math.abs(ro) <= 180) { rv = { lat: rl, lon: ro, by: clean(p.n, 20), t: now }; cache.put(g + '_rv', JSON.stringify(rv), TTL); }
    }
    // punti e pericoli segnalati sulla traccia
    var poi = JSON.parse(cache.get(g + '_poi') || '[]');
    if (p.poi) {
      var q = String(p.poi).split(','), pk = clean(q[0], 12), pl = num(q[1]), po = num(q[2]);
      if (pk && pl !== null && po !== null) { poi.push({ id: 'p' + now + Math.floor(Math.random() * 1000), k: pk, lat: pl, lon: po, by: clean(p.n, 20), t: now }); poi = poi.slice(-80); cache.put(g + '_poi', JSON.stringify(poi), TTL); }
    }
    if (p.delpoi) { poi = poi.filter(function (x) { return x.id !== p.delpoi; }); cache.put(g + '_poi', JSON.stringify(poi), TTL); }
    // la strada fatta dall'apripista
    var lead = JSON.parse(cache.get(g + '_lead') || '{"base":0,"pts":[]}');
    if (p.ro === 'A' && lat !== null && lon !== null) {
      var lp = lead.pts[lead.pts.length - 1];
      if (lead.by !== clean(p.n, 20)) { lead = { base: lead.base + lead.pts.length, pts: [], by: clean(p.n, 20) }; lp = null; }
      if (!lp || Math.abs(lp[0] - lat) * 111000 + Math.abs(lp[1] - lon) * 78000 > 40) {
        lead.pts.push([Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5]);
        if (lead.pts.length > 3000) { lead.base += 500; lead.pts = lead.pts.slice(500); }
        cache.put(g + '_lead', JSON.stringify(lead), TTL);
      }
    }
    var trk = JSON.parse(cache.get(g + '_trkm') || 'null');
    var others = [];
    for (var k2 in all) if (k2 !== id) { var r = all[k2]; r.id = k2; if (r.tr) { r.tr = r.tr.filter(function (x) { return now - x[2] < TRAIL; }).map(function (x) { return [x[0], x[1]]; }); if (!r.tr.length) delete r.tr; } r.ago = Math.round((now - r.t) / 1000); others.push(r); }
    return { ok: true, now: now, riders: others, rv: rv, poi: poi, lead: lead.by ? { by: lead.by, n: lead.base + lead.pts.length } : null, trk: trk };
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

/* ---------- backup dei giri registrati su Drive ----------
   EXPORT_KEY (codice archivio) e TRACKS_ROOT (id cartella "tracks") sono definiti solo nel progetto Apps Script,
   non qui nel repo pubblico. I giri finiscono in tracks/Giri EDT Nav/<nome pilota>/. */
function doPost(e) {
  var out;
  try {
    var b = JSON.parse((e.postData && e.postData.contents) || '{}');
    if (b.a === 'tset') out = trackSet(b);
    else if (b.a === 'ride') out = rideAdd(b);
    else if (b.a === 'bug') out = bugAdd(b);
    else if (b.key !== EXPORT_KEY) out = { ok: false, error: 'codice' };
    else if (b.a === 'save') out = saveRide(b);
    else if (b.a === 'blist') out = listRides(b);
    else if (b.a === 'bget') { var f = DriveApp.getFileById(String(b.id)); out = { ok: true, name: f.getName(), text: f.getBlob().getDataAsString() }; }
    else out = { ok: false, error: 'azione' };
  } catch (err) {
    out = { ok: false, error: String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
function sub(parent, name) { var it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : parent.createFolder(name); }
function ridesFolder(n) { return sub(sub(DriveApp.getFolderById(TRACKS_ROOT), 'Giri EDT Nav'), clean(n, 20) || 'Senza nome'); }
function saveRide(b) {
  var name = String(b.file || 'giro.gpx').replace(/[\/\\:*?"<>|]+/g, '_').slice(0, 80);
  if (!/\.gpx$/i.test(name)) name += '.gpx';
  var gpx = String(b.gpx || '');
  if (gpx.length < 50 || gpx.length > 20000000 || gpx.indexOf('<gpx') < 0) return { ok: false, error: 'gpx' };
  var dir = ridesFolder(b.n), ex = dir.getFilesByName(name);
  if (ex.hasNext()) return { ok: true, id: ex.next().getId(), dup: true };
  return { ok: true, id: dir.createFile(name, gpx, 'application/gpx+xml').getId() };
}
function listRides(b) {
  var it = ridesFolder(b.n).getFiles(), out = [];
  while (it.hasNext()) { var f = it.next(); if (/\.gpx$/i.test(f.getName())) out.push({ id: f.getId(), name: f.getName() }); }
  return { ok: true, files: out };
}

/* ---------- traccia del giro mandata a tutto il gruppo ---------- */
var CH = 90000;  // la cache tiene al massimo 100 KB per voce: spezzo la traccia
function trackSet(b) {
  var g = key(b.g || 'EDT'), pts = String(b.pts || ''), w = String(b.w || '');
  if (pts.length < 20 || pts.length > 900000) return { ok: false, error: 'traccia' };
  var cache = CacheService.getScriptCache(), now = Date.now(), n = Math.ceil(pts.length / CH), put = {};
  for (var i = 0; i < n; i++) put[g + '_trk_' + i] = pts.substr(i * CH, CH);
  put[g + '_trkw'] = w.slice(0, 90000);
  var meta = { id: 't' + now, name: clean(b.name, 40) || 'Giro', by: clean(b.n, 20), t: now, c: n };
  put[g + '_trkm'] = JSON.stringify(meta);
  cache.putAll(put, TTL);
  return { ok: true, trk: meta };
}
function trackGet(p) {
  var g = key(p.g || 'EDT'), cache = CacheService.getScriptCache(), meta = JSON.parse(cache.get(g + '_trkm') || 'null');
  if (!meta) return { ok: false, error: 'nessuna' };
  var keys = []; for (var i = 0; i < meta.c; i++) keys.push(g + '_trk_' + i);
  var got = cache.getAll(keys), pts = '';
  for (var j = 0; j < keys.length; j++) { if (got[keys[j]] == null) return { ok: false, error: 'scaduta' }; pts += got[keys[j]]; }
  return { ok: true, trk: meta, pts: pts, w: cache.get(g + '_trkw') || '' };
}
function leadGet(p) {
  var g = key(p.g || 'EDT'), lead = JSON.parse(CacheService.getScriptCache().get(g + '_lead') || '{"base":0,"pts":[]}');
  var from = Math.max(0, (num(p.from) || 0) - lead.base);
  return { ok: true, by: lead.by || '', base: lead.base, from: lead.base + from, pts: lead.pts.slice(from) };
}

/* ---------- classifica: giri di oggi e totali della stagione ----------
   Salvati in un file JSON su Drive (tracks/Giri EDT Nav/classifica-<gruppo>.json): Drive è già autorizzato. */
/* ---------- segnalazioni dei problemi dall'app: un file di testo (più l'eventuale screenshot) in Drive ---------- */
function bugAdd(b) {
  var cache = CacheService.getScriptCache(), k = 'bugs_' + Utilities.formatDate(new Date(), 'Europe/Rome', 'yyyyMMddHH'), n = +(cache.get(k) || 0);
  if (n >= 40) return { ok: false, error: 'troppe' };
  cache.put(k, String(n + 1), 3700);
  var dir = sub(sub(DriveApp.getFolderById(TRACKS_ROOT), 'Giri EDT Nav'), 'Segnalazioni');
  var stamp = Utilities.formatDate(new Date(), 'Europe/Rome', 'yyyy-MM-dd HH.mm.ss'), who = clean(b.n, 20) || 'anonimo', name = stamp + ' - ' + who;
  dir.createFile(name + '.txt', 'Da: ' + who + ' (gruppo ' + clean(b.g, 20) + ')\n' + stamp + '\n\n' + String(b.txt || '').slice(0, 4000) + '\n\n--- dati del telefono ---\n' + String(b.info || '').slice(0, 20000), 'text/plain');
  var m = String(b.img || '').match(/^data:image\/(jpeg|png);base64,(.+)$/);
  if (m && m[2].length < 2000000) dir.createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), 'image/' + m[1], name + (m[1] === 'png' ? '.png' : '.jpg')));
  return { ok: true };
}
function statsFile(g) {
  var dir = sub(DriveApp.getFolderById(TRACKS_ROOT), 'Giri EDT Nav'), name = 'classifica-' + g + '.json', it = dir.getFilesByName(name);
  return it.hasNext() ? it.next() : dir.createFile(name, '{}', 'application/json');
}
function rideAdd(b) {
  var g = key(b.g || 'EDT'), n = clean(b.n, 20) || 'Pilota', now = new Date();
  var r = { n: n, km: Math.round((num(b.km) || 0) * 10) / 10, time: Math.round(num(b.time) || 0), gain: Math.round(num(b.gain) || 0), max: Math.round(num(b.max) || 0), avg: Math.round(num(b.avg) || 0), t: now.getTime() };
  if (r.km < 1 || r.km > 1500) return { ok: false, error: 'giro' };
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    var f = statsFile(g), st = JSON.parse(f.getBlob().getDataAsString() || '{}'), day = Utilities.formatDate(now, 'Europe/Rome', 'yyyy-MM-dd'), y = String(now.getFullYear());
    if (st.day !== day) { st.day = day; st.rides = []; }
    st.rides.push(r); st.rides = st.rides.slice(-60);
    st.season = st.season || {}; var s = st.season[y] || {}, x = s[n] || { km: 0, rides: 0, gain: 0, max: 0 };
    x.km = Math.round((x.km + r.km) * 10) / 10; x.rides++; x.gain += r.gain; x.max = Math.max(x.max, r.max); s[n] = x; st.season[y] = s;
    f.setContent(JSON.stringify(st));
  } finally { lock.releaseLock(); }
  return { ok: true };
}
function statsGet(p) {
  var g = key(p.g || 'EDT'), now = new Date(), st = JSON.parse(statsFile(g).getBlob().getDataAsString() || '{}');
  var day = Utilities.formatDate(now, 'Europe/Rome', 'yyyy-MM-dd'), y = String(now.getFullYear());
  return { ok: true, day: st.day === day ? st.rides : [], season: (st.season || {})[y] || {}, year: now.getFullYear() };
}

// Da eseguire una volta dall'editor: chiede il permesso di scrivere su Drive (classifica e backup dei giri)
function autorizzaDrive() { var f = DriveApp.getFolderById(TRACKS_ROOT).createFolder('prova-permesso-EDT-Nav'); f.setTrashed(true); Logger.log('Permesso Drive ok'); }
