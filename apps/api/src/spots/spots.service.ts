import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  Amenity,
  PagedResult,
  PhotoDto,
  SpotDto,
  SpotInput,
  SpotQuery,
  SpotSource,
  SpotType,
} from '@ourspots/shared';
import { PrismaService } from '../prisma/prisma.service';
import { decimalToNumber, fromDateOnly, toDateOnly } from '../common/dates';
import { boundingBoxAround, haversineKm, parseBbox, parseLatLon } from '../common/geo';
import { TripsService } from '../trips/trips.service';

type SpotWithRelations = Prisma.SpotGetPayload<{
  include: { amenities: true; photos: true };
}>;

const INCLUDE = {
  amenities: true,
  photos: { orderBy: { sortIndex: 'asc' } },
} as const;

@Injectable()
export class SpotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripsService,
  ) {}

  /**
   * Sichtbar ist ein Stellplatz, wenn der Nutzer ihn selbst angelegt hat oder
   * er zu einer Reise gehört, auf die er Zugriff hat.
   */
  private visibilityFilter(userId: string): Prisma.SpotWhereInput {
    return {
      OR: [
        { createdById: userId },
        { trip: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] } },
      ],
    };
  }

  async search(userId: string, query: SpotQuery): Promise<PagedResult<SpotDto>> {
    const where: Prisma.SpotWhereInput[] = [this.visibilityFilter(userId)];

    if (query.onlyMine) where.push({ createdById: userId });
    if (query.tripId) where.push({ tripId: query.tripId });
    if (query.type) where.push({ type: query.type });
    if (query.country) where.push({ country: query.country.toUpperCase() });
    if (query.minRating) where.push({ rating: { gte: query.minRating } });
    if (query.maxPrice !== undefined) {
      where.push({ OR: [{ pricePerNight: null }, { pricePerNight: { lte: query.maxPrice } }] });
    }
    if (query.from) where.push({ visitedAt: { gte: toDateOnly(query.from)! } });
    if (query.to) where.push({ visitedAt: { lte: toDateOnly(query.to)! } });

    // Alle gewählten Merkmale müssen vorhanden sein (UND, nicht ODER) – sonst
    // liefert ein Filter mit mehreren Häkchen mehr Treffer statt weniger.
    for (const amenity of query.amenities ?? []) {
      where.push({ amenities: { some: { amenity } } });
    }

    if (query.q) {
      // Substring-Suche über alle Wörter: praktischer als eine Wortanfangs-
      // Volltextsuche, wenn man nach "hafen" auch "Yachthafen" finden will.
      for (const term of query.q.split(/\s+/).filter(Boolean).slice(0, 8)) {
        where.push({
          OR: [
            { name: { contains: term } },
            { address: { contains: term } },
            { notes: { contains: term } },
          ],
        });
      }
    }

    const bbox = query.bbox ? parseBbox(query.bbox) : null;
    if (bbox) {
      where.push({
        lat: { gte: bbox.minLat, lte: bbox.maxLat },
        lon: { gte: bbox.minLon, lte: bbox.maxLon },
      });
    }

    const near = query.near ? parseLatLon(query.near) : null;
    const radiusKm = query.radiusKm ?? 50;
    if (near) {
      const box = boundingBoxAround(near.lat, near.lon, radiusKm);
      where.push({
        lat: { gte: box.minLat, lte: box.maxLat },
        lon: { gte: box.minLon, lte: box.maxLon },
      });
    }

    const filter: Prisma.SpotWhereInput = { AND: where };
    const offset = decodeCursor(query.cursor);

    // Umkreis- und Entfernungssortierung brauchen die Haversine-Distanz, die
    // in SQL nicht indexgestützt wäre. Das Rechteck oben hat die Menge bereits
    // klein gehalten, der Rest passiert im Speicher.
    if (near) {
      const rows = await this.prisma.spot.findMany({
        where: filter,
        include: INCLUDE,
        take: 2000,
      });
      const withDistance = rows
        .map((row) => ({ row, distanceKm: haversineKm(near.lat, near.lon, row.lat, row.lon) }))
        .filter((r) => r.distanceKm <= radiusKm)
        // Bei einer Umkreissuche ist die Entfernung die einzige sinnvolle
        // Reihenfolge; ein abweichender sort-Parameter wird hier ignoriert.
        .sort((a, b) => a.distanceKm - b.distanceKm);

      const page = withDistance.slice(offset, offset + query.limit);
      return {
        items: page.map((r) => ({ ...this.toDto(r.row), distanceKm: round(r.distanceKm, 2) })),
        nextCursor:
          offset + query.limit < withDistance.length ? encodeCursor(offset + query.limit) : null,
        total: withDistance.length,
      };
    }

    const [rows, total] = await Promise.all([
      this.prisma.spot.findMany({
        where: filter,
        include: INCLUDE,
        orderBy: this.orderBy(query),
        skip: offset,
        take: query.limit,
      }),
      this.prisma.spot.count({ where: filter }),
    ]);

    return {
      items: rows.map((row) => this.toDto(row)),
      nextCursor: offset + rows.length < total ? encodeCursor(offset + rows.length) : null,
      total,
    };
  }

  async get(spotId: string, userId: string): Promise<SpotDto> {
    const spot = await this.prisma.spot.findFirst({
      where: { AND: [{ id: spotId }, this.visibilityFilter(userId)] },
      include: INCLUDE,
    });
    if (!spot) throw new NotFoundException('Stellplatz nicht gefunden');
    return this.toDto(spot, userId);
  }

  /**
   * Anlegen oder Ändern unter einer vom Client vergebenen UUID. Ein erneut
   * zugestellter Offline-Sync erzeugt damit keinen doppelten Eintrag.
   */
  async upsert(spotId: string, userId: string, input: SpotInput): Promise<SpotDto> {
    const existing = await this.prisma.spot.findUnique({
      where: { id: spotId },
      select: { createdById: true, tripId: true },
    });

    if (existing) {
      await this.assertWritable(existing, userId);
    }
    if (input.tripId) {
      // In eine fremde Reise darf nur einsortieren, wer dort schreiben darf.
      await this.trips.requireRole(input.tripId, userId, 'editor');
    }

    const data = {
      tripId: input.tripId ?? null,
      name: input.name,
      lat: input.lat,
      lon: input.lon,
      address: input.address ?? null,
      country: input.country?.toUpperCase() ?? null,
      type: input.type,
      visitedAt: toDateOnly(input.visitedAt),
      nights: input.nights ?? null,
      rating: input.rating ?? null,
      pricePerNight: input.pricePerNight ?? null,
      currency: input.currency,
      notes: input.notes ?? null,
      isPrivateNote: input.isPrivateNote,
      source: input.source,
    };

    const spot = await this.prisma.$transaction(async (tx) => {
      const saved = existing
        ? await tx.spot.update({ where: { id: spotId }, data })
        : await tx.spot.create({ data: { ...data, id: spotId, createdById: userId } });

      await tx.spotAmenity.deleteMany({ where: { spotId } });
      if (input.amenities.length) {
        await tx.spotAmenity.createMany({
          data: input.amenities.map((amenity) => ({ spotId, amenity })),
        });
      }
      return saved;
    });

    return this.get(spot.id, userId);
  }

  async remove(spotId: string, userId: string): Promise<void> {
    const existing = await this.prisma.spot.findUnique({
      where: { id: spotId },
      select: { createdById: true, tripId: true },
    });
    if (!existing) return;
    await this.assertWritable(existing, userId);
    await this.prisma.spot.delete({ where: { id: spotId } });
  }

  /** Schreiben darf der Ersteller, sonst ein Editor der zugehörigen Reise. */
  private async assertWritable(
    spot: { createdById: string; tripId: string | null },
    userId: string,
  ): Promise<void> {
    if (spot.createdById === userId) return;
    if (spot.tripId) {
      await this.trips.requireRole(spot.tripId, userId, 'editor');
      return;
    }
    throw new ForbiddenException('Dieser Stellplatz gehört jemand anderem');
  }

  private orderBy(query: SpotQuery): Prisma.SpotOrderByWithRelationInput[] {
    const dir = query.order;
    switch (query.sort) {
      case 'rating':
        return [{ rating: dir }, { visitedAt: 'desc' }];
      case 'name':
        return [{ name: dir }];
      case 'createdAt':
        return [{ createdAt: dir }];
      case 'distance':
      case 'visitedAt':
      default:
        // Nie besuchte Plätze sollen nicht die Liste anführen.
        return [{ visitedAt: dir }, { createdAt: 'desc' }];
    }
  }

  private toDto(spot: SpotWithRelations, viewerId?: string): SpotDto {
    const hideNotes = spot.isPrivateNote && viewerId !== undefined && spot.createdById !== viewerId;
    return {
      id: spot.id,
      tripId: spot.tripId,
      createdById: spot.createdById,
      name: spot.name,
      lat: spot.lat,
      lon: spot.lon,
      address: spot.address,
      country: spot.country,
      type: spot.type as SpotType,
      visitedAt: fromDateOnly(spot.visitedAt),
      nights: spot.nights,
      rating: spot.rating,
      pricePerNight: decimalToNumber(spot.pricePerNight),
      currency: spot.currency,
      notes: hideNotes ? null : spot.notes,
      isPrivateNote: spot.isPrivateNote,
      source: spot.source as SpotSource,
      amenities: spot.amenities.map((a) => a.amenity as Amenity),
      photos: spot.photos.map(toPhotoDto),
      createdAt: spot.createdAt.toISOString(),
      updatedAt: spot.updatedAt.toISOString(),
    };
  }
}

export function toPhotoDto(photo: {
  id: string;
  spotId: string | null;
  diaryEntryId: string | null;
  width: number;
  height: number;
  takenAt: Date | null;
  lat: number | null;
  lon: number | null;
  caption: string | null;
  sortIndex: number;
}): PhotoDto {
  return {
    id: photo.id,
    spotId: photo.spotId,
    diaryEntryId: photo.diaryEntryId,
    width: photo.width,
    height: photo.height,
    takenAt: photo.takenAt?.toISOString() ?? null,
    lat: photo.lat,
    lon: photo.lon,
    caption: photo.caption,
    sortIndex: photo.sortIndex,
  };
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset)).toString('base64url');
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const value = Number(Buffer.from(cursor, 'base64url').toString('utf8'));
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

