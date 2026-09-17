import { Controller, Get, Query } from '@nestjs/common';
import {
  geocodeQuerySchema,
  reverseQuerySchema,
  type GeocodeResultDto,
} from '@ourspots/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { GeocodeService } from './geocode.service';

@Controller()
export class GeocodeController {
  constructor(private readonly geocode: GeocodeService) {}

  @Get('geocode')
  search(
    @Query(new ZodValidationPipe(geocodeQuerySchema)) query: { q: string; limit: number },
  ): Promise<GeocodeResultDto[]> {
    return this.geocode.search(query.q, query.limit);
  }

  @Get('reverse')
  reverse(
    @Query(new ZodValidationPipe(reverseQuerySchema)) query: { lat: number; lon: number },
  ): Promise<GeocodeResultDto | null> {
    return this.geocode.reverse(query.lat, query.lon);
  }
}
