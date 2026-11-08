/**
 * Validation rules shared by the browser (instant feedback) and the API (final check).
 * Errors block saving. Warnings only ask the user to double-check.
 */
import { computePeriods, fromDayNumber, sortEntries, summarize, toDayNumber } from './calc';
import {
  FUEL_TYPES,
  NO_RIDE_REASONS,
  VEHICLE_TYPES,
  type FuelEntry,
  type FuelType,
  type NoRideReason,
  type VehicleType,
} from './types';

export const MAX_ODOMETER = 10_000_000;
export const MAX_NO_RIDE_RANGE = 366;
/** km/L more than 40% away from the average is "unusual". */
export const UNUSUAL_LIMIT = 0.4;

export interface CheckResult {
  errors: string[];
  warnings: string[];
}

export function isValidISODate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const n = toDayNumber(s);
  return Number.isFinite(n) && fromDayNumber(n) === s;
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

export interface FuelCandidate {
  id?: string;
  vehicle_id: string;
  entry_date: string;
  odometer: number;
  liters: number;
  price_per_liter: number;
  total_cost: number;
  is_full_tank: number | boolean;
  station?: string | null;
  note?: string | null;
}

export interface FuelCheckOptions {
  today: string;
  tankCapacity?: number | null;
  startOdometer?: number | null;
  /** Server allows +1 day because the user's timezone may be ahead of UTC. */
  allowDaysAhead?: number;
}

export function checkFuelEntry(
  c: FuelCandidate,
  existing: FuelEntry[],
  opts: FuelCheckOptions,
): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isValidISODate(c.entry_date)) errors.push('Please pick a valid date.');
  else if (toDayNumber(c.entry_date) > toDayNumber(opts.today) + (opts.allowDaysAhead ?? 0))
    errors.push("The date can't be in the future. Please pick today or an earlier day.");
  if (!Number.isFinite(c.odometer) || c.odometer < 0 || c.odometer > MAX_ODOMETER)
    errors.push('Please enter the meter reading (odometer) as a number.');
  if (!Number.isFinite(c.liters) || c.liters <= 0) errors.push('Liters must be more than 0.');
  if (!Number.isFinite(c.price_per_liter) || c.price_per_liter <= 0)
    errors.push('Price per liter must be more than 0.');
  if (!Number.isFinite(c.total_cost) || c.total_cost <= 0)
    errors.push('Total must be more than 0.');
  if (errors.length) return { errors, warnings };

  if (opts.startOdometer != null && c.odometer < opts.startOdometer) {
    errors.push(
      `This reading is lower than the vehicle's starting reading (${fmt(opts.startOdometer)}). Please check your meter.`,
    );
  }

  const others = sortEntries(existing.filter((e) => e.id !== c.id));
  const before = others.filter((e) => e.entry_date <= c.entry_date);
  const after = others.filter((e) => e.entry_date > c.entry_date);
  const prev = before.length ? before.reduce((a, b) => (b.odometer > a.odometer ? b : a)) : null;
  const next = after.length ? after.reduce((a, b) => (b.odometer < a.odometer ? b : a)) : null;
  if (prev && c.odometer <= prev.odometer) {
    errors.push(
      `The meter reading must be higher than ${fmt(prev.odometer)} (your reading on ${prev.entry_date}). Please check the number on your meter.`,
    );
  }
  if (next && c.odometer >= next.odometer) {
    errors.push(
      `The meter reading must be lower than ${fmt(next.odometer)} (your later reading on ${next.entry_date}). Please check the date or the reading.`,
    );
  }

  if (opts.tankCapacity && c.liters > opts.tankCapacity) {
    warnings.push(
      `That is more than the tank size (${fmt(opts.tankCapacity)} L). Please check the liters.`,
    );
  }
  const expected = c.liters * c.price_per_liter;
  if (Math.abs(c.total_cost - expected) > Math.max(1, expected * 0.05)) {
    warnings.push(
      'The total is different from liters × price. That is fine if the pump showed this total.',
    );
  }

  if (!errors.length) {
    const id = c.id ?? '__new__';
    const candidate: FuelEntry = {
      id,
      vehicle_id: c.vehicle_id,
      entry_date: c.entry_date,
      odometer: c.odometer,
      liters: c.liters,
      price_per_liter: c.price_per_liter,
      total_cost: c.total_cost,
      is_full_tank: Number(c.is_full_tank) ? 1 : 0,
      station: null,
      note: null,
    };
    const { periods } = computePeriods([...others, candidate]);
    const mine = periods.find((p) => p.endEntryId === id);
    const rest = periods.filter((p) => p.endEntryId !== id);
    if (mine && rest.length) {
      const avg = summarize(rest).avgKmPerLiter;
      if (avg > 0 && Math.abs(mine.kmPerLiter - avg) / avg > UNUSUAL_LIMIT) {
        warnings.push('This looks unusual. Please check the meter reading.');
      }
    }
  }

  return { errors, warnings };
}

/**
 * A day can't be "no ride" if a fill-up on that day shows the meter moved
 * since the previous fill-up. Returns a friendly message, or null if OK.
 */
export function checkNoRideDay(day: string, entries: FuelEntry[]): string | null {
  const sorted = sortEntries(entries);
  for (let i = 1; i < sorted.length; i++) {
    const e = sorted[i];
    if (e.entry_date === day && e.odometer > sorted[i - 1].odometer) {
      return 'You filled fuel on this day and the meter moved, so it looks like you rode. We kept it as a riding day.';
    }
  }
  return null;
}

export interface VehicleInput {
  name: string;
  type: VehicleType;
  plate_number: string | null;
  fuel_type: FuelType;
  tank_capacity_liters: number | null;
  start_odometer: number | null;
  color_tag: string;
  is_archived: number;
}

export function checkVehicle(v: VehicleInput): string[] {
  const errors: string[] = [];
  if (!v.name || !v.name.trim()) errors.push('Please give your vehicle a name.');
  else if (v.name.length > 60) errors.push('Please use a shorter name (60 letters or less).');
  if (!VEHICLE_TYPES.includes(v.type)) errors.push('Please pick a vehicle type.');
  if (!FUEL_TYPES.includes(v.fuel_type)) errors.push('Please pick a fuel type.');
  if (v.plate_number && v.plate_number.length > 20) errors.push('The plate number is too long.');
  if (
    v.tank_capacity_liters != null &&
    (!Number.isFinite(v.tank_capacity_liters) ||
      v.tank_capacity_liters <= 0 ||
      v.tank_capacity_liters > 500)
  )
    errors.push('Tank size must be a number between 0 and 500 liters.');
  if (
    v.start_odometer != null &&
    (!Number.isFinite(v.start_odometer) || v.start_odometer < 0 || v.start_odometer > MAX_ODOMETER)
  )
    errors.push('Starting reading must be a positive number.');
  if (!/^#[0-9a-fA-F]{6}$/.test(v.color_tag)) errors.push('Please pick a color.');
  return errors;
}

export function isNoRideReason(r: unknown): r is NoRideReason {
  return typeof r === 'string' && (NO_RIDE_REASONS as string[]).includes(r);
}

/** List every day from `from` to `to` (inclusive). */
export function expandRange(from: string, to: string): string[] {
  const a = toDayNumber(from);
  const b = toDayNumber(to);
  const out: string[] = [];
  for (let d = a; d <= b; d++) out.push(fromDayNumber(d));
  return out;
}
