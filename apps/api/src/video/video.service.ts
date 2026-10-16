import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
  Inject,
} from '@nestjs/common';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  routeOptionsSchema,
  VIDEO_GROESSEN,
  type VideoFoto,
  type VideoInput,
  type VideoMusik,
  type VideoJobDto,
  type VideoRezept,
} from '@ourspots/shared';
import type { VideoJob } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PhotosService } from '../photos/photos.service';
import { TripsService } from '../trips/trips.service';
import { RoutingService } from '../routing/routing.service';
import { AppConfig, CONFIG } from '../config/app-config';
import { newId } from '../common/ids';

/**
 * Renderauftraege fuer Reisevideos.
 *
 * Das Rendern selbst macht ein eigener Container: ein Chromium, der die
 * Renderseite oeffnet, Bild fuer Bild fotografiert und die Fotos an ffmpeg
 * weiterreicht. Hier liegt nur die Buchfuehrung -- wer was wann in Auftrag
 * gegeben hat, wie weit es ist, und wo die fertige Datei liegt.
 *
 * Bewusst genau ein Auftrag gleichzeitig: Ein Chromium mit Kartenkacheln und
 * Gelaendemodell ist das speicherhungrigste, was auf diesem Server laeuft.
 * Zwei davon nebeneinander wuerden ihn umbringen, und niemand wartet auf zwei
 * Videos zugleich.
 */
@Injectable()
export class VideoService implements OnModuleInit {
  private readonly logger = new Logger(VideoService.name);
  /** Laeuft gerade ein Durchlauf? Haelt die Warteschlange auf genau einem. */
  private arbeitet = false;
  /** Abbruchgriffe der laufenden Auftraege, damit "Verwerfen" sofort wirkt. */
  private readonly abbrueche = new Map<string, AbortController>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripsService,
    private readonly routing: RoutingService,
    private readonly photos: PhotosService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    // Nur anlegen, wenn die Funktion ueberhaupt eingerichtet ist: Sonst
    // scheiterte der Start an einem Verzeichnis, das nie gebraucht wird.
    if (this.verfuegbar) await mkdir(this.config.VIDEO_DIR, { recursive: true });

    // Ein Auftrag, der beim letzten Herunterfahren mitten im Rendern war,
    // steht nach dem Neustart fuer immer auf "laeuft" -- den Renderer, der ihn
    // bearbeitet hat, gibt es nicht mehr. Lieber ehrlich als Fehler melden,
    // als den Nutzer auf einen Fortschritt warten zu lassen, der nie kommt.
    const verwaist = await this.prisma.videoJob.updateMany({
      where: { status: { in: ['wartend', 'laeuft'] } },
      data: { status: 'fehler', fehler: 'Der Server wurde waehrend des Renderns neu gestartet' },
    });
    if (verwaist.count > 0) {
      this.logger.warn(`${verwaist.count} angefangene Renderauftraege verworfen`);
    }
  }

  get verfuegbar(): boolean {
    return this.config.VIDEO_RENDERER_URL.length > 0;
  }

  // --- Oeffentliche Schnittstelle ------------------------------------------

  async status(tripId: string, userId: string): Promise<VideoJobDto | null> {
    await this.trips.requireRole(tripId, userId, 'viewer');
    const job = await this.prisma.videoJob.findUnique({ where: { tripId } });
    return job ? zuDto(job) : null;
  }

  /**
   * Nimmt einen Auftrag an und stoesst die Warteschlange an.
   *
   * Je Reise gibt es nur einen Auftrag: Ein neuer Lauf ersetzt den alten samt
   * Datei. Sonst sammelten sich Videos an, die niemand mehr sehen will, und
   * das Volume liefe voll.
   */
  async start(tripId: string, userId: string, eingabe: VideoInput): Promise<VideoJobDto> {
    await this.trips.requireRole(tripId, userId, 'editor');
    await this.darfRendern(userId);
    if (!this.verfuegbar) {
      throw new ServiceUnavailableException('Auf diesem Server ist kein Renderer eingerichtet');
    }

    const vorher = await this.prisma.videoJob.findUnique({ where: { tripId } });
    if (vorher && (vorher.status === 'wartend' || vorher.status === 'laeuft')) {
      throw new BadRequestException('Fuer diese Reise laeuft bereits ein Auftrag');
    }

    // Erst das Rezept vollstaendig bauen, dann den Auftrag anlegen: Eine Reise
    // ohne Strecke soll sofort eine verstaendliche Antwort bekommen und nicht
    // als gescheiterter Auftrag in der Liste landen.
    const rezept = await this.baueRezept(tripId, userId, eingabe);

    if (vorher) await this.loescheDatei(vorher.id);

    const job = await this.prisma.videoJob.upsert({
      where: { tripId },
      create: {
        id: newId(),
        tripId,
        startedById: userId,
        status: 'wartend',
        rezept: JSON.stringify(rezept),
      },
      update: {
        startedById: userId,
        status: 'wartend',
        rezept: JSON.stringify(rezept),
        bilder: 0,
        bilderGesamt: 0,
        bytes: 0,
        dauerS: 0,
        fehler: null,
      },
    });

    // Nicht abwarten: Der Aufrufer bekommt den Auftrag, das Rendern laeuft
    // danach weiter. Fehler landen am Auftrag, nicht in dieser Antwort.
    void this.arbeiteAb();

    return zuDto(job);
  }

  /**
   * Das Rendern braucht ein eigenes Recht, die Vorschau nicht.
   *
   * Die Vorschau laeuft im Browser des Nutzers und kostet niemanden etwas.
   * Ein Renderlauf belegt dagegen minutenlang den einzigen Rendercontainer --
   * wer ihn ausloesen darf, ist deshalb eine Entscheidung des Administrators
   * und nicht eine Frage der Rolle innerhalb der Reise.
   */
  private async darfRendern(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, canRenderVideo: true },
    });
    if (user?.role === 'admin' || user?.canRenderVideo) return;
    throw new ForbiddenException(
      'Zum Erzeugen von Videos fehlt dir die Freigabe. Die Vorschau kannst du trotzdem nutzen.',
    );
  }

  async remove(tripId: string, userId: string): Promise<void> {
    await this.trips.requireRole(tripId, userId, 'editor');
    const job = await this.prisma.videoJob.findUnique({ where: { tripId } });
    if (!job) return;

    // Erst abbrechen, dann loeschen: Sonst schriebe der laufende Durchlauf
    // seinen Fortschritt auf eine Zeile, die es nicht mehr gibt.
    this.abbrueche.get(job.id)?.abort();
    this.abbrueche.delete(job.id);
    await this.prisma.videoJob.delete({ where: { id: job.id } });
    await this.loescheDatei(job.id);
  }

  async openStream(tripId: string, userId: string): Promise<{ stream: ReadStream; bytes: number }> {
    await this.trips.requireRole(tripId, userId, 'viewer');
    const job = await this.prisma.videoJob.findUnique({ where: { tripId } });
    if (!job || job.status !== 'fertig') throw new NotFoundException('Es gibt kein fertiges Video');

    const pfad = this.pfadVon(job.id);
    const info = await stat(pfad).catch(() => null);
    if (!info) throw new NotFoundException('Die Videodatei fehlt');
    return { stream: createReadStream(pfad), bytes: info.size };
  }

  /**
   * Die hochgeladene Musik einer Reise zum Anhoeren.
   *
   * Die Vorschau spielt sie mit, damit man vor einem Lauf von ein bis drei
   * Stunden hoert, ob Stueck und Lautstaerke zum Video passen. Lesen darf das
   * jeder, der die Reise sehen darf -- es ist dieselbe Datei, die er im
   * fertigen Video ohnehin hoert.
   */
  async oeffneMusik(
    tripId: string,
    userId: string,
  ): Promise<{ stream: ReadStream; bytes: number; typ: string }> {
    await this.trips.requireRole(tripId, userId, 'viewer');
    const datei = await this.eigeneMusikdatei(tripId);
    if (!datei) throw new NotFoundException('Für diese Reise ist keine Musik hinterlegt');

    const pfad = join(this.config.VIDEO_DIR, 'musik', datei);
    const info = await stat(pfad).catch(() => null);
    if (!info) throw new NotFoundException('Die Musikdatei fehlt');
    return {
      stream: createReadStream(pfad),
      bytes: info.size,
      typ: datei.endsWith('.m4a') ? 'audio/mp4' : 'audio/mpeg',
    };
  }

  // --- Rezept ---------------------------------------------------------------

  /**
   * Stellt alles zusammen, was der Renderer braucht.
   *
   * Die Renderseite im Container fragt nichts bei der API nach -- sie bekommt
   * die Reise mitgegeben. Dadurch braucht der Renderer keine Anmeldung, und es
   * gibt keinen zweiten Weg an fremde Reisen heran.
   */
  private async baueRezept(
    tripId: string,
    userId: string,
    eingabe: VideoInput,
  ): Promise<VideoRezept> {
    const [route, stages, waypoints] = await Promise.all([
      // Dieselben Vorgaben wie in der Oberflaeche, und ohne force: Liegt die
      // Route bereits berechnet vor, soll ein Videoauftrag den Routendienst
      // nicht erneut belasten.
      this.routing.routeTrip(tripId, userId, routeOptionsSchema.parse({})),
      this.trips.listStages(tripId, userId),
      this.trips.listWaypoints(tripId, userId),
    ]);

    if (route.legs.length === 0) {
      throw new BadRequestException(
        'Fuer ein Video braucht es eine berechnete Route mit mindestens einer Etappe',
      );
    }

    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      select: { title: true, startDate: true, endDate: true },
    });

    return {
      einstellungen: eingabe,
      route,
      stages,
      waypoints,
      fotos: await this.sammleFotos(tripId, eingabe),
      musik: await this.loeseMusik(tripId, eingabe),
      bilanz: {
        titel: trip.title,
        zeitraum: zeitraumText(trip.startDate, trip.endDate),
        distanzM: route.totalDistanceM,
        aufstiegM: route.totalAscentM,
        abstiegM: route.totalDescentM,
        // Der Startpunkt zaehlt nicht mit: Dort faengt die Reise an, statt
        // eine Station zu sein.
        stationen: Math.max(0, route.legs.length),
        tage: reisetage(trip.startDate, trip.endDate),
      },
    };
  }

  /**
   * Laedt die ausgewaehlten Fotos und legt sie als `data:`-URI ins Rezept.
   *
   * Nur die wirklich gewaehlten: Ein Rezept mit allen Fotos einer Reise waere
   * schnell zweistellig megabyteschwer, und gebraucht wird eine Handvoll.
   *
   * Gegen die Reise geprueft, nicht bloss nach Kennung geladen -- sonst liesse
   * sich ueber ein praepariertes Rezept ein fremdes Foto ins eigene Video
   * holen.
   */
  private async sammleFotos(
    tripId: string,
    eingabe: VideoInput,
  ): Promise<Record<string, VideoFoto>> {
    const gewaehlt = new Set(
      [
        ...eingabe.einstellungen.fotoProStation,
        ...eingabe.einstellungen.kameraPunkte.map((p) => p.foto ?? null),
      ].filter((id): id is string => typeof id === 'string' && id.length > 0),
    );
    if (gewaehlt.size === 0) return {};

    const reihen = await this.prisma.photo.findMany({
      where: { id: { in: [...gewaehlt] }, spot: { tripId } },
      select: { id: true, storageKey: true, caption: true },
    });

    const fotos: Record<string, VideoFoto> = {};
    for (const reihe of reihen) {
      const bild = await this.photos.alsDatenUri(reihe.storageKey);
      // Eine fehlende Datei laesst nur dieses Bild weg, statt den ganzen
      // Auftrag scheitern zu lassen.
      if (bild) fotos[reihe.id] = { bild, caption: reihe.caption };
    }
    return fotos;
  }

  /**
   * Woher die Tonspur kommt -- oder null, wenn das Video still bleibt.
   *
   * Zwei Quellen mit verschiedenen Wegen: Ein mitgeliefertes Stueck liegt beim
   * Webcontainer, der Renderer laedt es von dort. Eine hochgeladene Datei
   * liegt im gemeinsamen Volume, auf das API und Renderer beide zugreifen --
   * sie als data:-URI mitzuschicken waere bei mehreren Megabyte je Stueck
   * unsinnig, anders als bei den Fotos.
   */
  private async loeseMusik(tripId: string, eingabe: VideoInput): Promise<VideoMusik | null> {
    const wahl = eingabe.musik;
    if (!wahl) return null;

    if (wahl === 'eigene') {
      const datei = await this.eigeneMusikdatei(tripId);
      if (!datei) return null;
      return { pfad: `musik/${datei}`, lautstaerke: eingabe.musikLautstaerke };
    }

    if (wahl.startsWith('auswahl:')) {
      const name = wahl.slice('auswahl:'.length);
      // Nur der blosse Dateiname -- sonst liesse sich ueber ../ im Webcontainer
      // herumspazieren.
      if (!/^[\w.-]+$/.test(name)) {
        throw new BadRequestException('Ungueltiges Musikstueck');
      }
      return {
        url: `${this.config.VIDEO_WEB_URL}/musik/${name}`,
        lautstaerke: eingabe.musikLautstaerke,
      };
    }

    return null;
  }

  /** Die hochgeladene Datei dieser Reise, falls vorhanden. */
  async eigeneMusikdatei(tripId: string): Promise<string | null> {
    const verzeichnis = join(this.config.VIDEO_DIR, 'musik');
    const dateien = await readdir(verzeichnis).catch(() => [] as string[]);
    return dateien.find((d) => d.startsWith(`${tripId}.`)) ?? null;
  }

  /** Speichert die eigene Musik einer Reise; ersetzt eine vorhandene. */
  async speichereMusik(
    tripId: string,
    userId: string,
    datei: { originalname: string; buffer: Buffer },
  ): Promise<void> {
    await this.trips.requireRole(tripId, userId, 'editor');

    const endung = (datei.originalname.match(/\.(mp3|m4a|aac|ogg|wav)$/i)?.[1] ?? '').toLowerCase();
    if (!endung) {
      throw new BadRequestException('Erlaubt sind mp3, m4a, aac, ogg und wav');
    }

    const verzeichnis = join(this.config.VIDEO_DIR, 'musik');
    await mkdir(verzeichnis, { recursive: true });
    await this.loescheMusik(tripId, userId, false);
    await writeFile(join(verzeichnis, `${tripId}.${endung}`), datei.buffer);
  }

  async loescheMusik(tripId: string, userId: string, pruefen = true): Promise<void> {
    if (pruefen) await this.trips.requireRole(tripId, userId, 'editor');
    const vorhanden = await this.eigeneMusikdatei(tripId);
    if (vorhanden) {
      await rm(join(this.config.VIDEO_DIR, 'musik', vorhanden), { force: true });
    }
  }

  // --- Warteschlange --------------------------------------------------------

  /** Arbeitet wartende Auftraege nacheinander ab. */
  private async arbeiteAb(): Promise<void> {
    if (this.arbeitet) return;
    this.arbeitet = true;
    try {
      for (;;) {
        const job = await this.prisma.videoJob.findFirst({
          where: { status: 'wartend' },
          orderBy: { createdAt: 'asc' },
        });
        if (!job) return;
        // Bricht ab, wenn der Auftrag nicht uebernommen werden konnte --
        // sonst drehte sich die Schleife endlos ueber derselben Zeile.
        if (!(await this.rendere(job))) return;
      }
    } finally {
      this.arbeitet = false;
    }
  }

  /** Rendert einen Auftrag. Liefert false, wenn er nicht uebernommen wurde. */
  private async rendere(job: VideoJob): Promise<boolean> {
    // Den Auftrag in einem Zug uebernehmen: Zwischen dem Heraussuchen und hier
    // kann er geloescht worden sein. Schlaegt das fehl, ist er weg oder schon
    // in Arbeit -- in beiden Faellen gibt es hier nichts mehr zu tun.
    const uebernommen = await this.prisma.videoJob.updateMany({
      where: { id: job.id, status: 'wartend' },
      data: { status: 'laeuft', fehler: null },
    });
    if (uebernommen.count === 0) return false;

    const abbruch = new AbortController();
    this.abbrueche.set(job.id, abbruch);

    try {
      const rezept = JSON.parse(job.rezept) as VideoRezept;
      const ergebnis = await this.frageRenderer(job.id, rezept, abbruch.signal);

      await this.prisma.videoJob.update({
        where: { id: job.id },
        data: {
          status: 'fertig',
          bilder: ergebnis.bilder,
          bilderGesamt: ergebnis.bilder,
          bytes: ergebnis.bytes,
          dauerS: ergebnis.dauerS,
        },
      });
      this.logger.log(
        `Video ${job.id} fertig: ${ergebnis.bilder} Bilder, ` +
          `${(ergebnis.bytes / 1024 / 1024).toFixed(1)} MB`,
      );
    } catch (error) {
      if (abbruch.signal.aborted) {
        // Verworfen, nicht gescheitert: Die Zeile ist bereits geloescht.
        this.logger.log(`Video ${job.id} wurde abgebrochen`);
        await this.loescheDatei(job.id);
        return true;
      }
      const text = error instanceof Error ? error.message : String(error);
      this.logger.error(`Video ${job.id} gescheitert: ${text}`);
      await this.loescheDatei(job.id);
      // updateMany statt update: Der Auftrag kann zwischenzeitlich geloescht
      // worden sein, und daran soll die Fehlerbehandlung nicht selbst scheitern.
      await this.prisma.videoJob.updateMany({
        where: { id: job.id },
        data: { status: 'fehler', fehler: text.slice(0, 500) },
      });
    } finally {
      this.abbrueche.delete(job.id);
    }
    return true;
  }

  /**
   * Spricht mit dem Rendercontainer.
   *
   * Die Antwort ist kein einzelnes JSON, sondern ein Strom aus Zeilen: eine je
   * Fortschrittsmeldung, die letzte mit dem Ergebnis. Anders ginge es nicht --
   * ein Lauf dauert Minuten, und eine HTTP-Antwort, die so lange stumm bleibt,
   * halten weder Proxy noch Nutzer aus.
   */
  private async frageRenderer(
    jobId: string,
    rezept: VideoRezept,
    signal: AbortSignal,
  ): Promise<{ bilder: number; bytes: number; dauerS: number }> {
    const groesse = VIDEO_GROESSEN[rezept.einstellungen.groesse];
    const antwort = await fetch(`${this.config.VIDEO_RENDERER_URL}/render`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.VIDEO_RENDER_TOKEN
          ? { 'X-Render-Token': this.config.VIDEO_RENDER_TOKEN }
          : {}),
      },
      body: JSON.stringify({
        jobId,
        rezept,
        groesse: rezept.einstellungen.groesse,
        // Buehnenmasse in CSS-Pixeln, dazu die Pixeldichte. Das Video wird
        // breite*skala x hoehe*skala gross -- siehe VIDEO_GROESSEN.
        breite: groesse.breite,
        hoehe: groesse.hoehe,
        skala: groesse.skala,
        bilderProSekunde: rezept.einstellungen.bilderProSekunde,
        musik: rezept.musik,
      }),
    });

    if (!antwort.ok || !antwort.body) {
      throw new Error(`Der Renderer antwortete mit ${antwort.status}`);
    }

    let ergebnis: { bilder: number; bytes: number; dauerS: number } | null = null;
    let zuletztGemeldet = 0;

    for await (const zeile of zeilenVon(antwort.body)) {
      const meldung = JSON.parse(zeile) as {
        bilder?: number;
        bilderGesamt?: number;
        fertig?: { bilder: number; bytes: number; dauerS: number };
        fehler?: string;
      };

      if (meldung.fehler) throw new Error(meldung.fehler);
      if (meldung.fertig) {
        ergebnis = meldung.fertig;
        continue;
      }

      // Nicht jedes Bild schreiben: Bei 25 Bildern je Sekunde Video waeren das
      // Tausende Schreibvorgaenge fuer eine Anzeige, die niemand so genau
      // liest. Zwei Sekunden Abstand reichen vollkommen.
      const jetzt = Date.now();
      if (jetzt - zuletztGemeldet < 2000) continue;
      zuletztGemeldet = jetzt;
      await this.prisma.videoJob.updateMany({
        where: { id: jobId },
        data: {
          ...(meldung.bilder !== undefined ? { bilder: meldung.bilder } : {}),
          ...(meldung.bilderGesamt !== undefined ? { bilderGesamt: meldung.bilderGesamt } : {}),
        },
      });
    }

    if (!ergebnis) throw new Error('Der Renderer brach ab, ohne ein Ergebnis zu melden');
    return ergebnis;
  }

  // --- Dateien --------------------------------------------------------------

  private pfadVon(jobId: string): string {
    return join(this.config.VIDEO_DIR, `${jobId}.mp4`);
  }

  private async loescheDatei(jobId: string): Promise<void> {
    await rm(this.pfadVon(jobId), { force: true }).catch(() => undefined);
  }
}

function zuDto(job: VideoJob): VideoJobDto {
  return {
    id: job.id,
    tripId: job.tripId,
    status: job.status as VideoJobDto['status'],
    bilder: job.bilder,
    bilderGesamt: job.bilderGesamt,
    bytes: job.bytes,
    dauerS: job.dauerS,
    fehler: job.fehler,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

/** Zerlegt einen Byte-Strom in Zeilen, ohne auf das Ende zu warten. */
async function* zeilenVon(koerper: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const leser = koerper.getReader();
  const dekoder = new TextDecoder();
  let rest = '';

  for (;;) {
    const { done, value } = await leser.read();
    if (done) break;
    rest += dekoder.decode(value, { stream: true });
    let bruch: number;
    while ((bruch = rest.indexOf('\n')) >= 0) {
      const zeile = rest.slice(0, bruch).trim();
      rest = rest.slice(bruch + 1);
      if (zeile) yield zeile;
    }
  }
  if (rest.trim()) yield rest.trim();
}

/** Zeitraum als fertiger Text fuer die Titeltafel. */
function zeitraumText(von: Date | null, bis: Date | null): string | null {
  const f = (d: Date) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (von && bis) return `${f(von)} – ${f(bis)}`;
  if (von) return `ab ${f(von)}`;
  if (bis) return `bis ${f(bis)}`;
  return null;
}

/**
 * Reisetage einschliesslich An- und Abreisetag.
 *
 * Eine Reise vom 10. bis zum 11. dauert zwei Tage und nicht einen -- deshalb
 * die Differenz plus eins.
 */
function reisetage(von: Date | null, bis: Date | null): number | null {
  if (!von || !bis) return null;
  const tag = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.round((bis.getTime() - von.getTime()) / tag) + 1);
}
