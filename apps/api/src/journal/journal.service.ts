import { Injectable } from '@nestjs/common';
import type { DiaryEntry, Expense, FuelLog } from '@prisma/client';
import type {
  DiaryEntryDto,
  DiaryEntryInput,
  ExpenseCategory,
  ExpenseDto,
  ExpenseInput,
  FuelLogDto,
  FuelLogInput,
  TripStatsDto,
} from '@ourspots/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TripsService } from '../trips/trips.service';
import { decimalToNumber, fromDateOnly, toDateOnly } from '../common/dates';
import { toPhotoDto } from '../spots/spots.service';

@Injectable()
export class JournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripsService,
  ) {}

  // --- Tagebuch -------------------------------------------------------------

  async listDiary(tripId: string, userId: string): Promise<DiaryEntryDto[]> {
    await this.trips.requireRole(tripId, userId, 'viewer');
    const entries = await this.prisma.diaryEntry.findMany({
      where: { tripId },
      orderBy: { date: 'asc' },
      include: { photos: { orderBy: { sortIndex: 'asc' } } },
    });
    return entries.map((entry) => ({
      ...toDiaryDto(entry),
      photos: entry.photos.map(toPhotoDto),
    }));
  }

  async upsertDiary(
    tripId: string,
    entryId: string,
    userId: string,
    input: DiaryEntryInput,
  ): Promise<DiaryEntryDto> {
    await this.trips.requireRole(tripId, userId, 'editor');

    const data = {
      date: toDateOnly(input.date)!,
      title: input.title ?? null,
      text: input.text ?? null,
      odometerKm: input.odometerKm ?? null,
      weather: input.weather ?? null,
    };

    const entry = await this.prisma.diaryEntry.upsert({
      where: { id: entryId },
      create: { ...data, id: entryId, tripId },
      update: data,
      include: { photos: { orderBy: { sortIndex: 'asc' } } },
    });

    return { ...toDiaryDto(entry), photos: entry.photos.map(toPhotoDto) };
  }

  async removeDiary(tripId: string, entryId: string, userId: string): Promise<void> {
    await this.trips.requireRole(tripId, userId, 'editor');
    await this.prisma.diaryEntry.deleteMany({ where: { id: entryId, tripId } });
  }

  // --- Tankungen ------------------------------------------------------------

  async listFuel(tripId: string, userId: string): Promise<FuelLogDto[]> {
    await this.trips.requireRole(tripId, userId, 'viewer');
    const logs = await this.prisma.fuelLog.findMany({
      where: { tripId },
      orderBy: [{ date: 'asc' }, { odometerKm: 'asc' }],
    });
    return logs.map(toFuelDto);
  }

  async upsertFuel(
    tripId: string,
    logId: string,
    userId: string,
    input: FuelLogInput,
  ): Promise<FuelLogDto> {
    await this.trips.requireRole(tripId, userId, 'editor');

    // Was nicht eingetippt wurde, wird ausgerechnet – beim Tanken steht man
    // selten in Ruhe da und gibt alle drei Werte ein.
    const totalCost =
      input.totalCost ?? (input.pricePerL != null ? round2(input.liters * input.pricePerL) : null);
    const pricePerL =
      input.pricePerL ?? (input.totalCost != null ? round3(input.totalCost / input.liters) : null);

    const data = {
      date: toDateOnly(input.date)!,
      lat: input.lat ?? null,
      lon: input.lon ?? null,
      liters: input.liters,
      pricePerL,
      totalCost,
      odometerKm: input.odometerKm ?? null,
      isFull: input.isFull,
    };

    const log = await this.prisma.fuelLog.upsert({
      where: { id: logId },
      create: { ...data, id: logId, tripId },
      update: data,
    });
    return toFuelDto(log);
  }

  async removeFuel(tripId: string, logId: string, userId: string): Promise<void> {
    await this.trips.requireRole(tripId, userId, 'editor');
    await this.prisma.fuelLog.deleteMany({ where: { id: logId, tripId } });
  }

  // --- Ausgaben -------------------------------------------------------------

  async listExpenses(tripId: string, userId: string): Promise<ExpenseDto[]> {
    await this.trips.requireRole(tripId, userId, 'viewer');
    const expenses = await this.prisma.expense.findMany({
      where: { tripId },
      orderBy: { date: 'asc' },
    });
    return expenses.map(toExpenseDto);
  }

  async upsertExpense(
    tripId: string,
    expenseId: string,
    userId: string,
    input: ExpenseInput,
  ): Promise<ExpenseDto> {
    await this.trips.requireRole(tripId, userId, 'editor');

    const data = {
      date: toDateOnly(input.date)!,
      category: input.category,
      amount: input.amount,
      currency: input.currency,
      note: input.note ?? null,
    };

    const expense = await this.prisma.expense.upsert({
      where: { id: expenseId },
      create: { ...data, id: expenseId, tripId },
      update: data,
    });
    return toExpenseDto(expense);
  }

  async removeExpense(tripId: string, expenseId: string, userId: string): Promise<void> {
    await this.trips.requireRole(tripId, userId, 'editor');
    await this.prisma.expense.deleteMany({ where: { id: expenseId, tripId } });
  }

  // --- Auswertung -----------------------------------------------------------

  async stats(tripId: string, userId: string): Promise<TripStatsDto> {
    await this.trips.requireRole(tripId, userId, 'viewer');

    const [trip, fuelLogs, expenses, diary, spots] = await Promise.all([
      this.prisma.trip.findUniqueOrThrow({ where: { id: tripId } }),
      this.prisma.fuelLog.findMany({ where: { tripId }, orderBy: { odometerKm: 'asc' } }),
      this.prisma.expense.findMany({ where: { tripId } }),
      this.prisma.diaryEntry.findMany({ where: { tripId }, orderBy: { odometerKm: 'asc' } }),
      this.prisma.spot.findMany({ where: { tripId } }),
    ]);

    const odometers = [...fuelLogs, ...diary]
      .map((row) => row.odometerKm)
      .filter((km): km is number => km != null)
      .sort((a, b) => a - b);
    const distanceKm =
      odometers.length >= 2 ? odometers[odometers.length - 1]! - odometers[0]! : null;

    const fuelLiters = fuelLogs.reduce((sum, log) => sum + Number(log.liters), 0);
    const fuelCost = fuelLogs.reduce((sum, log) => sum + (decimalToNumber(log.totalCost) ?? 0), 0);

    const byCategory = new Map<ExpenseCategory, number>();
    for (const expense of expenses) {
      const category = expense.category as ExpenseCategory;
      byCategory.set(category, (byCategory.get(category) ?? 0) + Number(expense.amount));
    }
    const otherCost = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);

    const nights = spots.reduce((sum, spot) => sum + (spot.nights ?? 0), 0);
    const rated = spots.filter((spot) => spot.rating != null);
    const priced = spots.filter((spot) => spot.pricePerNight != null);

    const days = tripDays(trip.startDate, trip.endDate);
    const totalCost = round2(fuelCost + otherCost);

    return {
      tripId,
      distanceKm,
      fuelLiters: round2(fuelLiters),
      fuelCost: round2(fuelCost),
      consumptionL100km: consumptionFromFullTanks(fuelLogs),
      expensesByCategory: [...byCategory.entries()]
        .map(([category, amount]) => ({ category, amount: round2(amount) }))
        .sort((a, b) => b.amount - a.amount),
      otherCost: round2(otherCost),
      totalCost,
      costPerDay: days ? round2(totalCost / days) : null,
      costPerKm: distanceKm ? round2(totalCost / distanceKm) : null,
      nights,
      spotCount: spots.length,
      averageRating: rated.length
        ? round2(rated.reduce((sum, spot) => sum + (spot.rating ?? 0), 0) / rated.length)
        : null,
      averagePricePerNight: priced.length
        ? round2(
            priced.reduce((sum, spot) => sum + (decimalToNumber(spot.pricePerNight) ?? 0), 0) /
              priced.length,
          )
        : null,
    };
  }
}

/**
 * Verbrauch nur aus aufeinanderfolgenden Volltankungen: nur dann ist bekannt,
 * wie viel tatsächlich auf der Strecke dazwischen verbraucht wurde. Die erste
 * Volltankung zählt nicht mit, weil unklar ist, wie voll der Tank davor war.
 */
function consumptionFromFullTanks(logs: FuelLog[]): number | null {
  const usable = logs
    .filter((log) => log.odometerKm != null)
    .sort((a, b) => (a.odometerKm ?? 0) - (b.odometerKm ?? 0));

  let previousFull: FuelLog | null = null;
  let litersSinceFull = 0;
  let totalLiters = 0;
  let totalKm = 0;

  for (const log of usable) {
    litersSinceFull += Number(log.liters);

    if (!log.isFull) continue;

    if (previousFull) {
      const km = (log.odometerKm ?? 0) - (previousFull.odometerKm ?? 0);
      if (km > 0) {
        totalKm += km;
        totalLiters += litersSinceFull;
      }
    }
    previousFull = log;
    litersSinceFull = 0;
  }

  return totalKm > 0 ? round2((totalLiters / totalKm) * 100) : null;
}

function tripDays(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null;
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return days > 0 ? days : null;
}

function toDiaryDto(entry: DiaryEntry): Omit<DiaryEntryDto, 'photos'> {
  return {
    id: entry.id,
    tripId: entry.tripId,
    date: fromDateOnly(entry.date)!,
    title: entry.title,
    text: entry.text,
    odometerKm: entry.odometerKm,
    weather: entry.weather,
  };
}

function toFuelDto(log: FuelLog): FuelLogDto {
  return {
    id: log.id,
    tripId: log.tripId,
    date: fromDateOnly(log.date)!,
    lat: log.lat,
    lon: log.lon,
    liters: Number(log.liters),
    pricePerL: decimalToNumber(log.pricePerL),
    totalCost: decimalToNumber(log.totalCost),
    odometerKm: log.odometerKm,
    isFull: log.isFull,
  };
}

function toExpenseDto(expense: Expense): ExpenseDto {
  return {
    id: expense.id,
    tripId: expense.tripId,
    date: fromDateOnly(expense.date)!,
    category: expense.category as ExpenseCategory,
    amount: Number(expense.amount),
    currency: expense.currency,
    note: expense.note,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
