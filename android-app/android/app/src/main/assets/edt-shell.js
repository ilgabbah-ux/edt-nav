/* EDT Nav - guscio Android.
   Questo script gira dentro l'APK prima dell'app web e collega le funzioni del browser
   a quelle native: GPS che continua a schermo spento, voce, schermo acceso, condivisione.
   L'app web non cambia: nel browser normale questo file non esiste. */
(function () {
  if (window.__edtShell || window.top !== window || location.hostname !== 'ilgabbah-ux.github.io') return;
  var cap = function () { var c = window.Capacitor; return c && c.nativeCallback && c.nativePromise ? c : null; };
  var shell = function () { return window.EDTShell || null; };
  window.EDT_APK = true;

  /* ---------- stato dell'app web (variabili globali di index.html) ---------- */
  // window.edtStato() lo espone index.html (dalla v71). Se manca (versione vecchia in cache) tengo vivo comunque:
  // ci pensa la sicurezza batteria a spegnere dopo 30 minuti da fermo.
  function stato() { try { return typeof window.edtStato === 'function' ? window.edtStato() : null; } catch (e) { return null; } }
  function recOn() { var s = stato(); return !!(s && s.giro); }
  function busy() { var s = stato(); return s ? !!(s.giro || s.gruppo || s.naviga || s.traccia) : true; }

  /* ---------- GPS nativo ---------- */
  var geo = navigator.geolocation, orig = geo ? { w: geo.watchPosition.bind(geo), c: geo.clearWatch.bind(geo), g: geo.getCurrentPosition.bind(geo) } : null;
  var watchers = new Map(), seq = 1000, nid = null, last = null, hidden = false, idleStop = false, anchor = null, anchorT = 0, askedNotif = false;
  var IDLE_M = 100, IDLE_MS = 30 * 60 * 1000;
  function dist(a, b) {
    var R = 6371000, r = Math.PI / 180, dla = (b[0] - a[0]) * r, dlo = (b[1] - a[1]) * r;
    var x = Math.sin(dla / 2) * Math.sin(dla / 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dlo / 2) * Math.sin(dlo / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function report() { try { shell().setActive(!!(nid != null && watchers.size && busy())); } catch (e) {} }
  function each(fn) { Array.from(watchers.values()).forEach(function (w) { try { fn(w); } catch (e) {} }); }
  function onNative(loc, err) {
    if (err || !loc) {
      var denied = err && (err.code === 'NOT_AUTHORIZED' || /denied|disabled/i.test(err.message || ''));
      nid = null;
      var ws = Array.from(watchers.values());
      // permesso negato: per il browser quel watch e' morto (l'app web ne aprira' uno nuovo); altri errori: riprovo da solo
      if (denied) watchers.clear(); else setTimeout(function () { if (watchers.size && (!hidden || busy())) startNative(); }, 5000);
      report();
      ws.forEach(function (w) { try { if (w.e) w.e({ code: denied ? 1 : 2, message: (err && err.message) || 'GPS', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }); } catch (e) {} });
      return;
    }
    var pos = {
      coords: {
        latitude: loc.latitude, longitude: loc.longitude,
        accuracy: loc.accuracy == null ? 0 : loc.accuracy,
        altitude: loc.altitude == null ? null : loc.altitude,
        altitudeAccuracy: loc.altitudeAccuracy == null ? null : loc.altitudeAccuracy,
        heading: loc.bearing == null ? null : loc.bearing,
        speed: loc.speed == null ? null : loc.speed
      },
      timestamp: loc.time || Date.now()
    };
    last = pos;
    if (!askedNotif) { askedNotif = true; try { shell().askNotifications(); } catch (e) {} }
    // sicurezza batteria: in background, senza giro in registrazione, fermo da 30 minuti -> spengo il GPS
    var p = [loc.latitude, loc.longitude], now = Date.now();
    if (!anchor || dist(anchor, p) > IDLE_M) { anchor = p; anchorT = now; }
    if (hidden && !recOn() && now - anchorT > IDLE_MS) { idleStop = true; stopNative(); return; }
    each(function (w) { w.s(pos); });
  }
  function startNative() {
    var c = cap(); if (!c || nid != null) return;
    anchor = null;
    try {
      nid = c.nativeCallback('BackgroundGeolocation', 'addWatcher', {
        backgroundTitle: 'EDT Nav',
        backgroundMessage: 'GPS attivo anche a schermo spento. Tocca per tornare alla mappa.',
        requestPermissions: true, stale: false, distanceFilter: 0
      }, onNative);
    } catch (e) { nid = null; }
    report();
  }
  function stopNative() {
    var c = cap(), id = nid; nid = null;
    if (c && id != null) { try { c.nativePromise('BackgroundGeolocation', 'removeWatcher', { id: id }).catch(function () {}); } catch (e) {} }
    report();
  }
  if (geo && orig) {
    var watch = function (s, e, o) {
      if (!cap()) return orig.w(s, e, o);
      var id = seq++; watchers.set(id, { s: s, e: e });
      if (!hidden || busy()) startNative();
      return id;
    };
    var clear = function (id) {
      if (watchers.has(id)) { watchers.delete(id); if (!watchers.size) stopNative(); return; }
      orig.c(id);
    };
    var current = function (s, e, o) {
      if (!cap()) return orig.g(s, e, o);
      o = o || {};
      if (last && nid != null && Date.now() - last.timestamp <= Math.max(o.maximumAge || 0, 5000)) { var p = last; setTimeout(function () { s(p); }, 0); return; }
      var done = false, t = null, id = watch(function (p) { if (done) return; done = true; clearTimeout(t); clear(id); s(p); },
        function (er) { if (done) return; done = true; clearTimeout(t); clear(id); if (e) e(er); });
      t = setTimeout(function () { if (done) return; done = true; clear(id); if (e) e({ code: 3, message: 'timeout', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }); }, o.timeout > 0 && isFinite(o.timeout) ? o.timeout : 20000);
    };
    try {
      Object.defineProperty(geo, 'watchPosition', { configurable: true, writable: true, value: watch });
      Object.defineProperty(geo, 'clearWatch', { configurable: true, writable: true, value: clear });
      Object.defineProperty(geo, 'getCurrentPosition', { configurable: true, writable: true, value: current });
    } catch (e) {}
  }
  setInterval(report, 4000);

  /* ---------- visibilita': per Chrome la pagina resta "visibile" (niente rallentamenti a schermo spento),
     ma all'app web racconto la verita' cosi' salva i dati quando va in background ---------- */
  try {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: function () { return hidden ? 'hidden' : 'visible'; } });
    Object.defineProperty(document, 'hidden', { configurable: true, get: function () { return hidden; } });
    document.addEventListener('visibilitychange', function (ev) { if (ev.isTrusted) ev.stopImmediatePropagation(); }, true);
  } catch (e) {}

  window.__edtShell = {
    bg: function (h) {
      h = !!h; if (h === hidden) return; hidden = h;
      if (h) { anchor = null; if (!busy()) stopNative(); }
      else { idleStop = false; if (watchers.size) startNative(); }
      report();
      try { document.dispatchEvent(new Event('visibilitychange')); } catch (e) {}
    },
    state: function () { return { hidden: hidden, watchers: watchers.size, native: nid, busy: busy(), idleStop: idleStop, last: last && last.timestamp }; }
  };

  /* ---------- schermo acceso ---------- */
  try {
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true, value: {
        request: function () {
          var c = cap(); if (!c) return Promise.reject(new Error('non disponibile'));
          c.nativePromise('KeepAwake', 'keepAwake', {}).catch(function () {});
          return Promise.resolve({
            released: false, type: 'screen', addEventListener: function () {}, removeEventListener: function () {},
            release: function () { this.released = true; var k = cap(); return k ? k.nativePromise('KeepAwake', 'allowSleep', {}).catch(function () {}) : Promise.resolve(); }
          });
        }
      }
    });
  } catch (e) {}

  /* ---------- voce del navigatore (nel WebView la sintesi vocale del browser non parla) ---------- */
  try {
    var cur = null;
    var Utt = function (t) { this.text = t == null ? '' : String(t); this.lang = ''; this.rate = 1; this.pitch = 1; this.volume = 1; this.onend = null; this.onerror = null; this.onstart = null; };
    var fire = function (u, ok) { var f = ok ? u.onend : u.onerror; if (typeof f === 'function') { try { f({ utterance: u, error: ok ? undefined : 'synthesis-failed' }); } catch (e) {} } };
    var synth = {
      speaking: false, pending: false, paused: false,
      getVoices: function () { return []; }, addEventListener: function () {}, removeEventListener: function () {}, pause: function () {}, resume: function () {},
      cancel: function () {
        var u = cur; cur = null; synth.speaking = false; if (!u) return; u._x = true;
        var c = cap(); if (c) { try { c.nativePromise('TextToSpeech', 'stop', {}).catch(function () {}); } catch (e) {} }
        setTimeout(function () { if (!cur) fire(u, false); }, 0);   // se subito dopo parte un'altra frase non tocco la musica
      },
      speak: function (u) {
        var c = cap(); if (!c || !u) { if (u) fire(u, false); return; }
        cur = u; synth.speaking = true;
        var done = function (ok) { if (u._x) return; if (cur === u) { cur = null; synth.speaking = false; } fire(u, ok); };
        c.nativePromise('TextToSpeech', 'speak', { text: String(u.text || ''), lang: u.lang || 'it-IT', rate: u.rate || 1, pitch: u.pitch || 1, volume: u.volume == null ? 1 : u.volume, queueStrategy: 0 })
          .then(function () { done(true); }, function () { done(false); });
      }
    };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, writable: true, value: Utt });
  } catch (e) {}

  /* ---------- condividi (WhatsApp ecc.): nel WebView navigator.share non esiste ---------- */
  try {
    var b64 = function (f) {
      return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(',')[1] || ''); }; r.onerror = function () { rej(r.error); }; r.readAsDataURL(f); });
    };
    var share = function (d) {
      d = d || {};
      var s = shell(); if (!s) return Promise.reject(new Error('non disponibile'));
      var files = Array.from(d.files || []);
      return Promise.all(files.map(function (f) { return b64(f).then(function (x) { return { name: f.name || 'file', type: f.type || 'application/octet-stream', b64: x }; }); }))
        .then(function (fs) { s.share(JSON.stringify({ title: d.title || '', text: d.text || '', url: d.url || '', files: fs })); });
    };
    Object.defineProperty(navigator, 'share', { configurable: true, writable: true, value: share });
    Object.defineProperty(navigator, 'canShare', { configurable: true, writable: true, value: function () { return !!shell(); } });
  } catch (e) {}
})();
