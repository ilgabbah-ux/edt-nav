# EDT Nav

Navigatore off-road dell'Enduro Drinking Team: segue le tracce GPX, registra i giri, mostra gli amici del gruppo in tempo reale.

App: https://ilgabbah-ux.github.io/edt-nav/

- `index.html` — l'app (Leaflet, una pagina sola)
- `sw.js` — funzionamento offline e mappe salvate sul telefono
- `server/Codice.gs` — servizio posizioni del gruppo (Google Apps Script "EDT Nav server")
- `mappa.js` — stili della mappa: "EDT giorno" e "EDT notte" (vettoriali OpenFreeMap/OpenStreetMap, stile tipo DMD2) più le mappe raster
