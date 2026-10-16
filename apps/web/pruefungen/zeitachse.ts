import { baueTrack, type Punkt } from '../src/video/track';
import { baueZeitachse, zustandBei, VORGABE, type Etappe, type Station } from '../src/video/timeline';

// Gerade Linie von Suedwest nach Nordost, 300 Punkte.
const punkte: Punkt[] = Array.from({ length: 300 }, (_, i) => [8 + i * 0.01, 50 + i * 0.01]);
const track = baueTrack(punkte);

const etappen: Etappe[] = [
  { titel: 'Bremen',    von: 0,   bis: 0.4, distanzM: track.laengeM * 0.4 },
  { titel: 'Greetsiel', von: 0.4, bis: 0.7, distanzM: track.laengeM * 0.3 },
  { titel: 'Husum',     von: 0.7, bis: 1,   distanzM: track.laengeM * 0.3 },
];
const stationen: Station[] = [
  { name: 'Zuhause',   ort: punkte[0]!,   anteil: 0 },
  { name: 'Bremen',    ort: [0, 0],       anteil: 0.4 },
  { name: 'Greetsiel', ort: [0, 0],       anteil: 0.7 },
  { name: 'Husum',     ort: punkte.at(-1)!, anteil: 1 },
];

/**
 * Das Tempo steht nicht mehr je Etappe fest, sondern laeuft als Kurve ueber
 * die Reise. Fuer die Pruefung wird daraus ein Treppenprofil gebaut: zwei
 * Punkte eng beieinander ergeben einen nahezu harten Wechsel, und darauf
 * laesst sich dasselbe nachrechnen wie frueher auf dem Etappen-Tempo.
 */
const MIT_TEMPO = {
  ...VORGABE,
  kameraPunkte: [
    { anteil: 0,     zoom: VORGABE.fahrtZoom, neigung: VORGABE.neigung, tempo: 1 },
    { anteil: 0.399, zoom: VORGABE.fahrtZoom, neigung: VORGABE.neigung, tempo: 1, drehung: 0, halt: 0 },
    { anteil: 0.401, zoom: VORGABE.fahrtZoom, neigung: VORGABE.neigung, tempo: 2, drehung: 0, halt: 0 },
    { anteil: 0.699, zoom: VORGABE.fahrtZoom, neigung: VORGABE.neigung, tempo: 2, drehung: 0, halt: 0 },
    { anteil: 0.701, zoom: VORGABE.fahrtZoom, neigung: VORGABE.neigung, tempo: 1, drehung: 0, halt: 0 },
    { anteil: 1,     zoom: VORGABE.fahrtZoom, neigung: VORGABE.neigung, tempo: 1 },
  ],
};

const z = baueZeitachse(track, etappen, stationen, MIT_TEMPO);
let fehler = 0;
const pruefe = (name: string, ok: boolean, zusatz = '') => {
  console.log((ok ? '  ok   ' : '  FEHL ') + name + (zusatz ? '  ' + zusatz : ''));
  if (!ok) fehler++;
};

console.log('Track:', (track.laengeM / 1000).toFixed(0), 'km | Videodauer:', z.gesamtdauer.toFixed(1), 's');

// Der Abschnitt mit Tempo 2 muss halb so lange je Kilometer brauchen.
const fahrten = z.abschnitte.filter((a) => a.art === 'fahrt') as Array<{ dauer: number }>;
const proKm = fahrten.map((f, i) => f.dauer / (etappen[i]!.distanzM / 1000));
pruefe('der Abschnitt mit Tempo 2 braucht halb so lange je km',
  Math.abs(proKm[1]! / proKm[0]! - 0.5) < 0.005, `(${proKm[1]!.toFixed(4)} vs ${proKm[0]!.toFixed(4)})`);

// Monotonie ueber die gesamte Zeitachse.
let vorher = -1, monoton = true, maxSprung = 0;
for (let t = 0; t <= z.gesamtdauer; t += z.gesamtdauer / 2000) {
  const a = zustandBei(z, track, MIT_TEMPO, t).streckenAnteil;
  if (a < vorher - 1e-9) monoton = false;
  if (vorher >= 0) maxSprung = Math.max(maxSprung, a - vorher);
  vorher = a;
}
pruefe('Streckenanteil steigt monoton', monoton);
pruefe('keine Spruenge in der Bewegung', maxSprung < 0.01, `(groesster Schritt ${maxSprung.toFixed(4)})`);

// Plateau: waehrend eines Halts darf sich die Strecke nicht bewegen.
let start = 0;
let plateausOk = true;
for (const a of z.abschnitte) {
  if (a.art === 'halt') {
    const anfang = zustandBei(z, track, MIT_TEMPO, start + 0.01).streckenAnteil;
    const mitte = zustandBei(z, track, MIT_TEMPO, start + a.dauer / 2).streckenAnteil;
    const ende = zustandBei(z, track, MIT_TEMPO, start + a.dauer - 0.01).streckenAnteil;
    if (Math.abs(anfang - mitte) > 1e-9 || Math.abs(mitte - ende) > 1e-9) plateausOk = false;
  }
  start += a.dauer;
}
pruefe('Halte sind Plateaus (Strecke steht still)', plateausOk);

pruefe('Start bei 0', Math.abs(zustandBei(z, track, MIT_TEMPO, 0).streckenAnteil) < 1e-9);
pruefe('Ende bei 1', Math.abs(zustandBei(z, track, MIT_TEMPO, z.gesamtdauer).streckenAnteil - 1) < 1e-9);

// An jedem Halt muss das Schild der richtigen Station stehen.
let schilderOk = true;
start = 0;
for (const a of z.abschnitte) {
  if (a.art === 'halt') {
    const s = zustandBei(z, track, MIT_TEMPO, start + a.dauer / 2).schild;
    if (!s || s.staerke !== 1 || stationen[s.station]!.anteil !== a.anteil) schilderOk = false;
  }
  start += a.dauer;
}
pruefe('an jedem Halt steht das Schild der richtigen Station', schilderOk);

// Ausserhalb der Nähe eines Halts darf kein Schild stehen.
const mittenInFahrt = zustandBei(z, track, MIT_TEMPO, VORGABE.vorspannSekunden + fahrten[0]!.dauer * 0.5);
pruefe('mitten auf der Fahrt kein Schild', mittenInFahrt.schild === null);

// --- Pause an einem frei gesetzten Kamerapunkt --------------------------
{
  const mitPause = {
    ...MIT_TEMPO,
    kameraPunkte: MIT_TEMPO.kameraPunkte.map((p) =>
      // Mitten in der ersten Etappe, wo keine Station liegt.
      Math.abs(p.anteil - 0.399) < 1e-9 ? { ...p, halt: 4 } : p,
    ),
  };
  const zp = baueZeitachse(track, etappen, stationen, mitPause);
  pruefe(
    'eine Pause am Kamerapunkt verlaengert das Video um genau ihre Dauer',
    Math.abs(zp.gesamtdauer - z.gesamtdauer - 4) < 1e-6,
    `(${zp.gesamtdauer.toFixed(2)} statt ${z.gesamtdauer.toFixed(2)})`,
  );

  // Waehrend der Pause steht die Strecke still und es erscheint kein Schild:
  // an dieser Stelle gibt es keinen Ort zu benennen.
  let t = 0;
  let geprueft = false;
  for (const a of zp.abschnitte) {
    if (a.art === 'halt' && a.station === null) {
      const anfang = zustandBei(zp, track, mitPause, t + 0.1);
      const ende = zustandBei(zp, track, mitPause, t + a.dauer - 0.1);
      pruefe(
        'waehrend der Pause steht die Strecke still',
        Math.abs(anfang.streckenAnteil - ende.streckenAnteil) < 1e-9,
      );
      pruefe('an einer Pause ohne Station erscheint kein Schild', anfang.schild === null);
      geprueft = true;
    }
    t += a.dauer;
  }
  pruefe('die Pause liegt als eigener Abschnitt in der Zeitachse', geprueft);
}

// --- Haltedauer je Station ----------------------------------------------
{
  // Station 1 (Bremen) soll 6 s statt der ueblichen stehen, Station 2 gar nicht.
  const halte = stationen.map(() => VORGABE.haltSekunden);
  halte[1] = 6;
  halte[2] = 0;
  const zs = baueZeitachse(track, etappen, stationen, { ...MIT_TEMPO, haltProStation: halte });

  const dauerAn = (index: number) =>
    zs.abschnitte
      .filter((a): a is Extract<typeof a, { art: 'halt' }> => a.art === 'halt')
      .filter((a) => a.station === index)
      .reduce((summe, a) => summe + a.dauer, 0);

  pruefe('die eingestellte Haltedauer gilt', Math.abs(dauerAn(1) - 6) < 1e-9, `(${dauerAn(1)} s)`);
  pruefe('eine 0 faehrt ohne Halt durch', dauerAn(2) === 0);
  pruefe(
    'die uebrigen Stationen behalten die Grundeinstellung',
    Math.abs(dauerAn(3) - VORGABE.haltSekunden) < 1e-9,
  );
}

// --- Blickrichtung ------------------------------------------------------
{
  const gedreht = {
    ...MIT_TEMPO,
    kameraPunkte: [
      { anteil: 0, zoom: 8.5, neigung: 50, tempo: 1, drehung: 0, halt: 0 },
      { anteil: 1, zoom: 8.5, neigung: 50, tempo: 1, drehung: 1, halt: 0 },
    ],
  };
  const zd = baueZeitachse(track, etappen, stationen, gedreht);
  const anfang = zustandBei(zd, track, gedreht, zd.gesamtdauer * 0.05).drehung;
  const ende = zustandBei(zd, track, gedreht, zd.gesamtdauer * 0.97).drehung;
  pruefe(
    'die Blickrichtung laeuft von Norden oben zum Mitdrehen',
    anfang < 0.2 && ende > 0.8,
    `(${anfang.toFixed(2)} -> ${ende.toFixed(2)})`,
  );
  // Ohne gesetzte Punkte zieht die Grundeinstellung.
  const ohne = baueZeitachse(track, etappen, stationen, { ...MIT_TEMPO, kameraPunkte: [] });
  pruefe(
    'ohne Punkte gilt der Schalter "Kamera dreht mit"',
    zustandBei(ohne, track, { ...MIT_TEMPO, kameraPunkte: [] }, 5).drehung === 0,
  );
}

console.log(fehler === 0 ? '\nALLE PRUEFUNGEN BESTANDEN' : `\n${fehler} FEHLGESCHLAGEN`);
process.exit(fehler === 0 ? 0 : 1);
