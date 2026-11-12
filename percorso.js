/* EDT Nav · "Naviga verso": ricerca del posto e calcolo del percorso.
   Motore: BRouter (brouter.de, dati OpenStreetMap, gratis e senza chiavi).
   - "Veloce asfalto": profilo car-fast di BRouter (solo strade asfaltate/carrozzabili, il più rapido)
   - "Off facile": profilo nostro (profili/moto-off-facile.brf): preferisce sterrate facili,
     evita quelle dure, niente sentieri pedonali e rispetta i divieti ai mezzi a motore.
   Ricerca posti: Photon (komoot), sempre OpenStreetMap. */
(function () {
  const BR = 'https://brouter.de/brouter';
  let offId = null, offIdAt = 0;

  async function timed(url, opt, ms) {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms || 25000);
    try { return await fetch(url, Object.assign({ signal: ac.signal }, opt || {})); } finally { clearTimeout(t); }
  }

  // il profilo "Off facile" va caricato su BRouter (resta valido qualche ora): lo ricarico quando serve
  async function offProfile(force) {
    if (offId && !force && Date.now() - offIdAt < 3 * 3600e3) return offId;
    const txt = await (await fetch('profili/moto-off-facile.brf')).text();
    const r = await timed(BR + '/profile', { method: 'POST', body: txt }, 20000);
    const j = await r.json();
    if (j.error) throw new Error('profilo: ' + j.error);
    offId = j.profileid; offIdAt = Date.now(); return offId;
  }

  async function route(from, to, mode) {
    // from/to: [lat, lon]
    const lonlats = from[1].toFixed(6) + ',' + from[0].toFixed(6) + '|' + to[1].toFixed(6) + ',' + to[0].toFixed(6);
    let profile = mode === 'off' ? await offProfile() : 'car-fast';
    const ask = async (p) => {
      const r = await timed(`${BR}?lonlats=${lonlats}&profile=${p}&alternativeidx=0&format=geojson`, null, 30000);
      const t = await r.text();
      if (!r.ok || t[0] !== '{') throw new Error(t.slice(0, 160) || ('HTTP ' + r.status));
      return JSON.parse(t);
    };
    let j;
    try { j = await ask(profile); }
    catch (e) {
      if (mode === 'off' && /profile|custom/i.test(e.message)) { profile = await offProfile(true); j = await ask(profile); }
      else throw e;
    }
    const f = j.features && j.features[0];
    if (!f) throw new Error('nessun percorso');
    const p = f.properties || {};
    const pts = f.geometry.coordinates.map(c => [c[1], c[0], c[2] != null ? c[2] : null]);
    // quanta parte è sterrata (dalle informazioni sulle strade che BRouter restituisce)
    let tot = 0, dirt = 0;
    const msg = p.messages || [];
    if (msg.length > 1) {
      const h = msg[0], iD = h.indexOf('Distance'), iT = h.indexOf('WayTags');
      for (let k = 1; k < msg.length; k++) {
        const d = +msg[k][iD] || 0, tags = msg[k][iT] || '';
        tot += d; if (/highway=track|surface=(gravel|dirt|ground|unpaved|compacted|fine_gravel|earth|grass)/.test(tags)) dirt += d;
      }
    }
    return {
      pts, len: +p['track-length'] || 0, time: +p['total-time'] || 0, asc: +p['filtered ascend'] || 0,
      dirtPct: tot ? Math.round(dirt / tot * 100) : null
    };
  }

  async function search(q, near) {
    let u = 'https://photon.komoot.io/api/?limit=7&q=' + encodeURIComponent(q);
    if (near) u += '&lat=' + near[0].toFixed(4) + '&lon=' + near[1].toFixed(4);
    const r = await timed(u, null, 12000);
    const j = await r.json();
    return (j.features || []).map(f => {
      const pr = f.properties || {}, c = f.geometry.coordinates;
      const where = [pr.city || pr.town || pr.village, pr.county, pr.state].filter(Boolean).filter(x => x !== pr.name);
      return { name: pr.name || pr.street || 'Posto', where: [...new Set(where)].slice(0, 2).join(', '), pt: [c[1], c[0]] };
    });
  }

  window.EDTROUTE = { route, search, warm: () => offProfile().catch(() => {}) };
})();
