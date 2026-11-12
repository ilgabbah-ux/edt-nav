/* EDT Nav · "Naviga verso": ricerca del posto e calcolo del percorso.
   Motore: BRouter (brouter.de, dati OpenStreetMap, gratis e senza chiavi).
   - "Veloce asfalto": profilo car-fast di BRouter (solo strade asfaltate/carrozzabili, il più rapido)
   - "Off facile / medio / hard": profili nostri in profili/*.brf, sempre più sterrato e più duro;
     nessuno passa su sentieri pedonali o strade vietate ai mezzi a motore.
   Tragitti lunghi o BRouter giù: Valhalla (FOSSGIS) col profilo moto.
   Ricerca posti: Photon (komoot) e Nominatim insieme, sempre OpenStreetMap. */
(function () {
  const BR = 'https://brouter.de/brouter';
  const FILES = { off: 'moto-off-facile', offm: 'moto-off-medio', offh: 'moto-off-hard' };
  const ids = {};

  async function timed(url, opt, ms) {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms || 25000);
    try { return await fetch(url, Object.assign({ signal: ac.signal }, opt || {})); } finally { clearTimeout(t); }
  }

  // il profilo "Off facile" va caricato su BRouter (resta valido qualche ora): lo ricarico quando serve
  async function offProfile(mode, force) {
    const c = ids[mode];
    if (c && !force && Date.now() - c.at < 3 * 3600e3) return c.id;
    const txt = await (await fetch('profili/' + FILES[mode] + '.brf')).text();
    const r = await timed(BR + '/profile', { method: 'POST', body: txt }, 20000);
    const j = await r.json();
    if (j.error) throw new Error('profilo: ' + j.error);
    ids[mode] = { id: j.profileid, at: Date.now() }; return j.profileid;
  }

  async function routeBR(from, to, mode, vias) {
    // from/to/vias: [lat, lon]; i punti di passaggio vanno in mezzo
    const lonlats = [from].concat(vias || [], [to]).map(p => p[1].toFixed(6) + ',' + p[0].toFixed(6)).join('|');
    const isOff = !!FILES[mode];
    let profile = isOff ? await offProfile(mode) : 'car-fast';
    const ask = async (p) => {
      let r;
      try { r = await timed(`${BR}?lonlats=${lonlats}&profile=${p}&alternativeidx=0&format=geojson`, null, 40000); }
      catch (e) { r = await timed(`${BR}?lonlats=${lonlats}&profile=${p}&alternativeidx=0&format=geojson`, null, 40000); }
      const t = await r.text();
      if (!r.ok || t[0] !== '{') throw new Error(t.slice(0, 160) || ('HTTP ' + r.status));
      return JSON.parse(t);
    };
    let j;
    try { j = await ask(profile); }
    catch (e) {
      if (isOff && /profile|custom/i.test(e.message)) { profile = await offProfile(mode, true); j = await ask(profile); }
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
    // tempo: per l'off la stima di BRouter è da auto, la rifaccio a 20 km/h sullo sterrato e 45 su asfalto
    let time = +p['total-time'] || 0;
    if (isOff && tot) time = (dirt / 1000 / ({ off: 20, offm: 16, offh: 11 }[mode]) + (tot - dirt) / 1000 / 45) * 3600;
    return {
      pts, len: +p['track-length'] || 0, time, asc: +p['filtered ascend'] || 0, desc: descOf(pts),
      dirtPct: tot ? Math.round(dirt / tot * 100) : null
    };
  }

  // riserva: Valhalla (OpenStreetMap, server FOSSGIS) con il profilo moto. Serve per i tragitti lunghi
  // (BRouter pubblico si ferma dopo pochi secondi di calcolo) o quando BRouter è giù.
  function poly6(str) { const out = []; let i = 0, la = 0, lo = 0; while (i < str.length) { for (const k of [0, 1]) { let r = 0, sh = 0, b; do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32); const d = r & 1 ? ~(r >> 1) : r >> 1; if (k) lo += d; else la += d; } out.push([la / 1e6, lo / 1e6, null]); } return out; }
  async function routeVH(from, to, mode, vias) {
    const locs = [from].concat(vias || [], [to]).map((p, i, a) => ({ lat: p[0], lon: p[1], type: i === 0 || i === a.length - 1 ? 'break' : 'through' }));
    const trails = { off: 0.5, offm: 0.8, offh: 1 }[mode];
    const body = { locations: locs, costing: 'motorcycle', units: 'kilometers', language: 'it-IT', directions_type: 'none', costing_options: { motorcycle: trails != null ? { use_trails: trails, use_highways: 0.3 } : {} } };
    const r = await timed('https://valhalla1.openstreetmap.de/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 30000);
    const j = await r.json();
    if (!r.ok || !j.trip) throw new Error((j && (j.error || j.status_message)) || ('HTTP ' + r.status));
    let pts = []; j.trip.legs.forEach((l, i) => { const q = poly6(l.shape); pts = pts.concat(i ? q.slice(1) : q); });
    return { pts, len: j.trip.summary.length * 1000, time: j.trip.summary.time, asc: null, desc: null, dirtPct: null, long: 1 };
  }
  async function route(from, to, mode, vias) {
    try { return await routeBR(from, to, mode, vias); }
    catch (e) { if (!navigator.onLine) throw e; return await routeVH(from, to, mode, vias); }
  }

  function descOf(pts) { let d = 0, b = null; for (const p of pts) { if (p[2] == null) continue; if (b == null) { b = p[2]; continue; } if (b - p[2] > 4) { d += b - p[2]; b = p[2]; } else if (p[2] - b > 4) b = p[2]; } return d; }

  // ricerca posti: Photon e Nominatim insieme, vince il primo che risponde con qualcosa (Photon a volte è giù)
  async function photon(q, near) {
    let u = 'https://photon.komoot.io/api/?limit=7&lang=it&q=' + encodeURIComponent(q);
    if (near) u += '&lat=' + near[0].toFixed(4) + '&lon=' + near[1].toFixed(4);
    const r = await timed(u, null, 8000); if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    const out = (j.features || []).map(f => {
      const pr = f.properties || {}, c = f.geometry.coordinates;
      const where = [pr.city || pr.town || pr.village, pr.county, pr.state].filter(Boolean).filter(x => x !== pr.name);
      return { name: pr.name || pr.street || 'Posto', where: [...new Set(where)].slice(0, 2).join(', '), pt: [c[1], c[0]] };
    });
    if (!out.length) throw new Error('vuoto'); return out;
  }
  async function nominatim(q, near) {
    let u = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=7&accept-language=it&q=' + encodeURIComponent(q);
    const r = await timed(u, null, 8000); if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    const out = j.map(x => { const parts = String(x.display_name || '').split(', '); return { name: x.name || parts[0] || 'Posto', where: parts.slice(1, 3).join(', '), pt: [+x.lat, +x.lon] }; });
    if (!out.length) throw new Error('vuoto'); return out;
  }
  async function search(q, near) {
    try { return await Promise.any([photon(q, near), nominatim(q, near)]); }
    catch (e) { if (e.errors && e.errors.every(x => x.message === 'vuoto')) return []; throw e; }
  }

  window.EDTROUTE = { route, search, warm: (m) => FILES[m] ? offProfile(m).catch(() => {}) : null };
})();
