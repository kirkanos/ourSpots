# Musik für Reisevideos

Hier liegen die Stücke, die in der Oberfläche zur Auswahl stehen – ausgeliefert
werden sie vom Webcontainer, der Renderer lädt sie von dort.

| Datei | Titel | Urheber | Lizenz | Quelle |
|---|---|---|---|---|
| `contemplation.mp3` | Contemplation | Joth | CC0 1.0 | [OpenGameArt](https://opengameart.org/content/contemplation-0) |
| `celtic.mp3` | Celtic Loop | stereoscopic | CC0 1.0 | [OpenGameArt](https://opengameart.org/content/celtic-loop) |
| `synthwave.mp3` | Calm Ambient | The Cynic Project | CC0 1.0 | [OpenGameArt](https://opengameart.org/content/calm-ambient-1-synthwave-4k) |

Alle drei auf 128 kbit/s neu kodiert – unter einem Video ist das reichlich, und
die Originale brachten zusammen 11 MB statt 5 mit. CC0 erlaubt die Bearbeitung
ausdrücklich.

CC0 verlangt keine Namensnennung. Der Urheber von `synthwave.mp3` bittet
dennoch um einen Hinweis auf *The Cynic Project / cynicmusic.com /
pixelsphere.org* – wer das Stück in einem veröffentlichten Video verwendet,
tut ihm damit einen Gefallen.

## Worauf es bei der Auswahl ankam

Eine Audiodatei in einem öffentlichen Repository ist eine Weitergabe. Dafür
braucht es eine Lizenz, die das ausdrücklich erlaubt – in der Praxis **CC0**
oder Gemeinfreiheit. „Royalty free", „free download" oder „kostenlos" reichen
nicht: Sie regeln die Nutzung, nicht die Weitergabe.

Ein naheliegender Kandidat fiel genau daran durch: Ein Album stand im Free
Music Archive unter CC0 1.0, während die Seite des Urhebers einen gewöhnlichen
Copyright-Vermerk ohne Lizenzangabe trug. Dieser Widerspruch ließ sich nicht
auflösen, also wurde es nicht übernommen. Bei OpenGameArt hängt die Lizenz
dagegen an der einzelnen Einreichung und ist dort nachzulesen.

## Ein Stück hinzufügen

1. Datei als `.mp3` oder `.m4a` hier ablegen.
2. Eintrag in `stuecke.json` ergänzen:

```json
[
  {
    "datei": "weite-landschaft.mp3",
    "titel": "Weite Landschaft",
    "urheber": "Vorname Nachname",
    "lizenz": "CC0 1.0"
  }
]
```

Die Lizenz steht hier, damit sie nachvollziehbar bleibt – und damit auffällt,
wenn jemand etwas ohne klare Lizenz ablegt.

Taugliche Quellen sind **Musopen** (gemeinfreie Einspielungen klassischer
Werke) und **OpenGameArt** mit dem CC0-Filter. Bei beiden gilt: Die Lizenz
steht an der einzelnen Datei, nicht an der Sammlung, und genau dort gehört sie
geprüft.

## Der andere Weg

Unabhängig davon lässt sich je Reise **eine eigene Datei hochladen**. Das ist
der Weg für alles, was man selbst lizenziert hat – etwa ein Stück aus einem
Epidemic-Sound-Abo. Diese Dateien liegen im Volume der Videos und nicht im
Repository.
