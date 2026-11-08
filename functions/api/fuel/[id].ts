import type { FuelEntry } from '../../../shared/types';
import { getVehicle } from '../../_lib/db';
import type { Handler } from '../../_lib/env';
import { parseFuel, saveFuel } from '../../_lib/fuel';
import { json, notFound, param, readJson } from '../../_lib/http';

/** Loads a fill-up only if its vehicle belongs to the signed-in user. */
async function ownedEntry(db: D1Database, userId: string, id: string): Promise<FuelEntry> {
  const e = await db
    .prepare(
      `SELECT f.* FROM fuel_entries f JOIN vehicles v ON v.id = f.vehicle_id
       WHERE f.id = ? AND v.user_id = ?`,
    )
    .bind(id, userId)
    .first<FuelEntry>();
  if (!e) throw notFound('That fill-up');
  return e;
}

export const onRequestGet: Handler<'id'> = async ({ env, data, params }) =>
  json(await ownedEntry(env.DB, data.user.id, param(params.id)));

export const onRequestPut: Handler<'id'> = async ({ request, env, data, params }) => {
  const existing = await ownedEntry(env.DB, data.user.id, param(params.id));
  const body = await readJson(request);
  // Moving an entry to another vehicle is allowed if that vehicle is also the user's.
  const vehicleId = typeof body.vehicle_id === 'string' ? body.vehicle_id : existing.vehicle_id;
  const v = await getVehicle(env.DB, data.user.id, vehicleId);
  if (v.id !== existing.vehicle_id) {
    await env.DB.prepare('UPDATE fuel_entries SET vehicle_id = ? WHERE id = ?')
      .bind(v.id, existing.id)
      .run();
  }
  const c = parseFuel(body, v.id, existing.id);
  try {
    return json(await saveFuel(env.DB, v, c, 'update'));
  } catch (e) {
    if (v.id !== existing.vehicle_id) {
      await env.DB.prepare('UPDATE fuel_entries SET vehicle_id = ? WHERE id = ?')
        .bind(existing.vehicle_id, existing.id)
        .run();
    }
    throw e;
  }
};

export const onRequestDelete: Handler<'id'> = async ({ env, data, params }) => {
  const e = await ownedEntry(env.DB, data.user.id, param(params.id));
  await env.DB.prepare('DELETE FROM fuel_entries WHERE id = ?').bind(e.id).run();
  return json({ ok: true });
};
