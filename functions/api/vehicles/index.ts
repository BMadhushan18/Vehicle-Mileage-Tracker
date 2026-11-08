import { computePeriods, sortEntries, summarize } from '../../../shared/calc';
import type { Vehicle, VehicleWithStats } from '../../../shared/types';
import { groupBy, loadUserData, parseVehicle } from '../../_lib/db';
import type { Handler } from '../../_lib/env';
import { HttpError, json, readJson } from '../../_lib/http';

const MAX_VEHICLES = 20;

/** List vehicles with a few quick stats (one DB round trip). */
export const onRequestGet: Handler = async ({ env, data }) => {
  const { vehicles, entries, noRide } = await loadUserData(env.DB, data.user.id);
  const entriesBy = groupBy(entries, (e) => e.vehicle_id);
  const daysBy = groupBy(noRide, (d) => d.vehicle_id);
  const list: VehicleWithStats[] = vehicles.map((v) => {
    const es = entriesBy.get(v.id) ?? [];
    const { periods } = computePeriods(
      es,
      (daysBy.get(v.id) ?? []).map((d) => d.day),
    );
    const last = sortEntries(es).at(-1);
    return {
      ...v,
      avgKmPerLiter: summarize(periods).avgKmPerLiter,
      periodCount: periods.length,
      entryCount: es.length,
      lastOdometer: last?.odometer ?? null,
      lastPrice: last?.price_per_liter ?? null,
    };
  });
  return json(list);
};

export const onRequestPost: Handler = async ({ request, env, data }) => {
  const input = parseVehicle(await readJson(request));
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM vehicles WHERE user_id = ?')
    .bind(data.user.id)
    .first<number>('n');
  if ((count ?? 0) >= MAX_VEHICLES)
    throw new HttpError(
      422,
      'limit',
      `You can have up to ${MAX_VEHICLES} vehicles. Please archive or delete one first.`,
    );

  const v = await env.DB.prepare(
    `INSERT INTO vehicles (id, user_id, name, type, plate_number, fuel_type, tank_capacity_liters,
       start_odometer, color_tag, is_archived)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(
      crypto.randomUUID(),
      data.user.id,
      input.name,
      input.type,
      input.plate_number,
      input.fuel_type,
      input.tank_capacity_liters,
      input.start_odometer,
      input.color_tag,
      input.is_archived,
    )
    .first<Vehicle>();
  return json(v, 201);
};
