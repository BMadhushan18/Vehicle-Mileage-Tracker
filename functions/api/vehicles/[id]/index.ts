import type { Vehicle } from '../../../../shared/types';
import { getVehicle, parseVehicle } from '../../../_lib/db';
import type { Handler } from '../../../_lib/env';
import { HttpError, json, param, readJson } from '../../../_lib/http';

export const onRequestGet: Handler<'id'> = async ({ env, data, params }) =>
  json(await getVehicle(env.DB, data.user.id, param(params.id)));

export const onRequestPut: Handler<'id'> = async ({ request, env, data, params }) => {
  const existing = await getVehicle(env.DB, data.user.id, param(params.id));
  const input = parseVehicle(await readJson(request), existing);
  const v = await env.DB.prepare(
    `UPDATE vehicles SET name = ?, type = ?, plate_number = ?, fuel_type = ?, tank_capacity_liters = ?,
       start_odometer = ?, color_tag = ?, is_archived = ?
     WHERE id = ? AND user_id = ? RETURNING *`,
  )
    .bind(
      input.name,
      input.type,
      input.plate_number,
      input.fuel_type,
      input.tank_capacity_liters,
      input.start_odometer,
      input.color_tag,
      input.is_archived,
      existing.id,
      data.user.id,
    )
    .first<Vehicle>();
  return json(v);
};

/** Deletes the vehicle and (via ON DELETE CASCADE) all its fill-ups and no-ride days. */
export const onRequestDelete: Handler<'id'> = async ({ request, env, data, params }) => {
  const v = await getVehicle(env.DB, data.user.id, param(params.id));
  if (new URL(request.url).searchParams.get('confirm') !== 'yes') {
    throw new HttpError(
      400,
      'confirm_needed',
      'Deleting removes all fill-ups and no-ride days for this vehicle. Please confirm.',
    );
  }
  // Delete children explicitly too, in case foreign keys are not enforced.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM fuel_entries WHERE vehicle_id = ?').bind(v.id),
    env.DB.prepare('DELETE FROM no_ride_days WHERE vehicle_id = ?').bind(v.id),
    env.DB.prepare('DELETE FROM vehicles WHERE id = ? AND user_id = ?').bind(v.id, data.user.id),
  ]);
  return json({ ok: true });
};
