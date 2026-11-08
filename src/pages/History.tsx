import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FuelEntry } from '../../shared/types';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { EmptyState, ErrorBox, Skeleton } from '../components/ui';
import { VehicleSwitcher } from '../components/VehicleSwitcher';
import { fixed, formatDate, money, monthLabel, num, unitLabel } from '../format';
import { navigate } from '../router';
import { errorText, useApp } from '../store';

/**
 * Deletes wait 5 seconds so the user can undo. Timers live outside React,
 * so the delete still happens if the user leaves this screen.
 */
const pendingDeletes = new Map<string, ReturnType<typeof setTimeout>>();

export default function History() {
  const { activeVehicles, vehicles, selected, setSelected, settings, toast, bump, dataVersion } =
    useApp();
  const [entries, setEntries] = useState<FuelEntry[] | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api
      .allFuel()
      .then(setEntries)
      .catch((e) => setError(errorText(e)));
  }, []);

  useEffect(() => {
    load();
  }, [load, dataVersion]);

  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuFor]);

  const byId = useMemo(() => new Map((vehicles ?? []).map((v) => [v.id, v])), [vehicles]);
  const groups = useMemo(() => {
    const list = (entries ?? []).filter(
      (e) => !hidden.has(e.id) && (selected === 'all' || e.vehicle_id === selected),
    );
    const map = new Map<string, FuelEntry[]>();
    for (const e of list) {
      const k = e.entry_date.slice(0, 7);
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.entries()];
  }, [entries, hidden, selected]);

  function remove(e: FuelEntry) {
    setHidden((h) => new Set(h).add(e.id));
    const timer = setTimeout(() => {
      pendingDeletes.delete(e.id);
      api.deleteFuel(e.id).then(bump, (err) => {
        toast(errorText(err), { kind: 'error' });
        setHidden((h) => {
          const n = new Set(h);
          n.delete(e.id);
          return n;
        });
      });
    }, 5000);
    pendingDeletes.set(e.id, timer);
    toast('Fill-up deleted.', {
      action: {
        label: 'Undo',
        onClick: () => {
          clearTimeout(pendingDeletes.get(e.id));
          pendingDeletes.delete(e.id);
          setHidden((h) => {
            const n = new Set(h);
            n.delete(e.id);
            return n;
          });
        },
      },
    });
  }

  const u = unitLabel(settings.distance_unit);

  return (
    <div className="stack">
      <VehicleSwitcher vehicles={activeVehicles} value={selected} onChange={setSelected} />
      {error && <ErrorBox message={error} onRetry={load} />}
      {!entries && !error && (
        <div className="stack">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={64} radius={12} />
          ))}
        </div>
      )}
      {entries && !groups.length && (
        <EmptyState
          icon="history"
          title="No fill-ups yet"
          text="Every time you buy fuel, add it here to track your mileage."
          action={
            <a href="#/add" className="btn btn-primary">
              <Icon name="plus" /> Add fuel
            </a>
          }
        />
      )}
      {groups.map(([month, list]) => (
        <section key={month} aria-labelledby={`m-${month}`}>
          <h2 id={`m-${month}`} className="group-title">
            {monthLabel(month, true)}
            <span className="muted small">
              {money(
                list.reduce((s, e) => s + e.total_cost, 0),
                settings.currency,
              )}
            </span>
          </h2>
          <ul className="list" role="list">
            {list.map((e) => {
              const v = byId.get(e.vehicle_id);
              return (
                <li key={e.id} className="card entry">
                  <span
                    className="color-bar"
                    style={{ background: v?.color_tag ?? '#94A3B8' }}
                    aria-hidden="true"
                  />
                  <div className="entry-main">
                    <div className="entry-top">
                      <strong>{formatDate(e.entry_date, settings.date_format)}</strong>
                      {!e.is_full_tank && <span className="badge">Part fill</span>}
                    </div>
                    <div className="muted small">
                      {selected === 'all' && v ? `${v.name} · ` : ''}
                      {fixed(e.liters, 2)} L · {num(e.odometer, 1)} {u}
                      {e.station ? ` · ${e.station}` : ''}
                    </div>
                    {e.note && <div className="small entry-note">{e.note}</div>}
                  </div>
                  <div className="entry-side">
                    <strong>{money(e.total_cost, settings.currency)}</strong>
                    <div className="menu-wrap">
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Options for fill-up on ${formatDate(e.entry_date, settings.date_format)}`}
                        aria-haspopup="menu"
                        aria-expanded={menuFor === e.id}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setMenuFor(menuFor === e.id ? null : e.id);
                        }}
                      >
                        <Icon name="more" />
                      </button>
                      {menuFor === e.id && (
                        <div className="menu" role="menu">
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => navigate(`/edit?id=${e.id}`)}
                          >
                            <Icon name="edit" size={18} /> Edit
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="danger"
                            onClick={() => remove(e)}
                          >
                            <Icon name="trash" size={18} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
