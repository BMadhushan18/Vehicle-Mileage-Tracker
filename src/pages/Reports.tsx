import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Period, VehicleReport } from '../../shared/types';
import { api } from '../api';
import { LazyChart } from '../charts/LazyChart';
import type { Series } from '../charts/Charts';
import { Icon } from '../components/Icon';
import { EmptyState, ErrorBox, Field, SkeletonCards, StatCard } from '../components/ui';
import { VehicleSwitcher } from '../components/VehicleSwitcher';
import { download, toCsv } from '../csv';
import {
  addMonths,
  fixed,
  formatDate,
  money,
  monthLabel,
  num,
  perLiter,
  shortDate,
  todayISO,
  unitLabel,
} from '../format';
import { errorText, useApp } from '../store';

type RangeKey = 'month' | '3m' | 'year' | 'all' | 'custom';
const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: '3m', label: 'Last 3 months' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom' },
];

function rangeFor(
  key: RangeKey,
  today: string,
  cFrom: string,
  cTo: string,
): { from?: string; to?: string } {
  switch (key) {
    case 'month':
      return { from: today.slice(0, 8) + '01', to: today };
    case '3m':
      return { from: addMonths(today, -2), to: today };
    case 'year':
      return { from: today.slice(0, 4) + '-01-01', to: today };
    case 'custom':
      return { from: cFrom || undefined, to: cTo || undefined };
    default:
      return {};
  }
}

export default function Reports() {
  const { activeVehicles, vehicles, selected, setSelected, settings, dataVersion } = useApp();
  const today = todayISO();
  const [rangeKey, setRangeKey] = useState<RangeKey>('3m');
  const [cFrom, setCFrom] = useState(addMonths(today, -2));
  const [cTo, setCTo] = useState(today);
  const [reports, setReports] = useState<VehicleReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => rangeFor(rangeKey, today, cFrom, cTo), [rangeKey, today, cFrom, cTo]);
  const vehicleId =
    selected !== 'all' && activeVehicles.some((v) => v.id === selected) ? selected : 'all';

  const load = useCallback(() => {
    setError(null);
    setReports(null);
    const req =
      vehicleId === 'all'
        ? api.summary(range).then((r) => r.reports)
        : api.report(vehicleId, range).then((r) => [r]);
    req.then(setReports).catch((e) => setError(errorText(e)));
  }, [vehicleId, range]);

  useEffect(() => {
    load();
  }, [load, dataVersion]);

  if (vehicles !== null && !activeVehicles.length) {
    return (
      <EmptyState
        icon="chart"
        title="No reports yet"
        text="Add a vehicle and a few fill-ups to see your reports."
        action={
          <a href="#/vehicles?new=1" className="btn btn-primary">
            Add a vehicle
          </a>
        }
      />
    );
  }

  const u = settings.distance_unit;
  const cur = settings.currency;

  function exportCsv() {
    if (!reports) return;
    const rows = reports.flatMap((r) =>
      r.periods.map((p) => [
        r.vehicle.name,
        p.startDate,
        p.endDate,
        fixed(p.distance, 1),
        fixed(p.fuelUsed, 2),
        fixed(p.kmPerLiter, 2),
        fixed(p.cost, 2),
        fixed(p.costPerKm, 2),
        p.ridingDays,
        p.noRideDays,
        fixed(p.kmPerRidingDay, 1),
        fixed(p.costPerRidingDay, 2),
      ]),
    );
    const d = unitLabel(u);
    const csv = toCsv(
      [
        'Vehicle',
        'Start date',
        'End date',
        `Distance (${d})`,
        'Liters',
        `${d}/L`,
        `Cost (${cur})`,
        `Cost per ${d}`,
        'Riding days',
        'No-ride days',
        `${d} per riding day`,
        'Cost per riding day',
      ],
      rows,
    );
    download(`ridelog-report-${today}.csv`, csv);
  }

  return (
    <div className="stack">
      <VehicleSwitcher vehicles={activeVehicles} value={vehicleId} onChange={setSelected} />
      <div className="chips wrap" role="radiogroup" aria-label="Date range">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            role="radio"
            aria-checked={rangeKey === r.key}
            className={`chip${rangeKey === r.key ? ' active' : ''}`}
            onClick={() => setRangeKey(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>
      {rangeKey === 'custom' && (
        <div className="row-2">
          <Field label="From" htmlFor="rp-from">
            <input
              id="rp-from"
              type="date"
              value={cFrom}
              max={cTo}
              onChange={(e) => setCFrom(e.target.value)}
            />
          </Field>
          <Field label="To" htmlFor="rp-to">
            <input
              id="rp-to"
              type="date"
              value={cTo}
              min={cFrom}
              onChange={(e) => setCTo(e.target.value)}
            />
          </Field>
        </div>
      )}

      {error && <ErrorBox message={error} onRetry={load} />}
      {!reports && !error && <SkeletonCards count={6} />}
      {reports &&
        (vehicleId === 'all' ? (
          <CompareView reports={reports} />
        ) : (
          reports[0] && <SingleView r={reports[0]} />
        ))}

      {reports && reports.some((r) => r.periods.length) && (
        <button type="button" className="btn btn-secondary btn-block" onClick={exportCsv}>
          <Icon name="download" /> Export to CSV
        </button>
      )}
    </div>
  );
}

function SingleView({ r }: { r: VehicleReport }) {
  const { settings } = useApp();
  const u = settings.distance_unit;
  const cur = settings.currency;
  const s = r.summary;
  if (!s.periodCount) {
    return (
      <>
        <EmptyState
          icon="chart"
          title="No results in this time"
          text="A result appears each time you fill the tank full after an earlier full tank. Try a longer date range."
        />
        {r.pending && <PendingNote r={r} />}
      </>
    );
  }
  return (
    <>
      <div className="stat-grid">
        <StatCard label="Average mileage" value={`${fixed(s.avgKmPerLiter)} ${perLiter(u)}`} />
        <StatCard label={`Cost per ${unitLabel(u)}`} value={money(s.avgCostPerKm, cur)} />
        <StatCard label="Distance" value={`${num(s.totalDistance, 0)} ${unitLabel(u)}`} />
        <StatCard label="Fuel used" value={`${fixed(s.totalFuel, 1)} L`} />
        <StatCard label="Spent" value={money(s.totalCost, cur)} />
        <StatCard label={`${unitLabel(u)} per riding day`} value={fixed(s.avgKmPerRidingDay)} />
        <StatCard label="Cost per riding day" value={money(s.avgCostPerRidingDay, cur)} />
        <StatCard label="Riding / no-ride days" value={`${s.ridingDays} / ${s.noRideDays}`} />
        <StatCard
          label="Best fill"
          value={s.best ? `${fixed(s.best.kmPerLiter)} ${perLiter(u)}` : '–'}
          hint={s.best ? `ended ${formatDate(s.best.endDate, settings.date_format)}` : undefined}
          tone="good"
        />
        <StatCard
          label="Worst fill"
          value={s.worst ? `${fixed(s.worst.kmPerLiter)} ${perLiter(u)}` : '–'}
          hint={s.worst ? `ended ${formatDate(s.worst.endDate, settings.date_format)}` : undefined}
          tone="bad"
        />
      </div>
      <p className="note">
        Mileage ({perLiter(u)}) comes from your meter reading, so no-ride days do not change it.
        No-ride days only change the per-day numbers.
      </p>
      {r.pending && <PendingNote r={r} />}
      <SingleCharts r={r} />
      <PeriodTable periods={s.monthly.length ? r.periods : []} />
    </>
  );
}

function PendingNote({ r }: { r: VehicleReport }) {
  const { settings } = useApp();
  return (
    <div className="alert alert-info">
      <strong>Waiting for next full tank:</strong> {r.pending!.partialFills} part fill(s),{' '}
      {fixed(r.pending!.liters, 2)} L since {formatDate(r.pending!.startDate, settings.date_format)}
      .
    </div>
  );
}

function SingleCharts({ r }: { r: VehicleReport }) {
  const { settings } = useApp();
  const u = settings.distance_unit;
  const cur = settings.currency;
  const data = useMemo(() => {
    const m = r.summary.monthly;
    return {
      trendLabels: r.periods.map((p) => shortDate(p.endDate)),
      trend: [
        {
          label: perLiter(u),
          data: r.periods.map((p) => Math.round(p.kmPerLiter * 10) / 10),
          color: r.vehicle.color_tag,
        },
      ],
      monthLabels: m.map((x) => monthLabel(x.month)),
      spend: [
        {
          label: 'Spent',
          data: m.map((x) => Math.round(x.cost * 100) / 100),
          color: r.vehicle.color_tag,
        },
      ],
      days: [
        { label: 'Riding days', data: m.map((x) => x.ridingDays), color: '#22C55E', stack: 'd' },
        { label: 'No-ride days', data: m.map((x) => x.noRideDays), color: '#94A3B8', stack: 'd' },
      ] as Series[],
    };
  }, [r, u]);
  const moneyFmt = useCallback((n: number) => money(n, cur), [cur]);
  return (
    <>
      <section className="card">
        <h2 className="card-title">Mileage trend</h2>
        <LazyChart
          type="line"
          labels={data.trendLabels}
          series={data.trend}
          ariaLabel="Mileage trend chart"
        />
      </section>
      <div className="grid-2">
        <section className="card">
          <h2 className="card-title">Money spent per month</h2>
          <LazyChart
            type="bar"
            labels={data.monthLabels}
            series={data.spend}
            valueFormat={moneyFmt}
            ariaLabel="Monthly spend chart"
          />
        </section>
        <section className="card">
          <h2 className="card-title">Riding vs no-ride days</h2>
          <LazyChart
            type="bar"
            labels={data.monthLabels}
            series={data.days}
            stacked
            ariaLabel="Riding and no-ride days chart"
          />
        </section>
      </div>
    </>
  );
}

function PeriodTable({ periods }: { periods: Period[] }) {
  const { settings } = useApp();
  const u = settings.distance_unit;
  const cur = settings.currency;
  const d = unitLabel(u);
  return (
    <section className="card">
      <h2 className="card-title">Each full tank</h2>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Fill-up results table">
        <table>
          <thead>
            <tr>
              <th scope="col">From</th>
              <th scope="col">To</th>
              <th scope="col">Distance</th>
              <th scope="col">Liters</th>
              <th scope="col">{d}/L</th>
              <th scope="col">Cost</th>
              <th scope="col">Cost/{d}</th>
              <th scope="col">Riding days</th>
              <th scope="col">No-ride</th>
              <th scope="col">{d}/riding day</th>
            </tr>
          </thead>
          <tbody>
            {[...periods].reverse().map((p) => (
              <tr key={p.endEntryId}>
                <td>{formatDate(p.startDate, settings.date_format)}</td>
                <td>{formatDate(p.endDate, settings.date_format)}</td>
                <td>{num(p.distance, 1)}</td>
                <td>{fixed(p.fuelUsed, 2)}</td>
                <td>
                  <strong>{fixed(p.kmPerLiter)}</strong>
                </td>
                <td>{money(p.cost, cur)}</td>
                <td>{money(p.costPerKm, cur)}</td>
                <td>{p.ridingDays}</td>
                <td>{p.noRideDays}</td>
                <td>{fixed(p.kmPerRidingDay)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CompareView({ reports }: { reports: VehicleReport[] }) {
  const { settings } = useApp();
  const u = settings.distance_unit;
  const cur = settings.currency;
  const charts = useMemo(() => {
    const months = [
      ...new Set(reports.flatMap((r) => r.summary.monthly.map((m) => m.month))),
    ].sort();
    return {
      kmplLabels: ['Average mileage'],
      kmpl: reports.map((r) => ({
        label: r.vehicle.name,
        data: [Math.round(r.summary.avgKmPerLiter * 10) / 10],
        color: r.vehicle.color_tag,
      })),
      monthLabels: months.map((m) => monthLabel(m)),
      spend: reports.map((r) => ({
        label: r.vehicle.name,
        data: months.map((m) => {
          const row = r.summary.monthly.find((x) => x.month === m);
          return row ? Math.round(row.cost * 100) / 100 : 0;
        }),
        color: r.vehicle.color_tag,
        stack: 's',
      })),
    };
  }, [reports]);
  const moneyFmt = useCallback((n: number) => money(n, cur), [cur]);
  const hasData = reports.some((r) => r.summary.periodCount);
  const d = unitLabel(u);

  return (
    <>
      <section className="card">
        <h2 className="card-title">Compare vehicles</h2>
        <div
          className="table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Vehicle comparison table"
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Vehicle</th>
                <th scope="col">{d}/L</th>
                <th scope="col">Distance</th>
                <th scope="col">Liters</th>
                <th scope="col">Spent</th>
                <th scope="col">Cost/{d}</th>
                <th scope="col">{d}/riding day</th>
                <th scope="col">Riding / no-ride</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const s = r.summary;
                return (
                  <tr key={r.vehicle.id}>
                    <th scope="row">
                      <span
                        className="dot"
                        style={{ background: r.vehicle.color_tag }}
                        aria-hidden="true"
                      />{' '}
                      {r.vehicle.name}
                    </th>
                    <td>
                      <strong>{s.periodCount ? fixed(s.avgKmPerLiter) : '–'}</strong>
                    </td>
                    <td>{num(s.totalDistance, 0)}</td>
                    <td>{fixed(s.totalFuel, 1)}</td>
                    <td>{money(s.totalCost, cur)}</td>
                    <td>{s.periodCount ? money(s.avgCostPerKm, cur) : '–'}</td>
                    <td>{s.periodCount ? fixed(s.avgKmPerRidingDay) : '–'}</td>
                    <td>
                      {s.ridingDays} / {s.noRideDays}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <p className="note">
        Mileage ({perLiter(u)}) comes from your meter reading, so no-ride days do not change it.
        No-ride days only change the per-day numbers.
      </p>
      {hasData ? (
        <div className="grid-2">
          <section className="card">
            <h2 className="card-title">Average mileage ({perLiter(u)})</h2>
            <LazyChart
              type="bar"
              labels={charts.kmplLabels}
              series={charts.kmpl}
              ariaLabel="Average mileage by vehicle"
            />
          </section>
          <section className="card">
            <h2 className="card-title">Money spent per month</h2>
            <LazyChart
              type="bar"
              labels={charts.monthLabels}
              series={charts.spend}
              stacked
              valueFormat={moneyFmt}
              ariaLabel="Monthly spend by vehicle"
            />
          </section>
        </div>
      ) : (
        <EmptyState
          icon="chart"
          title="No results in this time"
          text="Try a longer date range, or add more fill-ups."
        />
      )}
    </>
  );
}
