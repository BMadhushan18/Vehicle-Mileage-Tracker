import type { FuelEntry, GpsDay, NoRideDay, Vehicle } from '../../shared/types';
import { checkVehicle, type VehicleInput } from '../../shared/validate';
import { HttpError, notFound, optNumber, optText } from './http';

export async function getVehicle(db: D1Database, userId: string, id: string): Promise<Vehicle> {
  const v = await db
    .prepare('SELECT * FROM vehicles WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first<Vehicle>();
  if (!v) throw notFound('That vehicle');
  return v;
}

/** One round trip: all fill-ups and no-ride days for a vehicle. */
export async function loadVehicleData(db: D1Database, vehicleId: string) {
  const [entries, days, gps] = await db.batch([
    db
      .prepare('SELECT * FROM fuel_entries WHERE vehicle_id = ? ORDER BY entry_date, odometer')
      .bind(vehicleId),
    db.prepare('SELECT * FROM no_ride_days WHERE vehicle_id = ? ORDER BY day').bind(vehicleId),
    db
      .prepare('SELECT day, distance_km FROM gps_days WHERE vehicle_id = ? ORDER BY day')
      .bind(vehicleId),
  ]);
  return {
    entries: entries.results as unknown as FuelEntry[],
    noRide: days.results as unknown as NoRideDay[],
    gps: gps.results as unknown as GpsDay[],
  };
}

/** One round trip: everything that belongs to a user. */
export async function loadUserData(db: D1Database, userId: string) {
  const [vehicles, entries, days, gps] = await db.batch([
    db
      .prepare('SELECT * FROM vehicles WHERE user_id = ? ORDER BY is_archived, created_at')
      .bind(userId),
    db
      .prepare(
        `SELECT f.* FROM fuel_entries f JOIN vehicles v ON v.id = f.vehicle_id
         WHERE v.user_id = ? ORDER BY f.entry_date, f.odometer`,
      )
      .bind(userId),
    db
      .prepare(
        `SELECT n.* FROM no_ride_days n JOIN vehicles v ON v.id = n.vehicle_id
         WHERE v.user_id = ? ORDER BY n.day`,
      )
      .bind(userId),
    db
      .prepare(
        `SELECT g.vehicle_id, g.day, g.distance_km FROM gps_days g JOIN vehicles v ON v.id = g.vehicle_id
         WHERE v.user_id = ? ORDER BY g.day`,
      )
      .bind(userId),
  ]);
  return {
    vehicles: vehicles.results as unknown as Vehicle[],
    entries: entries.results as unknown as FuelEntry[],
    noRide: days.results as unknown as NoRideDay[],
    gps: gps.results as unknown as (GpsDay & { vehicle_id: string })[],
  };
}

export function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const list = map.get(k);
    if (list) list.push(it);
    else map.set(k, [it]);
  }
  return map;
}

export function parseVehicle(body: Record<string, unknown>, base?: Vehicle): VehicleInput {
  const pick = <K extends keyof VehicleInput>(k: K): unknown =>
    k in body ? body[k] : base ? base[k] : undefined;
  const v: VehicleInput = {
    name: String(pick('name') ?? '').trim(),
    type: (pick('type') ?? 'bike') as VehicleInput['type'],
    plate_number: optText(pick('plate_number'), 20),
    fuel_type: (pick('fuel_type') ?? 'petrol') as VehicleInput['fuel_type'],
    tank_capacity_liters: optNumber(pick('tank_capacity_liters')),
    start_odometer: optNumber(pick('start_odometer')),
    daily_km: optNumber(pick('daily_km')),
    color_tag: String(pick('color_tag') ?? '#3B82F6'),
    is_archived: Number(pick('is_archived') ?? 0) ? 1 : 0,
  };
  const errors = checkVehicle(v);
  if (errors.length) throw new HttpError(422, 'invalid', errors[0], errors);
  return v;
}
