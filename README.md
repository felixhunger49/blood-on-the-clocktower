# Blood on the Clocktower – Rollen-App

Eine Web-App (läuft im Browser jedes Handys, keine Installation, kein Server nötig) für
*Blood on the Clocktower*:

- **Rollen-Lexikon:** Alle 87 Rollen der drei Grund-Editionen (Trouble Brewing, Bad Moon Rising,
  Sects & Violets) inkl. Reisende – mit Fähigkeit, Erklärung, Tipp und Spielleiter-Hinweisen.
- **Rollen auf jedes Handy:** Der Spielleiter verteilt die Rollen, jeder Spieler bekommt seine
  Rolle per **QR-Code**, **Link** oder **5-stelligem Code** auf sein eigenes Handy und kann sie dort
  verdeckt aufrufen und in Ruhe nachlesen. Alternativ: **Handy weitergeben**.
- **Spielleiter-Bereich:** Edition und Spielerzahl wählen, Rollen automatisch (regelkonform, inkl.
  Baron/Pate/Fang Gu/Vigormortis) oder von Hand wählen, Säufer & Wahnsinniger werden korrekt
  behandelt, Bluffs für den Dämon, Reisende hinzufügen.
- **Grimoire:** Leben/Tod, Geisterstimmen, Notizen und die **Nachtreihenfolge** (erste Nacht /
  andere Nächte) mit Anweisungen für genau die Rollen im Spiel.
- **Anleitung:** Spielablauf, Nominierungen, Abstimmungen, Begriffe und Tipps für Spielleiter.

## Starten

Lokal testen:

```bash
python3 -m http.server 8000
# dann http://localhost:8000 im Browser öffnen
```

Die App wird bei jedem Push auf `main` automatisch über GitHub Pages veröffentlicht
(Workflow `.github/workflows/pages.yml`). Einmalig muss unter **Settings → Pages → Source**
„GitHub Actions“ ausgewählt sein.

Adresse: **https://felixhunger49.github.io/blood-on-the-clocktower/**

Tipp: Auf dem Handy „Zum Startbildschirm hinzufügen“ – danach funktioniert die App auch offline.

Die 5-stelligen Codes funktionieren auch ohne Internet, solange die App auf dem Handy geöffnet ist.

*Blood on the Clocktower* ist ein Spiel von The Pandemonium Institute. Diese App ist ein inoffizielles
Fan-Hilfsmittel; die Rollentexte sind eigene, sinngemäße Beschreibungen.
