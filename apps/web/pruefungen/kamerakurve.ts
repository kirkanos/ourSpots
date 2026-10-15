/**
 * Prueft die Kamerakurve an genau den Eigenschaften, die im Video zaehlen:
 * Sie muss die gesetzten Punkte treffen, darf nirgends ueber sie hinaus
 * schiessen, und sie darf keine Spruenge machen.
 */
import {
  anteilNachFahrzeit,
  baueKamerakurve,
  baueTempoprofil,
  fahrzeitBis,
  kameraBei,
  type Kamerapunkt,
} from '../src/video/kamerakurve';

let fehler = 0;
const pruefe = (name: string, bedingung: boolean, zusatz = '') => {
  console.log(`  ${bedingung ? 'ok  ' : 'FEHL'}   ${name}${zusatz ? '  (' + zusatz + ')' : ''}`);
  if (!bedingung) fehler++;
};

const probe = (punkte: Kamerapunkt[], n = 2001) => {
  const kurve = baueKamerakurve(punkte, 8.5, 50);
  const werte: { a: number; zoom: number; neigung: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = i / (n - 1);
    werte.push({ a, ...kameraBei(kurve, a) });
  }
  return { kurve, werte };
};

// --- Ohne Punkte bleibt alles wie vorher --------------------------------
{
  const { werte } = probe([]);
  pruefe(
    'ohne Kamerapunkte gilt ueberall die Grundeinstellung',
    werte.every((w) => w.zoom === 8.5 && w.neigung === 50),
  );
}

// --- Die gesetzten Punkte werden getroffen ------------------------------
{
  const punkte: Kamerapunkt[] = [
    { anteil: 0, zoom: 6, neigung: 20, tempo: 1 },
    { anteil: 0.35, zoom: 11, neigung: 65, tempo: 1 },
    { anteil: 0.7, zoom: 9, neigung: 40, tempo: 1 },
    { anteil: 1, zoom: 12, neigung: 70, tempo: 1 },
  ];
  const { kurve } = probe(punkte);
  const treffer = punkte.every((p) => {
    const w = kameraBei(kurve, p.anteil);
    return Math.abs(w.zoom - p.zoom) < 1e-9 && Math.abs(w.neigung - p.neigung) < 1e-9;
  });
  pruefe('jeder gesetzte Punkt wird exakt getroffen', treffer);
}

// --- Kein Ueberschwingen ------------------------------------------------
{
  // Genau der Fall, an dem Catmull-Rom scheitert: ein Hochpunkt in der Mitte.
  const punkte: Kamerapunkt[] = [
    { anteil: 0, zoom: 8, neigung: 30, tempo: 1 },
    { anteil: 0.5, zoom: 12, neigung: 70, tempo: 1 },
    { anteil: 1, zoom: 8, neigung: 30, tempo: 1 },
  ];
  const { werte } = probe(punkte);
  const maxZoom = Math.max(...werte.map((w) => w.zoom));
  const minZoom = Math.min(...werte.map((w) => w.zoom));
  pruefe(
    'kein Ueberschwingen ueber den hoechsten gesetzten Wert',
    maxZoom <= 12 + 1e-9,
    `hoechster Wert ${maxZoom.toFixed(4)}`,
  );
  pruefe(
    'kein Unterschwingen unter den niedrigsten gesetzten Wert',
    minZoom >= 8 - 1e-9,
    `niedrigster Wert ${minZoom.toFixed(4)}`,
  );
}

// --- Monoton, wo die Punkte monoton sind --------------------------------
{
  const punkte: Kamerapunkt[] = [
    { anteil: 0, zoom: 6, neigung: 10, tempo: 1 },
    { anteil: 0.3, zoom: 7, neigung: 25, tempo: 1 },
    { anteil: 0.6, zoom: 10, neigung: 45, tempo: 1 },
    { anteil: 1, zoom: 13, neigung: 75, tempo: 1 },
  ];
  const { werte } = probe(punkte);
  let monoton = true;
  for (let i = 1; i < werte.length; i++) {
    if (werte[i]!.zoom < werte[i - 1]!.zoom - 1e-9) monoton = false;
  }
  pruefe('steigende Punkte ergeben eine steigende Kurve', monoton);
}

// --- Keine Spruenge -----------------------------------------------------
{
  const punkte: Kamerapunkt[] = [
    { anteil: 0.1, zoom: 5, neigung: 0, tempo: 1 },
    { anteil: 0.12, zoom: 14, neigung: 80, tempo: 1 },
    { anteil: 0.9, zoom: 6, neigung: 10, tempo: 1 },
  ];
  const { werte } = probe(punkte, 20001);
  let groesster = 0;
  for (let i = 1; i < werte.length; i++) {
    groesster = Math.max(groesster, Math.abs(werte[i]!.zoom - werte[i - 1]!.zoom));
  }
  // Selbst der haerteste Sprung -- 9 Zoomstufen auf 2 % der Strecke -- muss
  // sich ueber viele Bilder verteilen.
  pruefe(
    'auch ein harter Wechsel laeuft stetig durch',
    groesster < 0.05,
    `groesster Schritt ${groesster.toFixed(5)}`,
  );
}

// --- Vor dem ersten und nach dem letzten Punkt wird gehalten ------------
{
  const punkte: Kamerapunkt[] = [
    { anteil: 0.4, zoom: 7, neigung: 30, tempo: 1 },
    { anteil: 0.6, zoom: 11, neigung: 60, tempo: 1 },
  ];
  const { kurve } = probe(punkte);
  pruefe(
    'vor dem ersten Punkt gilt dessen Wert',
    kameraBei(kurve, 0).zoom === 7 && kameraBei(kurve, 0.2).zoom === 7,
  );
  pruefe(
    'nach dem letzten Punkt gilt dessen Wert',
    kameraBei(kurve, 0.8).zoom === 11 && kameraBei(kurve, 1).zoom === 11,
  );
}

// --- Reihenfolge und Dubletten der Eingabe sind egal --------------------
{
  const a = baueKamerakurve(
    [
      { anteil: 0.8, zoom: 12, neigung: 70, tempo: 1 },
      { anteil: 0.2, zoom: 6, neigung: 20, tempo: 1 },
    ],
    8.5,
    50,
  );
  const b = baueKamerakurve(
    [
      { anteil: 0.2, zoom: 6, neigung: 20, tempo: 1 },
      { anteil: 0.8, zoom: 12, neigung: 70, tempo: 1 },
    ],
    8.5,
    50,
  );
  let gleich = true;
  for (let i = 0; i <= 100; i++) {
    if (Math.abs(kameraBei(a, i / 100).zoom - kameraBei(b, i / 100).zoom) > 1e-12) gleich = false;
  }
  pruefe('unsortierte Eingabe ergibt dieselbe Kurve', gleich);

  const dublette = baueKamerakurve(
    [
      { anteil: 0.5, zoom: 6, neigung: 20, tempo: 1 },
      { anteil: 0.5, zoom: 10, neigung: 60, tempo: 1 },
    ],
    8.5,
    50,
  );
  const w = kameraBei(dublette, 0.5);
  pruefe(
    'zwei Punkte an derselben Stelle ergeben keine kaputte Kurve',
    Number.isFinite(w.zoom) && w.zoom === 10,
    `Wert ${w.zoom}`,
  );
}

// --- Fehlendes Feld aus einem alten Auftrag ----------------------------
{
  // Das Rezept eines Renderauftrags kommt als JSON aus der Datenbank; dort
  // haelt kein Typ die Form fest. Der Cast steht hier deshalb mit Absicht.
  const kurve = baueKamerakurve(undefined as unknown as Kamerapunkt[], 8.5, 50);
  const w = kameraBei(kurve, 0.5);
  pruefe(
    'ein fehlendes Feld faellt auf die Grundeinstellung zurueck',
    w.zoom === 8.5 && w.neigung === 50 && w.tempo === 1,
  );
}

// --- Tempoprofil: Integration ------------------------------------------
{
  // Festes Tempo 2 ueber die ganze Strecke: Die Fahrt muss genau halb so
  // lange dauern wie bei Tempo 1.
  const einfach = baueTempoprofil(baueKamerakurve([], 8.5, 50));
  const doppelt = baueTempoprofil(
    baueKamerakurve(
      [
        { anteil: 0, zoom: 8.5, neigung: 50, tempo: 2 },
        { anteil: 1, zoom: 8.5, neigung: 50, tempo: 2 },
      ],
      8.5,
      50,
    ),
  );
  const ganz = (p: ReturnType<typeof baueTempoprofil>) => fahrzeitBis(p, 1);
  pruefe(
    'festes Tempo 2 halbiert die Fahrzeit',
    Math.abs(ganz(doppelt) / ganz(einfach) - 0.5) < 1e-9,
    `${ganz(doppelt).toFixed(5)} vs ${ganz(einfach).toFixed(5)}`,
  );

  // Die halbe Strecke langsam, die halbe schnell: Die langsame Haelfte muss
  // den groesseren Teil der Zeit beanspruchen.
  const gemischt = baueTempoprofil(
    baueKamerakurve(
      [
        { anteil: 0, zoom: 8.5, neigung: 50, tempo: 0.5 },
        { anteil: 0.499, zoom: 8.5, neigung: 50, tempo: 0.5 },
        { anteil: 0.501, zoom: 8.5, neigung: 50, tempo: 2 },
        { anteil: 1, zoom: 8.5, neigung: 50, tempo: 2 },
      ],
      8.5,
      50,
    ),
  );
  const ersteHaelfte = fahrzeitBis(gemischt, 0.5);
  const zweiteHaelfte = fahrzeitBis(gemischt, 1) - ersteHaelfte;
  pruefe(
    'die langsame Haelfte dauert viermal so lange wie die schnelle',
    Math.abs(ersteHaelfte / zweiteHaelfte - 4) < 0.02,
    `Verhaeltnis ${(ersteHaelfte / zweiteHaelfte).toFixed(4)}`,
  );
}

// --- Tempoprofil: Umkehrung --------------------------------------------
{
  const profil = baueTempoprofil(
    baueKamerakurve(
      [
        { anteil: 0.1, zoom: 8.5, neigung: 50, tempo: 0.25 },
        { anteil: 0.45, zoom: 8.5, neigung: 50, tempo: 4 },
        { anteil: 0.9, zoom: 8.5, neigung: 50, tempo: 1 },
      ],
      8.5,
      50,
    ),
  );
  let groessterFehler = 0;
  for (let i = 0; i <= 500; i++) {
    const a = i / 500;
    const zurueck = anteilNachFahrzeit(profil, fahrzeitBis(profil, a));
    groessterFehler = Math.max(groessterFehler, Math.abs(zurueck - a));
  }
  pruefe(
    'Hin- und Rueckrechnung der Fahrzeit treffen sich wieder',
    groessterFehler < 1e-6,
    `groesste Abweichung ${groessterFehler.toExponential(2)}`,
  );

  // Gleichmaessig verteilte Zeit darf nie rueckwaerts laufen.
  let monoton = true;
  let vorher = -1;
  const gesamt = fahrzeitBis(profil, 1);
  for (let i = 0; i <= 5000; i++) {
    const a = anteilNachFahrzeit(profil, (i / 5000) * gesamt);
    if (a < vorher - 1e-12) monoton = false;
    vorher = a;
  }
  pruefe('ueber die Zeit laeuft die Strecke nur vorwaerts', monoton);
}

console.log(fehler === 0 ? '\nALLE PRUEFUNGEN BESTANDEN' : `\n${fehler} PRUEFUNG(EN) FEHLGESCHLAGEN`);
process.exit(fehler === 0 ? 0 : 1);
