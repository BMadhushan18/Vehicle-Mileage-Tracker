import { useEffect, useState } from 'react';
import type { VehicleReport } from '../../shared/types';
import {
  gpsSupported,
  isNativeApp,
  startTracking,
  stopTracking,
  subscribe,
  type TrackerState,
} from '../gps/tracker';
import { fixed, num, todayISO, unitLabel } from '../format';
import { useApp } from '../store';
import { Icon } from './Icon';

function elapsed(from: number | null): string {
  if (!from) return '';
  const m = Math.floor((Date.now() - from) / 60_000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** Start/stop GPS tracking and show what GPS has learned for this vehicle. */
export function RideTrackerCard({ r }: { r: VehicleReport }) {
  const { settings, bump, toast } = useApp();
  const [s, setS] = useState<TrackerState | null>(null);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  const u = unitLabel(settings.distance_unit);
  const id = r.vehicle.id;

  useEffect(() => subscribe((next) => setS({ ...next })), []);
  useEffect(() => {
    if (!s?.active) return;
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [s?.active]);

  if (!gpsSupported || !s) return null;

  const factor = r.gps?.factor ?? 1;
  const trackingThis = s.active && s.vehicleId === id;
  const trackingOther = s.active && s.vehicleId !== id;
  const today = (s.days[id]?.[todayISO()] ?? 0) * factor;

  async function toggle() {
    setBusy(true);
    try {
      if (trackingThis) {
        const km = s!.sessionKm * factor;
        await stopTracking();
        toast(`Ride saved: ${fixed(km, 1)} ${u}.`, { kind: 'success' });
        bump();
      } else {
        await startTracking(id);
        toast(
          isNativeApp
            ? 'Tracking started. You can lock the screen.'
            : 'Tracking started. Keep this page open and the screen on.',
          { kind: 'success' },
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={`card stack tracker${trackingThis ? ' is-live' : ''}`}
      aria-labelledby={`trk-${id}`}
    >
      <div className="card-head">
        <h2 id={`trk-${id}`} className="card-title">
          GPS ride tracking
        </h2>
        {trackingThis ? (
          <span className="live-pill">
            <span className="live-dot" aria-hidden="true" /> Live · {elapsed(s.startedAt)}
          </span>
        ) : (
          <span className="muted small">
            {isNativeApp ? 'Works with screen off' : 'Screen must stay on'}
          </span>
        )}
      </div>

      <dl className="estimate-grid">
        <div>
          <dt>This ride</dt>
          <dd>
            {trackingThis ? fixed(s.sessionKm * factor, 1) : '–'} {trackingThis ? u : ''}
          </dd>
        </div>
        <div>
          <dt>Today</dt>
          <dd>
            {fixed(today, 1)} {u}
          </dd>
        </div>
        <div>
          <dt>Meter now</dt>
          <dd>{r.gps?.estimatedOdometer != null ? `≈ ${num(r.gps.estimatedOdometer, 0)}` : '–'}</dd>
        </div>
      </dl>

      {s.error && <div className="alert alert-error small">{s.error}</div>}

      <button
        type="button"
        className={`btn btn-block ${trackingThis ? 'btn-danger' : 'btn-primary'}`}
        disabled={busy}
        onClick={toggle}
      >
        <Icon name={trackingThis ? 'check' : 'road'} />
        {trackingThis
          ? 'Stop & save ride'
          : trackingOther
            ? 'Track this vehicle instead'
            : 'Start ride'}
      </button>

      <p className="muted small">
        {r.gps && r.gps.periodsUsed > 0
          ? `Calibrated to your meter from ${r.gps.periodsUsed} full-tank period${r.gps.periodsUsed > 1 ? 's' : ''} (×${factor.toFixed(3)}).`
          : 'GPS learns your meter after one full tank to full tank tracked with GPS. Meter readings at fill-ups stay the real source for km/L.'}
        {!isNativeApp && ' For tracking with the screen off, use the RideLog Android app.'}
      </p>
    </section>
  );
}
