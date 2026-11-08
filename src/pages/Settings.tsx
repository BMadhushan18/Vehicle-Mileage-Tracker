import { useState, type ChangeEvent } from 'react';
import { DATE_FORMATS, type DateFormat, type DistanceUnit } from '../../shared/types';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { Field, Modal } from '../components/ui';
import { download, toCsv } from '../csv';
import { CURRENCIES, formatDate, todayISO } from '../format';
import { errorText, useApp } from '../store';

export default function SettingsPage() {
  const { settings, setSettings, toast, bump, vehicles } = useApp();
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importData, setImportData] = useState<unknown>(null);
  const [replace, setReplace] = useState(false);

  async function save(patch: Partial<typeof settings>) {
    setSaving(true);
    try {
      setSettings(await api.saveMe(patch));
      toast('Settings saved.', { kind: 'success' });
    } catch (e) {
      toast(errorText(e), { kind: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function exportJson() {
    setBusy(true);
    try {
      const data = await api.exportAll();
      download(
        `ridelog-backup-${todayISO()}.json`,
        JSON.stringify(data, null, 2),
        'application/json',
      );
    } catch (e) {
      toast(errorText(e), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    setBusy(true);
    try {
      const data = await api.exportAll();
      const names = new Map(data.vehicles.map((v) => [v.id, v.name]));
      const fuel = toCsv(
        [
          'Vehicle',
          'Date',
          'Odometer',
          'Liters',
          'Price per liter',
          'Total',
          'Full tank',
          'Station',
          'Note',
        ],
        data.fuel_entries.map((e) => [
          names.get(e.vehicle_id),
          e.entry_date,
          e.odometer,
          e.liters,
          e.price_per_liter,
          e.total_cost,
          e.is_full_tank ? 'yes' : 'no',
          e.station,
          e.note,
        ]),
      );
      download(`ridelog-fuel-${todayISO()}.csv`, fuel);
      const days = toCsv(
        ['Vehicle', 'Day', 'Reason'],
        data.no_ride_days.map((d) => [names.get(d.vehicle_id), d.day, d.reason]),
      );
      download(`ridelog-no-ride-days-${todayISO()}.csv`, days);
    } catch (e) {
      toast(errorText(e), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function pickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 4_500_000)
      return toast('That file is too big. Please pick a RideLog backup file.', { kind: 'error' });
    try {
      const data = JSON.parse(await file.text());
      if (data?.app !== 'ridelog') throw new Error('not ridelog');
      setReplace(false);
      setImportData(data);
    } catch {
      toast('This is not a RideLog backup file. Please pick the .json file you exported.', {
        kind: 'error',
      });
    }
  }

  async function runImport() {
    setBusy(true);
    try {
      const res = await api.importAll(importData, replace);
      toast(
        `Imported ${res.vehicles} vehicle(s), ${res.fuel_entries} fill-ups and ${res.no_ride_days} no-ride days.`,
        {
          kind: 'success',
        },
      );
      setImportData(null);
      bump();
    } catch (e) {
      toast(errorText(e), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  }

  const counts = importData as { vehicles?: unknown[]; fuel_entries?: unknown[] } | null;

  return (
    <div className="stack">
      <section className="card form">
        <h2 className="card-title">Display</h2>
        <Field label="Currency" htmlFor="s-cur">
          <select
            id="s-cur"
            value={settings.currency}
            disabled={saving}
            onChange={(e) => save({ currency: e.target.value })}
          >
            {(CURRENCIES.includes(settings.currency)
              ? CURRENCIES
              : [settings.currency, ...CURRENCIES]
            ).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Distance unit"
          htmlFor="s-unit"
          hint="This only changes the labels. Always type the number your meter shows."
        >
          <select
            id="s-unit"
            value={settings.distance_unit}
            disabled={saving}
            onChange={(e) => save({ distance_unit: e.target.value as DistanceUnit })}
          >
            <option value="km">Kilometers (km)</option>
            <option value="miles">Miles (mi)</option>
          </select>
        </Field>
        <Field label="Date format" htmlFor="s-date">
          <select
            id="s-date"
            value={settings.date_format}
            disabled={saving}
            onChange={(e) => save({ date_format: e.target.value as DateFormat })}
          >
            {DATE_FORMATS.map((f) => (
              <option key={f} value={f}>
                {formatDate(todayISO(), f)} ({f})
              </option>
            ))}
          </select>
        </Field>
      </section>

      <section className="card stack">
        <h2 className="card-title">Your data</h2>
        <p className="muted small">Keep a copy of your data, or move it to another account.</p>
        <button
          type="button"
          className="btn btn-secondary btn-block"
          disabled={busy || !vehicles?.length}
          onClick={exportJson}
        >
          <Icon name="download" /> Download backup (JSON)
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-block"
          disabled={busy || !vehicles?.length}
          onClick={exportCsv}
        >
          <Icon name="download" /> Download as spreadsheet (CSV)
        </button>
        <label className="btn btn-secondary btn-block file-btn">
          <Icon name="upload" /> Restore from backup (JSON)
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={pickFile}
          />
        </label>
      </section>

      <section className="card">
        <h2 className="card-title">Account</h2>
        <p className="small">Personal app – no sign-in needed.</p>
        <p className="muted small">Anyone with the link can open it, so keep the link private.</p>
      </section>

      <Modal
        open={importData !== null}
        title="Restore from backup"
        onClose={() => setImportData(null)}
      >
        <div className="stack">
          <p>
            This backup has <strong>{counts?.vehicles?.length ?? 0} vehicle(s)</strong> and{' '}
            <strong>{counts?.fuel_entries?.length ?? 0} fill-ups</strong>.
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={replace}
              onChange={(e) => setReplace(e.target.checked)}
            />
            <span>Replace my current data (deletes what is in RideLog now)</span>
          </label>
          {!replace && (
            <p className="muted small">The backup will be added next to your current vehicles.</p>
          )}
          <button
            type="button"
            className={`btn btn-block ${replace ? 'btn-danger' : 'btn-primary'}`}
            disabled={busy}
            onClick={runImport}
          >
            {busy ? 'Restoring…' : replace ? 'Replace and restore' : 'Add from backup'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
