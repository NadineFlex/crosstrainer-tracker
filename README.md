# Crosstrainer Pro V5

React/Vite + Capacitor Android. Midnight-Performance-Design, lokale OCR-Fotoerkennung und Fitness-Statistiken.

## APK mit GitHub Actions bauen (auch vom Smartphone)

1. Neues **privates** GitHub-Repository erstellen und **den Inhalt dieses ZIP-Ordners** hochladen (einschließlich `.github/workflows/android-apk.yml`).
2. In GitHub auf **Actions** → **Android APK bauen** → **Run workflow** tippen (oder auf `main` pushen).
3. Nach erfolgreichem Workflow unter **Artifacts** `crosstrainer-pro-v5-debug-apk` herunterladen und ZIP entpacken.
4. `app-debug.apk` auf Android installieren. Android fragt ggf. nach Erlaubnis für Installationen aus dieser Quelle.

Die Debug-APK ist für private Tests gedacht und **keine signierte Release-Version für den Play Store**. Hier wurde keine APK lokal gebaut; der Workflow erstellt sie erst auf GitHub.

## Lokal starten

`npm install` → `npm run dev`; `npm test` führt Scanner-Tests aus; `npm run build` baut die Weboberfläche.

## Fotoerkennung

Die App nutzt Tesseract.js zur **lokalen Texterkennung**; die Bilddatei wird nicht an einen eigenen KI-Server gesendet. Beim ersten Scan müssen OCR-Dateien heruntergeladen werden, daher ist eine Internetverbindung nötig. OCR erkennt Beschriftungen wie TIME, DISTANCE, CALORIES, WATT, PULSE, SPEED, RESISTANCE. Bei Matrix-Displays mit mehrspaltigen Tabellen, schwachem Kontrast oder ungewöhnlicher Anordnung kann die Zuordnung fehlschlagen. **Immer alle Werte prüfen**, bevor du speicherst; Rohtext ist einblendbar. Die Erkennung ist keine garantierte automatische Matrix-TOTAL-Spaltenauswertung.

## Daten und Updates

Die App nutzt `localStorage` im Android-WebView. Vor Neuinstallation, App-Daten-Löschung oder Wechsel der App-ID ein JSON-Backup exportieren. Eine Neuinstallation mit abweichender Herkunft/App-ID kann Daten nicht übernehmen. Die App benötigt keine Anmeldung. Backup-Dateien können persönliche Fitnesswerte enthalten: privat aufbewahren.
