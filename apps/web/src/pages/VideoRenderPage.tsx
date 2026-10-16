import { useEffect, useRef, useState } from 'react';
import type { VideoRezept } from '@ourspots/shared';
import { VIDEO_GROESSEN } from '@ourspots/shared';
import { baueReisedaten } from '../video/reisedaten';
import { baueZeitachse, zustandBei } from '../video/timeline';
import { Szene } from '../video/szene';
import { ladeStil } from '../video/stile';

/**
 * Die Seite, die der Renderer im Container oeffnet.
 *
 * Sie zeigt von sich aus nichts und fragt nichts bei der API nach. Der
 * Renderer injiziert das Rezept und schaltet danach ueber `window.__video`
 * Bild fuer Bild weiter -- jedes Bild wird erst fotografiert, wenn die Karte
 * fertig geladen hat. Die Seite ist damit eine Fernbedienung fuer genau die
 * Szene, die auch die Vorschau fuehrt.
 *
 * Bewusst ohne Anmeldung: Sie bekommt alles mitgegeben, hat also nichts, was
 * ein Unbefugter abrufen koennte.
 */

/** Die Fernbedienung, die der Renderer im Container aufruft. */
interface VideoFernbedienung {
  /** Baut die Szene auf und liefert, wie lang das Video wird. */
  aufbauen(rezept: VideoRezept): Promise<{ dauerS: number }>;
  /** Stellt das Bild zum Zeitpunkt t (Sekunden) her und wartet, bis es steht. */
  zeige(t: number): Promise<void>;
}

declare global {
  interface Window {
    __video?: VideoFernbedienung;
  }
}

export function VideoRenderPage() {
  const karteRef = useRef<HTMLDivElement | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [bereit, setBereit] = useState(false);

  // Die Groesse steht in der Adresse. Es sind die Masse der Buehne in
  // CSS-Pixeln, nicht die des Videos: Der Renderer setzt sein Fenster auf
  // dieselben Masse und schraubt fuer 4K nur die Pixeldichte hoch. Deshalb
  // zeigen alle Stufen denselben Kartenausschnitt.
  const params = new URLSearchParams(window.location.search);
  const groesse =
    VIDEO_GROESSEN[(params.get('groesse') ?? '720p') as keyof typeof VIDEO_GROESSEN] ??
    VIDEO_GROESSEN['720p'];

  useEffect(() => {
    let szene: Szene | null = null;
    let abgebaut = false;

    window.__video = {
      async aufbauen(rezept) {
        const behaelter = karteRef.current;
        if (!behaelter) throw new Error('Die Renderseite ist noch nicht bereit');

        const daten = baueReisedaten(rezept.route, rezept.stages, rezept.waypoints);
        if (!daten) throw new Error('Diese Reise hat keine Strecke, aus der ein Video entstehen kann');

        const e = rezept.einstellungen;
        const zeitachse = baueZeitachse(
          daten.track,
          daten.etappen,
          daten.stationen,
          e.einstellungen,
        );

        const stil = await ladeStil(e.stil);
        szene = await Szene.erzeuge(behaelter, stil, {
          marker: e.marker,
          gelaende: e.gelaende,
          ueberhoehung: e.ueberhoehung,
          ruhigeBeschriftung: e.ruhigeBeschriftung,
        });
        if (abgebaut) {
          szene.zerstoere();
          throw new Error('Die Renderseite wurde waehrenddessen verlassen');
        }
        szene.setzeFotos(rezept.fotos ?? {});
        szene.setzeBilanz(rezept.bilanz ?? null, e.titel, e.schluss);
        szene.setzeDaten(daten);

        // Erst hier ersetzen: `zeige` darf nicht auf halb aufgebaute Teile
        // zugreifen, wenn der Renderer zu frueh fragt.
        window.__video!.zeige = async (t: number) => {
          const s = szene;
          if (!s) throw new Error('Es gibt keine Szene');
          s.zeichne(zustandBei(zeitachse, daten.track, e.einstellungen, t));
          await s.ruhig();
        };

        setBereit(true);
        return { dauerS: zeitachse.gesamtdauer };
      },
      async zeige() {
        throw new Error('Zuerst muss das Rezept uebergeben werden');
      },
    };

    return () => {
      abgebaut = true;
      szene?.zerstoere();
      delete window.__video;
    };
  }, []);

  useEffect(() => {
    const beiFehler = (e: ErrorEvent) => setFehler(e.message);
    window.addEventListener('error', beiFehler);
    return () => window.removeEventListener('error', beiFehler);
  }, []);

  return (
    <div
      className="videobuehne"
      // Feste Masse statt Prozentwerten: Der Renderer fotografiert genau
      // dieses Rechteck, und ein um einen Pixel abweichendes Bild liesse
      // ffmpeg den ganzen Lauf verweigern.
      style={{
        width: `${groesse.breite}px`,
        height: `${groesse.hoehe}px`,
        // Marker und Schilder sind in CSS-Pixeln bemasst. Ohne diesen Faktor
        // waere das Wohnmobil in einem 1080p-Video sichtbar kleiner als in der
        // Vorschau, und die Schilder waeren kaum noch zu lesen.
        //
        // Bewusst aus den CSS-Massen und nicht aus der Pixeldichte: Sonst
        // waere das Wohnmobil in 4K doppelt so gross im Bild. Und bewusst aus
        // der *kuerzeren* Seite -- im Hochformat ist das die Breite, und ein
        // Marker, der sich an der Hoehe orientiert, saehe dort riesig aus.
        ['--videoskala' as string]: String(Math.min(groesse.breite, groesse.hoehe) / 720),
      }}
      data-bereit={bereit ? 'ja' : 'nein'}
    >
      <div ref={karteRef} className="videobuehne__karte" />
      {fehler && <div className="videobuehne__fehler">{fehler}</div>}
    </div>
  );
}
