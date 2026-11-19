# EDT Nav per Android (APK)

Guscio Android di EDT Nav. Carica l'app online (https://ilgabbah-ux.github.io/edt-nav/), quindi gli aggiornamenti
dell'app arrivano da soli come nel browser: l'APK va rifatto solo se cambia questo guscio.

Cosa aggiunge rispetto al browser:
- GPS che continua a schermo spento (servizio in primo piano con notifica) quando c'è un giro in registrazione,
  la posizione condivisa col gruppo, "Naviga verso" o una traccia attiva;
- voce del navigatore con la sintesi vocale di Android;
- schermo sempre acceso e "condividi" (WhatsApp ecc.) collegati alle funzioni native;
- sicurezza batteria: in background, senza giro in registrazione, dopo 30 minuti da fermo il GPS si spegne.

File principali:
- `android/app/src/main/assets/edt-shell.js`: collega le funzioni del browser a quelle native;
- `android/app/src/main/java/com/gabbah/edtnav/`: `MainActivity` e `KeepAliveWebView`;
- `capacitor.config.json`: indirizzo dell'app.

Per ricompilare: `npm install`, `npx cap sync android`, poi `cd android && ./gradlew assembleRelease`.
Serve `android/keystore.properties` con la chiave di firma (non è nel repo: è in Drive, "Progetti Claude/EDT Nav").
Con una chiave diversa l'aggiornamento non si installa sopra la versione precedente.
