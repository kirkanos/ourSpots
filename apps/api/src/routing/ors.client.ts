import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Vehicle } from '@prisma/client';
import type { RoutePreference } from '@womo/shared';
import { AppConfig, CONFIG } from '../config/app-config';

export interface RouteRequest {
  /** Reihenfolge wie gefahren, als [lon, lat] – so erwartet es ORS. */
  coordinates: [number, number][];
  preference: RoutePreference;
  avoidTollways: boolean;
  avoidFerries: boolean;
  avoidHighways: boolean;
  vehicle: Vehicle | null;
}

export interface RouteResult {
  distanceM: number;
  durationS: number;
  /** Encoded Polyline, Präzision 5. */
  geometry: string;
  bbox: [number, number, number, number] | null;
  profile: string;
}

export interface OptimizeResult {
  /** Indizes der Zwischenziele in der vorgeschlagenen Reihenfolge. */
  order: number[];
  distanceM: number;
  durationS: number;
}

/**
 * Zugriff auf OpenRouteService.
 *
 * Das Fahrzeugprofil ist der eigentliche Grund für diesen Dienst: mit
 * hinterlegten Maßen fährt die Route nicht mehr unter zu niedrigen Brücken
 * hindurch oder über für das Gewicht gesperrte Straßen.
 */
@Injectable()
export class OrsClient {
  private readonly logger = new Logger(OrsClient.name);

  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  get configured(): boolean {
    return this.config.ORS_API_KEY.length > 0;
  }

  /** `driving-hgv` nur, wenn Maße vorliegen – sonst bringt es keinen Vorteil. */
  profileFor(vehicle: Vehicle | null): string {
    return vehicle && hasDimensions(vehicle) ? 'driving-hgv' : 'driving-car';
  }

  async route(request: RouteRequest): Promise<RouteResult> {
    const profile = this.profileFor(request.vehicle);

    const body: Record<string, unknown> = {
      coordinates: request.coordinates,
      preference: request.preference,
      units: 'm',
      instructions: false,
      geometry: true,
    };

    const avoid: string[] = [];
    if (request.avoidTollways) avoid.push('tollways');
    if (request.avoidFerries) avoid.push('ferries');
    if (request.avoidHighways) avoid.push('highways');

    const options: Record<string, unknown> = {};
    if (avoid.length) options.avoid_features = avoid;

    if (profile === 'driving-hgv' && request.vehicle) {
      const v = request.vehicle;
      options.vehicle_type = 'hgv';
      options.profile_params = {
        restrictions: {
          ...(v.heightM ? { height: v.heightM } : {}),
          ...(v.widthM ? { width: v.widthM } : {}),
          ...(v.lengthM ? { length: v.lengthM } : {}),
          ...(v.weightT ? { weight: v.weightT } : {}),
        },
      };
    }
    if (Object.keys(options).length) body.options = options;

    const data = await this.post<OrsDirectionsResponse>(
      `/v2/directions/${profile}/json`,
      body,
    );

    const route = data.routes?.[0];
    if (!route) {
      throw new ServiceUnavailableException(
        'Der Routendienst hat keine Route geliefert. Liegen alle Ziele an einer befahrbaren Straße?',
      );
    }

    return {
      distanceM: route.summary?.distance ?? 0,
      durationS: route.summary?.duration ?? 0,
      geometry: route.geometry ?? '',
      bbox: normalizeBbox(data.bbox ?? route.bbox),
      profile,
    };
  }

  /**
   * Reihenfolge der Zwischenziele optimieren (ORS-Optimization, VROOM).
   * Start und Ziel werden als Fahrzeug-Start/-Ende übergeben und bleiben fest.
   */
  async optimize(
    start: [number, number],
    end: [number, number],
    vias: [number, number][],
    vehicle: Vehicle | null,
  ): Promise<OptimizeResult> {
    const profile = this.profileFor(vehicle);

    const data = await this.post<OrsOptimizationResponse>('/optimization', {
      jobs: vias.map((location, index) => ({ id: index + 1, location })),
      vehicles: [{ id: 1, profile, start, end }],
    });

    const route = data.routes?.[0];
    if (!route) {
      throw new ServiceUnavailableException(
        'Der Routendienst konnte keine Reihenfolge berechnen.',
      );
    }

    const order = route.steps
      .filter((step) => step.type === 'job' && typeof step.id === 'number')
      .map((step) => (step.id as number) - 1);

    return {
      order,
      distanceM: route.distance ?? data.summary?.distance ?? 0,
      durationS: route.duration ?? data.summary?.duration ?? 0,
    };
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        'Für die Routenberechnung fehlt der OpenRouteService-Schlüssel (ORS_API_KEY).',
      );
    }

    const url = `${this.config.ORS_BASE_URL.replace(/\/$/, '')}${path}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: this.config.ORS_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    }).catch((err: unknown) => {
      throw new ServiceUnavailableException(`Routendienst nicht erreichbar: ${String(err)}`);
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.warn(`ORS antwortete mit ${response.status}: ${text.slice(0, 500)}`);

      if (response.status === 403 || response.status === 401) {
        throw new ServiceUnavailableException(
          'Der OpenRouteService-Schlüssel wurde abgelehnt. Stimmt ORS_API_KEY?',
        );
      }
      if (response.status === 429) {
        throw new ServiceUnavailableException(
          'Das Tageskontingent von OpenRouteService ist erschöpft. Morgen geht es wieder.',
        );
      }
      throw new ServiceUnavailableException(
        `Der Routendienst meldete einen Fehler (${response.status}). ${extractOrsMessage(text)}`,
      );
    }

    return (await response.json()) as T;
  }
}

export function hasDimensions(vehicle: Vehicle): boolean {
  return Boolean(vehicle.heightM || vehicle.widthM || vehicle.lengthM || vehicle.weightT);
}

interface OrsDirectionsResponse {
  bbox?: number[];
  routes?: {
    summary?: { distance?: number; duration?: number };
    geometry?: string;
    bbox?: number[];
  }[];
}

interface OrsOptimizationResponse {
  summary?: { distance?: number; duration?: number };
  routes?: {
    distance?: number;
    duration?: number;
    steps: { type: string; id?: number }[];
  }[];
}

function normalizeBbox(bbox: number[] | undefined): [number, number, number, number] | null {
  if (!bbox || bbox.length < 4) return null;
  const [a, b, c, d] = bbox as [number, number, number, number];
  return [a, b, c, d];
}

/** Die Fehlermeldung von ORS steckt verschachtelt in der Antwort. */
function extractOrsMessage(text: string): string {
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } | string };
    if (typeof parsed.error === 'string') return parsed.error;
    return parsed.error?.message ?? '';
  } catch {
    return '';
  }
}
