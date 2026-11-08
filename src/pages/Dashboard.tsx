import { useCallback, useEffect, useMemo, useState } from 'react';
import { compareToAverage } from '../../shared/calc';
import type { VehicleReport } from '../../shared/types';
import { api } from '../api';
import { LazyChart } from '../charts/LazyChart';
import { Icon } from '../components/Icon';
import { EmptyState, ErrorBox, SkeletonCards, StatCard } from '../components/ui';
import { VehicleSwitcher } from '../components/VehicleSwitcher';
import {
  fixed,
  formatDate,
  money,
  num,
  percentText,
  perLiter,
  shortDate,
  todayISO,
  unitLabel,
} from '../format';
import { errorText, useApp } from '../store';

export function Dashboard() {
  const {
    activeVehicles,
    vehicles,
    selected,
    setSelected,
    settings,
    dataVersion,
    toast,
    bump,
    loadError,
    reloadVehicles,
  } = useApp();
  const [reports, setReports] = useState<VehicleReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const today = todayISO();

  const load = useCallback(() => {
    setError(null);
    api
      .summary({ today })
      .then((r) => setReports(r.reports))
      .catch((e) => setError(errorText(e)));
  }, [today]);

  useEffect(() => {
    load();
  }, [load, dataVersion]);

  if (loadError) return <ErrorBox message={loadError} onRetry={reloadVehicles} />;
  if (vehicles === null) return <SkeletonCards />;
  if (!activeVehicles.length) {
    return (
      <EmptyState
        title="Add your first vehicle to start"
        text="Tell RideLog about your bike, scooter or car. Then log each fill-up to see your mileage."
        action={
          <a href="#/vehicles?new=1" className="btn btn-primary">
            <Icon name="plus" /> Add a vehicle
          </a>
        }
      />
    );
  }

  const current =
    selected === 'all' ? null : (reports?.find((r) => r.vehicle.id === selected) ?? null);

  async function toggleNoRide(r: VehicleReport) {
    setBusy(true);
    const id = r.vehicle.id;
    try {
      if (r.noRideToday) {
        await api.removeNoRide(id, today);
        toast('Okay, today counts as a riding day again.');
      } else {
        await api.addNoRide(id, today);
        toast(`Marked today as a no-ride day for ${r.vehicle.name}.`, {
          kind: 'success',
          action: {
            label: 'Undo',
            onClick: () => {
              api.removeNoRide(id, today).then(bump, (e) => toast(errorText(e), { kind: 'error' }));
            },
          },
        });
      }
      bump();
    } catch (e) {
      toast(errorText(e), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <VehicleSwitcher vehicles={activeVehicles} value={selected} onChange={setSelected} />
      {error && <ErrorBox message={error} onRetry={load} />}
      {!reports && !error && <SkeletonCards />}
      {reports && (current ? vehicleView(current) : allView(reports, setSelected))}

      <a
        href={`#/add${current ? `?vehicle=${current.vehicle.id}` : ''}`}
        className="btn btn-primary btn-big btn-block"
      >
        <Icon name="plus" /> Add fuel
      </a>

      {current && (
        <button
          type="button"
          className={`btn btn-block ${current.noRideToday ? 'btn-pressed' : 'btn-secondary'}`}
          aria-pressed={current.noRideToday}
          disabled={busy}
          onClick={() => toggleNoRide(current)}
        >
          <Icon name={current.noRideToday ? 'check' : 'noride'} />
          {current.noRideToday ? 'Today is marked as no-ride (tap to undo)' : "I didn't ride today"}
        </button>
      )}
      {!current && reports && (
        <p className="muted small center">Pick a vehicle above to mark today as a no-ride day.</p>
      )}
    </div>
  );

  function vehicleView(r: VehicleReport) {
    const u = settings.distance_unit;
    const s = r.summary;

    const diff =
      s.lastKmPerLiter !== null ? compareToAverage(s.lastKmPerLiter, s.avgKmPerLiter) : null;

    if (!r.entryCount) {
      return (
        <EmptyState
          icon="fuel"
          title="No fill-ups yet"
          text={`Add your first fill-up for ${r.vehicle.name}. Fill the tank full, then add it here.`}
        />
      );
    }
    return (
      <>
        <div className="stat-grid">
          <StatCard
            label="Last mileage"
            value={s.lastKmPerLiter !== null ? `${fixed(s.lastKmPerLiter)} ${perLiter(u)}` : '–'}
            hint={diff !== null && s.periodCount > 1 ? percentText(diff) : undefined}
            tone={diff !== null && Math.round(diff) !== 0 ? (diff > 0 ? 'good' : 'bad') : undefined}
          />
          <StatCard
            label="Average mileage"
            value={s.periodCount ? `${fixed(s.avgKmPerLiter)} ${perLiter(u)}` : '–'}
          />
          <StatCard
            label={`Cost per ${unitLabel(u)}`}
            value={s.periodCount ? money(s.avgCostPerKm, settings.currency) : '–'}
          />
          <StatCard label="Spent this month" value={money(r.monthSpent, settings.currency)} />
        </div>

        {!s.periodCount && (
          <div className="alert alert-info">
            Your first full tank is your starting point. Fill the tank full again next time to see
            your first mileage.
          </div>
        )}
        {r.pending && (
          <div className="alert alert-info">
            <strong>Waiting for next full tank.</strong> {r.pending.partialFills} part fill
            {r.pending.partialFills > 1 ? 's' : ''} ({fixed(r.pending.liters, 2)} L) since{' '}
            {formatDate(r.pending.startDate, settings.date_format)} will be counted when you next
            fill the tank full.
          </div>
        )}

        {r.periods.length > 1 && <TrendCard periods={r.periods} unit={u} />}

        {r.lastEntry && (
          <p className="muted small">
            Last fill-up: {formatDate(r.lastEntry.entry_date, settings.date_format)} at{' '}
            {num(r.lastEntry.odometer, 1)} {unitLabel(u)}.
          </p>
        )}
        <p className="note">
          Mileage ({perLiter(u)}) comes from your meter reading, so no-ride days do not change it.
          No-ride days only change the per-day numbers.
        </p>
      </>
    );
  }

  function allView(reports: VehicleReport[], onPick: (id: string) => void) {
    const u = settings.distance_unit;
    const spent = reports.reduce((a, r) => a + r.monthSpent, 0);
    const dist = reports.reduce((a, r) => a + r.summary.totalDistance, 0);
    const cost = reports.reduce((a, r) => a + r.summary.totalCost, 0);
    return (
      <>
        <div className="stat-grid">
          <StatCard label="Spent this month" value={money(spent, settings.currency)} />
          <StatCard label={`Total ${unitLabel(u)} tracked`} value={num(dist, 0)} />
          <StatCard
            label={`Cost per ${unitLabel(u)}`}
            value={dist ? money(cost / dist, settings.currency) : '–'}
          />
          <StatCard label="Vehicles" value={String(reports.length)} />
        </div>
        <div className="list">
          {reports.map((r) => (
            <button
              key={r.vehicle.id}
              type="button"
              className="card vehicle-row"
              onClick={() => onPick(r.vehicle.id)}
            >
              <span
                className="color-bar"
                style={{ background: r.vehicle.color_tag }}
                aria-hidden="true"
              />
              <span className="vr-main">
                <strong>{r.vehicle.name}</strong>
                <span className="muted small">
                  {r.summary.periodCount
                    ? `Last ${fixed(r.summary.lastKmPerLiter)} · Avg ${fixed(r.summary.avgKmPerLiter)} ${perLiter(u)}`
                    : r.entryCount
                      ? 'Waiting for the next full tank'
                      : 'No fill-ups yet'}
                </span>
              </span>
              <span className="vr-side">
                <span className="small muted">This month</span>
                <strong>{money(r.monthSpent, settings.currency)}</strong>
              </span>
            </button>
          ))}
        </div>
      </>
    );
  }
}

function TrendCard({
  periods: all,
  unit,
}: {
  periods: VehicleReport['periods'];
  unit: 'km' | 'miles';
}) {
  const periods = useMemo(() => all.slice(-10), [all]);
  const labels = useMemo(() => periods.map((p) => shortDate(p.endDate)), [periods]);
  const series = useMemo(
    () => [{ label: perLiter(unit), data: periods.map((p) => Math.round(p.kmPerLiter * 10) / 10) }],
    [periods, unit],
  );
  return (
    <section className="card">
      <h2 className="card-title">Mileage, last {periods.length} fills</h2>
      <LazyChart
        type="line"
        labels={labels}
        series={series}
        height={170}
        ariaLabel={`Mileage trend in ${perLiter(unit)}`}
      />
    </section>
  );
}
