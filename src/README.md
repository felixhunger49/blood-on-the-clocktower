# Aufbau des App-Codes

Der Programmcode der App liegt in **`src/app/`**, aufgeteilt in kleine, thematisch sortierte Teile
(`00-kopf.js` … `33-wach-halten-start.js`). Die Nummern bestimmen die Reihenfolge.

Der Browser lädt weiterhin eine einzige Datei, **`js/app.js`**. Sie wird aus den Teilen zusammengesetzt –
**nicht direkt in `js/app.js` ändern**, sondern im passenden Teil in `src/app/` und danach bauen:

```
node tools/build.cjs          # setzt js/app.js aus src/app/ zusammen
node tools/build.cjs --check  # prüft, ob js/app.js zu den Teilen passt
node tools/check.cjs          # prüft auf doppelt vergebene Funktions-/Variablennamen
```

Alle Teile gehören zu einer gemeinsamen Funktion: `00-kopf.js` öffnet sie, `33-wach-halten-start.js` schließt sie.
Darum dürfen Namen auf oberster Ebene (2 Leerzeichen eingerückt) im ganzen Code nur einmal vorkommen –
`tools/check.cjs` passt darauf auf. Beide Prüfungen laufen auch automatisch vor jeder Veröffentlichung.

| Teil | Inhalt |
|---|---|
| 00–03 | Grundfunktionen, Startbildschirm, Rollen-Auswahl und Rollenkarte der Spieler |
| 04–07 | Spielleiter: Spielstand & Rückgängig, Einrichtung (Schritt 1–3), Grimoire, Knöpfe |
| 08–11 | Tag: Sonderregeln (Heiliger, Jungfrau, Dämonenjäger, Kannibale …), Yaggababble/Mezepheles/Ojo, Hinrichtungs-Regeln, Nominieren & Abstimmen |
| 12–18 | Marker & Sitzkreis, Timer, Notizen, Spielverlauf & Rückblick, Statistik, Musik, Testrunde mit Bots |
| 19–21 | Rollenliste, Balance & Setup-Bewertung, Homebrew-Editor & Skript-Import |
| 22–27 | Nacht: Tötungen & Schutz, Nachtaktionen (Spielleiter/Handy), Info-Rollen, Info-Vorschläge, Spion-Grimoire |
| 28–33 | Lexikon, Anleitung, Online-Modus (Spielleiter/Spieler), Router, Bildschirm wach halten & Start |
