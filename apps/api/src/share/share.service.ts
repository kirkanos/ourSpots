import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Amenity, PublicTripDto, ShareLinkDto, ShareLinkInput, SpotType } from '@womo/shared';
import { AppConfig, CONFIG } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { TripsService } from '../trips/trips.service';
import { newId } from '../common/ids';
import { decimalToNumber, fromDateOnly } from '../common/dates';

@Injectable()
export class ShareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripsService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  async list(tripId: string, userId: string): Promise<ShareLinkDto[]> {
    await this.trips.requireRole(tripId, userId, 'owner');
    const links = await this.prisma.shareLink.findMany({
      where: { tripId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return links.map((link) => this.toDto(link));
  }

  async create(tripId: string, userId: string, input: ShareLinkInput): Promise<ShareLinkDto> {
    await this.trips.requireRole(tripId, userId, 'owner');

    const link = await this.prisma.shareLink.create({
      data: {
        id: newId(),
        tripId,
        createdById: userId,
        // 32 Byte Zufall: der Link ist der einzige Schutz, er muss unratbar sein.
        token: randomBytes(32).toString('base64url'),
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        includePhotos: input.includePhotos,
      },
    });
    return this.toDto(link);
  }

  async revoke(token: string, userId: string): Promise<void> {
    const link = await this.prisma.shareLink.findUnique({ where: { token } });
    if (!link) return;
    await this.trips.requireRole(link.tripId, userId, 'owner');
    await this.prisma.shareLink.update({
      where: { token },
      data: { revokedAt: new Date() },
    });
  }

  /** Prüft den Token und liefert die Reise in der öffentlichen Sicht. */
  async publicTrip(token: string): Promise<PublicTripDto> {
    const link = await this.resolveToken(token);

    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: link.tripId },
      include: {
        owner: true,
        waypoints: { orderBy: { seq: 'asc' } },
        spots: {
          orderBy: { visitedAt: 'asc' },
          include: {
            amenities: true,
            photos: { orderBy: { sortIndex: 'asc' }, select: { id: true } },
          },
        },
      },
    });

    return {
      title: trip.title,
      description: trip.description,
      startDate: fromDateOnly(trip.startDate),
      endDate: fromDateOnly(trip.endDate),
      ownerName: trip.owner.displayName,
      includePhotos: link.includePhotos,
      waypoints: trip.waypoints.map((wp) => ({
        seq: wp.seq,
        kind: wp.kind as PublicTripDto['waypoints'][number]['kind'],
        name: wp.name,
        lat: wp.lat,
        lon: wp.lon,
      })),
      spots: trip.spots.map((spot) => ({
        id: spot.id,
        name: spot.name,
        lat: spot.lat,
        lon: spot.lon,
        type: spot.type as SpotType,
        visitedAt: fromDateOnly(spot.visitedAt),
        rating: spot.rating,
        pricePerNight: decimalToNumber(spot.pricePerNight),
        // Als privat markierte Notizen verlassen die App nie.
        notes: spot.isPrivateNote ? null : spot.notes,
        amenities: spot.amenities.map((a) => a.amenity as Amenity),
        photoIds: link.includePhotos ? spot.photos.map((photo) => photo.id) : [],
      })),
    };
  }

  /**
   * Prüft, ob ein Foto über diesen Link ausgeliefert werden darf. Ohne diese
   * Prüfung wäre jede Foto-ID mit einem beliebigen gültigen Token abrufbar.
   */
  async photoStorageKey(token: string, photoId: string): Promise<string> {
    const link = await this.resolveToken(token);
    if (!link.includePhotos) {
      throw new NotFoundException('Für diesen Link sind keine Fotos freigegeben');
    }

    const photo = await this.prisma.photo.findFirst({
      where: { id: photoId, spot: { tripId: link.tripId } },
      select: { storageKey: true },
    });
    if (!photo) throw new NotFoundException('Foto nicht gefunden');
    return photo.storageKey;
  }

  private async resolveToken(token: string) {
    const link = await this.prisma.shareLink.findUnique({ where: { token } });

    // Abgelaufen, widerrufen und unbekannt führen bewusst zur selben Antwort.
    if (
      !link ||
      link.revokedAt !== null ||
      (link.expiresAt !== null && link.expiresAt.getTime() <= Date.now())
    ) {
      throw new NotFoundException('Dieser Link ist nicht (mehr) gültig');
    }
    return link;
  }

  private toDto(link: {
    id: string;
    token: string;
    expiresAt: Date | null;
    includePhotos: boolean;
    revokedAt: Date | null;
    createdAt: Date;
  }): ShareLinkDto {
    return {
      id: link.id,
      token: link.token,
      url: `${this.config.APP_URL}/s/${link.token}`,
      expiresAt: link.expiresAt?.toISOString() ?? null,
      includePhotos: link.includePhotos,
      revokedAt: link.revokedAt?.toISOString() ?? null,
      createdAt: link.createdAt.toISOString(),
    };
  }
}
