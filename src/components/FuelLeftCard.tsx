import { useState } from 'react';
import { estimateFuelLeft } from '../../shared/calc';
import type { VehicleReport } from '../../shared/types';
import { api } from '../api';
import { fixed, num, perLiter, unitLabel } from '../format';
import { errorText, useApp } from '../store';

const toNum = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')));
const key = (id: string) => `ridelog.odo.${id}`;

function readSaved(id: string): string | null {
  try {
    return localStorage.getItem(key(id));
  } catch {
    return null;
  }
}

/** "How far can I go?" – estimate fuel left from the current meter reading. */
export function FuelLeftCard({ r }: { r: VehicleReport }) {
  const { settings, toast, bump } = useApp();
  const v = r.vehicle;
  const u = unitLabel(settings.distance_unit);
  const last = r.lastEntry;

  // GPS estimate is the freshest guess; otherwise the last reading typed here, then the last fill-up.
  const gpsOdo =
    r.gps?.estimatedOdometer != null ? String(Math.round(r.gps.estimatedOdometer * 10) / 10) : null;
  const [odo, setOdo] = useState(
    () => gpsOdo ?? readSaved(v.id) ?? (last ? String(last.odometer) : ''),
  );
  const [daily, setDaily] = useState(v.daily_km != null ? String(v.daily_km) : '');
  const [savingDaily, setSavingDaily] = useState(false);

  // Last full tank: if part fills came after it, the report's pending block knows its reading.
  const lastFullOdometer = r.pending
    ? r.pending.startOdometer
    : last && last.is_full_tank
      ? last.odometer
      : null;
  const gpsDaily = r.gps?.avgDailyKm ?? null;
  const historyDaily =
    gpsDaily ?? (r.summary.avgKmPerRidingDay > 0 ? r.summary.avgKmPerRidingDay : null);
  const dailyKm = Number.isFinite(toNum(daily)) && toNum(daily) > 0 ? toNum(daily) : historyDaily;

  const est = estimateFuelLeft({
    lastFullOdometer,
    partialLiters: r.pending?.liters ?? 0,
    tankCapacity: v.tank_capacity_liters,
    kmPerLiter: r.allTimeAvgKmPerLiter,
    currentOdometer: toNum(odo),
    dailyKm,
  });

  function changeOdo(value: string) {
    setOdo(value);
    try {
      localStorage.setItem(key(v.id), value);
    } catch {
      /* private mode */
    }
  }

  async function saveDaily() {
    const n = daily.trim() === '' ? null : toNum(daily);
    if (n !== null && !(n > 0 && n <= 2000)) {
      toast('Please enter a daily distance between 1 and 2000.', { kind: 'error' });
      return;
    }
    setSavingDaily(true);
    try {
      await api.updateVehicle(v.id, { daily_km: n });
      toast(n ? `Daily distance saved: ${num(n, 1)} ${u}.` : 'Daily distance cleared.', {
        kind: 'success',
      });
      bump();
    } catch (e) {
      toast(errorText(e), { kind: 'error' });
    } finally {
      setSavingDaily(false);
    }
  }

  const dailyChanged = (daily.trim() === '' ? null : toNum(daily)) !== v.daily_km;

  let body;
  if (!est.ok) {
    const msg = {
      no_tank: (
        <>
          Add the <strong>tank size</strong> for this vehicle to see fuel left.{' '}
          <a href="#/vehicles">Edit vehicle</a>
        </>
      ),
      no_full_fill: 'Fill the tank full once and add it here to start the estimate.',
      no_average:
        'We need one more full-tank fill-up to know your mileage. Then the estimate will appear.',
      reading_too_low: `The reading must be at least ${num(lastFullOdometer, 1)} ${u} (your last full tank).`,
    }[est.reason];
    body = <p className="muted small">{msg}</p>;
  } else {
    const low = est.percentLeft < 20;
    body = (
      <>
        <div
          className={`gauge${low ? ' low' : ''}`}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(est.percentLeft)}
          aria-label="Estimated fuel left"
        >
          <span style={{ width: `${est.percentLeft}%` }} />
        </div>
        <dl className="estimate-grid">
          <div>
            <dt>Fuel left</dt>
            <dd>≈ {fixed(est.fuelLeft, 1)} L</dd>
          </div>
          <div>
            <dt>Can still go</dt>
            <dd>
              ≈ {num(est.rangeKm, 0)} {u}
            </dd>
          </div>
          <div>
            <dt>Days left</dt>
            <dd>{est.daysLeft === null ? '–' : `≈ ${fixed(est.daysLeft, 1)}`}</dd>
          </div>
        </dl>
        {est.overdue ? (
          <p className="alert alert-warning small">
            By our numbers the tank should be empty. Please fill up soon, or check the reading.
          </p>
        ) : (
          low && <p className="alert alert-warning small">Fuel is low. Plan to fill up soon.</p>
        )}
        <p className="muted small">
          {num(est.distanceSinceFull, 0)} {u} since your last full tank, at your average of{' '}
          {fixed(r.allTimeAvgKmPerLiter)} {perLiter(settings.distance_unit)}. This is a rough guide.
        </p>
      </>
    );
  }

  return (
    <section className="card stack" aria-labelledby={`fl-${v.id}`}>
      <h2 id={`fl-${v.id}`} className="card-title">
        Fuel left &amp; distance you can go
      </h2>
      <div className="row-2">
        <div className="field">
          <label htmlFor={`fl-odo-${v.id}`}>Meter reading now ({u})</label>
          <input
            id={`fl-odo-${v.id}`}
            inputMode="decimal"
            autoComplete="off"
            value={odo}
            onChange={(e) => changeOdo(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`fl-daily-${v.id}`}>Normal riding per day ({u})</label>
          <div className="input-row">
            <input
              id={`fl-daily-${v.id}`}
              inputMode="decimal"
              autoComplete="off"
              placeholder={historyDaily ? num(historyDaily, 0) : 'e.g. 30'}
              value={daily}
              onChange={(e) => setDaily(e.target.value)}
            />
            {dailyChanged && (
              <button
                type="button"
                className="btn btn-primary btn-small"
                disabled={savingDaily}
                onClick={saveDaily}
              >
                Save
              </button>
            )}
          </div>
          {!daily && historyDaily && (
            <div className="field-hint">
              Using your {gpsDaily ? 'GPS rides' : 'history'}: {num(historyDaily, 0)} {u}/day
            </div>
          )}
        </div>
      </div>
      {body}
    </section>
  );
}
