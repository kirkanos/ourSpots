import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import exifr from 'exifr';
import sharp from 'sharp';
import type { PhotoDto } from '@ourspots/shared';
import { AppConfig, CONFIG } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { TripsService } from '../trips/trips.service';
import { newId } from '../common/ids';
import { toPhotoDto } from '../spots/spots.service';

/** Kantenlängen der abgelegten Varianten. */
const SIZES = { thumb: 400, medium: 1600, original: 4000 } as const;
export type PhotoSize = keyof typeof SIZES;

export function isPhotoSize(value: string): value is PhotoSize {
  return value in SIZES;
}

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

@Injectable()
export class PhotosService {
  private readonly logger = new Logger(PhotosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripsService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  async uploadForSpot(
    spotId: string,
    userId: string,
    file: { buffer: Buffer; mimetype: string; size: number },
  ): Promise<PhotoDto> {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException(`Dateityp ${file.mimetype} wird nicht unterstützt`);
    }

    const spot = await this.prisma.spot.findUnique({
      where: { id: spotId },
      select: { id: true, createdById: true, tripId: true, visitedAt: true },
    });
    if (!spot) throw new NotFoundException('Stellplatz nicht gefunden');
    if (spot.createdById !== userId) {
      if (!spot.tripId) throw new ForbiddenException('Dieser Stellplatz gehört jemand anderem');
      await this.trips.requireRole(spot.tripId, userId, 'editor');
    }

    const photoId = newId();
    const year = (spot.visitedAt ?? new Date()).getUTCFullYear();
    const storageKey = `${year}/${spotId}/${photoId}`;

    const meta = await this.writeVariants(storageKey, file.buffer);
    const exif = await this.readExif(file.buffer);

    const maxIndex = await this.prisma.photo.aggregate({
      where: { spotId },
      _max: { sortIndex: true },
    });

    const photo = await this.prisma.photo.create({
      data: {
        id: photoId,
        spotId,
        uploadedById: userId,
        storageKey,
        mimeType: 'image/webp',
        width: meta.width,
        height: meta.height,
        bytes: meta.bytes,
        takenAt: exif.takenAt,
        lat: exif.lat,
        lon: exif.lon,
        sortIndex: (maxIndex._max.sortIndex ?? -1) + 1,
      },
    });

    return toPhotoDto(photo);
  }

  async remove(photoId: string, userId: string): Promise<void> {
    const photo = await this.prisma.photo.findUnique({
      where: { id: photoId },
      include: { spot: { select: { createdById: true, tripId: true } } },
    });
    if (!photo) return;

    if (photo.uploadedById !== userId) {
      const spot = photo.spot;
      if (!spot?.tripId) throw new ForbiddenException('Dieses Foto gehört jemand anderem');
      await this.trips.requireRole(spot.tripId, userId, 'editor');
    }

    await this.prisma.photo.delete({ where: { id: photoId } });
    // Dateien nachrangig löschen: ein verwaister Rest ist harmloser als ein
    // Datensatz, dessen Bild fehlt.
    await Promise.all(
      (Object.keys(SIZES) as PhotoSize[]).map((size) =>
        unlink(this.pathFor(photo.storageKey, size)).catch(() => undefined),
      ),
    );
  }

  /** Zugriffsprüfung beim Ausliefern – Bilder liegen nicht im Webroot. */
  async openStream(
    photoId: string,
    userId: string,
    size: PhotoSize,
  ): Promise<{ stream: ReadStream; bytes: number }> {
    const photo = await this.prisma.photo.findUnique({
      where: { id: photoId },
      include: {
        spot: {
          select: {
            createdById: true,
            trip: { select: { ownerId: true, members: { select: { userId: true } } } },
          },
        },
      },
    });
    if (!photo) throw new NotFoundException('Foto nicht gefunden');

    const visible =
      photo.uploadedById === userId ||
      photo.spot?.createdById === userId ||
      photo.spot?.trip?.ownerId === userId ||
      photo.spot?.trip?.members.some((m) => m.userId === userId);
    if (!visible) throw new NotFoundException('Foto nicht gefunden');

    return this.openFile(photo.storageKey, size);
  }

  async openFile(storageKey: string, size: PhotoSize): Promise<{ stream: ReadStream; bytes: number }> {
    const path = this.pathFor(storageKey, size);
    const info = await stat(path).catch(() => null);
    if (!info) throw new NotFoundException('Bilddatei nicht gefunden');
    return { stream: createReadStream(path), bytes: info.size };
  }

  private pathFor(storageKey: string, size: PhotoSize): string {
    return join(this.config.PHOTO_DIR, `${storageKey}_${size}.webp`);
  }

  /**
   * Alle Varianten als WebP. `withoutEnlargement` verhindert, dass kleine
   * Bilder künstlich hochskaliert werden; `rotate()` ohne Argument wendet die
   * EXIF-Orientierung an, sonst liegen Handyfotos quer.
   */
  private async writeVariants(
    storageKey: string,
    buffer: Buffer,
  ): Promise<{ width: number; height: number; bytes: number }> {
    await mkdir(dirname(this.pathFor(storageKey, 'original')), { recursive: true });

    let width = 0;
    let height = 0;
    let bytes = 0;

    for (const [size, edge] of Object.entries(SIZES) as [PhotoSize, number][]) {
      const output = await sharp(buffer)
        .rotate()
        .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: size === 'original' ? 88 : 80 })
        .toFile(this.pathFor(storageKey, size));

      if (size === 'original') {
        width = output.width;
        height = output.height;
        bytes = output.size;
      }
    }

    return { width, height, bytes };
  }

  /** Aufnahmezeit und GPS aus dem Bild, als Vorbelegung fürs Formular. */
  private async readExif(
    buffer: Buffer,
  ): Promise<{ takenAt: Date | null; lat: number | null; lon: number | null }> {
    try {
      const data = await exifr.parse(buffer, { gps: true, tiff: true, exif: true });
      if (!data) return { takenAt: null, lat: null, lon: null };
      const taken = data.DateTimeOriginal ?? data.CreateDate ?? null;
      return {
        takenAt: taken instanceof Date && !Number.isNaN(taken.valueOf()) ? taken : null,
        lat: typeof data.latitude === 'number' ? data.latitude : null,
        lon: typeof data.longitude === 'number' ? data.longitude : null,
      };
    } catch (err) {
      this.logger.debug(`EXIF-Daten nicht lesbar: ${String(err)}`);
      return { takenAt: null, lat: null, lon: null };
    }
  }
}
