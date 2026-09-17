import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { GeocodeResultDto } from '@ourspots/shared';
import { AppConfig, CONFIG } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';

/** Die öffentliche Nominatim-Instanz erlaubt höchstens eine Anfrage pro Sekunde. */
const MIN_INTERVAL_MS = 1100;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface NominatimPlace {
  display_name?: string;
  lat?: string;
  lon?: string;
  type?: string;
  address?: { country_code?: string };
  boundingbox?: string[];
}

@Injectable()
export class GeocodeService {
  private readonly logger = new Logger(GeocodeService.name);
  /** Serialisiert alle ausgehenden Anfragen zu einer Warteschlange. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  async search(query: string, limit: number): Promise<GeocodeResultDto[]> {
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      limit: String(limit),
      addressdetails: '1',
    });
    return this.fetchCached(`search?${params.toString()}`, (data) =>
      (data as NominatimPlace[]).map(toResult).filter((r): r is GeocodeResultDto => r !== null),
    );
  }

  async reverse(lat: number, lon: number): Promise<GeocodeResultDto | null> {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      format: 'jsonv2',
      addressdetails: '1',
      zoom: '17',
    });
    const results = await this.fetchCached(`reverse?${params.toString()}`, (data) => {
      const place = toResult(data as NominatimPlace);
      return place ? [place] : [];
    });
    return results[0] ?? null;
  }

  private async fetchCached<T>(
    path: string,
    map: (data: unknown) => T[],
  ): Promise<T[]> {
    const key = path.slice(0, 255);

    const cached = await this.prisma.geocodeCache.findUnique({ where: { key } });
    if (cached && Date.now() - cached.createdAt.getTime() < CACHE_TTL_MS) {
      return map(JSON.parse(cached.response));
    }

    const data = await this.enqueue(() => this.request(path));

    await this.prisma.geocodeCache
      .upsert({
        where: { key },
        create: { key, response: JSON.stringify(data) },
        update: { response: JSON.stringify(data), createdAt: new Date() },
      })
      // Ein fehlgeschlagener Cache-Schreibvorgang darf die Suche nicht kippen.
      .catch((err) => this.logger.warn(`Geocode-Cache nicht geschrieben: ${String(err)}`));

    return map(data);
  }

  /**
   * Hängt die Anfrage hinten an die Warteschlange an und wartet vorher das
   * Mindestintervall ab – so bleibt die Nutzungsbedingung eingehalten, auch
   * wenn mehrere Nutzer gleichzeitig tippen.
   */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(
      () => new Promise<T>((resolve) => setTimeout(() => resolve(task()), MIN_INTERVAL_MS)),
    );
    // Die Kette darf nicht durch einen Fehler abreißen.
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async request(path: string): Promise<unknown> {
    const url = `${this.config.NOMINATIM_URL.replace(/\/$/, '')}/${path}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': this.config.NOMINATIM_USER_AGENT,
        'Accept-Language': 'de,en',
      },
      signal: AbortSignal.timeout(10_000),
    }).catch((err: unknown) => {
      throw new ServiceUnavailableException(`Adresssuche nicht erreichbar: ${String(err)}`);
    });

    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Adresssuche antwortete mit Status ${response.status}`,
      );
    }
    return response.json();
  }
}

function toResult(place: NominatimPlace): GeocodeResultDto | null {
  const lat = Number(place.lat);
  const lon = Number(place.lon);
  if (!place.display_name || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  // Nominatim liefert die Box als [minLat, maxLat, minLon, maxLon].
  const box = place.boundingbox?.map(Number);
  const boundingBox =
    box && box.length === 4 && box.every(Number.isFinite)
      ? ([box[0], box[1], box[2], box[3]] as [number, number, number, number])
      : null;

  return {
    displayName: place.display_name,
    lat,
    lon,
    type: place.type ?? null,
    country: place.address?.country_code?.toUpperCase() ?? null,
    boundingBox,
  };
}
