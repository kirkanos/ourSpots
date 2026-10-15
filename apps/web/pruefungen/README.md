# Prüfungen zur Reiseanimation

Zwei Teile der Animation sind reine Rechnerei, deren Richtigkeit man dem Code
nicht ansieht: die Zeitachse und der Verlauf von Kamera und Tempo. Beide lassen sich nicht am
Bildschirm beurteilen – ein Überschwingen um 0,4 Zoomstufen oder ein um
Millisekunden verschobenes Schild sieht man schlicht nicht, es stört nur.

Deshalb hier zwei Skripte, die genau die Eigenschaften nachrechnen, auf die
sich der Rest verlässt:

```bash
npm run pruefe -w @ourspots/web
```

| Datei | Prüft |
|---|---|
| `zeitachse.ts` | Tempo wirkt auf die Dauer, Strecke läuft monoton, Halte sind Plateaus, Schilder stehen an der richtigen Station |
| `kamerakurve.ts` | Punkte werden exakt getroffen, kein Über- oder Unterschwingen, keine Sprünge, Reihenfolge der Eingabe egal; dazu das Tempoprofil: richtige Fahrzeit, und Hin- und Rückrechnung treffen sich wieder |

Bewusst ohne Testframework: Das Projekt hat keines, und für zwei Dateien wäre
ein weiteres Werkzeug mehr Aufwand als Nutzen. Die Skripte geben bei Erfolg 0
zurück und taugen damit auch für die Pipeline.

Sie liegen außerhalb von `src/`, weil sie auf `process` zugreifen – im
Browser-tsconfig gibt es das nicht.
