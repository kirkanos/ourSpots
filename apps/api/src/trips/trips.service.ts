import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, Trip } from '@prisma/client';
import type {
  StageDto,
  StageInput,
  TripDto,
  TripInput,
  TripMemberInput,
  TripRole,
  TripStatus,
  WaypointDto,
  WaypointInput,
} from '@ourspots/shared';
import { PrismaService } from '../prisma/prisma.service';
import { newId } from '../common/ids';
import { fromDateOnly, toDateOnly } from '../common/dates';
import { assertRole } from './trip-access';

@Injectable()
export class TripsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Rolle des Nutzers in einer Reise, oder null ohne jeden Zugriff. */
  async roleOf(tripId: string, userId: string): Promise<TripRole | null> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { ownerId: true, members: { where: { userId }, select: { role: true } } },
    });
    if (!trip) return null;
    if (trip.ownerId === userId) return 'owner';
    const member = trip.members[0];
    return member ? (member.role as TripRole) : null;
  }

  async requireRole(tripId: string, userId: string, required: TripRole): Promise<TripRole> {
    return assertRole(await this.roleOf(tripId, userId), required);
  }

  /** Reisen, auf die der Nutzer als Eigentümer oder Mitglied Zugriff hat. */
  private accessFilter(userId: string): Prisma.TripWhereInput {
    return { OR: [{ ownerId: userId }, { members: { some: { userId } } }] };
  }

  async list(userId: string): Promise<TripDto[]> {
    const trips = await this.prisma.trip.findMany({
      where: this.accessFilter(userId),
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        members: { where: { userId }, select: { role: true } },
        _count: { select: { spots: true } },
      },
    });

    return trips.map((trip) =>
      this.toDto(trip, this.resolveRole(trip.ownerId, userId, trip.members[0]?.role), trip._count.spots),
    );
  }

  async get(tripId: string, userId: string): Promise<TripDto> {
    const role = await this.requireRole(tripId, userId, 'viewer');
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        _count: { select: { spots: true } },
        members: { include: { user: true } },
      },
    });
    if (!trip) throw new NotFoundException('Reise nicht gefunden');

    const dto = this.toDto(trip, role, trip._count.spots);
    dto.members = [
      {
        userId: trip.ownerId,
        role: 'owner',
        user: {
          id: trip.ownerId,
          email: null,
          displayName: '',
          avatarUrl: null,
        },
      },
      ...trip.members.map((m) => ({
        userId: m.userId,
        role: m.role as TripRole,
        user: {
          id: m.user.id,
          email: m.user.email,
          displayName: m.user.displayName,
          avatarUrl: m.user.avatarUrl,
        },
      })),
    ];
    // Eigentümer-Daten nachziehen, statt eine zweite Query zu bauen.
    const owner = await this.prisma.user.findUnique({ where: { id: trip.ownerId } });
    if (owner && dto.members[0]) {
      dto.members[0].user = {
        id: owner.id,
        email: owner.email,
        displayName: owner.displayName,
        avatarUrl: owner.avatarUrl,
      };
    }
    return dto;
  }

  async create(userId: string, input: TripInput, id?: string): Promise<TripDto> {
    const trip = await this.prisma.trip.create({
      data: {
        id: id ?? newId(),
        ownerId: userId,
        title: input.title,
        description: input.description ?? null,
        startDate: toDateOnly(input.startDate),
        endDate: toDateOnly(input.endDate),
        status: input.status,
        vehicleId: input.vehicleId ?? null,
      },
    });
    return this.toDto(trip, 'owner', 0);
  }

  async update(tripId: string, userId: string, input: TripInput): Promise<TripDto> {
    const role = await this.requireRole(tripId, userId, 'editor');
    const trip = await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        title: input.title,
        description: input.description ?? null,
        startDate: toDateOnly(input.startDate),
        endDate: toDateOnly(input.endDate),
        status: input.status,
        vehicleId: input.vehicleId ?? null,
      },
      include: { _count: { select: { spots: true } } },
    });
    return this.toDto(trip, role, trip._count.spots);
  }

  async remove(tripId: string, userId: string): Promise<void> {
    await this.requireRole(tripId, userId, 'owner');
    await this.prisma.trip.delete({ where: { id: tripId } });
  }

  // -------------------------------------------------------------------------
  // Mitglieder
  // -------------------------------------------------------------------------

  async addMember(tripId: string, userId: string, input: TripMemberInput): Promise<void> {
    await this.requireRole(tripId, userId, 'owner');

    const target = await this.prisma.user.findFirst({ where: { email: input.email } });
    if (!target) {
      // Es gibt keine Einladung per E-Mail: die Person muss sich einmal über
      // Authelia angemeldet haben, damit ein Konto existiert.
      throw new BadRequestException(
        'Zu dieser E-Mail-Adresse gibt es noch kein Konto. Die Person muss sich einmal anmelden.',
      );
    }

    const trip = await this.prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
    if (trip.ownerId === target.id) {
      throw new BadRequestException('Der Eigentümer ist bereits Mitglied');
    }

    await this.prisma.tripMember.upsert({
      where: { tripId_userId: { tripId, userId: target.id } },
      create: { tripId, userId: target.id, role: input.role },
      update: { role: input.role },
    });
  }

  async removeMember(tripId: string, userId: string, memberId: string): Promise<void> {
    await this.requireRole(tripId, userId, 'owner');
    await this.prisma.tripMember
      .delete({ where: { tripId_userId: { tripId, userId: memberId } } })
      .catch(() => null);
  }

  // -------------------------------------------------------------------------
  // Etappen und Wegpunkte
  // -------------------------------------------------------------------------

  async listStages(tripId: string, userId: string): Promise<StageDto[]> {
    await this.requireRole(tripId, userId, 'viewer');
    const stages = await this.prisma.stage.findMany({
      where: { tripId },
      orderBy: { seq: 'asc' },
    });
    return stages.map((s) => ({
      id: s.id,
      tripId: s.tripId,
      seq: s.seq,
      title: s.title,
      date: fromDateOnly(s.date),
      notes: s.notes,
    }));
  }

  /**
   * Etappen werden wie die Wegpunkte als vollständige Liste gespeichert.
   * Wegpunkte gelöschter Etappen verlieren nur ihre Zuordnung – sie gehören
   * weiterhin zur Reise und sollen nicht mit verschwinden.
   */
  async replaceStages(
    tripId: string,
    userId: string,
    input: StageInput[],
  ): Promise<StageDto[]> {
    await this.requireRole(tripId, userId, 'editor');

    const rows = input
      .slice()
      .sort((a, b) => a.seq - b.seq)
      .map((stage, index) => ({
        id: stage.id ?? newId(),
        tripId,
        seq: index,
        title: stage.title ?? null,
        date: toDateOnly(stage.date),
        notes: stage.notes ?? null,
      }));

    const keptIds = rows.map((row) => row.id);

    await this.prisma.$transaction([
      this.prisma.waypoint.updateMany({
        where: { tripId, stageId: { notIn: keptIds.length ? keptIds : ['-'] } },
        data: { stageId: null },
      }),
      this.prisma.stage.deleteMany({
        where: { tripId, id: { notIn: keptIds.length ? keptIds : ['-'] } },
      }),
      ...rows.map((row) =>
        this.prisma.stage.upsert({
          where: { id: row.id },
          create: row,
          update: { seq: row.seq, title: row.title, date: row.date, notes: row.notes },
        }),
      ),
      this.prisma.route.deleteMany({ where: { tripId } }),
    ]);

    return this.listStages(tripId, userId);
  }

  async listWaypoints(tripId: string, userId: string): Promise<WaypointDto[]> {
    await this.requireRole(tripId, userId, 'viewer');
    const waypoints = await this.prisma.waypoint.findMany({
      where: { tripId },
      orderBy: { seq: 'asc' },
    });
    return waypoints.map(toWaypointDto);
  }

  /**
   * Wegpunkte werden immer als vollständige, sortierte Liste gespeichert.
   * Das hält Drag&Drop-Umsortierung einfach und vermeidet Lücken in `seq`.
   */
  async replaceWaypoints(
    tripId: string,
    userId: string,
    input: WaypointInput[],
  ): Promise<WaypointDto[]> {
    await this.requireRole(tripId, userId, 'editor');

    const stageIds = new Set(
      (await this.prisma.stage.findMany({ where: { tripId }, select: { id: true } })).map(
        (s) => s.id,
      ),
    );
    for (const wp of input) {
      if (wp.stageId && !stageIds.has(wp.stageId)) {
        throw new BadRequestException(`Etappe ${wp.stageId} gehört nicht zu dieser Reise`);
      }
    }

    const rows = input
      .slice()
      .sort((a, b) => a.seq - b.seq)
      .map((wp, index) => ({
        id: wp.id ?? newId(),
        tripId,
        stageId: wp.stageId ?? null,
        seq: index,
        kind: wp.kind,
        name: wp.name,
        lat: wp.lat,
        lon: wp.lon,
        address: wp.address ?? null,
        plannedArrival: toDateOnly(wp.plannedArrival),
        plannedNights: wp.plannedNights ?? null,
        locked: wp.locked,
      }));

    await this.prisma.$transaction([
      this.prisma.waypoint.deleteMany({ where: { tripId } }),
      ...(rows.length ? [this.prisma.waypoint.createMany({ data: rows })] : []),
      // Die gecachten Routen passen nicht mehr zur neuen Wegpunktfolge.
      this.prisma.route.deleteMany({ where: { tripId } }),
    ]);

    return rows.map(toWaypointDto);
  }

  // -------------------------------------------------------------------------

  private resolveRole(ownerId: string, userId: string, memberRole?: string): TripRole {
    if (ownerId === userId) return 'owner';
    return (memberRole as TripRole | undefined) ?? 'viewer';
  }

  private toDto(trip: Trip, myRole: TripRole, spotCount: number): TripDto {
    return {
      id: trip.id,
      title: trip.title,
      description: trip.description,
      startDate: fromDateOnly(trip.startDate),
      endDate: fromDateOnly(trip.endDate),
      status: trip.status as TripStatus,
      vehicleId: trip.vehicleId,
      coverPhotoId: trip.coverPhotoId,
      ownerId: trip.ownerId,
      myRole,
      spotCount,
      createdAt: trip.createdAt.toISOString(),
      updatedAt: trip.updatedAt.toISOString(),
    };
  }
}

function toWaypointDto(wp: {
  id: string;
  tripId: string;
  stageId: string | null;
  seq: number;
  kind: string;
  name: string;
  lat: number;
  lon: number;
  address: string | null;
  plannedArrival: Date | null;
  plannedNights: number | null;
  locked: boolean;
}): WaypointDto {
  return {
    id: wp.id,
    tripId: wp.tripId,
    stageId: wp.stageId,
    seq: wp.seq,
    kind: wp.kind as WaypointDto['kind'],
    name: wp.name,
    lat: wp.lat,
    lon: wp.lon,
    address: wp.address,
    plannedArrival: fromDateOnly(wp.plannedArrival),
    plannedNights: wp.plannedNights,
    locked: wp.locked,
  };
}
