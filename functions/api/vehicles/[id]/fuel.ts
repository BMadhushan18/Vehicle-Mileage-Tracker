import { isValidISODate } from '../../../../shared/validate';
import { getVehicle } from '../../../_lib/db';
import type { Handler } from '../../../_lib/env';
import { parseFuel, saveFuel } from '../../../_lib/fuel';
import { json, param, readJson } from '../../../_lib/http';

/** GET /api/vehicles/:id/fuel?from=&to= */
export const onRequestGet: Handler<'id'> = async ({ request, env, data, params }) => {
  const v = await getVehicle(env.DB, data.user.id, param(params.id));
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const { results } = await env.DB.prepare(
    `SELECT * FROM fuel_entries WHERE vehicle_id = ?
       AND (?2 IS NULL OR entry_date >= ?2) AND (?3 IS NULL OR entry_date <= ?3)
     ORDER BY entry_date, odometer`,
  )
    .bind(v.id, isValidISODate(from) ? from : null, isValidISODate(to) ? to : null)
    .all();
  return json(results);
};

export const onRequestPost: Handler<'id'> = async ({ request, env, data, params }) => {
  const v = await getVehicle(env.DB, data.user.id, param(params.id));
  const c = parseFuel(await readJson(request), v.id);
  return json(await saveFuel(env.DB, v, c, 'insert'), 201);
};
