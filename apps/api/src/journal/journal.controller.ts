import { Body, Controller, Delete, Get, HttpCode, Param, Put } from '@nestjs/common';
import type { User } from '@prisma/client';
import {
  diaryEntryInputSchema,
  expenseInputSchema,
  fuelLogInputSchema,
  type DiaryEntryDto,
  type DiaryEntryInput,
  type ExpenseDto,
  type ExpenseInput,
  type FuelLogDto,
  type FuelLogInput,
  type TripStatsDto,
} from '@ourspots/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JournalService } from './journal.service';

@Controller('trips/:tripId')
export class JournalController {
  constructor(private readonly journal: JournalService) {}

  // --- Tagebuch -------------------------------------------------------------

  @Get('diary')
  listDiary(@Param('tripId') tripId: string, @CurrentUser() user: User): Promise<DiaryEntryDto[]> {
    return this.journal.listDiary(tripId, user.id);
  }

  @Put('diary/:entryId')
  upsertDiary(
    @Param('tripId') tripId: string,
    @Param('entryId') entryId: string,
    @Body(new ZodValidationPipe(diaryEntryInputSchema)) body: DiaryEntryInput,
    @CurrentUser() user: User,
  ): Promise<DiaryEntryDto> {
    return this.journal.upsertDiary(tripId, entryId, user.id, body);
  }

  @Delete('diary/:entryId')
  @HttpCode(204)
  removeDiary(
    @Param('tripId') tripId: string,
    @Param('entryId') entryId: string,
    @CurrentUser() user: User,
  ): Promise<void> {
    return this.journal.removeDiary(tripId, entryId, user.id);
  }

  // --- Tankungen ------------------------------------------------------------

  @Get('fuel')
  listFuel(@Param('tripId') tripId: string, @CurrentUser() user: User): Promise<FuelLogDto[]> {
    return this.journal.listFuel(tripId, user.id);
  }

  @Put('fuel/:logId')
  upsertFuel(
    @Param('tripId') tripId: string,
    @Param('logId') logId: string,
    @Body(new ZodValidationPipe(fuelLogInputSchema)) body: FuelLogInput,
    @CurrentUser() user: User,
  ): Promise<FuelLogDto> {
    return this.journal.upsertFuel(tripId, logId, user.id, body);
  }

  @Delete('fuel/:logId')
  @HttpCode(204)
  removeFuel(
    @Param('tripId') tripId: string,
    @Param('logId') logId: string,
    @CurrentUser() user: User,
  ): Promise<void> {
    return this.journal.removeFuel(tripId, logId, user.id);
  }

  // --- Ausgaben -------------------------------------------------------------

  @Get('expenses')
  listExpenses(@Param('tripId') tripId: string, @CurrentUser() user: User): Promise<ExpenseDto[]> {
    return this.journal.listExpenses(tripId, user.id);
  }

  @Put('expenses/:expenseId')
  upsertExpense(
    @Param('tripId') tripId: string,
    @Param('expenseId') expenseId: string,
    @Body(new ZodValidationPipe(expenseInputSchema)) body: ExpenseInput,
    @CurrentUser() user: User,
  ): Promise<ExpenseDto> {
    return this.journal.upsertExpense(tripId, expenseId, user.id, body);
  }

  @Delete('expenses/:expenseId')
  @HttpCode(204)
  removeExpense(
    @Param('tripId') tripId: string,
    @Param('expenseId') expenseId: string,
    @CurrentUser() user: User,
  ): Promise<void> {
    return this.journal.removeExpense(tripId, expenseId, user.id);
  }

  // --- Auswertung -----------------------------------------------------------

  @Get('stats')
  stats(@Param('tripId') tripId: string, @CurrentUser() user: User): Promise<TripStatsDto> {
    return this.journal.stats(tripId, user.id);
  }
}
