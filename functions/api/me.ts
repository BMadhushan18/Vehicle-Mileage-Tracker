import { DATE_FORMATS, type DateFormat, type Settings } from '../../shared/types';
import type { Handler, UserRow } from '../_lib/env';
import { HttpError, json, readJson } from '../_lib/http';

const toSettings = (u: UserRow): Settings => ({
  email: u.email,
  currency: u.currency,
  distance_unit: u.distance_unit,
  date_format: u.date_format as DateFormat,
});

export const onRequestGet: Handler = async ({ data }) => json(toSettings(data.user));

export const onRequestPut: Handler = async ({ request, env, data }) => {
  const body = await readJson(request);
  const currency = String(body.currency ?? data.user.currency).toUpperCase();
  const unit = String(body.distance_unit ?? data.user.distance_unit);
  const fmt = String(body.date_format ?? data.user.date_format);
  if (!/^[A-Z]{3}$/.test(currency)) throw new HttpError(422, 'invalid', 'Please pick a currency.');
  if (unit !== 'km' && unit !== 'miles')
    throw new HttpError(422, 'invalid', 'Please pick km or miles.');
  if (!(DATE_FORMATS as string[]).includes(fmt))
    throw new HttpError(422, 'invalid', 'Please pick a date format.');

  const user = await env.DB.prepare(
    'UPDATE users SET currency = ?, distance_unit = ?, date_format = ? WHERE id = ? RETURNING *',
  )
    .bind(currency, unit, fmt, data.user.id)
    .first<UserRow>();
  return json(toSettings(user!));
};
