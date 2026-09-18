import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { GeocodeResultDto } from '@ourspots/shared';
import { AppConfig, CONFIG } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';

/** Die öffentliche Nominatim-Instanz erlaubt höchstens eine Anfrage pro Sekunde. */
const NOMINATIM_INTERVAL_MS = 1100;
/** Photon kennt kein festes Limit, wir drosseln trotzdem aus Höflichkeit. */
const PHOTON_INTERVAL_MS = 250;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface NominatimPlace {
  display_name?: string;
  lat?: string;
  lon?: string;
  type?: string;
  address?: { country_code?: string };
  boundingbox?: string[];
}

interface PhotonFeature {
  geometry?: { coordinates?: number[] };
  properties?: {
    name?: string;
    housenumber?: string;
    street?: string;
    district?: string;
    city?: string;
    postcode?: string;
    county?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    osm_value?: string;
    type?: string;
    /** [minLon, maxLat, maxLon, minLat] */
    extent?: number[];
  };
}

interface PhotonResponse {
  features?: PhotonFeature[];
}

@Injectable()
export class GeocodeService {
  private readonly logger = new Logger(GeocodeService.name);
  /** Serialisiert alle ausgehenden Anfragen je Dienst zu einer Warteschlange. */
  private readonly queues = new Map<string, Promise<unknown>>();

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
    const results = await this.fetchCached(
      'nominatim',
      `search?${params.toString()}`,
      NOMINATIM_INTERVAL_MS,
      (data) =>
        (data as NominatimPlace[]).map(fromNominatim).filter((r): r is GeocodeResultDto => r !== null),
    );
    if (results.length > 0) return results;

    // Nominatim sucht exakt: Eine Hausnummer oder PLZ, die so nicht in OSM
    // steht, lässt den Treffer komplett wegfallen – gerade bei Adressen aus
    // Campingführern der Normalfall. Photon arbeitet auf denselben Daten,
    // aber unscharf, und fängt diese Fälle ab.
    return this.searchPhoton(query, limit);
  }

  private async searchPhoton(query: string, limit: number): Promise<GeocodeResultDto[]> {
    const params = new URLSearchParams({
      q: query,
      limit: String(limit),
      lang: 'de',
    });
    try {
      return await this.fetchCached(
        'photon',
        `api?${params.toString()}`,
        PHOTON_INTERVAL_MS,
        (data) =>
          ((data as PhotonResponse).features ?? [])
            .map(fromPhoton)
            .filter((r): r is GeocodeResultDto => r !== null),
      );
    } catch (err) {
      // Der Fallback darf eine ansonsten funktionierende Suche nicht kippen:
      // Nominatim hat bereits sauber mit „nichts gefunden“ geantwortet.
      this.logger.warn(`Photon-Fallback fehlgeschlagen: ${String(err)}`);
      return [];
    }
  }

  async reverse(lat: number, lon: number): Promise<GeocodeResultDto | null> {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      format: 'jsonv2',
      addressdetails: '1',
      zoom: '17',
    });
    const results = await this.fetchCached(
      'nominatim',
      `reverse?${params.toString()}`,
      NOMINATIM_INTERVAL_MS,
      (data) => {
        const place = fromNominatim(data as NominatimPlace);
        return place ? [place] : [];
      },
    );
    return results[0] ?? null;
  }

  private async fetchCached<T>(
    provider: 'nominatim' | 'photon',
    path: string,
    intervalMs: number,
    map: (data: unknown) => T[],
  ): Promise<T[]> {
    const key = `${provider}:${path}`.slice(0, 255);

    const cached = await this.prisma.geocodeCache.findUnique({ where: { key } });
    if (cached && Date.now() - cached.createdAt.getTime() < CACHE_TTL_MS) {
      return map(JSON.parse(cached.response));
    }

    const base = provider === 'photon' ? this.config.PHOTON_URL : this.config.NOMINATIM_URL;
    const data = await this.enqueue(provider, intervalMs, () =>
      this.request(`${base.replace(/\/$/, '')}/${path}`),
    );

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
   * Hängt die Anfrage hinten an die Warteschlange des Dienstes an und wartet
   * vorher dessen Mindestintervall ab – so bleibt die Nutzungsbedingung
   * eingehalten, auch wenn mehrere Nutzer gleichzeitig tippen. Jeder Dienst
   * hat eine eigene Schlange, damit der Photon-Fallback nicht zusätzlich auf
   * das Nominatim-Limit warten muss.
   */
  private enqueue<T>(provider: string, intervalMs: number, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(provider) ?? Promise.resolve();
    const run = previous.then(
      () => new Promise<T>((resolve) => setTimeout(() => resolve(task()), intervalMs)),
    );
    // Die Kette darf nicht durch einen Fehler abreißen.
    this.queues.set(provider, run.catch(() => undefined));
    return run;
  }

  private async request(url: string): Promise<unknown> {
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

function fromNominatim(place: NominatimPlace): GeocodeResultDto | null {
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

function fromPhoton(feature: PhotonFeature): GeocodeResultDto | null {
  const [lon, lat] = feature.geometry?.coordinates ?? [];
  const props = feature.properties;
  if (!props || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const street = [props.street, props.housenumber].filter(Boolean).join(' ');
  // Photon kennt kein display_name, also bauen wir es wie Nominatim von
  // speziell nach allgemein zusammen und werfen Dubletten raus.
  const parts = [
    props.name,
    street,
    props.district,
    props.city,
    props.postcode,
    props.state,
    props.country,
  ].filter((part): part is string => Boolean(part));
  const displayName = [...new Set(parts)].join(', ');
  if (!displayName) return null;

  // Photon liefert die Box als [minLon, maxLat, maxLon, minLat].
  const e = props.extent;
  const boundingBox =
    e && e.length === 4 && e.every(Number.isFinite)
      ? ([e[3], e[1], e[0], e[2]] as [number, number, number, number])
      : null;

  return {
    displayName,
    lat: lat as number,
    lon: lon as number,
    type: props.osm_value ?? props.type ?? null,
    country: props.countrycode?.toUpperCase() ?? null,
    boundingBox,
  };
}
