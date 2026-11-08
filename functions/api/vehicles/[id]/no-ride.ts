import type { FuelEntry } from '../../../../shared/types';
import {
  MAX_NO_RIDE_RANGE,
  checkNoRideDay,
  expandRange,
  isNoRideReason,
  isValidISODate,
} from '../../../../shared/validate';
import { getVehicle } from '../../../_lib/db';
import type { Handler } from '../../../_lib/env';
import { HttpError, json, param, readJson } from '../../../_lib/http';

function readRange(from: unknown, to: unknown): { from: string; to: string } {
  const f = from;
  const t = to === undefined || to === null || to === '' ? from : to;
  if (!isValidISODate(f) || !isValidISODate(t))
    throw new HttpError(422, 'invalid', 'Please pick valid dates.');
  if (t < f) throw new HttpError(422, 'invalid', 'The end date must be after the start date.');
  if (expandRange(f, t).length > MAX_NO_RIDE_RANGE)
    throw new HttpError(422, 'invalid', 'Please pick one year or less at a time.');
  return { from: f, to: t };
}

/** GET ?from=&to= - list no-ride days (all if no range). */
export const onRequestGet: Handler<'id'> = async ({ request, env, data, params }) => {
  const v = await getVehicle(env.DB, data.user.id, param(params.id));
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const { results } = await env.DB.prepare(
    `SELECT * FROM no_ride_days WHERE vehicle_id = ?1
       AND (?2 IS NULL OR day >= ?2) AND (?3 IS NULL OR day <= ?3) ORDER BY day`,
  )
    .bind(v.id, isValidISODate(from) ? from : null, isValidISODate(to) ? to : null)
    .all();
  return json(results);
};

/** POST { from, to?, reason? } - mark one day or a range. Days where the meter moved are skipped. */
export const onRequestPost: Handler<'id'> = async ({ request, env, data, params }) => {
  const v = await getVehicle(env.DB, data.user.id, param(params.id));
  const body = await readJson(request);
  const { from, to } = readRange(body.from ?? body.day, body.to);
  const reason = body.reason == null || body.reason === '' ? null : body.reason;
  if (reason !== null && !isNoRideReason(reason))
    throw new HttpError(422, 'invalid', 'Please pick a reason from the list.');

  const { results } = await env.DB.prepare(
    'SELECT * FROM fuel_entries WHERE vehicle_id = ? ORDER BY entry_date, odometer',
  )
    .bind(v.id)
    .all<FuelEntry>();

  const added: string[] = [];
  const skipped: { day: string; message: string }[] = [];
  for (const day of expandRange(from, to)) {
    const msg = checkNoRideDay(day, results);
    if (msg) skipped.push({ day, message: msg });
    else added.push(day);
  }
  if (!added.length) {
    throw new HttpError(422, 'rode_that_day', skipped[0]?.message ?? 'Nothing to mark.', skipped);
  }

  // One statement for the whole range: the days are passed as a JSON array.
  const rows = added.map((day) => ({ id: crypto.randomUUID(), day }));
  await env.DB.prepare(
    `INSERT INTO no_ride_days (id, vehicle_id, day, reason)
     SELECT json_extract(value, '$.id'), ?1, json_extract(value, '$.day'), ?2 FROM json_each(?3)
     WHERE true
     ON CONFLICT(vehicle_id, day) DO UPDATE SET reason = excluded.reason`,
  )
    .bind(v.id, reason, JSON.stringify(rows))
    .run();

  return json({ added, skipped }, 201);
};

/** DELETE ?from=&to= (or ?day=) - unmark one day or a range. */
export const onRequestDelete: Handler<'id'> = async ({ request, env, data, params }) => {
  const v = await getVehicle(env.DB, data.user.id, param(params.id));
  const url = new URL(request.url);
  const { from, to } = readRange(
    url.searchParams.get('from') ?? url.searchParams.get('day'),
    url.searchParams.get('to'),
  );
  const res = await env.DB.prepare(
    'DELETE FROM no_ride_days WHERE vehicle_id = ? AND day >= ? AND day <= ?',
  )
    .bind(v.id, from, to)
    .run();
  return json({ removed: res.meta.changes ?? 0 });
};
