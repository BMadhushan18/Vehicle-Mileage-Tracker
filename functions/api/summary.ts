import { buildVehicleReport } from '../../shared/calc';
import { isValidISODate } from '../../shared/validate';
import { groupBy, loadUserData } from '../_lib/db';
import type { Handler } from '../_lib/env';
import { json } from '../_lib/http';

/**
 * GET /api/summary?from=&to=&today=&archived=1
 * Reports for every vehicle in one request (dashboard + "All vehicles" reports).
 */
export const onRequestGet: Handler = async ({ request, env, data }) => {
  const q = new URL(request.url).searchParams;
  const pick = (k: string) => {
    const s = q.get(k);
    return isValidISODate(s) ? s : null;
  };
  const opts = { from: pick('from'), to: pick('to'), today: pick('today') };
  const { vehicles, entries, noRide } = await loadUserData(env.DB, data.user.id);
  const entriesBy = groupBy(entries, (e) => e.vehicle_id);
  const daysBy = groupBy(noRide, (d) => d.vehicle_id);
  const reports = vehicles
    .filter((v) => q.get('archived') === '1' || !v.is_archived)
    .map((v) =>
      buildVehicleReport(
        v,
        entriesBy.get(v.id) ?? [],
        (daysBy.get(v.id) ?? []).map((d) => d.day),
        opts,
      ),
    );
  return json({ reports });
};
