/* EDT Nav · stili mappa.
   "EDT giorno" e "EDT notte" sono mappe vettoriali disegnate qui, sui dati OpenStreetMap di OpenFreeMap:
   strade principali gialle, secondarie grigie, sterrate arancio bordate di scuro, sentieri tratteggiati
   colorati per difficoltà MTB quando c'è, cime col triangolo e la quota, rilievo del terreno.
   Le altre mappe sono immagini (raster) già pronte. */
(function () {
  const OFM = 'https://tiles.openfreemap.org/planet';
  const FONT_R = ['Noto Sans Regular'], FONT_B = ['Noto Sans Bold'];
  const DEM = {
    type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
    encoding: 'terrarium', tileSize: 256, maxzoom: 15, attribution: 'Rilievo: Mapzen Terrain Tiles'
  };

  const PAL = {
    day: {
      bg: '#f1eee6', wood: '#bfe0a6', grass: '#d8edc4', farm: '#efe7cf', resid: '#e6e1d8', water: '#a8cbea', river: '#6fa8dc',
      major: '#ffd400', majorCase: '#9c7f00', minor: '#a9a9a6', minorCase: '#7b7b78', service: '#c9c9c5',
      track: '#e3832b', trackPaved: '#c9a227', trackCase: '#3b2610', path: '#6b4426', foot: '#8c7b6b',
      noAccess: '#d7261e', text: '#2a2722', halo: '#ffffff', peak: '#9a7b4f', building: '#d9d2c5', boundary: '#9e7fb8',
      shadow: '#5d5446', highlight: '#ffffff', rail: '#8a8a8a'
    },
    night: {
      bg: '#1c1e1b', wood: '#243a22', grass: '#2a3a25', farm: '#2a2822', resid: '#272724', water: '#16304a', river: '#2d6fb0',
      major: '#d9b200', majorCase: '#5a4a00', minor: '#5d605a', minorCase: '#3a3c38', service: '#4a4c47',
      track: '#f0913a', trackPaved: '#c9a227', trackCase: '#0b0703', path: '#d1a679', foot: '#a39684',
      noAccess: '#ff5a4f', text: '#ece9e1', halo: '#111210', peak: '#c9a97a', building: '#30302c', boundary: '#8f73aa',
      shadow: '#000000', highlight: '#7a7a6a', rail: '#6a6a6a'
    }
  };

  // larghezze che crescono con lo zoom
  const w = (a, b, c) => ['interpolate', ['exponential', 1.5], ['zoom'], 10, a, 14, b, 18, c];
  const cls = (...v) => ['match', ['get', 'class'], v, true, false];
  const notTunnel = ['!=', ['get', 'brunnel'], 'tunnel'];

  function vectorLayers(P, f, hill) {
    const t = f; // fattore grandezza scritte
    const L = [
      { id: 'bg', type: 'background', paint: { 'background-color': P.bg } },
      { id: 'landuse', type: 'fill', source: 'ofm', 'source-layer': 'landuse', filter: cls('residential', 'suburb', 'neighbourhood', 'industrial', 'commercial', 'retail'), paint: { 'fill-color': P.resid } },
      { id: 'farm', type: 'fill', source: 'ofm', 'source-layer': 'landcover', filter: cls('farmland'), paint: { 'fill-color': P.farm } },
      { id: 'grass', type: 'fill', source: 'ofm', 'source-layer': 'landcover', filter: cls('grass', 'scrub', 'wetland'), paint: { 'fill-color': P.grass } },
      { id: 'wood', type: 'fill', source: 'ofm', 'source-layer': 'landcover', filter: cls('wood', 'forest'), paint: { 'fill-color': P.wood } },
      { id: 'park', type: 'fill', source: 'ofm', 'source-layer': 'park', paint: { 'fill-color': P.grass, 'fill-opacity': .5 } },
    ];
    if (hill > 0) L.push({ id: 'hillshade', type: 'hillshade', source: 'dem', paint: {
      'hillshade-exaggeration': Math.min(1, hill / 100 + .15), 'hillshade-shadow-color': P.shadow, 'hillshade-highlight-color': P.highlight, 'hillshade-accent-color': P.shadow } });
    L.push(
      { id: 'water', type: 'fill', source: 'ofm', 'source-layer': 'water', paint: { 'fill-color': P.water } },
      { id: 'river', type: 'line', source: 'ofm', 'source-layer': 'waterway', paint: { 'line-color': P.river, 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 10, ['match', ['get', 'class'], 'river', 1.2, .5], 14, ['match', ['get', 'class'], 'river', 2.5, 1], 18, ['match', ['get', 'class'], 'river', 6, 2.5]] } },
      { id: 'building', type: 'fill', source: 'ofm', 'source-layer': 'building', minzoom: 14, paint: { 'fill-color': P.building } },
      { id: 'boundary', type: 'line', source: 'ofm', 'source-layer': 'boundary', filter: ['<=', ['get', 'admin_level'], 6], paint: { 'line-color': P.boundary, 'line-width': 1, 'line-dasharray': [3, 2], 'line-opacity': .6 } },

      // sentieri: tratteggio colorato per difficoltà MTB (0-1 verde, 2 giallo, 3 arancio, 4+ rosso), altrimenti marrone
      { id: 'path', type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 12, filter: ['all', cls('path'), ['!', ['match', ['get', 'subclass'], ['footway', 'steps', 'pedestrian'], true, false]]],
        paint: { 'line-color': ['match', ['to-string', ['get', 'mtb_scale']], ['0', '0+', '0-', '1', '1+', '1-'], '#2f9e44', ['2', '2+', '2-'], '#d4a400', ['3', '3+', '3-'], '#e8590c', ['4', '5', '6'], '#c92a2a', P.path],
          'line-width': w(.8, 1.6, 3.5), 'line-dasharray': [2.5, 1.5] } },
      { id: 'foot', type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 14, filter: ['all', cls('path'), ['match', ['get', 'subclass'], ['footway', 'steps', 'pedestrian'], true, false]],
        paint: { 'line-color': P.foot, 'line-width': w(.5, 1, 2.5), 'line-dasharray': [1, 1.5] } },

      // sterrate: bordo scuro + arancio (cementate in ocra)
      { id: 'track-case', type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 11, filter: cls('track'),
        layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': P.trackCase, 'line-width': w(1.6, 3.4, 8) } },
      { id: 'track', type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 11, filter: cls('track'),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['match', ['get', 'surface'], 'paved', P.trackPaved, P.track], 'line-width': w(.8, 2, 5) } },

      // strade
      { id: 'service', type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 13, filter: cls('service'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': P.service, 'line-width': w(.5, 1.5, 6) } },
      { id: 'minor-case', type: 'line', source: 'ofm', 'source-layer': 'transportation', filter: cls('minor', 'tertiary'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': P.minorCase, 'line-width': w(1.2, 4, 14) } },
      { id: 'minor', type: 'line', source: 'ofm', 'source-layer': 'transportation', filter: cls('minor', 'tertiary'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': P.minor, 'line-width': w(.8, 3, 12) } },
      { id: 'rail', type: 'line', source: 'ofm', 'source-layer': 'transportation', filter: cls('rail'), paint: { 'line-color': P.rail, 'line-width': w(.6, 1.2, 2.5), 'line-dasharray': [3, 2] } },
      { id: 'major-case', type: 'line', source: 'ofm', 'source-layer': 'transportation', filter: cls('motorway', 'trunk', 'primary', 'secondary'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': P.majorCase, 'line-width': w(2, 6, 18) } },
      { id: 'major', type: 'line', source: 'ofm', 'source-layer': 'transportation', filter: cls('motorway', 'trunk', 'primary', 'secondary'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': P.major, 'line-width': w(1.4, 4.6, 15) } },

      // divieto di transito: bordino rosso sopra sterrate e sentieri vietati
      { id: 'noaccess', type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 13,
        filter: ['all', cls('track', 'path', 'service', 'minor'), ['match', ['get', 'access'], ['no', 'private', 'false'], true, false]],
        paint: { 'line-color': P.noAccess, 'line-width': w(.6, 1.2, 2.5), 'line-offset': w(1.5, 3, 7), 'line-dasharray': [1, 1] } },

      // scritte
      { id: 'water-name', type: 'symbol', source: 'ofm', 'source-layer': 'waterway', minzoom: 13, layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': FONT_R, 'text-size': 11 * t }, paint: { 'text-color': P.river, 'text-halo-color': P.halo, 'text-halo-width': 1.2 } },
      { id: 'road-name', type: 'symbol', source: 'ofm', 'source-layer': 'transportation_name', minzoom: 13, layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': FONT_B, 'text-size': 12 * t, 'text-letter-spacing': .03 }, paint: { 'text-color': P.text, 'text-halo-color': P.halo, 'text-halo-width': 1.6 } },
      { id: 'peak', type: 'symbol', source: 'ofm', 'source-layer': 'mountain_peak', minzoom: 11, filter: ['has', 'ele'],
        layout: { 'icon-image': 'peak', 'icon-size': .9 * t, 'icon-allow-overlap': false, 'text-field': ['concat', ['coalesce', ['get', 'name'], ''], '\n', ['to-string', ['get', 'ele']]], 'text-font': FONT_B, 'text-size': 12 * t, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-optional': true },
        paint: { 'text-color': P.peak, 'text-halo-color': P.halo, 'text-halo-width': 1.6 } },
      { id: 'place-village', type: 'symbol', source: 'ofm', 'source-layer': 'place', minzoom: 11, filter: cls('village', 'hamlet', 'suburb', 'neighbourhood', 'isolated_dwelling'),
        layout: { 'text-field': ['get', 'name'], 'text-font': FONT_B, 'text-size': ['match', ['get', 'class'], 'village', 14 * t, 12 * t] }, paint: { 'text-color': P.text, 'text-halo-color': P.halo, 'text-halo-width': 2 } },
      { id: 'place-town', type: 'symbol', source: 'ofm', 'source-layer': 'place', filter: cls('town', 'city'),
        layout: { 'text-field': ['get', 'name'], 'text-font': FONT_B, 'text-size': ['match', ['get', 'class'], 'city', 20 * t, 16 * t], 'text-transform': 'uppercase', 'text-letter-spacing': .05 }, paint: { 'text-color': P.text, 'text-halo-color': P.halo, 'text-halo-width': 2.2 } }
    );
    return L;
  }

  function raster(id, tiles, max, attr, big, extra) {
    return { src: { type: 'raster', tiles, tileSize: big ? 512 : 256, maxzoom: max, attribution: attr }, layer: Object.assign({ id, type: 'raster', source: id }, extra || {}) };
  }
  const abc = u => ['a', 'b', 'c'].map(s => u.replace('{s}', s));

  const BASES = {
    edt: { n: 'EDT giorno' },
    edtnight: { n: 'EDT notte' },
    topo: { n: 'Topografica', tiles: abc('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'), max: 17, a: '© OpenStreetMap, © OpenTopoMap' },
    cyclosm: { n: 'Sterrati CyclOSM', tiles: abc('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png'), max: 20, a: '© OpenStreetMap, CyclOSM' },
    sat: { n: 'Satellite ESRI', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], max: 19, a: '© Esri' },
    osm: { n: 'Stradale OSM', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], max: 19, a: '© OpenStreetMap' }
  };

  function buildStyle(S, night) {
    const base = BASES[S.base] ? S.base : 'edt';
    const isVec = base === 'edt' || base === 'edtnight';
    const P = PAL[(base === 'edtnight') ? 'night' : 'day'];
    const f = S.big ? 1.35 : 1;
    const style = {
      version: 8, glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
      sources: { dem: DEM }, layers: []
    };
    if (isVec) {
      style.sources.ofm = { type: 'vector', url: OFM, attribution: '© OpenStreetMap, OpenFreeMap' };
      style.layers = vectorLayers(P, f, S.hill);
    } else {
      const b = BASES[base], r = raster('base', b.tiles, b.max, b.a, S.big);
      style.sources.base = r.src; style.layers.push(r.layer);
      if (S.hill > 0) style.layers.push({ id: 'hillshade', type: 'hillshade', source: 'dem', paint: { 'hillshade-exaggeration': S.hill / 100, 'hillshade-shadow-color': '#3d372c' } });
      if (base === 'sat' && S.labels) {
        const r1 = raster('roads', ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'], 19, '', S.big);
        const r2 = raster('places', ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'], 19, '', S.big);
        style.sources.roads = r1.src; style.sources.places = r2.src; style.layers.push(r1.layer, r2.layer);
      }
    }
    if (S.mtb) {
      const m = raster('mtb', ['https://tile.waymarkedtrails.org/mtb/{z}/{x}/{y}.png'], 18, '© Waymarked Trails', S.big, { paint: { 'raster-opacity': .85 } });
      style.sources.mtb = m.src; style.layers.push(m.layer);
    }
    return style;
  }

  // icona cima: triangolo bordato
  function addIcons(map, nightish) {
    if (map.hasImage('peak')) return;
    const s = 2, c = document.createElement('canvas'); c.width = 22 * s; c.height = 20 * s;
    const g = c.getContext('2d'); g.scale(s, s);
    g.beginPath(); g.moveTo(11, 2); g.lineTo(20, 18); g.lineTo(2, 18); g.closePath();
    g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 2.2; g.strokeStyle = '#3a3226'; g.stroke();
    map.addImage('peak', g.getImageData(0, 0, c.width, c.height), { pixelRatio: s });
  }

  window.EDTMAP = { BASES, buildStyle, addIcons, isNight: S => S.base === 'edtnight' };
})();
