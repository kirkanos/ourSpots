import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UsePipes,
} from '@nestjs/common';
import type { User } from '../generated/prisma/client';
import {
  tripInputSchema,
  tripMemberInputSchema,
  stageBulkSchema,
  waypointBulkSchema,
  type StageDto,
  type TripDto,
  type TripInput,
  type TripMemberInput,
  type WaypointDto,
} from '@ourspots/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TripsService } from './trips.service';

@Controller('trips')
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  @Get()
  list(@CurrentUser() user: User): Promise<TripDto[]> {
    return this.trips.list(user.id);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: User): Promise<TripDto> {
    return this.trips.get(id, user.id);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(tripInputSchema))
  create(@Body() body: TripInput, @CurrentUser() user: User): Promise<TripDto> {
    return this.trips.create(user.id, body);
  }

  /**
   * Anlegen unter einer vom Client erzeugten ID – so kann eine offline
   * begonnene Reise später idempotent nachsynchronisiert werden.
   */
  @Put(':id')
  upsert(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(tripInputSchema)) body: TripInput,
    @CurrentUser() user: User,
  ): Promise<TripDto> {
    return this.trips
      .roleOf(id, user.id)
      .then((role) =>
        role === null
          ? this.trips.create(user.id, body, id)
          : this.trips.update(id, user.id, body),
      );
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @CurrentUser() user: User): Promise<void> {
    return this.trips.remove(id, user.id);
  }

  @Post(':id/members')
  @HttpCode(204)
  addMember(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(tripMemberInputSchema)) body: TripMemberInput,
    @CurrentUser() user: User,
  ): Promise<void> {
    return this.trips.addMember(id, user.id, body);
  }

  @Delete(':id/members/:userId')
  @HttpCode(204)
  removeMember(
    @Param('id') id: string,
    @Param('userId') memberId: string,
    @CurrentUser() user: User,
  ): Promise<void> {
    return this.trips.removeMember(id, user.id, memberId);
  }

  @Get(':id/stages')
  stages(@Param('id') id: string, @CurrentUser() user: User): Promise<StageDto[]> {
    return this.trips.listStages(id, user.id);
  }

  @Put(':id/stages')
  replaceStages(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(stageBulkSchema)) body: { stages: unknown[] },
    @CurrentUser() user: User,
  ): Promise<StageDto[]> {
    return this.trips.replaceStages(id, user.id, body.stages as never);
  }

  @Get(':id/waypoints')
  waypoints(@Param('id') id: string, @CurrentUser() user: User): Promise<WaypointDto[]> {
    return this.trips.listWaypoints(id, user.id);
  }

  @Put(':id/waypoints')
  replaceWaypoints(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(waypointBulkSchema)) body: { waypoints: unknown[] },
    @CurrentUser() user: User,
  ): Promise<WaypointDto[]> {
    return this.trips.replaceWaypoints(id, user.id, body.waypoints as never);
  }
}
