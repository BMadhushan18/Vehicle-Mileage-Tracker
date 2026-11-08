import { useEffect, useState, type FormEvent } from 'react';
import { FUEL_TYPES, VEHICLE_TYPES, type VehicleWithStats } from '../../shared/types';
import { checkVehicle, type VehicleInput } from '../../shared/validate';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { EmptyState, ErrorBox, Field, Modal, SkeletonCards } from '../components/ui';
import { capitalize, fixed, num, perLiter, unitLabel } from '../format';
import { errorText, useApp } from '../store';

const COLORS = [
  '#3B82F6',
  '#22C55E',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
  '#64748B',
];

const emptyForm = (): VehicleInput => ({
  name: '',
  type: 'bike',
  plate_number: null,
  fuel_type: 'petrol',
  tank_capacity_liters: null,
  start_odometer: null,
  color_tag: COLORS[0],
  is_archived: 0,
});

export default function Vehicles({ openNew }: { openNew?: boolean }) {
  const { vehicles, loadError, reloadVehicles, settings, bump, toast } = useApp();
  const [editing, setEditing] = useState<VehicleWithStats | 'new' | null>(openNew ? 'new' : null);
  const [deleting, setDeleting] = useState<VehicleWithStats | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (openNew) setEditing('new');
  }, [openNew]);

  // Close the open card menu when clicking elsewhere.
  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuFor]);

  if (loadError) return <ErrorBox message={loadError} onRetry={reloadVehicles} />;
  if (vehicles === null) return <SkeletonCards count={2} />;

  const active = vehicles.filter((v) => !v.is_archived);
  const archived = vehicles.filter((v) => v.is_archived);

  async function setArchived(v: VehicleWithStats, value: boolean) {
    try {
      await api.updateVehicle(v.id, { is_archived: value ? 1 : 0 });
      toast(value ? `${v.name} archived. Its data is kept.` : `${v.name} is back in your list.`, {
        kind: 'success',
      });
      bump();
    } catch (e) {
      toast(errorText(e), { kind: 'error' });
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.deleteVehicle(deleting.id);
      toast(`${deleting.name} and all its entries were deleted.`);
      setDeleting(null);
      bump();
    } catch (e) {
      toast(errorText(e), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  }

  const card = (v: VehicleWithStats) => (
    <article key={v.id} className={`card vehicle-card${v.is_archived ? ' archived' : ''}`}>
      <span className="color-bar" style={{ background: v.color_tag }} aria-hidden="true" />
      <div className="vc-main">
        <h2 className="vc-name">{v.name}</h2>
        <div className="muted small">
          {capitalize(v.type)} · {capitalize(v.fuel_type)}
          {v.plate_number ? ` · ${v.plate_number}` : ''}
        </div>
        <div className="vc-stats">
          <span>
            <strong>{v.periodCount ? fixed(v.avgKmPerLiter) : '–'}</strong>{' '}
            {perLiter(settings.distance_unit)} avg
          </span>
          <span className="muted small">
            {v.entryCount} fill-up{v.entryCount === 1 ? '' : 's'}
            {v.lastOdometer !== null
              ? ` · ${num(v.lastOdometer, 0)} ${unitLabel(settings.distance_unit)}`
              : ''}
          </span>
        </div>
      </div>
      <div className="menu-wrap">
        <button
          type="button"
          className="icon-btn"
          aria-label={`Options for ${v.name}`}
          aria-haspopup="menu"
          aria-expanded={menuFor === v.id}
          onClick={(e) => {
            e.stopPropagation();
            setMenuFor(menuFor === v.id ? null : v.id);
          }}
        >
          <Icon name="more" />
        </button>
        {menuFor === v.id && (
          <div className="menu" role="menu">
            <button type="button" role="menuitem" onClick={() => setEditing(v)}>
              <Icon name="edit" size={18} /> Edit
            </button>
            <button type="button" role="menuitem" onClick={() => setArchived(v, !v.is_archived)}>
              <Icon name="archive" size={18} /> {v.is_archived ? 'Restore' : 'Archive'}
            </button>
            <button type="button" role="menuitem" className="danger" onClick={() => setDeleting(v)}>
              <Icon name="trash" size={18} /> Delete
            </button>
          </div>
        )}
      </div>
    </article>
  );

  return (
    <div className="stack">
      {active.length ? (
        <div className="list">{active.map(card)}</div>
      ) : (
        <EmptyState
          title="Add your first vehicle to start"
          text="Add a bike, scooter or car to start logging fuel."
        />
      )}
      <button
        type="button"
        className="btn btn-primary btn-big btn-block"
        onClick={() => setEditing('new')}
      >
        <Icon name="plus" /> Add a vehicle
      </button>

      {archived.length > 0 && (
        <details className="archived-list">
          <summary>Archived vehicles ({archived.length})</summary>
          <div className="list">{archived.map(card)}</div>
        </details>
      )}

      <Modal
        open={editing !== null}
        title={editing === 'new' ? 'Add a vehicle' : 'Edit vehicle'}
        onClose={() => setEditing(null)}
      >
        {editing !== null && (
          <VehicleForm
            vehicle={editing === 'new' ? null : editing}
            onDone={(name) => {
              setEditing(null);
              toast(`${name} saved.`, { kind: 'success' });
              bump();
              if (openNew) window.location.hash = '/vehicles';
            }}
          />
        )}
      </Modal>

      <Modal
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? ''}?`}
        onClose={() => setDeleting(null)}
      >
        <div className="stack">
          <p>
            This will{' '}
            <strong>remove all {deleting?.entryCount ?? 0} fill-ups and all no-ride days</strong>{' '}
            for this vehicle. You can't undo this.
          </p>
          <p className="muted">Tip: “Archive” hides the vehicle but keeps all its data.</p>
          <button
            type="button"
            className="btn btn-danger btn-block"
            disabled={busy}
            onClick={confirmDelete}
          >
            {busy ? 'Deleting…' : 'Yes, delete everything'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            onClick={() => {
              if (deleting) setArchived(deleting, true);
              setDeleting(null);
            }}
          >
            Archive instead
          </button>
        </div>
      </Modal>
    </div>
  );
}

function VehicleForm({
  vehicle,
  onDone,
}: {
  vehicle: VehicleWithStats | null;
  onDone: (name: string) => void;
}) {
  const [form, setForm] = useState<VehicleInput>(() =>
    vehicle
      ? {
          name: vehicle.name,
          type: vehicle.type,
          plate_number: vehicle.plate_number,
          fuel_type: vehicle.fuel_type,
          tank_capacity_liters: vehicle.tank_capacity_liters,
          start_odometer: vehicle.start_odometer,
          color_tag: vehicle.color_tag,
          is_archived: vehicle.is_archived,
        }
      : emptyForm(),
  );
  const [tank, setTank] = useState(vehicle?.tank_capacity_liters?.toString() ?? '');
  const [start, setStart] = useState(vehicle?.start_odometer?.toString() ?? '');
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof VehicleInput>(k: K, v: VehicleInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors([]);
  };
  const toNumOrNull = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const input: VehicleInput = {
      ...form,
      name: form.name.trim(),
      plate_number: form.plate_number?.trim() || null,
      tank_capacity_liters: toNumOrNull(tank),
      start_odometer: toNumOrNull(start),
    };
    const errs = checkVehicle(input);
    if (errs.length) return setErrors(errs);
    setSaving(true);
    try {
      if (vehicle) await api.updateVehicle(vehicle.id, input);
      else await api.createVehicle(input);
      onDone(input.name);
    } catch (err) {
      setErrors([errorText(err)]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <Field label="Name" htmlFor="v-name">
        <input
          id="v-name"
          value={form.name}
          maxLength={60}
          placeholder="e.g. My Pulsar"
          required
          onChange={(e) => set('name', e.target.value)}
        />
      </Field>
      <div className="row-2">
        <Field label="Type" htmlFor="v-type">
          <select
            id="v-type"
            value={form.type}
            onChange={(e) => set('type', e.target.value as VehicleInput['type'])}
          >
            {VEHICLE_TYPES.map((t) => (
              <option key={t} value={t}>
                {capitalize(t)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fuel" htmlFor="v-fuel">
          <select
            id="v-fuel"
            value={form.fuel_type}
            onChange={(e) => set('fuel_type', e.target.value as VehicleInput['fuel_type'])}
          >
            {FUEL_TYPES.map((t) => (
              <option key={t} value={t}>
                {capitalize(t)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Plate number (optional)" htmlFor="v-plate">
        <input
          id="v-plate"
          value={form.plate_number ?? ''}
          maxLength={20}
          onChange={(e) => set('plate_number', e.target.value)}
        />
      </Field>
      <div className="row-2">
        <Field label="Tank size in liters (optional)" htmlFor="v-tank">
          <input
            id="v-tank"
            inputMode="decimal"
            value={tank}
            onChange={(e) => setTank(e.target.value)}
          />
        </Field>
        <Field label="Starting meter reading (optional)" htmlFor="v-start">
          <input
            id="v-start"
            inputMode="decimal"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
      </div>
      <fieldset className="field">
        <legend>Color</legend>
        <div className="swatches" role="radiogroup" aria-label="Color">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={form.color_tag === c}
              aria-label={`Color ${c}`}
              className={`swatch${form.color_tag === c ? ' active' : ''}`}
              style={{ background: c }}
              onClick={() => set('color_tag', c)}
            />
          ))}
        </div>
      </fieldset>
      {errors.length > 0 && (
        <div className="alert alert-error" role="alert">
          {errors.map((m) => (
            <div key={m}>{m}</div>
          ))}
        </div>
      )}
      <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
        {saving ? 'Saving…' : vehicle ? 'Save changes' : 'Add vehicle'}
      </button>
    </form>
  );
}
