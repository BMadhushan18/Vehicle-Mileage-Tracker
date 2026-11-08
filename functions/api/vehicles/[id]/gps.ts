import { isValidISODate } from '../../../../shared/validate';
import { getVehicle } from '../../../_lib/db';
import type { Handler } from '../../../_lib/env';
import { HttpError, json, param, readJson } from '../../../_lib/http';

const MAX_DAYS_PER_SYNC = 62;
const MAX_KM_PER_DAY = 2000;

/** GET /api/vehicles/:id/gps?from=&to= - daily GPS distance totals. */
export const onRequestGet: Handler<'id'> = async ({ request, env, data, params }) => {
  const v = await getVehicle(env.DB, data.user.id, param(params.id));
  const q = new URL(request.url).searchParams;
  const from = q.get('from');
  const to = q.get('to');
  const { results } = await env.DB.prepare(
    `SELECT day, distance_km FROM gps_days WHERE vehicle_id = ?1
       AND (?2 IS NULL OR day >= ?2) AND (?3 IS NULL OR day <= ?3) ORDER BY day`,
  )
    .bind(v.id, isValidISODate(from) ? from : null, isValidISODate(to) ? to : null)
    .all();
  return json(results);
};

/**
 * POST { days: [{ day, distance_km }] } - the phone sends each day's running total.
 * Totals replace the stored value, so sending the same day again is safe.
 */
export const onRequestPost: Handler<'id'> = async ({ request, env, data, params }) => {
  const v = await getVehicle(env.DB, data.user.id, param(params.id));
  const body = await readJson<{ days?: unknown }>(request);
  if (!Array.isArray(body.days) || !body.days.length)
    throw new HttpError(422, 'invalid', 'No GPS days to save.');
  if (body.days.length > MAX_DAYS_PER_SYNC)
    throw new HttpError(422, 'invalid', 'Too many days in one sync.');

  const rows = body.days.map((d: { day?: unknown; distance_km?: unknown }) => {
    const km = Number(d?.distance_km);
    if (!isValidISODate(d?.day) || !(km >= 0) || km > MAX_KM_PER_DAY)
      throw new HttpError(422, 'invalid', 'A GPS day has an invalid date or distance.');
    return { id: crypto.randomUUID(), day: d.day, km: Math.round(km * 1000) / 1000 };
  });

  // One statement for all days (rows passed as JSON) to stay within free-plan limits.
  await env.DB.prepare(
    `INSERT INTO gps_days (id, vehicle_id, day, distance_km)
     SELECT json_extract(value, '$.id'), ?1, json_extract(value, '$.day'), json_extract(value, '$.km')
     FROM json_each(?2) WHERE true
     ON CONFLICT(vehicle_id, day) DO UPDATE SET distance_km = excluded.distance_km,
       updated_at = datetime('now')`,
  )
    .bind(v.id, JSON.stringify(rows))
    .run();
  return json({ saved: rows.length });
};
