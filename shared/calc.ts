/**
 * All mileage math lives here. Uses the "full tank to full tank" method:
 * a period runs from one full fill-up to the next full fill-up.
 */
import type {
  FuelEntry,
  MonthlyRow,
  PendingPeriod,
  Period,
  Summary,
  Vehicle,
  VehicleReport,
} from './types';

const DAY_MS = 86_400_000;

/** Days since epoch for a YYYY-MM-DD string (UTC, so no timezone drift). */
export function toDayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function fromDayNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(start: string, end: string): number {
  return toDayNumber(end) - toDayNumber(start);
}

export function isFullTank(e: { is_full_tank: number | boolean }): boolean {
  return Number(e.is_full_tank) === 1;
}

/** Sort by date, then by odometer for fill-ups on the same day. */
export function sortEntries<T extends { entry_date: string; odometer: number }>(entries: T[]): T[] {
  return [...entries].sort((a, b) =>
    a.entry_date === b.entry_date ? a.odometer - b.odometer : a.entry_date < b.entry_date ? -1 : 1,
  );
}

function safeDiv(a: number, b: number): number {
  return b > 0 ? a / b : 0;
}

export function computePeriods(
  entries: FuelEntry[],
  noRideDays: string[] = [],
): { periods: Period[]; pending: PendingPeriod | null } {
  const noRide = [...new Set(noRideDays.map(toDayNumber))];
  // Start day is not counted, end day is counted.
  const countNoRide = (start: string, end: string) => {
    const a = toDayNumber(start);
    const b = toDayNumber(end);
    return noRide.filter((d) => d > a && d <= b).length;
  };

  const periods: Period[] = [];
  let start: FuelEntry | null = null;
  let partialLiters = 0;
  let partialCost = 0;
  let partialCount = 0;
  let lastPartialDate = '';

  for (const e of sortEntries(entries)) {
    if (!isFullTank(e)) {
      // Partial fills before the first full tank cannot be measured, so they are skipped.
      if (start) {
        partialLiters += e.liters;
        partialCost += e.total_cost;
        partialCount++;
        lastPartialDate = e.entry_date;
      }
      continue;
    }
    if (start) {
      const distance = e.odometer - start.odometer;
      const fuelUsed = e.liters + partialLiters;
      const cost = e.total_cost + partialCost;
      const calendarDays = Math.max(0, daysBetween(start.entry_date, e.entry_date));
      const noRideCount = Math.min(countNoRide(start.entry_date, e.entry_date), calendarDays);
      const ridingDays = Math.max(1, calendarDays - noRideCount);
      periods.push({
        vehicleId: e.vehicle_id,
        startEntryId: start.id,
        endEntryId: e.id,
        startDate: start.entry_date,
        endDate: e.entry_date,
        startOdometer: start.odometer,
        endOdometer: e.odometer,
        distance,
        fuelUsed,
        cost,
        partialFills: partialCount,
        kmPerLiter: safeDiv(distance, fuelUsed),
        costPerKm: safeDiv(cost, distance),
        calendarDays,
        noRideDays: noRideCount,
        ridingDays,
        kmPerRidingDay: distance / ridingDays,
        costPerRidingDay: cost / ridingDays,
        fuelPerRidingDay: fuelUsed / ridingDays,
      });
    }
    start = e;
    partialLiters = 0;
    partialCost = 0;
    partialCount = 0;
  }

  const pending: PendingPeriod | null =
    start && partialCount > 0
      ? {
          startDate: start.entry_date,
          startOdometer: start.odometer,
          partialFills: partialCount,
          liters: partialLiters,
          cost: partialCost,
          lastDate: lastPartialDate,
        }
      : null;

  return { periods, pending };
}

export function summarize(periods: Period[]): Summary {
  let totalDistance = 0;
  let totalFuel = 0;
  let totalCost = 0;
  let ridingDays = 0;
  let noRideDays = 0;
  let best: Period | null = null;
  let worst: Period | null = null;
  const months = new Map<string, MonthlyRow>();

  for (const p of periods) {
    totalDistance += p.distance;
    totalFuel += p.fuelUsed;
    totalCost += p.cost;
    ridingDays += p.ridingDays;
    noRideDays += p.noRideDays;
    if (!best || p.kmPerLiter > best.kmPerLiter) best = p;
    if (!worst || p.kmPerLiter < worst.kmPerLiter) worst = p;

    const key = p.endDate.slice(0, 7);
    const row = months.get(key) ?? {
      month: key,
      periods: 0,
      distance: 0,
      fuel: 0,
      cost: 0,
      kmPerLiter: 0,
      costPerKm: 0,
      ridingDays: 0,
      noRideDays: 0,
    };
    row.periods++;
    row.distance += p.distance;
    row.fuel += p.fuelUsed;
    row.cost += p.cost;
    row.ridingDays += p.ridingDays;
    row.noRideDays += p.noRideDays;
    months.set(key, row);
  }

  const monthly = [...months.values()]
    .sort((a, b) => (a.month < b.month ? -1 : 1))
    .map((r) => ({
      ...r,
      kmPerLiter: safeDiv(r.distance, r.fuel),
      costPerKm: safeDiv(r.cost, r.distance),
    }));

  return {
    periodCount: periods.length,
    totalDistance,
    totalFuel,
    totalCost,
    // Total distance / total fuel, NOT the average of each period's km/L.
    avgKmPerLiter: safeDiv(totalDistance, totalFuel),
    avgCostPerKm: safeDiv(totalCost, totalDistance),
    avgKmPerRidingDay: safeDiv(totalDistance, ridingDays),
    avgCostPerRidingDay: safeDiv(totalCost, ridingDays),
    best,
    worst,
    lastKmPerLiter: periods.length ? periods[periods.length - 1].kmPerLiter : null,
    ridingDays,
    noRideDays,
    monthly,
  };
}

/** Keep periods whose end date falls inside [from, to] (both optional, inclusive). */
export function filterPeriods(
  periods: Period[],
  from?: string | null,
  to?: string | null,
): Period[] {
  return periods.filter((p) => (!from || p.endDate >= from) && (!to || p.endDate <= to));
}

/** Percent difference of value from average (positive = better). */
export function compareToAverage(value: number, average: number | null | undefined): number | null {
  if (!average || average <= 0) return null;
  return ((value - average) / average) * 100;
}

export function buildVehicleReport(
  vehicle: Vehicle,
  entries: FuelEntry[],
  noRideDays: string[],
  opts: { from?: string | null; to?: string | null; today?: string | null } = {},
): VehicleReport {
  const { periods: all, pending } = computePeriods(entries, noRideDays);
  const periods = filterPeriods(all, opts.from, opts.to);
  const sorted = sortEntries(entries);
  const month = opts.today ? opts.today.slice(0, 7) : null;
  const monthSpent = month
    ? entries.filter((e) => e.entry_date.startsWith(month)).reduce((s, e) => s + e.total_cost, 0)
    : 0;
  return {
    vehicle,
    periods,
    pending,
    summary: summarize(periods),
    allTimeAvgKmPerLiter: summarize(all).avgKmPerLiter,
    lastEntry: sorted.length ? sorted[sorted.length - 1] : null,
    entryCount: entries.length,
    monthSpent,
    noRideToday: Boolean(opts.today && noRideDays.includes(opts.today)),
  };
}

export interface FuelEstimateInput {
  /** Odometer at the last FULL tank. */
  lastFullOdometer: number | null;
  /** Liters added by part fills since that full tank. */
  partialLiters: number;
  tankCapacity: number | null;
  /** Usually the vehicle's average km/L. */
  kmPerLiter: number;
  currentOdometer: number;
  /** Normal riding distance per day. */
  dailyKm: number | null;
}

export type FuelEstimate =
  | {
      ok: true;
      distanceSinceFull: number;
      fuelUsed: number;
      fuelLeft: number;
      /** 0-100 */
      percentLeft: number;
      rangeKm: number;
      daysLeft: number | null;
      /** True when the reading suggests more fuel was used than the tank holds. */
      overdue: boolean;
    }
  | { ok: false; reason: 'no_tank' | 'no_full_fill' | 'no_average' | 'reading_too_low' };

/**
 * Rough "fuel left" estimate: the tank was full at the last full fill-up,
 * part fills added fuel, and riding since then used distance / average km/L.
 */
export function estimateFuelLeft(i: FuelEstimateInput): FuelEstimate {
  if (!i.tankCapacity || i.tankCapacity <= 0) return { ok: false, reason: 'no_tank' };
  if (i.lastFullOdometer === null) return { ok: false, reason: 'no_full_fill' };
  if (!(i.kmPerLiter > 0)) return { ok: false, reason: 'no_average' };
  const distanceSinceFull = i.currentOdometer - i.lastFullOdometer;
  if (!Number.isFinite(distanceSinceFull) || distanceSinceFull < 0)
    return { ok: false, reason: 'reading_too_low' };

  const fuelUsed = distanceSinceFull / i.kmPerLiter;
  const raw = i.tankCapacity + i.partialLiters - fuelUsed;
  const fuelLeft = Math.min(i.tankCapacity, Math.max(0, raw));
  const rangeKm = fuelLeft * i.kmPerLiter;
  return {
    ok: true,
    distanceSinceFull,
    fuelUsed,
    fuelLeft,
    percentLeft: (fuelLeft / i.tankCapacity) * 100,
    rangeKm,
    daysLeft: i.dailyKm && i.dailyKm > 0 ? rangeKm / i.dailyKm : null,
    overdue: raw < 0,
  };
}
