import { Body, Controller, Delete, Get, HttpCode, Param, Put, Query } from '@nestjs/common';
import type { User } from '@prisma/client';
import {
  spotInputSchema,
  spotQuerySchema,
  type PagedResult,
  type SpotDto,
  type SpotInput,
  type SpotQuery,
} from '@womo/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SpotsService } from './spots.service';

@Controller('spots')
export class SpotsController {
  constructor(private readonly spots: SpotsService) {}

  @Get()
  search(
    @Query(new ZodValidationPipe(spotQuerySchema)) query: SpotQuery,
    @CurrentUser() user: User,
  ): Promise<PagedResult<SpotDto>> {
    return this.spots.search(user.id, query);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: User): Promise<SpotDto> {
    return this.spots.get(id, user.id);
  }

  /**
   * Bewusst PUT mit client-seitiger UUID statt POST: Anlegen und Ändern laufen
   * über denselben Weg, und ein wiederholter Offline-Sync bleibt idempotent.
   */
  @Put(':id')
  upsert(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(spotInputSchema)) body: SpotInput,
    @CurrentUser() user: User,
  ): Promise<SpotDto> {
    return this.spots.upsert(id, user.id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @CurrentUser() user: User): Promise<void> {
    return this.spots.remove(id, user.id);
  }
}
