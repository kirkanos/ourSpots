# Musik für Reisevideos

Dieser Ordner ist **absichtlich leer**. Hier liegen die Stücke, die in der
Oberfläche zur Auswahl stehen – ausgeliefert werden sie vom Webcontainer, der
Renderer lädt sie von dort.

## Warum nichts mitgeliefert wird

Eine Audiodatei in einem öffentlichen Repository ist eine Weitergabe. Dafür
braucht es eine Lizenz, die das ausdrücklich erlaubt – in der Praxis **CC0**
oder Gemeinfreiheit. „Royalty free", „free download" oder „kostenlos" reichen
nicht: Sie regeln die Nutzung, nicht die Weitergabe.

Beim Zusammenstellen einer Auswahl bin ich auf genau diese Unschärfe gestoßen.
Ein vielversprechendes Album stand im Free Music Archive unter CC0 1.0, während
die Seite des Urhebers einen gewöhnlichen Copyright-Vermerk ohne Lizenzangabe
trug. Dieser Widerspruch ließ sich nicht auflösen, also wurde nichts übernommen.

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
