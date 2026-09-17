import { Body, Controller, Delete, Get, HttpCode, Param, Put } from '@nestjs/common';
import type { User } from '../generated/prisma/client';
import { vehicleInputSchema, type VehicleDto, type VehicleInput } from '@ourspots/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { VehiclesService } from './vehicles.service';

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get()
  list(@CurrentUser() user: User): Promise<VehicleDto[]> {
    return this.vehicles.list(user.id);
  }

  @Put(':id')
  upsert(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(vehicleInputSchema)) body: VehicleInput,
    @CurrentUser() user: User,
  ): Promise<VehicleDto> {
    return this.vehicles.upsert(id, user.id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @CurrentUser() user: User): Promise<void> {
    return this.vehicles.remove(id, user.id);
  }
}
