import { useCallback, useEffect, useMemo, useState } from 'react';
import { compareToAverage } from '../../shared/calc';
import type { VehicleReport } from '../../shared/types';
import { api } from '../api';
import { LazyChart } from '../charts/LazyChart';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { BikeLogo } from '../components/BikeLogo';
import { FuelLeftCard } from '../components/FuelLeftCard';
import { RideTrackerCard } from '../components/RideTrackerCard';
import { Icon } from '../components/Icon';
import { EmptyState, ErrorBox, Skeleton, SkeletonCards, StatCard } from '../components/ui';
import { VehicleSwitcher } from '../components/VehicleSwitcher';
import {
  capitalize,
  fixed,
  formatDate,
  money,
  num,
  perLiter,
  shortDate,
  todayISO,
  unitLabel,
} from '../format';
import { errorText, useApp } from '../store';

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function longToday(): string {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

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
  const u = settings.distance_unit;
  const cur = settings.currency;
  const fmt1 = useCallback((n: number) => fixed(n, 1), []);
  const fmtMoney = useCallback((n: number) => money(n, cur), [cur]);
  const fmtInt = useCallback((n: number) => num(n, 0), []);

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
      <div className="stack">
        <Greeting />
        <EmptyState
          title="Add your first vehicle to start"
          text="Tell RideLog about your bike, scooter or car. Then log each fill-up to see your mileage."
          action={
            <a href="#/vehicles?new=1" className="btn btn-primary">
              <Icon name="plus" /> Add a vehicle
            </a>
          }
        />
      </div>
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
      <Greeting />
      <VehicleSwitcher vehicles={activeVehicles} value={selected} onChange={setSelected} />
      {error && <ErrorBox message={error} onRetry={load} />}
      {!reports && !error && (
        <>
          <Skeleton height={180} radius={20} />
          <SkeletonCards />
        </>
      )}
      {reports && (current ? vehicleView(current) : allView(reports))}
    </div>
  );

  function quickActions(r: VehicleReport | null) {
    return (
      <div className="quick">
        <a
          href={`#/add${r ? `?vehicle=${r.vehicle.id}` : ''}`}
          className="btn btn-primary btn-big quick-main"
        >
          <Icon name="plus" /> Add fuel
        </a>
        {r && (
          <button
            type="button"
            className={`btn btn-big ${r.noRideToday ? 'btn-pressed' : 'btn-secondary'}`}
            aria-pressed={r.noRideToday}
            disabled={busy}
            onClick={() => toggleNoRide(r)}
          >
            <Icon name={r.noRideToday ? 'check' : 'noride'} />
            {r.noRideToday ? 'No ride today ✓' : 'No ride today'}
          </button>
        )}
      </div>
    );
  }

  function vehicleView(r: VehicleReport) {
    const s = r.summary;
    const diff =
      s.lastKmPerLiter !== null && s.periodCount > 1
        ? compareToAverage(s.lastKmPerLiter, s.avgKmPerLiter)
        : null;
    const rounded = diff === null ? 0 : Math.round(diff);

    return (
      <>
        <section className="hero" style={{ ['--vc' as string]: r.vehicle.color_tag }}>
          <div className="hero-top">
            <span className="hero-chip">
              <span className="dot" style={{ background: r.vehicle.color_tag }} />
              {r.vehicle.name}
            </span>
            <span className="hero-meta">
              {capitalize(r.vehicle.type)}
              {r.vehicle.plate_number ? ` · ${r.vehicle.plate_number}` : ''}
            </span>
          </div>
          <div className="hero-main">
            <div>
              <div className="hero-label">Average mileage</div>
              {s.periodCount ? (
                <div className="hero-value">
                  <AnimatedNumber value={s.avgKmPerLiter} format={fmt1} />
                  <span className="hero-unit">{perLiter(u)}</span>
                </div>
              ) : (
                <div className="hero-value hero-empty">Not yet</div>
              )}
              {diff !== null ? (
                <span className={`hero-badge ${rounded >= 0 ? 'up' : 'down'}`}>
                  {rounded >= 0 ? '▲' : '▼'} Last fill {Math.abs(rounded)}%{' '}
                  {rounded >= 0 ? 'better' : 'worse'}
                </span>
              ) : (
                <span className="hero-badge">
                  {r.entryCount
                    ? 'Fill the tank full again to see results'
                    : 'Add your first full tank'}
                </span>
              )}
            </div>
            <BikeLogo size={124} className="hero-bike" />
          </div>
          <div className="hero-road" aria-hidden="true" />
        </section>

        {quickActions(r)}

        <div className="stat-grid">
          <StatCard
            icon="gauge"
            label="Last mileage"
            amount={s.lastKmPerLiter}
            format={(n) => `${fixed(n)} ${perLiter(u)}`}
          />
          <StatCard
            icon="wallet"
            label={`Cost per ${unitLabel(u)}`}
            amount={s.periodCount ? s.avgCostPerKm : null}
            format={fmtMoney}
          />
          <StatCard icon="fuel" label="Spent this month" amount={r.monthSpent} format={fmtMoney} />
          <StatCard
            icon="road"
            label={`${unitLabel(u)} tracked`}
            amount={s.totalDistance}
            format={fmtInt}
          />
        </div>

        <RideTrackerCard r={r} />

        {r.entryCount > 0 && <FuelLeftCard key={r.vehicle.id} r={r} />}

        {r.pending && (
          <div className="alert alert-info">
            <strong>Waiting for next full tank.</strong> {r.pending.partialFills} part fill
            {r.pending.partialFills > 1 ? 's' : ''} ({fixed(r.pending.liters, 2)} L) since{' '}
            {formatDate(r.pending.startDate, settings.date_format)} will be counted when you next
            fill the tank full.
          </div>
        )}

        {r.periods.length > 1 && (
          <TrendCard periods={r.periods} unit={u} color={r.vehicle.color_tag} />
        )}

        {r.lastEntry && (
          <p className="muted small center">
            Last fill-up {formatDate(r.lastEntry.entry_date, settings.date_format)} at{' '}
            {num(r.lastEntry.odometer, 1)} {unitLabel(u)}
          </p>
        )}
        <p className="note">
          Mileage ({perLiter(u)}) comes from your meter reading, so no-ride days do not change it.
          No-ride days only change the per-day numbers.
        </p>
      </>
    );
  }

  function allView(list: VehicleReport[]) {
    const spent = list.reduce((a, r) => a + r.monthSpent, 0);
    const dist = list.reduce((a, r) => a + r.summary.totalDistance, 0);
    const cost = list.reduce((a, r) => a + r.summary.totalCost, 0);
    return (
      <>
        <section className="hero">
          <div className="hero-top">
            <span className="hero-chip">All vehicles</span>
            <span className="hero-meta">{list.length} active</span>
          </div>
          <div className="hero-main">
            <div>
              <div className="hero-label">Spent this month</div>
              <div className="hero-value">
                <AnimatedNumber value={spent} format={fmtMoney} />
              </div>
              <span className="hero-badge">
                {num(dist, 0)} {unitLabel(u)} tracked in total
              </span>
            </div>
            <BikeLogo size={124} className="hero-bike" />
          </div>
          <div className="hero-road" aria-hidden="true" />
        </section>

        {quickActions(null)}

        <div className="stat-grid">
          <StatCard
            icon="wallet"
            label={`Cost per ${unitLabel(u)}`}
            amount={dist ? cost / dist : null}
            format={fmtMoney}
          />
          <StatCard icon="fuel" label="Total spent" amount={cost} format={fmtMoney} />
        </div>

        <h2 className="section-title">Your vehicles</h2>
        <div className="list">
          {list.map((r) => (
            <button
              key={r.vehicle.id}
              type="button"
              className="card vehicle-row"
              onClick={() => setSelected(r.vehicle.id)}
            >
              <span
                className="color-bar"
                style={{ background: r.vehicle.color_tag }}
                aria-hidden="true"
              />
              <span className="vr-avatar" style={{ color: r.vehicle.color_tag }}>
                <BikeLogo size={34} animated={false} />
              </span>
              <span className="vr-main">
                <strong>{r.vehicle.name}</strong>
                <span className="muted small">
                  {r.summary.periodCount
                    ? `Avg ${fixed(r.summary.avgKmPerLiter)} ${perLiter(u)} · last ${fixed(r.summary.lastKmPerLiter)}`
                    : r.entryCount
                      ? 'Waiting for the next full tank'
                      : 'No fill-ups yet'}
                </span>
              </span>
              <span className="vr-side">
                <span className="small muted">This month</span>
                <strong>{money(r.monthSpent, cur)}</strong>
              </span>
            </button>
          ))}
        </div>
        <p className="muted small center">Pick a vehicle to mark today as a no-ride day.</p>
      </>
    );
  }
}

function Greeting() {
  return (
    <header className="greet">
      <p className="greet-hello">{greeting()} 👋</p>
      <p className="greet-date">{longToday()}</p>
    </header>
  );
}

function TrendCard({
  periods: all,
  unit,
  color,
}: {
  periods: VehicleReport['periods'];
  unit: 'km' | 'miles';
  color: string;
}) {
  const periods = useMemo(() => all.slice(-10), [all]);
  const labels = useMemo(() => periods.map((p) => shortDate(p.endDate)), [periods]);
  const series = useMemo(
    () => [
      {
        label: perLiter(unit),
        data: periods.map((p) => Math.round(p.kmPerLiter * 10) / 10),
        color,
      },
    ],
    [periods, unit, color],
  );
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Mileage trend</h2>
        <span className="muted small">Last {periods.length} full tanks</span>
      </div>
      <LazyChart
        type="line"
        labels={labels}
        series={series}
        height={180}
        ariaLabel={`Mileage trend in ${perLiter(unit)}`}
      />
    </section>
  );
}
