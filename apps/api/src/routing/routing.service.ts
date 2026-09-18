import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Stage, Waypoint } from '../generated/prisma/client';
import type {
  OptimizeOptions,
  OptimizeResultDto,
  RouteLegDto,
  RouteOptions,
  TripRouteDto,
} from '@ourspots/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TripsService } from '../trips/trips.service';
import { newId } from '../common/ids';
import { hasDimensions, OrsClient } from './ors.client';

interface RoutePoint {
  lat: number;
  lon: number;
}

/** Eine Teilroute: die Etappe, ihr Titel fuer die Anzeige und ihre Punkte. */
interface RouteGroup {
  stage: Stage | null;
  title: string | null;
  points: RoutePoint[];
}

function toPoint(wp: Waypoint): RoutePoint {
  return { lat: wp.lat, lon: wp.lon };
}

/** Der Rastort einer Etappe – nur vollstaendige Koordinaten zaehlen. */
function stageStop(stage: Stage): RoutePoint | null {
  return stage.lat != null && stage.lon != null ? { lat: stage.lat, lon: stage.lon } : null;
}

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripsService,
    private readonly ors: OrsClient,
  ) {}

  /**
   * Berechnet die Route einer Reise.
   *
   * Sind Etappen angelegt, entsteht pro Etappe eine eigene Teilroute – das ist
   * der Etappen-Modus. Ohne Etappen ergibt sich genau eine durchgehende Route.
   * Mit `stageId` wird gezielt eine einzelne Etappe berechnet.
   */
  async routeTrip(tripId: string, userId: string, options: RouteOptions): Promise<TripRouteDto> {
    await this.trips.requireRole(tripId, userId, 'viewer');

    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      include: {
        vehicle: true,
        stages: { orderBy: { seq: 'asc' } },
        waypoints: { orderBy: { seq: 'asc' } },
      },
    });

    const notes: string[] = [];
    const vehicle = trip.vehicle;

    if (!vehicle) {
      notes.push(
        'Für diese Reise ist kein Fahrzeug hinterlegt – gerechnet wird wie für einen Pkw, ohne Rücksicht auf Höhe und Gewicht.',
      );
    } else if (!hasDimensions(vehicle)) {
      notes.push(
        `Beim Fahrzeug „${vehicle.name}“ fehlen die Maße – ohne sie kann der Dienst keine Beschränkungen berücksichtigen.`,
      );
    }

    const groups = this.groupWaypoints(trip.waypoints, trip.stages, options.stageId ?? null);
    if (groups.length === 0) {
      throw new BadRequestException(
        'Für eine Route braucht es mindestens zwei Ziele. Lege Start und Ziel an.',
      );
    }

    const legs: RouteLegDto[] = [];
    let bbox: [number, number, number, number] | null = null;
    let profile = this.ors.profileFor(vehicle);

    for (const group of groups) {
      if (group.points.length < 2) {
        if (group.stage) {
          notes.push(
            `Der Etappe „${group.stage.title ?? group.stage.seq + 1}“ fehlt ein Rastort, sie wurde übersprungen.`,
          );
        }
        continue;
      }

      const coordinates = group.points.map((p) => [p.lon, p.lat] as [number, number]);
      const hash = this.hashFor(coordinates, profile, options);

      const cached = options.force
        ? null
        : await this.prisma.route.findUnique({ where: { profileHash: hash } });

      if (cached) {
        legs.push({
          stageId: group.stage?.id ?? null,
          stageTitle: group.title,
          distanceM: cached.distanceM,
          durationS: cached.durationS,
          geometry: cached.geometry,
          cached: true,
        });
        bbox = mergeBbox(bbox, parseBboxString(cached.bbox));
        continue;
      }

      const result = await this.ors.route({
        coordinates,
        preference: options.preference,
        avoidTollways: options.avoidTollways,
        avoidFerries: options.avoidFerries,
        avoidHighways: options.avoidHighways,
        vehicle,
      });
      profile = result.profile;

      await this.prisma.route.upsert({
        where: { profileHash: hash },
        create: {
          id: newId(),
          tripId,
          stageId: group.stage?.id ?? null,
          profileHash: hash,
          distanceM: result.distanceM,
          durationS: result.durationS,
          geometry: result.geometry,
          bbox: result.bbox ? result.bbox.join(',') : null,
          provider: 'openrouteservice',
        },
        update: {
          distanceM: result.distanceM,
          durationS: result.durationS,
          geometry: result.geometry,
          bbox: result.bbox ? result.bbox.join(',') : null,
          computedAt: new Date(),
        },
      });

      legs.push({
        stageId: group.stage?.id ?? null,
        stageTitle: group.title,
        distanceM: result.distanceM,
        durationS: result.durationS,
        geometry: result.geometry,
        cached: false,
      });
      bbox = mergeBbox(bbox, result.bbox);
    }

    if (legs.length === 0) {
      throw new BadRequestException(
        'Keine der Etappen ergibt eine Strecke. Lege für jede Etappe einen Rastort fest.',
      );
    }

    return {
      tripId,
      profile,
      legs,
      totalDistanceM: legs.reduce((sum, leg) => sum + leg.distanceM, 0),
      totalDurationS: legs.reduce((sum, leg) => sum + leg.durationS, 0),
      bbox,
      notes,
    };
  }

  /**
   * Schlägt eine kürzere Reihenfolge der Zwischenziele vor. Der Vorschlag wird
   * nur zurückgegeben, nicht gespeichert – übernommen wird er erst, wenn der
   * Nutzer zustimmt.
   */
  async optimize(
    tripId: string,
    userId: string,
    options: OptimizeOptions,
  ): Promise<OptimizeResultDto> {
    await this.trips.requireRole(tripId, userId, 'editor');

    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      include: {
        vehicle: true,
        stages: { orderBy: { seq: 'asc' } },
        waypoints: {
          where: options.stageId ? { stageId: options.stageId } : {},
          orderBy: { seq: 'asc' },
        },
      },
    });

    // Traegt die Reise ihre Rastorte in den Etappen, ist deren Reihenfolge das,
    // was umsortiert werden soll – die Wegpunkte sind dann nur noch Start und
    // Ziel.
    const stagesWithStop = trip.stages.filter((stage) => stageStop(stage) !== null);
    if (!options.stageId && stagesWithStop.length >= 2) {
      return this.optimizeStages(trip.waypoints, stagesWithStop, trip.vehicle);
    }

    const waypoints = trip.waypoints;
    if (waypoints.length < 4) {
      throw new BadRequestException(
        'Zum Optimieren braucht es mindestens zwei Zwischenziele zwischen Start und Ziel.',
      );
    }

    const first = waypoints[0]!;
    const last = waypoints[waypoints.length - 1]!;
    // Festgepinnte Ziele bleiben, wo sie sind – etwa eine Fähre mit Uhrzeit.
    const movable = waypoints.slice(1, -1).filter((wp) => !wp.locked);
    const pinned = waypoints.slice(1, -1).filter((wp) => wp.locked);

    if (movable.length < 2) {
      throw new BadRequestException(
        'Es sind zu wenige verschiebbare Zwischenziele vorhanden. Löse einzelne Festlegungen auf.',
      );
    }

    const result = await this.ors.optimize(
      [first.lon, first.lat],
      [last.lon, last.lat],
      movable.map((wp) => [wp.lon, wp.lat] as [number, number]),
      trip.vehicle,
    );

    const reordered = result.order
      .map((index) => movable[index])
      .filter((wp): wp is Waypoint => wp !== undefined);

    // Festgepinnte Ziele hinten anfügen, damit kein Ziel verlorengeht.
    const proposal = [first, ...reordered, ...pinned, last];

    const current = await this.currentDistance(waypoints.map(toPoint), trip.vehicle);

    return {
      target: 'waypoints',
      waypointIds: proposal.map((wp) => wp.id),
      stageIds: [],
      distanceM: result.distanceM,
      durationS: result.durationS,
      savedM: Math.max(0, current - result.distanceM),
    };
  }

  /**
   * Sucht eine kuerzere Reihenfolge der Etappen. Start und Ziel der Reise
   * bleiben fest – sie sind es ja gerade, die den Rahmen vorgeben.
   */
  private async optimizeStages(
    waypoints: Waypoint[],
    stages: Stage[],
    vehicle: Parameters<OrsClient['route']>[0]['vehicle'],
  ): Promise<OptimizeResultDto> {
    const start = waypoints.find((wp) => wp.kind === 'start');
    const end = [...waypoints].reverse().find((wp) => wp.kind === 'end');
    if (!start || !end) {
      throw new BadRequestException(
        'Zum Optimieren braucht es einen festen Start und ein festes Ziel.',
      );
    }

    const result = await this.ors.optimize(
      [start.lon, start.lat],
      [end.lon, end.lat],
      stages.map((stage) => {
        const stop = stageStop(stage)!;
        return [stop.lon, stop.lat] as [number, number];
      }),
      vehicle,
    );

    const reordered = result.order
      .map((index) => stages[index])
      .filter((stage): stage is Stage => stage !== undefined);

    // Falls der Dienst eine Etappe unterschlaegt, haengen wir sie hinten an –
    // lieber eine ungeschickte Reihenfolge als eine verlorene Etappe.
    const missing = stages.filter((stage) => !reordered.includes(stage));
    const proposal = [...reordered, ...missing];

    const currentOrder: RoutePoint[] = [
      toPoint(start),
      ...stages.map((stage) => stageStop(stage)!),
      toPoint(end),
    ];
    const current = await this.currentDistance(currentOrder, vehicle);

    return {
      target: 'stages',
      waypointIds: [],
      stageIds: proposal.map((stage) => stage.id),
      distanceM: result.distanceM,
      durationS: result.durationS,
      savedM: Math.max(0, current - result.distanceM),
    };
  }

  /** Strecke der aktuellen Reihenfolge, für den Vorher-Nachher-Vergleich. */
  private async currentDistance(
    points: RoutePoint[],
    vehicle: Parameters<OrsClient['route']>[0]['vehicle'],
  ): Promise<number> {
    try {
      const result = await this.ors.route({
        coordinates: points.map((p) => [p.lon, p.lat] as [number, number]),
        preference: 'recommended',
        avoidTollways: false,
        avoidFerries: false,
        avoidHighways: false,
        vehicle,
      });
      return result.distanceM;
    } catch (err) {
      // Ohne Vergleichswert ist der Vorschlag immer noch brauchbar.
      this.logger.warn(`Vergleichsstrecke nicht ermittelbar: ${String(err)}`);
      return 0;
    }
  }

  /**
   * Zerlegt die Reise in Teilrouten.
   *
   * Ohne Etappen entsteht eine durchgehende Strecke ueber alle Wegpunkte.
   * Mit Etappen gilt die Kette Start → Etappe 1 → Etappe 2 → … → Ziel: Jede
   * Etappe endet an ihrem eigenen Rastort und beginnt dort, wo die vorige
   * geendet hat. Ohne diese Verkettung muesste jeder Uebernachtungsort doppelt
   * eingetragen werden – einmal als Ende der einen und einmal als Anfang der
   * naechsten Etappe.
   */
  private groupWaypoints(
    waypoints: Waypoint[],
    stages: Stage[],
    onlyStageId: string | null,
  ): RouteGroup[] {
    const start = waypoints.find((wp) => wp.kind === 'start') ?? null;
    const end = [...waypoints].reverse().find((wp) => wp.kind === 'end') ?? null;

    const usesStages =
      stages.length > 0 &&
      stages.some((stage) => stageStop(stage) !== null || waypoints.some((wp) => wp.stageId === stage.id));

    if (!usesStages) {
      return [{ stage: null, title: null, points: waypoints.map(toPoint) }];
    }

    const groups: RouteGroup[] = [];
    let previous: RoutePoint | null = start ? toPoint(start) : null;

    for (const stage of stages) {
      // Zugeordnete Wegpunkte sind Zwischenstopps des Tages, der Rastort der
      // Etappe steht am Ende.
      const own = waypoints.filter((wp) => wp.stageId === stage.id).map(toPoint);
      const stop = stageStop(stage);
      const points = stop ? [...own, stop] : own;

      if (points.length === 0) {
        groups.push({ stage, title: stage.title, points: [] });
        continue;
      }

      groups.push({
        stage,
        title: stage.title,
        points: previous ? [previous, ...points] : points,
      });
      previous = points[points.length - 1]!;
    }

    // Wegpunkte ohne Etappe liegen auf dem Weg zum Ziel – etwa der Rueckweg
    // nach Hause, den niemand als eigene Etappe anlegt.
    if (end) {
      const loose = waypoints
        .filter((wp) => wp.stageId === null && wp !== start && wp !== end)
        .map(toPoint);
      groups.push({
        stage: null,
        title: 'Zum Ziel',
        points: previous ? [previous, ...loose, toPoint(end)] : [...loose, toPoint(end)],
      });
    }

    if (onlyStageId) return groups.filter((group) => group.stage?.id === onlyStageId);
    return groups;
  }

  /**
   * Der Hash umfasst alles, was das Ergebnis beeinflusst. Ändert sich nichts,
   * liefert der Cache – und der ORS-Zugang bleibt unbelastet.
   */
  private hashFor(
    coordinates: [number, number][],
    profile: string,
    options: RouteOptions,
  ): string {
    const payload = JSON.stringify({
      coordinates: coordinates.map(([lon, lat]) => [round6(lon), round6(lat)]),
      profile,
      preference: options.preference,
      avoid: [options.avoidTollways, options.avoidFerries, options.avoidHighways],
    });
    return createHash('sha256').update(payload).digest('hex');
  }
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function parseBboxString(value: string | null): [number, number, number, number] | null {
  if (!value) return null;
  const parts = value.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  return parts as [number, number, number, number];
}

function mergeBbox(
  a: [number, number, number, number] | null,
  b: [number, number, number, number] | null,
): [number, number, number, number] | null {
  if (!a) return b;
  if (!b) return a;
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}
