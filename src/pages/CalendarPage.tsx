import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  NO_RIDE_REASONS,
  type FuelEntry,
  type NoRideDay,
  type NoRideReason,
} from '../../shared/types';
import { checkNoRideDay, expandRange } from '../../shared/validate';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { EmptyState, ErrorBox, Field, Modal, Skeleton } from '../components/ui';
import { VehicleSwitcher } from '../components/VehicleSwitcher';
import {
  addMonths,
  capitalize,
  fixed,
  formatDate,
  lastDayOfMonth,
  monthLabel,
  num,
  todayISO,
  unitLabel,
} from '../format';
import { errorText, useApp } from '../store';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function ReasonPicker({
  value,
  onChange,
}: {
  value: NoRideReason | '';
  onChange: (r: NoRideReason | '') => void;
}) {
  return (
    <div className="chips wrap" role="radiogroup" aria-label="Reason (optional)">
      {(['', ...NO_RIDE_REASONS] as const).map((r) => (
        <button
          key={r || 'none'}
          type="button"
          role="radio"
          aria-checked={value === r}
          className={`chip${value === r ? ' active' : ''}`}
          onClick={() => onChange(r)}
        >
          {r ? capitalize(r) : 'No reason'}
        </button>
      ))}
    </div>
  );
}

export default function CalendarPage() {
  const { activeVehicles, vehicles, selected, setSelected, settings, toast, bump, dataVersion } =
    useApp();
  const vehicleId = activeVehicles.some((v) => v.id === selected)
    ? selected
    : activeVehicles[0]?.id;
  const today = todayISO();
  const [month, setMonth] = useState(today.slice(0, 7) + '-01');
  const [entries, setEntries] = useState<FuelEntry[] | null>(null);
  const [days, setDays] = useState<NoRideDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [reason, setReason] = useState<NoRideReason | ''>('');
  const [rangeFrom, setRangeFrom] = useState(today);
  const [rangeTo, setRangeTo] = useState(today);
  const [busy, setBusy] = useState(false);

  const monthEnd = lastDayOfMonth(month);

  const load = useCallback(() => {
    if (!vehicleId) return;
    setError(null);
    setDays(null);
    // Two small requests: all fill-ups (needed for the "meter moved" check) and this month's no-ride days.
    Promise.all([api.fuelList(vehicleId), api.noRide(vehicleId, month, monthEnd)])
      .then(([f, d]) => {
        setEntries(f);
        setDays(d);
      })
      .catch((e) => setError(errorText(e)));
  }, [vehicleId, month, monthEnd]);

  useEffect(() => {
    load();
  }, [load, dataVersion]);

  const noRideMap = useMemo(() => new Map((days ?? []).map((d) => [d.day, d])), [days]);
  const fuelByDay = useMemo(() => {
    const m = new Map<string, FuelEntry[]>();
    for (const e of entries ?? []) m.set(e.entry_date, [...(m.get(e.entry_date) ?? []), e]);
    return m;
  }, [entries]);

  if (vehicles !== null && !activeVehicles.length) {
    return (
      <EmptyState
        icon="calendar"
        title="Add a vehicle first"
        text="The calendar shows riding days for each vehicle."
        action={
          <a href="#/vehicles?new=1" className="btn btn-primary">
            Add a vehicle
          </a>
        }
      />
    );
  }

  const [y, m] = month.split('-').map(Number);
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Monday first
  const allDays = expandRange(month, monthEnd);

  async function mark(from: string, to: string) {
    if (!vehicleId) return;
    setBusy(true);
    try {
      const res = await api.addNoRide(vehicleId, from, to, reason || null);
      const msg =
        res.added.length === 1
          ? `Marked ${formatDate(res.added[0], settings.date_format)} as no-ride.`
          : `Marked ${res.added.length} days as no-ride.`;
      toast(
        res.skipped.length
          ? `${msg} ${res.skipped.length} day(s) skipped because you rode then.`
          : msg,
        {
          kind: 'success',
        },
      );
      setOpenDay(null);
      setRangeOpen(false);
      bump();
    } catch (e) {
      toast(errorText(e), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function unmark(from: string, to?: string) {
    if (!vehicleId) return;
    setBusy(true);
    try {
      const res = await api.removeNoRide(vehicleId, from, to);
      toast(
        res.removed
          ? `Removed ${res.removed} no-ride day(s).`
          : 'There were no no-ride days in that range.',
      );
      setOpenDay(null);
      setRangeOpen(false);
      bump();
    } catch (e) {
      toast(errorText(e), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  }

  const dayInfo = openDay ? noRideMap.get(openDay) : undefined;
  const dayFuel = openDay ? (fuelByDay.get(openDay) ?? []) : [];
  const blocked = openDay && entries ? checkNoRideDay(openDay, entries) : null;

  return (
    <div className="stack">
      <VehicleSwitcher
        vehicles={activeVehicles}
        value={vehicleId ?? ''}
        onChange={setSelected}
        allowAll={false}
      />
      {error && <ErrorBox message={error} onRetry={load} />}

      <section className="card">
        <div className="cal-head">
          <button
            type="button"
            className="icon-btn"
            aria-label="Previous month"
            onClick={() => setMonth(addMonths(month, -1))}
          >
            <Icon name="left" />
          </button>
          <h2 className="cal-title" aria-live="polite">
            {monthLabel(month, true)}
          </h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="Next month"
            onClick={() => setMonth(addMonths(month, 1))}
          >
            <Icon name="right" />
          </button>
        </div>

        <div
          className="cal-grid"
          role="grid"
          aria-label={`Calendar for ${monthLabel(month, true)}`}
        >
          {WEEKDAYS.map((d) => (
            <div key={d} className="cal-wd" role="columnheader">
              {d}
            </div>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <div key={`b${i}`} aria-hidden="true" />
          ))}
          {allDays.map((d) => {
            if (!days) return <Skeleton key={d} height={44} />;
            const nr = noRideMap.has(d);
            const fuel = fuelByDay.has(d);
            const label = [
              formatDate(d, settings.date_format),
              nr && 'no-ride day',
              fuel && 'fill-up day',
            ]
              .filter(Boolean)
              .join(', ');
            return (
              <button
                key={d}
                type="button"
                role="gridcell"
                className={`cal-day${nr ? ' no-ride' : ''}${fuel ? ' has-fuel' : ''}${d === today ? ' today' : ''}`}
                aria-label={label}
                onClick={() => {
                  setReason('');
                  setOpenDay(d);
                }}
              >
                <span>{Number(d.slice(8))}</span>
                {fuel && <Icon name="fuel" size={14} />}
              </button>
            );
          })}
        </div>

        <div className="legend" aria-label="Legend">
          <span>
            <span className="lg-box lg-ride" /> Riding day
          </span>
          <span>
            <span className="lg-box lg-noride" /> No-ride day
          </span>
          <span>
            <Icon name="fuel" size={14} /> Fill-up
          </span>
          <span>
            <span className="lg-box lg-today" /> Today
          </span>
        </div>
      </section>

      <button
        type="button"
        className="btn btn-secondary btn-block"
        onClick={() => {
          setReason('');
          setRangeFrom(today);
          setRangeTo(today);
          setRangeOpen(true);
        }}
      >
        <Icon name="calendar" /> Mark several days (e.g. a trip)
      </button>
      <p className="muted small center">Tap a day to mark or unmark it as a no-ride day.</p>

      <Modal
        open={Boolean(openDay)}
        title={openDay ? formatDate(openDay, settings.date_format) : ''}
        onClose={() => setOpenDay(null)}
      >
        <div className="stack">
          {dayFuel.map((e) => (
            <div key={e.id} className="mini-entry">
              <Icon name="fuel" size={16} /> {fixed(e.liters, 2)} L at {num(e.odometer, 1)}{' '}
              {unitLabel(settings.distance_unit)}
              {!e.is_full_tank && ' (part fill)'}
            </div>
          ))}
          {dayInfo ? (
            <>
              <p>
                This is a <strong>no-ride day</strong>
                {dayInfo.reason ? ` (${dayInfo.reason})` : ''}.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-block"
                disabled={busy}
                onClick={() => unmark(openDay!)}
              >
                I rode this day (unmark)
              </button>
            </>
          ) : blocked ? (
            <div className="alert alert-info">{blocked}</div>
          ) : (
            <>
              <p className="muted">Did you not ride on this day? Pick a reason if you like.</p>
              <ReasonPicker value={reason} onChange={setReason} />
              <button
                type="button"
                className="btn btn-primary btn-block"
                disabled={busy}
                onClick={() => mark(openDay!, openDay!)}
              >
                Mark as no-ride day
              </button>
            </>
          )}
        </div>
      </Modal>

      <Modal open={rangeOpen} title="Mark several days" onClose={() => setRangeOpen(false)}>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            mark(rangeFrom, rangeTo);
          }}
        >
          <div className="row-2">
            <Field label="From" htmlFor="r-from">
              <input
                id="r-from"
                type="date"
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value)}
                required
              />
            </Field>
            <Field label="To" htmlFor="r-to">
              <input
                id="r-to"
                type="date"
                value={rangeTo}
                min={rangeFrom}
                onChange={(e) => setRangeTo(e.target.value)}
                required
              />
            </Field>
          </div>
          <ReasonPicker value={reason} onChange={setReason} />
          <p className="muted small">Days where a fill-up shows you rode will be skipped.</p>
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={busy || rangeTo < rangeFrom}
          >
            Mark as no-ride
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            disabled={busy || rangeTo < rangeFrom}
            onClick={() => unmark(rangeFrom, rangeTo)}
          >
            Unmark these days
          </button>
        </form>
      </Modal>
    </div>
  );
}
