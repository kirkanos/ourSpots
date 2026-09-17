import { BadRequestException, Injectable } from '@nestjs/common';
import type { ImportResultDto } from '@ourspots/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TripsService } from '../trips/trips.service';
import { RoutingService } from '../routing/routing.service';
import { newId } from '../common/ids';
import { fromDateOnly } from '../common/dates';
import { haversineKm } from '../common/geo';
import { buildGpx, buildKml, parseCsv, parsePoints, type ExportPoint } from './gpx';

/** Näher als das gilt ein importierter Punkt als bereits vorhanden. */
const DUPLICATE_RADIUS_KM = 0.05;

@Injectable()
export class TransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripsService,
    private readonly routing: RoutingService,
  ) {}

  /**
   * Exportiert eine Reise. Die Straßenroute kommt aus dem Cache – ein Export
   * soll kein ORS-Kontingent verbrauchen; fehlt sie, enthält die Datei nur
   * Wegpunkte und Stellplätze.
   */
  async exportTrip(
    tripId: string,
    userId: string,
    format: 'gpx' | 'kml',
  ): Promise<{ filename: string; content: string; contentType: string }> {
    await this.trips.requireRole(tripId, userId, 'viewer');

    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      include: {
        waypoints: { orderBy: { seq: 'asc' } },
        spots: { orderBy: { visitedAt: 'asc' }, include: { amenities: true } },
        routes: { orderBy: { computedAt: 'asc' } },
      },
    });

    const waypoints: ExportPoint[] = trip.waypoints.map((wp) => ({
      name: wp.name,
      lat: wp.lat,
      lon: wp.lon,
      description: describeWaypoint(wp.kind, wp.plannedNights),
    }));

    const spots: ExportPoint[] = trip.spots.map((spot) => ({
      name: spot.name,
      lat: spot.lat,
      lon: spot.lon,
      description: describeSpot(
        spot.type,
        spot.rating,
        fromDateOnly(spot.visitedAt),
        spot.isPrivateNote ? null : spot.notes,
        spot.amenities.map((a) => a.amenity),
      ),
    }));

    const track =
      trip.routes.length > 0
        ? { name: `Route ${trip.title}`, geometries: trip.routes.map((route) => route.geometry) }
        : null;

    const safeTitle = trip.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'reise';

    return format === 'gpx'
      ? {
          filename: `${safeTitle}.gpx`,
          content: buildGpx(trip.title, waypoints, spots, track),
          contentType: 'application/gpx+xml; charset=utf-8',
        }
      : {
          filename: `${safeTitle}.kml`,
          content: buildKml(trip.title, waypoints, spots, track),
          contentType: 'application/vnd.google-earth.kml+xml; charset=utf-8',
        };
  }

  /**
   * Importiert Punkte aus GPX, KML oder CSV als Stellplätze. Punkte, die schon
   * als Stellplatz vorhanden sind, werden übersprungen statt doppelt angelegt.
   */
  async importSpots(
    userId: string,
    filename: string,
    content: string,
    tripId: string | null,
  ): Promise<ImportResultDto> {
    if (tripId) await this.trips.requireRole(tripId, userId, 'editor');

    const lower = filename.toLowerCase();
    const points = lower.endsWith('.csv') ? parseCsv(content) : parsePoints(content);

    if (points.length === 0) {
      throw new BadRequestException(
        'In der Datei wurden keine Punkte gefunden. Unterstützt werden GPX, KML und CSV mit Spalten für Breiten- und Längengrad.',
      );
    }

    const existing = await this.prisma.spot.findMany({
      where: { createdById: userId },
      select: { lat: true, lon: true },
    });

    const messages: string[] = [];
    let imported = 0;
    let skipped = 0;

    for (const point of points) {
      const duplicate = existing.some(
        (spot) => haversineKm(spot.lat, spot.lon, point.lat, point.lon) < DUPLICATE_RADIUS_KM,
      );
      if (duplicate) {
        skipped++;
        if (messages.length < 10) {
          messages.push(`„${point.name}“ übersprungen – an dieser Stelle gibt es schon einen Eintrag.`);
        }
        continue;
      }

      await this.prisma.spot.create({
        data: {
          id: newId(),
          createdById: userId,
          tripId,
          name: point.name.slice(0, 200),
          lat: point.lat,
          lon: point.lon,
          notes: point.description?.slice(0, 10000) ?? null,
          visitedAt: parseDate(point.time),
          type: 'stellplatz',
          source: 'import',
        },
      });
      // Der neue Punkt zählt sofort als vorhanden, sonst legen zwei gleiche
      // Punkte in derselben Datei beide an.
      existing.push({ lat: point.lat, lon: point.lon });
      imported++;
    }

    if (skipped > 10) {
      messages.push(`… und ${skipped - 10} weitere übersprungene Punkte.`);
    }

    return { imported, skipped, messages };
  }
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return null;
  return new Date(`${parsed.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

function describeWaypoint(kind: string, nights: number | null): string {
  const label = kind === 'start' ? 'Start' : kind === 'end' ? 'Ziel' : 'Zwischenziel';
  return nights ? `${label}, ${nights} Nächte geplant` : label;
}

function describeSpot(
  type: string,
  rating: number | null,
  visitedAt: string | null,
  notes: string | null,
  amenities: string[],
): string {
  const parts = [type];
  if (rating) parts.push(`${rating}/5`);
  if (visitedAt) parts.push(visitedAt);
  if (amenities.length) parts.push(amenities.join(', '));
  if (notes) parts.push(notes);
  return parts.join(' · ');
}
