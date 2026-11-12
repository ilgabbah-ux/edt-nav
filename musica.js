/* EDT Nav · musica in sella.
   - "Il GaBbAH": le canzoni del Gabbah già nell'app (cartella musica/)
   - "I miei brani": file audio dal telefono, salvati nell'app (IndexedDB) come playlist personale
   - "Streaming": apre l'app di Spotify / YouTube Music / ecc. con il proprio account; la musica continua sotto EDT Nav
   Comandi anche dalla schermata di blocco e dalle cuffie (Media Session). */
(function () {
  const GABBAH = [
    ['giro-easy', 'Tranquilli, è un giro easy'], ['bosco-veloce', 'Bosco Veloce'], ['re-dell-ignoranza', "Re dell'ignoranza"],
    ['bosco-dell-ignoranza', "Il Bosco dell'ignoranza"], ['kick-up-the-dust', 'Kick Up the Dust'], ['enduro-is-not-a-crime', 'Enduro Is Not a Crime'],
    ['lenduro-non-e-reato', "L'enduro non è reato"], ['gas-a-martello', 'Gas a martello'], ['salita-infame', 'Salita infame'],
    ['supereroi-contro-le-gev', 'Supereroi contro le GEV'], ['same-blood', 'Same Blood'], ['hell-can-wait', 'Hell Can Wait'],
    ['suka-suka', 'SUKA SUKA'], ['vai-ciccio', 'Vai Ciccio'], ['brindisi-easy', 'Brindisi Easy'], ['gusta-ranch', 'Gusta Ranch'],
    ['orto-bio', 'Orto Bio'], ['leventino-2026', 'Leventino 2026'], ['mirco-e-gabbah-fest-v2', 'Mirco e Gabbah Fest'],
    ['angelo-potter', 'Angelo Potter'], ['angelo-vs-gabbah', 'Angelo vs Gabbah'], ['costa-vs-linus', 'Costa vs Linus'],
    ['sergione-vs-renard', 'Sergione vs Renard'], ['christmas-madness', 'Christmas Madness'], ['ethereal-hammer', 'Ethereal Hammer'],
    ['fango-senza-pieta', 'Fango senza pietà'], 
    ['euro-zero-inferno', 'Euro Zero Inferno'], ['ti-fa-male-la-gamba', 'Ti fa male la gamba?'],
    ['re-dell-ignoranza-4x4', "I Re dell'ignoranza 4x4"], ['halloween-trial-team-night', 'Halloween (Trial Team Night)'], 
    ['ansia-da-colonnina', 'Ansia da colonnina'], ['quanto-costa', 'Quanto costa?'],
    ['bollo-addio', 'Bollo addio! Pieno porco dio!'], ['lultimo-e-poi-andiamo', "L'ultimo e poi andiamo!"], 
    ['mirco-vs-miti', 'Mirco vs Miti'], ['purcello-vs-paletta', 'Purcello vs Paletta'], ['angelo', 'Angelo'],
    ['costa-gay', 'Costa Gay'], 
    ['all-i-want-for-xmas-is-edt', 'All I Want for Xmas Is EDT'],
    ['prosecco-e-spritz', 'Prosecco e Spritz'], ['mami-lo-spritz', 'Mami lo Spritz!'],
    ['porco-dio', 'Porco Dio!']
  ].map(([f, t]) => ({ id: 'g:' + f, title: t, artist: 'Il GaBbAH', src: 'musica/' + f + '.mp3' }));

  // --- memoria brani personali ---
  let dbp;
  function db() {
    return dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open('edt-musica', 1); r.onupgradeneeded = () => r.result.createObjectStore('b', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }).catch(() => null));
  }
  async function allMine() { const d = await db(); if (!d) return []; return new Promise(r => { const q = d.transaction('b').objectStore('b').getAll(); q.onsuccess = () => r((q.result || []).sort((a, b) => a.order - b.order)); q.onerror = () => r([]); }); }
  async function putMine(x) { const d = await db(); if (!d) throw new Error('memoria non disponibile'); return new Promise((r, j) => { const tx = d.transaction('b', 'readwrite'); tx.objectStore('b').put(x); tx.oncomplete = r; tx.onerror = () => j(tx.error); }); }
  async function delMine(id) { const d = await db(); if (!d) return; return new Promise(r => { const tx = d.transaction('b', 'readwrite'); tx.objectStore('b').delete(id); tx.oncomplete = r; tx.onerror = r; }); }

  // --- lettore ---
  const audio = new Audio(); audio.preload = 'auto';
  let queue = [], idx = -1, shuffle = false, urls = [], onUi = () => {};
  function freeUrls() { urls.forEach(u => URL.revokeObjectURL(u)); urls = []; }
  function srcOf(t) { if (t.src) return t.src; const u = URL.createObjectURL(t.blob); urls.push(u); return u; }
  async function playAt(i) {
    if (!queue.length) return;
    idx = (i + queue.length) % queue.length; const t = queue[idx];
    freeUrls(); audio.src = srcOf(t);
    try { await audio.play(); } catch (e) { }
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist || '', album: 'EDT Nav', artwork: [{ src: 'icon-512.png', sizes: '512x512', type: 'image/png' }] });
    }
    onUi();
  }
  function next() { if (!queue.length) return; playAt(shuffle ? Math.floor(Math.random() * queue.length) : idx + 1); }
  function prev() { if (audio.currentTime > 4) { audio.currentTime = 0; return; } playAt(idx - 1); }
  function toggle() { if (!queue.length) return; if (audio.paused) audio.play().catch(() => {}); else audio.pause(); onUi(); }
  audio.addEventListener('ended', next);
  audio.addEventListener('play', () => onUi()); audio.addEventListener('pause', () => onUi());
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', toggle); navigator.mediaSession.setActionHandler('pause', toggle);
    navigator.mediaSession.setActionHandler('nexttrack', next); navigator.mediaSession.setActionHandler('previoustrack', prev);
  }

  window.EDTMUSIC = {
    GABBAH, audio,
    playList(list, start, shuf) { queue = list.slice(); shuffle = !!shuf; playAt(start != null ? start : (shuffle ? Math.floor(Math.random() * queue.length) : 0)); },
    toggle, next, prev,
    current() { return idx >= 0 ? queue[idx] : null; },
    playing() { return !audio.paused && !!audio.src; },
    setShuffle(v) { shuffle = v; }, shuffle: () => shuffle,
    stop() { audio.pause(); queue = []; idx = -1; freeUrls(); audio.removeAttribute('src'); onUi(); },
    // abbassa la musica mentre parla il navigatore
    duck(on) { audio.volume = on ? 0.25 : 1; },
    async addFiles(files) {
      const have = await allMine(); let n = have.length, added = 0;
      for (const f of files) {
        if (!/^audio\//.test(f.type) && !/\.(mp3|m4a|aac|ogg|opus|wav|flac)$/i.test(f.name)) continue;
        await putMine({ id: 'm:' + Date.now() + Math.random().toString(36).slice(2, 6), title: f.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' '), artist: 'Dal telefono', blob: f, order: n++ });
        added++;
      }
      return added;
    },
    mine: allMine, remove: delMine,
    onUi(fn) { onUi = fn; }
  };
})();
