import { buildVehicleReport } from '../../../../shared/calc';
import { isValidISODate } from '../../../../shared/validate';
import { getVehicle, loadVehicleData } from '../../../_lib/db';
import type { Handler } from '../../../_lib/env';
import { json, param } from '../../../_lib/http';

/** GET /api/vehicles/:id/report?from=&to=&today= - periods + summary. */
export const onRequestGet: Handler<'id'> = async ({ request, env, data, params }) => {
  const v = await getVehicle(env.DB, data.user.id, param(params.id));
  const q = new URL(request.url).searchParams;
  const pick = (k: string) => {
    const s = q.get(k);
    return isValidISODate(s) ? s : null;
  };
  const { entries, noRide } = await loadVehicleData(env.DB, v.id);
  return json(
    buildVehicleReport(
      v,
      entries,
      noRide.map((d) => d.day),
      { from: pick('from'), to: pick('to'), today: pick('today') },
    ),
  );
};
