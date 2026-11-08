import { computePeriods, summarize } from '../../shared/calc';
import type { FuelEntry, SaveFuelResult, Vehicle } from '../../shared/types';
import { checkFuelEntry, type FuelCandidate } from '../../shared/validate';
import { loadVehicleData } from './db';
import { HttpError, optNumber, optText, utcToday } from './http';

export function parseFuel(
  body: Record<string, unknown>,
  vehicleId: string,
  id?: string,
): FuelCandidate {
  const liters = optNumber(body.liters) ?? NaN;
  const price = optNumber(body.price_per_liter) ?? NaN;
  const total = optNumber(body.total_cost);
  return {
    id,
    vehicle_id: vehicleId,
    entry_date: String(body.entry_date ?? ''),
    odometer: optNumber(body.odometer) ?? NaN,
    liters,
    price_per_liter: price,
    total_cost: total ?? Math.round(liters * price * 100) / 100,
    is_full_tank: body.is_full_tank === undefined ? 1 : Number(Boolean(body.is_full_tank)),
    station: optText(body.station, 80),
    note: optText(body.note, 500),
  };
}

/** Validates against the vehicle's other entries, then inserts or updates. */
export async function saveFuel(
  db: D1Database,
  vehicle: Vehicle,
  c: FuelCandidate,
  mode: 'insert' | 'update',
): Promise<SaveFuelResult> {
  const { entries, noRide } = await loadVehicleData(db, vehicle.id);
  const check = checkFuelEntry(c, entries, {
    today: utcToday(),
    allowDaysAhead: 1,
    tankCapacity: vehicle.tank_capacity_liters,
    startOdometer: vehicle.start_odometer,
  });
  if (check.errors.length) throw new HttpError(422, 'invalid', check.errors[0], check.errors);

  const id = c.id ?? crypto.randomUUID();
  const values = [
    c.entry_date,
    c.odometer,
    c.liters,
    c.price_per_liter,
    c.total_cost,
    Number(c.is_full_tank) ? 1 : 0,
    c.station ?? null,
    c.note ?? null,
  ];
  const stmt =
    mode === 'insert'
      ? db
          .prepare(
            `INSERT INTO fuel_entries (entry_date, odometer, liters, price_per_liter, total_cost,
               is_full_tank, station, note, id, vehicle_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
          )
          .bind(...values, id, vehicle.id)
      : db
          .prepare(
            `UPDATE fuel_entries SET entry_date = ?, odometer = ?, liters = ?, price_per_liter = ?,
               total_cost = ?, is_full_tank = ?, station = ?, note = ?
             WHERE id = ? AND vehicle_id = ? RETURNING *`,
          )
          .bind(...values, id, vehicle.id);
  const entry = await stmt.first<FuelEntry>();
  if (!entry) throw new HttpError(404, 'not_found', 'That fill-up was not found.');

  // Work out the new result without another DB read.
  const all = [...entries.filter((e) => e.id !== id), entry];
  const { periods, pending } = computePeriods(
    all,
    noRide.map((d) => d.day),
  );
  const period = periods.find((p) => p.endEntryId === id) ?? null;
  const others = periods.filter((p) => p.endEntryId !== id);
  return {
    entry,
    warnings: check.warnings,
    period,
    avgKmPerLiter: others.length ? summarize(others).avgKmPerLiter : null,
    pending,
  };
}
