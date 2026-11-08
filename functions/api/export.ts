import type { DateFormat, ExportData } from '../../shared/types';
import { loadUserData } from '../_lib/db';
import type { Handler } from '../_lib/env';
import { json } from '../_lib/http';

export const onRequestGet: Handler = async ({ env, data }) => {
  const { vehicles, entries, noRide } = await loadUserData(env.DB, data.user.id);
  const out: ExportData = {
    app: 'ridelog',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: {
      currency: data.user.currency,
      distance_unit: data.user.distance_unit,
      date_format: data.user.date_format as DateFormat,
    },
    vehicles,
    fuel_entries: entries,
    no_ride_days: noRide,
  };
  return json(out);
};
