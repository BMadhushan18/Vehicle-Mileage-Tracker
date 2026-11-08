import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { compareToAverage, sortEntries } from '../../shared/calc';
import type { FuelEntry, SaveFuelResult } from '../../shared/types';
import { checkFuelEntry } from '../../shared/validate';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { EmptyState, ErrorBox, Field, Skeleton, Toggle } from '../components/ui';
import {
  fixed,
  formatDate,
  money,
  num,
  percentText,
  perLiter,
  todayISO,
  unitLabel,
} from '../format';
import { navigate } from '../router';
import { errorText, useApp } from '../store';

const toNum = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')));
const round2 = (n: number) => Math.round(n * 100) / 100;

function queryVehicle(): string | null {
  return new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('vehicle');
}

export function FuelForm({ editId }: { editId?: string | null }) {
  const { activeVehicles, vehicles, selected, settings, bump, toast } = useApp();
  const u = settings.distance_unit;

  const [vehicleId, setVehicleId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [odometer, setOdometer] = useState('');
  const [liters, setLiters] = useState('');
  const [price, setPrice] = useState('');
  const [total, setTotal] = useState('');
  const [totalTouched, setTotalTouched] = useState(false);
  const [full, setFull] = useState(true);
  const [station, setStation] = useState('');
  const [note, setNote] = useState('');

  const [entries, setEntries] = useState<FuelEntry[] | null>(null);
  const [gpsOdo, setGpsOdo] = useState<number | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(Boolean(editId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<SaveFuelResult | null>(null);

  // Pick a starting vehicle once vehicles are loaded.
  useEffect(() => {
    if (vehicleId || editId || !activeVehicles.length) return;
    const q = queryVehicle();
    const pick =
      activeVehicles.find((v) => v.id === q) ??
      activeVehicles.find((v) => v.id === selected) ??
      activeVehicles[0];
    setVehicleId(pick.id);
  }, [activeVehicles, selected, vehicleId, editId]);

  // Edit mode: load the entry.
  useEffect(() => {
    if (!editId) return;
    api
      .getFuel(editId)
      .then((e) => {
        setVehicleId(e.vehicle_id);
        setDate(e.entry_date);
        setOdometer(String(e.odometer));
        setLiters(String(e.liters));
        setPrice(String(e.price_per_liter));
        setTotal(String(e.total_cost));
        setTotalTouched(Math.abs(e.total_cost - round2(e.liters * e.price_per_liter)) > 0.009);
        setFull(Boolean(e.is_full_tank));
        setStation(e.station ?? '');
        setNote(e.note ?? '');
      })
      .catch((e) => setLoadError(errorText(e)))
      .finally(() => setLoadingEdit(false));
  }, [editId]);

  // Load this vehicle's fill-ups for hints and checks.
  useEffect(() => {
    if (!vehicleId) return;
    let alive = true;
    setEntries(null);
    api
      .fuelList(vehicleId)
      .then((list) => {
        if (!alive) return;
        setEntries(list);
        const last = sortEntries(list).at(-1);
        if (!editId && last) setPrice((p) => p || String(last.price_per_liter));
      })
      .catch((e) => alive && setLoadError(errorText(e)));
    return () => {
      alive = false;
    };
  }, [vehicleId, editId]);

  // GPS estimate of the meter right now, to help on fill-up day (add mode only).
  useEffect(() => {
    setGpsOdo(null);
    if (!vehicleId || editId) return;
    let alive = true;
    api
      .report(vehicleId, { today: todayISO() })
      .then((rep) => alive && setGpsOdo(rep.gps?.estimatedOdometer ?? null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [vehicleId, editId]);

  const vehicle = (vehicles ?? []).find((v) => v.id === vehicleId);
  const lastEntry = useMemo(() => {
    const others = (entries ?? []).filter((e) => e.id !== editId && e.entry_date <= date);
    return sortEntries(others).at(-1) ?? null;
  }, [entries, editId, date]);

  const autoTotal = round2(toNum(liters) * toNum(price));
  const totalValue = totalTouched ? toNum(total) : autoTotal;

  function changed() {
    setErrors([]);
    setWarnings([]);
  }

  function reset() {
    setResult(null);
    setDate(todayISO());
    setOdometer('');
    setLiters('');
    setTotal('');
    setTotalTouched(false);
    setFull(true);
    setStation('');
    setNote('');
    changed();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!vehicleId) return;
    const candidate = {
      id: editId ?? undefined,
      vehicle_id: vehicleId,
      entry_date: date,
      odometer: toNum(odometer),
      liters: toNum(liters),
      price_per_liter: toNum(price),
      total_cost: Number.isFinite(totalValue) ? totalValue : NaN,
      is_full_tank: full ? 1 : 0,
    };
    const check = checkFuelEntry(candidate, entries ?? [], {
      today: todayISO(),
      tankCapacity: vehicle?.tank_capacity_liters,
      startOdometer: vehicle?.start_odometer,
    });
    if (check.errors.length) {
      setErrors(check.errors);
      return;
    }
    // GPS cross-check: catch typos like 2135 instead of 21135 (today's fill-ups only).
    if (gpsOdo && lastEntry && date === todayISO()) {
      const expected = gpsOdo - lastEntry.odometer;
      const typed = candidate.odometer - lastEntry.odometer;
      if (expected > 20 && Math.abs(typed - expected) > Math.max(30, expected * 0.25)) {
        check.warnings.push(
          `GPS says the meter should be about ${num(gpsOdo, 0)}. Please check the reading.`,
        );
      }
    }
    // Warnings: show once, then the user can choose "Save anyway".
    if (check.warnings.length && !warnings.length) {
      setWarnings(check.warnings);
      return;
    }
    setSaving(true);
    try {
      const body = { ...candidate, station, note };
      const res = editId
        ? await api.updateFuel(editId, body)
        : await api.createFuel(vehicleId, body);
      setResult(res);
      bump();
      if (editId) toast('Fill-up updated.', { kind: 'success' });
    } catch (err) {
      setErrors([errorText(err)]);
    } finally {
      setSaving(false);
    }
  }

  if (vehicles !== null && !activeVehicles.length && !editId) {
    return (
      <EmptyState
        title="Add a vehicle first"
        text="You need a vehicle before you can log fuel."
        action={
          <a href="#/vehicles?new=1" className="btn btn-primary">
            <Icon name="plus" /> Add a vehicle
          </a>
        }
      />
    );
  }
  if (loadError) return <ErrorBox message={loadError} onRetry={() => window.location.reload()} />;
  if (loadingEdit || vehicles === null) {
    return (
      <div className="card stack">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} height={44} />
        ))}
      </div>
    );
  }

  if (result) return savedResult(result, reset);

  const selectable = (vehicles ?? []).filter((v) => !v.is_archived || v.id === vehicleId);

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <Field label="Vehicle" htmlFor="f-vehicle">
        <select
          id="f-vehicle"
          value={vehicleId}
          onChange={(e) => {
            setVehicleId(e.target.value);
            changed();
          }}
        >
          {selectable.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Date" htmlFor="f-date">
        <input
          id="f-date"
          type="date"
          value={date}
          max={todayISO()}
          required
          onChange={(e) => {
            setDate(e.target.value);
            changed();
          }}
        />
      </Field>

      <Field
        label={`Meter reading (odometer, ${unitLabel(u)})`}
        htmlFor="f-odo"
        hint={
          entries === null
            ? 'Loading last reading…'
            : lastEntry
              ? `Last reading: ${num(lastEntry.odometer, 1)} on ${formatDate(lastEntry.entry_date, settings.date_format)}${gpsOdo ? ` · GPS estimate now ≈ ${num(gpsOdo, 0)}` : ''}`
              : 'This is the first fill-up for this vehicle.'
        }
      >
        <input
          id="f-odo"
          inputMode="decimal"
          autoComplete="off"
          placeholder={lastEntry ? `More than ${num(lastEntry.odometer, 1)}` : 'e.g. 12500'}
          value={odometer}
          required
          onChange={(e) => {
            setOdometer(e.target.value);
            changed();
          }}
        />
      </Field>

      <div className="row-2">
        <Field label="Liters" htmlFor="f-liters">
          <input
            id="f-liters"
            inputMode="decimal"
            autoComplete="off"
            placeholder="e.g. 8.5"
            value={liters}
            required
            onChange={(e) => {
              setLiters(e.target.value);
              changed();
            }}
          />
        </Field>
        <Field label="Price per liter" htmlFor="f-price">
          <input
            id="f-price"
            inputMode="decimal"
            autoComplete="off"
            placeholder="e.g. 305"
            value={price}
            required
            onChange={(e) => {
              setPrice(e.target.value);
              changed();
            }}
          />
        </Field>
      </div>

      <Field
        label="Total paid"
        htmlFor="f-total"
        hint={
          totalTouched ? (
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setTotalTouched(false);
                changed();
              }}
            >
              Use liters × price (
              {Number.isFinite(autoTotal) ? money(autoTotal, settings.currency) : '–'})
            </button>
          ) : (
            'Worked out for you. Change it if the pump showed a different total.'
          )
        }
      >
        <input
          id="f-total"
          inputMode="decimal"
          autoComplete="off"
          value={totalTouched ? total : Number.isFinite(autoTotal) ? autoTotal.toFixed(2) : ''}
          onChange={(e) => {
            setTotalTouched(true);
            setTotal(e.target.value);
            changed();
          }}
        />
      </Field>

      <Toggle
        id="f-full"
        checked={full}
        onChange={(v) => {
          setFull(v);
          changed();
        }}
        label="Full tank"
        description={
          full
            ? 'You filled the tank to the top.'
            : 'Part fill. It will be added to your next full tank result.'
        }
      />

      <div className="row-2">
        <Field label="Station (optional)" htmlFor="f-station">
          <input
            id="f-station"
            value={station}
            maxLength={80}
            onChange={(e) => setStation(e.target.value)}
          />
        </Field>
        <Field label="Note (optional)" htmlFor="f-note">
          <input
            id="f-note"
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </div>

      {errors.length > 0 && (
        <div className="alert alert-error" role="alert">
          <ul>
            {errors.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="alert alert-warning" role="alert">
          <ul>
            {warnings.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <span className="small">If everything is correct, tap “Save anyway”.</span>
        </div>
      )}

      <button
        type="submit"
        className="btn btn-primary btn-big btn-block"
        disabled={saving || entries === null}
      >
        {saving
          ? 'Saving…'
          : warnings.length
            ? 'Save anyway'
            : editId
              ? 'Save changes'
              : 'Save fill-up'}
      </button>
      {editId && (
        <button
          type="button"
          className="btn btn-secondary btn-block"
          onClick={() => history.back()}
        >
          Cancel
        </button>
      )}
    </form>
  );

  function savedResult(result: SaveFuelResult, onAnother: () => void) {
    const p = result.period;
    const diff = p ? compareToAverage(p.kmPerLiter, result.avgKmPerLiter) : null;
    let headline: string;
    let sub: string;
    if (p) {
      headline = `${fixed(p.kmPerLiter)} ${perLiter(u)}`;
      sub = diff !== null ? percentText(diff) : 'This is your first mileage result!';
    } else if (!result.entry.is_full_tank) {
      headline = 'Part fill saved';
      sub = 'Waiting for next full tank. We will add this fill to that result.';
    } else {
      headline = 'Saved!';
      sub =
        'This full tank is your starting point. Next time you fill the tank full, you will see your mileage.';
    }
    return (
      <div className="card result stack" role="status">
        <div className="result-icon">
          <Icon name="check" size={32} />
        </div>
        <div className="result-head">{headline}</div>
        <p
          className={`result-sub${diff !== null && Math.round(diff) !== 0 ? (diff > 0 ? ' tone-good' : ' tone-bad') : ''}`}
        >
          {p && diff !== null ? `${headline} – ${sub}` : sub}
        </p>
        {p && (
          <dl className="result-grid">
            <div>
              <dt>Distance</dt>
              <dd>
                {num(p.distance, 1)} {unitLabel(u)}
              </dd>
            </div>
            <div>
              <dt>Fuel used</dt>
              <dd>{fixed(p.fuelUsed, 2)} L</dd>
            </div>
            <div>
              <dt>Cost per {unitLabel(u)}</dt>
              <dd>{money(p.costPerKm, settings.currency)}</dd>
            </div>
            <div>
              <dt>Riding days</dt>
              <dd>
                {p.ridingDays} ({num(p.kmPerRidingDay, 1)} {unitLabel(u)}/day)
              </dd>
            </div>
          </dl>
        )}
        {result.warnings.length > 0 && (
          <div className="alert alert-warning">
            {result.warnings.map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>
        )}
        <a href="#/" className="btn btn-primary btn-block">
          Back to home
        </a>
        {editId ? (
          <button
            type="button"
            className="btn btn-secondary btn-block"
            onClick={() => navigate('/history')}
          >
            Back to fuel history
          </button>
        ) : (
          <button type="button" className="btn btn-secondary btn-block" onClick={onAnother}>
            Add another fill-up
          </button>
        )}
      </div>
    );
  }
}
