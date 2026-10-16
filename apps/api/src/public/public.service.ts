import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  Amenity,
  PublicTripDto,
  PublicTripListeDto,
  SpotType,
} from '@ourspots/shared';
import { PrismaService } from '../prisma/prisma.service';
import { decimalToNumber, fromDateOnly } from '../common/dates';

/**
 * Reisen, die ohne Anmeldung sichtbar sind.
 *
 * Jede Abfrage hier filtert auf `isPublic` -- das ist die einzige
 * Berechtigung, die es in diesem Dienst gibt, und sie steht in jeder
 * einzelnen Abfrage. Bewusst nicht in einer gemeinsamen Hilfsfunktion
 * versteckt: Wer hier eine Methode ergaenzt, soll die Bedingung schreiben
 * muessen und nicht vergessen koennen.
 *
 * **Notizen erscheinen hier nie.** Zwischen angemeldeten Nutzern gibt es keine
 * privaten Notizen mehr, aber eine oeffentliche Reise liest die ganze Welt --
 * einschliesslich Suchmaschinen. Was jemand ueber einen Stellplatz notiert
 * hat, war nicht fuer dieses Publikum gedacht.
 */
@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  async liste(): Promise<PublicTripListeDto[]> {
    const trips = await this.prisma.trip.findMany({
      where: { isPublic: true },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        owner: { select: { displayName: true } },
        _count: { select: { spots: true } },
        // Nach Berechnungszeitpunkt sortiert -- siehe summiereStrecke.
        routes: {
          select: { distanceM: true, stageId: true, computedAt: true },
          orderBy: { computedAt: 'desc' },
        },
      },
    });

    return trips.map((trip) => ({
      id: trip.id,
      title: trip.title,
      description: trip.description,
      startDate: fromDateOnly(trip.startDate),
      endDate: fromDateOnly(trip.endDate),
      ownerName: trip.owner.displayName,
      spotCount: trip._count.spots,
      distanceM: summiereStrecke(trip.routes),
    }));
  }

  async reise(tripId: string): Promise<PublicTripDto> {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, isPublic: true },
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
    if (!trip) throw new NotFoundException('Reise nicht gefunden');

    return {
      title: trip.title,
      description: trip.description,
      startDate: fromDateOnly(trip.startDate),
      endDate: fromDateOnly(trip.endDate),
      ownerName: trip.owner.displayName,
      includePhotos: true,
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
        // Siehe Klassenkommentar: in der oeffentlichen Ansicht keine Notizen.
        notes: null,
        amenities: spot.amenities.map((a) => a.amenity as Amenity),
        photoIds: spot.photos.map((photo) => photo.id),
      })),
    };
  }

  /**
   * Der Ablageort eines Fotos, sofern es zu einer oeffentlichen Reise gehoert.
   *
   * Ohne die Bedingung auf `isPublic` waere jede Foto-Kennung ohne Anmeldung
   * abrufbar -- die Kennungen sind zwar nicht zu erraten, aber darauf darf
   * sich ein Zugriffsschutz nicht stuetzen.
   */
  async fotoAblage(photoId: string): Promise<string> {
    const photo = await this.prisma.photo.findFirst({
      where: { id: photoId, spot: { trip: { isPublic: true } } },
      select: { storageKey: true },
    });
    if (!photo) throw new NotFoundException('Foto nicht gefunden');
    return photo.storageKey;
  }
}

/**
 * Gesamtstrecke einer Reise aus den zwischengespeicherten Teilrouten.
 *
 * Die Routentabelle ist ein Cache und kein Verzeichnis der aktuellen Route:
 * Zu derselben Etappe koennen mehrere Eintraege liegen -- andere Einstellungen
 * zu Maut und Faehren, oder schlicht aeltere Fassungen, etwa von vor der
 * Umstellung auf Hoehendaten. Alles aufzusummieren ergab auf der Testreise
 * 2640 statt 1065 Kilometer.
 *
 * Deshalb je Etappe nur der zuletzt berechnete Eintrag. Die Liste kommt bereits
 * nach Zeitpunkt sortiert herein, der erste je Etappe ist also der juengste.
 * Liegt ueberhaupt keine Etappenroute vor, zaehlt die juengste durchgehende.
 */
function summiereStrecke(
  routes: { distanceM: number; stageId: string | null; computedAt: Date }[],
): number | null {
  if (routes.length === 0) return null;

  const jeEtappe = new Map<string, number>();
  for (const route of routes) {
    if (route.stageId === null) continue;
    if (!jeEtappe.has(route.stageId)) jeEtappe.set(route.stageId, route.distanceM);
  }
  if (jeEtappe.size > 0) {
    return [...jeEtappe.values()].reduce((summe, m) => summe + m, 0);
  }

  const durchgehend = routes.find((r) => r.stageId === null);
  return durchgehend ? durchgehend.distanceM : null;
}
