import { FUEL_TYPES, VEHICLE_TYPES } from '../../shared/types';
import { isNoRideReason, isValidISODate } from '../../shared/validate';
import type { Handler } from '../_lib/env';
import { HttpError, json, optNumber, optText, readJson } from '../_lib/http';

const LIMITS = { vehicles: 20, entries: 20_000, days: 20_000 };

type Row = Record<string, unknown>;
const asRows = (v: unknown): Row[] =>
  Array.isArray(v) ? (v.filter((r) => r && typeof r === 'object') as Row[]) : [];
const bad = (msg: string) =>
  new HttpError(422, 'bad_backup', `This backup file has a problem: ${msg}`);

/**
 * POST /api/import?mode=add|replace
 * Imports a RideLog JSON backup. New ids are created so it never clashes with existing data.
 * Each table is inserted with ONE statement (rows passed as JSON) to stay inside free-plan limits.
 */
export const onRequestPost: Handler = async ({ request, env, data }) => {
  const mode = new URL(request.url).searchParams.get('mode') === 'replace' ? 'replace' : 'add';
  const body = await readJson(request);
  if (body.app !== 'ridelog') throw bad('it is not a RideLog backup.');

  const vehicles = asRows(body.vehicles);
  const entries = asRows(body.fuel_entries);
  const days = asRows(body.no_ride_days);
  if (vehicles.length > LIMITS.vehicles) throw bad('too many vehicles.');
  if (entries.length > LIMITS.entries || days.length > LIMITS.days) throw bad('too many rows.');

  const idMap = new Map<string, string>();
  const vRows = vehicles.map((v, i) => {
    const name = optText(v.name, 60);
    if (!name) throw bad(`vehicle #${i + 1} has no name.`);
    const id = crypto.randomUUID();
    idMap.set(String(v.id), id);
    return {
      id,
      name,
      type: VEHICLE_TYPES.includes(v.type as never) ? v.type : 'other',
      plate_number: optText(v.plate_number, 20),
      fuel_type: FUEL_TYPES.includes(v.fuel_type as never) ? v.fuel_type : 'petrol',
      tank_capacity_liters: optNumber(v.tank_capacity_liters),
      start_odometer: optNumber(v.start_odometer),
      daily_km: optNumber(v.daily_km),
      color_tag: /^#[0-9a-fA-F]{6}$/.test(String(v.color_tag)) ? v.color_tag : '#3B82F6',
      is_archived: Number(v.is_archived) ? 1 : 0,
    };
  });

  const fRows = entries.map((e, i) => {
    const vehicle_id = idMap.get(String(e.vehicle_id));
    const odometer = Number(e.odometer);
    const liters = Number(e.liters);
    const price = Number(e.price_per_liter);
    const total = optNumber(e.total_cost) ?? liters * price;
    if (
      !vehicle_id ||
      !isValidISODate(e.entry_date) ||
      !(odometer >= 0) ||
      !(liters > 0) ||
      !(price > 0) ||
      !(total > 0)
    )
      throw bad(`fill-up #${i + 1} is not valid.`);
    return {
      id: crypto.randomUUID(),
      vehicle_id,
      entry_date: e.entry_date,
      odometer,
      liters,
      price_per_liter: price,
      total_cost: total,
      is_full_tank: Number(e.is_full_tank ?? 1) ? 1 : 0,
      station: optText(e.station, 80),
      note: optText(e.note, 500),
    };
  });

  const dRows = days.map((d, i) => {
    const vehicle_id = idMap.get(String(d.vehicle_id));
    if (!vehicle_id || !isValidISODate(d.day)) throw bad(`no-ride day #${i + 1} is not valid.`);
    return {
      id: crypto.randomUUID(),
      vehicle_id,
      day: d.day,
      reason: isNoRideReason(d.reason) ? d.reason : null,
    };
  });

  const db = env.DB;
  const uid = data.user.id;
  const stmts: D1PreparedStatement[] = [];
  if (mode === 'replace') {
    stmts.push(
      db
        .prepare(
          'DELETE FROM fuel_entries WHERE vehicle_id IN (SELECT id FROM vehicles WHERE user_id = ?)',
        )
        .bind(uid),
      db
        .prepare(
          'DELETE FROM no_ride_days WHERE vehicle_id IN (SELECT id FROM vehicles WHERE user_id = ?)',
        )
        .bind(uid),
      db.prepare('DELETE FROM vehicles WHERE user_id = ?').bind(uid),
    );
  }
  const j = (k: string) => `json_extract(value, '$.${k}')`;
  stmts.push(
    db
      .prepare(
        `INSERT INTO vehicles (id, user_id, name, type, plate_number, fuel_type, tank_capacity_liters,
           start_odometer, color_tag, is_archived, daily_km)
         SELECT ${j('id')}, ?1, ${j('name')}, ${j('type')}, ${j('plate_number')}, ${j('fuel_type')},
           ${j('tank_capacity_liters')}, ${j('start_odometer')}, ${j('color_tag')}, ${j('is_archived')}, ${j('daily_km')}
         FROM json_each(?2)`,
      )
      .bind(uid, JSON.stringify(vRows)),
  );
  // Keep each statement's JSON well under D1's size limits.
  for (let i = 0; i < fRows.length; i += 3000) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO fuel_entries (id, vehicle_id, entry_date, odometer, liters, price_per_liter,
             total_cost, is_full_tank, station, note)
           SELECT ${j('id')}, ${j('vehicle_id')}, ${j('entry_date')}, ${j('odometer')}, ${j('liters')},
             ${j('price_per_liter')}, ${j('total_cost')}, ${j('is_full_tank')}, ${j('station')}, ${j('note')}
           FROM json_each(?1)`,
        )
        .bind(JSON.stringify(fRows.slice(i, i + 3000))),
    );
  }
  for (let i = 0; i < dRows.length; i += 5000) {
    stmts.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO no_ride_days (id, vehicle_id, day, reason)
           SELECT ${j('id')}, ${j('vehicle_id')}, ${j('day')}, ${j('reason')} FROM json_each(?1)`,
        )
        .bind(JSON.stringify(dRows.slice(i, i + 5000))),
    );
  }

  if (mode === 'add') {
    const count = await db
      .prepare('SELECT COUNT(*) AS n FROM vehicles WHERE user_id = ?')
      .bind(uid)
      .first<number>('n');
    if ((count ?? 0) + vRows.length > LIMITS.vehicles)
      throw new HttpError(
        422,
        'limit',
        'That would be more than 20 vehicles. Try "Replace my data" instead.',
      );
  }

  // batch() runs as one transaction: all or nothing.
  await db.batch(stmts);
  return json({
    vehicles: vRows.length,
    fuel_entries: fRows.length,
    no_ride_days: dRows.length,
    mode,
  });
};
