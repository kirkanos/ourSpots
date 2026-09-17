import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { User } from '../generated/prisma/client';
import {
  optimizeOptionsSchema,
  routeOptionsSchema,
  type OptimizeOptions,
  type OptimizeResultDto,
  type RouteOptions,
  type TripRouteDto,
} from '@ourspots/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RoutingService } from './routing.service';
import { OrsClient } from './ors.client';

@Controller()
export class RoutingController {
  constructor(
    private readonly routing: RoutingService,
    private readonly ors: OrsClient,
  ) {}

  /** Das Frontend blendet die Routenfunktionen aus, wenn kein Schlüssel gesetzt ist. */
  @Get('routing/status')
  status(): { configured: boolean } {
    return { configured: this.ors.configured };
  }

  @Post('trips/:id/route')
  route(
    @Param('id') tripId: string,
    @Body(new ZodValidationPipe(routeOptionsSchema)) options: RouteOptions,
    @CurrentUser() user: User,
  ): Promise<TripRouteDto> {
    return this.routing.routeTrip(tripId, user.id, options);
  }

  @Post('trips/:id/route/optimize')
  optimize(
    @Param('id') tripId: string,
    @Body(new ZodValidationPipe(optimizeOptionsSchema)) options: OptimizeOptions,
    @CurrentUser() user: User,
  ): Promise<OptimizeResultDto> {
    return this.routing.optimize(tripId, user.id, options);
  }
}
