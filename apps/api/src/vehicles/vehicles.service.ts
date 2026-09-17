import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Vehicle } from '@prisma/client';
import type { VehicleDto, VehicleInput } from '@womo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { newId } from '../common/ids';

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<VehicleDto[]> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { ownerId: userId },
      orderBy: { name: 'asc' },
    });
    return vehicles.map(toDto);
  }

  async upsert(vehicleId: string, userId: string, input: VehicleInput): Promise<VehicleDto> {
    const existing = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (existing && existing.ownerId !== userId) {
      throw new ForbiddenException('Dieses Fahrzeug gehört jemand anderem');
    }

    const data = {
      name: input.name,
      heightM: input.heightM ?? null,
      widthM: input.widthM ?? null,
      lengthM: input.lengthM ?? null,
      weightT: input.weightT ?? null,
      axles: input.axles ?? null,
      consumptionL100km: input.consumptionL100km ?? null,
    };

    const vehicle = existing
      ? await this.prisma.vehicle.update({ where: { id: vehicleId }, data })
      : await this.prisma.vehicle.create({
          data: { ...data, id: vehicleId || newId(), ownerId: userId },
        });

    return toDto(vehicle);
  }

  async remove(vehicleId: string, userId: string): Promise<void> {
    const existing = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!existing) throw new NotFoundException('Fahrzeug nicht gefunden');
    if (existing.ownerId !== userId) {
      throw new ForbiddenException('Dieses Fahrzeug gehört jemand anderem');
    }
    // Reisen behalten ihre Zuordnung nicht, werden aber nicht mitgelöscht.
    await this.prisma.vehicle.delete({ where: { id: vehicleId } });
  }
}

function toDto(vehicle: Vehicle): VehicleDto {
  return {
    id: vehicle.id,
    name: vehicle.name,
    heightM: vehicle.heightM,
    widthM: vehicle.widthM,
    lengthM: vehicle.lengthM,
    weightT: vehicle.weightT,
    axles: vehicle.axles,
    consumptionL100km: vehicle.consumptionL100km,
  };
}
