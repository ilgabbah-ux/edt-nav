# EDT Nav

Navigatore off-road dell'Enduro Drinking Team: segue le tracce GPX, registra i giri, mostra gli amici del gruppo in tempo reale.

App: https://ilgabbah-ux.github.io/edt-nav/

- `index.html` — l'app (Leaflet, una pagina sola)
- `sw.js` — funzionamento offline e mappe salvate sul telefono
- `server/Codice.gs` — servizio posizioni del gruppo (Google Apps Script "EDT Nav server")
- `mappa.js` — stili della mappa: "EDT giorno" e "EDT notte" (vettoriali OpenFreeMap/OpenStreetMap, stile tipo DMD2) più le mappe raster
- `difficolta.js` — colori per grado delle sterrate (tracktype/smoothness da OpenStreetMap via Overpass), salvati sul telefono per l'offline
- `grade/` — grado delle sterrate del Nord-Ovest a tasselli z12, generato con `tools/estrai-difficolta.py` dall'estratto Geofabrik `italy/nord-ovest`
- `percorso.js` — "Naviga verso": ricerca posti (Photon) e calcolo percorso (BRouter): "Veloce asfalto" (car-fast) o "Off facile" (`profili/moto-off-facile.brf`), con ricalcolo automatico se esci dal percorso
- `musica.js` + `musica/` — musica in sella: le canzoni del Gabbah, i brani del proprio telefono (salvati nell'app), scorciatoie alle app di streaming; comandi da schermata di blocco/cuffie, volume abbassato quando parla il navigatore
