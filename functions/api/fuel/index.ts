import type { Handler } from '../../_lib/env';
import { json } from '../../_lib/http';

/** GET /api/fuel - every fill-up for the signed-in user (used by Fuel history). */
export const onRequestGet: Handler = async ({ env, data }) => {
  const { results } = await env.DB.prepare(
    `SELECT f.* FROM fuel_entries f JOIN vehicles v ON v.id = f.vehicle_id
     WHERE v.user_id = ? ORDER BY f.entry_date DESC, f.odometer DESC`,
  )
    .bind(data.user.id)
    .all();
  return json(results);
};
