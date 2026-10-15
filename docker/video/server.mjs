/**
 * Der Rendercontainer: aus einer Reiseanimation wird eine MP4-Datei.
 *
 * Das Vorgehen ist bewusst einfach und deterministisch. Ein Chromium oeffnet
 * dieselbe Renderseite, die auch die Vorschau fuettert, und wird Bild fuer
 * Bild weitergeschaltet -- nicht in Echtzeit abgefilmt. Jedes Bild wird erst
 * fotografiert, wenn die Karte fertig geladen hat. Dadurch kann kein Bild
 * verloren gehen und keine halb geladene Kachel im Video landen, auch wenn
 * ein Kachelserver einmal langsam ist.
 *
 * Fotografiert wird die ganze Seite, nicht das Canvas: Fahrzeug und
 * Etappenschilder sind HTML-Elemente darueber. Ein Canvas-Mitschnitt haette
 * die Karte, aber kein Wohnmobil.
 *
 * Die Antwort ist ein Strom aus JSON-Zeilen statt einer einzelnen Antwort --
 * ein Lauf dauert Minuten, und so lange bleibt keine HTTP-Verbindung
 * unbehelligt stumm.
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const PORT = Number(process.env.PORT ?? 3100);
const WEB_URL = process.env.WEB_URL ?? 'http://ourspots:80';
const VIDEO_DIR = process.env.VIDEO_DIR ?? '/data/videos';
const TOKEN = process.env.VIDEO_RENDER_TOKEN ?? '';

/** Wie lange ein einzelnes Bild hoechstens brauchen darf. */
const BILD_ZEITLIMIT_MS = 60_000;

/**
 * Genau ein Lauf gleichzeitig.
 *
 * Ein Chromium mit Kartenkacheln und Gelaendemodell ist das speicherhungrigste,
 * was hier laeuft. Die API haelt sich ohnehin daran; dies ist der Riegel fuer
 * den Fall, dass sie es einmal nicht tut.
 */
let belegt = false;

const server = createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, belegt }));
    return;
  }

  if (req.method !== 'POST' || !req.url?.startsWith('/render')) {
    res.writeHead(404).end();
    return;
  }

  if (TOKEN && req.headers['x-render-token'] !== TOKEN) {
    res.writeHead(401).end();
    return;
  }

  if (belegt) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ fehler: 'Es laeuft bereits ein Auftrag' }));
    return;
  }

  let auftrag;
  try {
    auftrag = JSON.parse(await koerperLesen(req));
  } catch {
    res.writeHead(400).end();
    return;
  }

  belegt = true;
  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson',
    'Cache-Control': 'no-store',
  });

  const melde = (objekt) => {
    if (!res.writableEnded) res.write(`${JSON.stringify(objekt)}\n`);
  };

  try {
    const ergebnis = await rendere(auftrag, melde, req);
    melde({ fertig: ergebnis });
  } catch (fehler) {
    console.error('Rendern gescheitert:', fehler);
    melde({ fehler: fehler instanceof Error ? fehler.message : String(fehler) });
  } finally {
    belegt = false;
    res.end();
  }
});

/**
 * Ein kompletter Lauf.
 *
 * `req` dient nur dazu, einen Abbruch zu bemerken: Bricht die API die
 * Verbindung ab, weil der Nutzer "Verwerfen" gedrueckt hat, soll nicht noch
 * minutenlang weitergerendert werden.
 */
async function rendere(auftrag, melde, req) {
  const { jobId, rezept, groesse, breite, hoehe, bilderProSekunde } = auftrag;
  const skala = auftrag.skala ?? 1;
  if (!jobId || !rezept) throw new Error('Unvollstaendiger Auftrag');

  let abgebrochen = false;
  req.on('close', () => {
    abgebrochen = true;
  });

  await mkdir(VIDEO_DIR, { recursive: true });
  const ziel = join(VIDEO_DIR, `${jobId}.mp4`);
  // Eine Datei aus einem frueheren, gescheiterten Lauf wuerde ffmpeg sonst
  // zum Nachfragen bringen, und darauf wartet niemand.
  await rm(ziel, { force: true });

  console.log(`Auftrag ${jobId}: Browser wird gestartet`);
  const browser = await chromium.launch({
    args: [
      // Ohne Sandbox, weil die uebliche Alternative waere, dem Container
      // SYS_ADMIN zu geben -- das waere deutlich mehr Recht als weniger.
      // Geoeffnet wird ausschliesslich die eigene Renderseite; die Reisedaten
      // kommen injiziert, nicht aus dem Netz.
      '--no-sandbox',
      // In einem Container ist /dev/shm standardmaessig 64 MB gross; Chromium
      // geht von mehr aus und stuerzt sonst mitten im Lauf ab.
      '--disable-dev-shm-usage',
      // Es gibt keine Grafikkarte. Ohne diese beiden Schalter verweigert
      // Chromium WebGL, und MapLibre zeigt eine leere Flaeche.
      '--use-gl=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });

  let ffmpeg = null;
  try {
    const seite = await browser.newPage({
      viewport: { width: breite, height: hoehe },
      // Die Pixeldichte macht die Aufloesung, nicht die Fenstergroesse. Bei
      // einer Vektorkarte zeigt ein breiteres Fenster mehr Landschaft; eine
      // hoehere Dichte zeichnet denselben Ausschnitt feiner -- MapLibre holt
      // dafuer von sich aus Kacheln einer tieferen Zoomstufe. Das Foto ist
      // damit breite*skala x hoehe*skala gross, und ffmpeg muss nichts
      // umrechnen.
      deviceScaleFactor: skala,
      locale: 'de-DE',
    });
    seite.on('console', (m) => {
      if (m.type() === 'error') console.warn('Seite:', m.text());
    });
    seite.on('pageerror', (e) => console.warn('Seitenfehler:', e.message));

    console.log(`Auftrag ${jobId}: Renderseite wird geoeffnet`);
    await seite.goto(`${WEB_URL}/video-rendern?groesse=${encodeURIComponent(groesse)}`, {
      waitUntil: 'load',
      timeout: 60_000,
    });
    await seite.waitForFunction(() => typeof window.__video?.aufbauen === 'function', null, {
      timeout: 60_000,
    });

    console.log(`Auftrag ${jobId}: Szene wird aufgebaut`);
    // page.evaluate kennt kein eigenes Zeitlimit: Wartet die Seite auf etwas,
    // das nie kommt -- einen Kachelserver, der nicht antwortet --, wartet der
    // Auftrag ewig mit. Lieber nach zwei Minuten ehrlich scheitern.
    const { dauerS } = await mitZeitlimit(
      seite.evaluate((r) => window.__video.aufbauen(r), rezept),
      120_000,
      'Die Szene liess sich nicht aufbauen',
    );
    const bilderGesamt = Math.max(1, Math.ceil(dauerS * bilderProSekunde));
    melde({ bilder: 0, bilderGesamt });
    // Gerundet, weil die Dichte ein Bruch sein darf: 1920 * 2/3 ist als
    // Gleitkommazahl 1279.9999999999998, als Bild aber 1280 Pixel breit.
    const [vBreite, vHoehe] = [Math.round(breite * skala), Math.round(hoehe * skala)];
    console.log(
      `Auftrag ${jobId}: ${bilderGesamt} Bilder, ${vBreite}x${vHoehe}` +
        (skala === 1 ? '' : ` (Buehne ${breite}x${hoehe} bei Dichte ${skala.toFixed(2)})`),
    );

    ffmpeg = starteFfmpeg(ziel, bilderProSekunde);

    for (let i = 0; i < bilderGesamt; i++) {
      if (abgebrochen) throw new Error('Der Auftrag wurde abgebrochen');

      const foto = await holeBild(seite, i / bilderProSekunde, i + 1);
      // Einmal nachmessen, bevor Tausende Bilder in den Kodierer wandern.
      // ffmpeg stellt sich auf das erste Bild ein; ein spaeter abweichendes
      // wuerde er zurueckweisen, und eine ungerade Kante lehnt libx264 mit
      // yuv420p von vornherein ab. Beides waere ein Fehler, dessen Ursache
      // weit zurueck liegt -- hier ist sie noch offensichtlich.
      if (i === 0) pruefeMasse(foto, vBreite, vHoehe);

      // Gescheitertes ffmpeg sofort bemerken: Sonst schriebe die Schleife
      // noch Hunderte Bilder in ein totes Rohr und meldete erst am Ende einen
      // Fehler, dessen Ursache minutenlang zurueckliegt.
      if (ffmpeg.fehler) throw ffmpeg.fehler;

      // Gegendruck beachten: ffmpeg kodiert langsamer, als Chromium
      // fotografiert. Ohne das Warten wuechse der Puffer bis zum
      // Speicherfehler.
      if (!ffmpeg.stdin.write(foto)) {
        await Promise.race([once(ffmpeg.stdin, 'drain'), ffmpeg.fertig]);
      }

      // Nicht jedes Bild melden; die API fasst ohnehin zusammen.
      if ((i + 1) % 10 === 0 || i + 1 === bilderGesamt) {
        melde({ bilder: i + 1, bilderGesamt });
      }
    }

    ffmpeg.stdin.end();
    await ffmpeg.fertig;
    ffmpeg = null;

    const info = await stat(ziel);
    return { bilder: bilderGesamt, bytes: info.size, dauerS };
  } catch (fehler) {
    ffmpeg?.kill('SIGKILL');
    await rm(ziel, { force: true }).catch(() => undefined);
    throw fehler;
  } finally {
    await browser.close().catch(() => undefined);
  }
}

/**
 * Prueft die Masse des ersten Fotos gegen das, was bestellt war.
 *
 * Die Masse stehen im PNG-Kopf als zwei 32-Bit-Werte ab Byte 16.
 */
function pruefeMasse(foto, breite, hoehe) {
  const ist = [foto.readUInt32BE(16), foto.readUInt32BE(20)];
  const soll = [breite, hoehe];
  if (ist[0] !== soll[0] || ist[1] !== soll[1]) {
    throw new Error(
      `Das Foto ist ${ist[0]}x${ist[1]} statt ${soll[0]}x${soll[1]} gross - ` +
        'die Pixeldichte geht nicht glatt auf',
    );
  }
  if (ist[0] % 2 !== 0 || ist[1] % 2 !== 0) {
    throw new Error(`Ungerade Videomasse ${ist[0]}x${ist[1]} - H.264 kann das nicht`);
  }
}

/**
 * Stellt ein Bild her und fotografiert es.
 *
 * Mit einem zweiten Versuch, denn der Preis eines Fehlschlags ist hier
 * unverhaeltnismaessig: Ein einzelner Aussetzer -- eine Kachel, die nicht
 * kommt, ein Bild, das der Browser nicht rechtzeitig liefert -- wuerde sonst
 * eine halbe Stunde Arbeit wegwerfen. Dass die Karte dabei einmal nicht ganz
 * fertig geladen ist, faellt in einem von Tausend Bildern niemandem auf.
 */
async function holeBild(seite, t, nummer) {
  let letzter;
  for (let versuch = 1; versuch <= 2; versuch++) {
    try {
      await mitZeitlimit(
        seite.evaluate((zeit) => window.__video.zeige(zeit), t),
        BILD_ZEITLIMIT_MS,
        `Bild ${nummer} wurde nicht fertig`,
      );
      return await seite.screenshot({ type: 'png', timeout: BILD_ZEITLIMIT_MS });
    } catch (fehler) {
      letzter = fehler;
      console.warn(`Bild ${nummer}, Versuch ${versuch} gescheitert:`, fehler.message);
    }
  }
  throw letzter;
}

/**
 * ffmpeg nimmt die Bilder als PNG-Strom entgegen.
 *
 * yuv420p ist nicht die beste, aber die einzige Farbabtastung, die jeder
 * Abspieler und jedes Handy versteht -- ein Video, das nur am Rechner laeuft,
 * waere hier nutzlos. faststart schiebt die Kopfdaten nach vorn, damit das
 * Video im Browser schon waehrend des Ladens anlaeuft.
 */
function starteFfmpeg(ziel, bilderProSekunde) {
  const ffmpeg = spawn(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel', 'error',
      '-f', 'image2pipe',
      '-framerate', String(bilderProSekunde),
      '-i', '-',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      ziel,
    ],
    { stdio: ['pipe', 'ignore', 'pipe'] },
  );
  ffmpeg.stderr.on('data', (d) => console.warn('ffmpeg:', String(d).trim()));
  // Ohne diesen Horcher wirft ein abgebrochener Lauf EPIPE als unbehandeltes
  // Ereignis und reisst den ganzen Dienst mit.
  ffmpeg.stdin.on('error', () => undefined);

  // Dasselbe gilt fuer das 'error'-Ereignis des Prozesses selbst: Ein ffmpeg,
  // das sich gar nicht erst starten laesst, darf diesen einen Auftrag
  // scheitern lassen, aber nicht den Dienst beenden.
  ffmpeg.fehler = null;
  ffmpeg.fertig = new Promise((erfuellt, abgelehnt) => {
    ffmpeg.on('error', (f) => {
      ffmpeg.fehler = new Error(`ffmpeg liess sich nicht starten: ${f.message}`);
      abgelehnt(ffmpeg.fehler);
    });
    ffmpeg.on('close', (code) => {
      if (code === 0) return erfuellt();
      ffmpeg.fehler ??= new Error(`ffmpeg brach mit Code ${code} ab`);
      abgelehnt(ffmpeg.fehler);
    });
  });
  // Angehaengt, damit ein Fehler nicht als unbehandelte Ablehnung gilt,
  // solange die Schleife noch nicht darauf wartet.
  ffmpeg.fertig.catch(() => undefined);

  return ffmpeg;
}

/**
 * Begrenzt die Wartezeit auf ein Versprechen.
 *
 * Das Versprechen laeuft danach weiter -- abbrechen laesst sich eine laufende
 * Auswertung in der Seite nicht. Das macht hier nichts: Gleich darauf wird der
 * ganze Browser geschlossen.
 */
function mitZeitlimit(versprechen, ms, text) {
  let uhr;
  return Promise.race([
    versprechen.finally(() => clearTimeout(uhr)),
    new Promise((_, abgelehnt) => {
      uhr = setTimeout(() => abgelehnt(new Error(`${text} (Zeitlimit ${ms / 1000}s)`)), ms);
    }),
  ]);
}

async function koerperLesen(req) {
  const teile = [];
  for await (const teil of req) teile.push(teil);
  return Buffer.concat(teile).toString('utf8');
}

server.listen(PORT, () => console.log(`Renderer hoert auf Port ${PORT}, Oberflaeche: ${WEB_URL}`));

// Ohne das bleibt der Container beim Stoppen bis zum Zwangsende stehen.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
