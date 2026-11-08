import { describe, expect, it } from 'vitest';
import {
  buildVehicleReport,
  compareToAverage,
  computePeriods,
  daysBetween,
  estimateFuelLeft,
  filterPeriods,
  summarize,
} from './calc';
import { checkFuelEntry, checkNoRideDay, expandRange, isValidISODate } from './validate';
import type { FuelEntry, Vehicle } from './types';

let seq = 0;
function fill(
  date: string,
  odometer: number,
  liters: number,
  opts: { full?: boolean; price?: number; vehicle?: string; total?: number } = {},
): FuelEntry {
  const price = opts.price ?? 100;
  return {
    id: `e${++seq}`,
    vehicle_id: opts.vehicle ?? 'v1',
    entry_date: date,
    odometer,
    liters,
    price_per_liter: price,
    total_cost: opts.total ?? liters * price,
    is_full_tank: opts.full === false ? 0 : 1,
    station: null,
    note: null,
  };
}

const vehicle: Vehicle = {
  id: 'v1',
  name: 'Test bike',
  type: 'bike',
  plate_number: null,
  fuel_type: 'petrol',
  tank_capacity_liters: 12,
  start_odometer: null,
  daily_km: null,
  color_tag: '#3B82F6',
  is_archived: 0,
  created_at: '2024-01-01',
};

describe('daysBetween', () => {
  it('counts calendar days, not including the start day', () => {
    expect(daysBetween('2024-01-01', '2024-01-11')).toBe(10);
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2); // leap year
  });
});

describe('computePeriods', () => {
  it('treats the first full tank as a baseline with no result', () => {
    const { periods, pending } = computePeriods([fill('2024-01-01', 1000, 10)]);
    expect(periods).toHaveLength(0);
    expect(pending).toBeNull();
  });

  it('calculates a simple full-to-full period', () => {
    const { periods } = computePeriods([
      fill('2024-01-01', 1000, 10),
      fill('2024-01-11', 1400, 10),
    ]);
    expect(periods).toHaveLength(1);
    const p = periods[0];
    expect(p.distance).toBe(400);
    expect(p.fuelUsed).toBe(10); // start fill liters are NOT counted
    expect(p.kmPerLiter).toBe(40);
    expect(p.cost).toBe(1000);
    expect(p.costPerKm).toBe(2.5);
    expect(p.calendarDays).toBe(10);
    expect(p.ridingDays).toBe(10);
    expect(p.kmPerRidingDay).toBe(40);
    expect(p.costPerRidingDay).toBe(100);
    expect(p.fuelPerRidingDay).toBe(1);
  });

  it('adds partial fills into the next full period', () => {
    const { periods, pending } = computePeriods([
      fill('2024-01-01', 1000, 10),
      fill('2024-01-05', 1150, 4, { full: false }),
      fill('2024-01-10', 1450, 6),
    ]);
    expect(pending).toBeNull();
    expect(periods).toHaveLength(1);
    expect(periods[0].fuelUsed).toBe(10);
    expect(periods[0].cost).toBe(1000);
    expect(periods[0].partialFills).toBe(1);
    expect(periods[0].kmPerLiter).toBe(45);
  });

  it('shows partial fills after the last full tank as pending', () => {
    const { periods, pending } = computePeriods([
      fill('2024-01-01', 1000, 10),
      fill('2024-01-11', 1400, 10),
      fill('2024-01-15', 1550, 3, { full: false }),
      fill('2024-01-18', 1650, 2, { full: false }),
    ]);
    expect(periods).toHaveLength(1);
    expect(pending).toEqual({
      startDate: '2024-01-11',
      startOdometer: 1400,
      partialFills: 2,
      liters: 5,
      cost: 500,
      lastDate: '2024-01-18',
    });
  });

  it('ignores partial fills before the first full tank', () => {
    const { periods, pending } = computePeriods([
      fill('2023-12-28', 900, 3, { full: false }),
      fill('2024-01-01', 1000, 10),
      fill('2024-01-11', 1400, 10),
    ]);
    expect(periods[0].fuelUsed).toBe(10);
    expect(pending).toBeNull();
  });

  it('subtracts no-ride days inside the period (start excluded, end included)', () => {
    const { periods } = computePeriods(
      [fill('2024-01-01', 1000, 10), fill('2024-01-11', 1400, 10)],
      ['2024-01-01', '2024-01-03', '2024-01-04', '2024-01-11', '2024-01-20', '2024-01-03'],
    );
    const p = periods[0];
    expect(p.noRideDays).toBe(3); // 03, 04 and 11. 01 is the start day, 20 is outside, dup ignored
    expect(p.ridingDays).toBe(7);
    expect(p.kmPerRidingDay).toBeCloseTo(400 / 7);
    // km/L is unchanged by no-ride days
    expect(p.kmPerLiter).toBe(40);
  });

  it('uses at least 1 riding day when every day was marked no-ride', () => {
    const { periods } = computePeriods(
      [fill('2024-01-01', 1000, 10), fill('2024-01-03', 1010, 1)],
      ['2024-01-02', '2024-01-03'],
    );
    expect(periods[0].calendarDays).toBe(2);
    expect(periods[0].noRideDays).toBe(2);
    expect(periods[0].ridingDays).toBe(1);
    expect(periods[0].kmPerRidingDay).toBe(10);
  });

  it('handles two full fills on the same day (zero calendar days)', () => {
    const { periods } = computePeriods([fill('2024-01-01', 1000, 10), fill('2024-01-01', 1050, 1)]);
    expect(periods[0].calendarDays).toBe(0);
    expect(periods[0].ridingDays).toBe(1);
  });

  it('sorts entries added out of date order', () => {
    const entries = [
      fill('2024-01-21', 1800, 10),
      fill('2024-01-01', 1000, 10),
      fill('2024-01-11', 1400, 8),
    ];
    const { periods } = computePeriods(entries);
    expect(periods.map((p) => [p.startDate, p.endDate])).toEqual([
      ['2024-01-01', '2024-01-11'],
      ['2024-01-11', '2024-01-21'],
    ]);
    expect(periods[0].kmPerLiter).toBe(50);
    expect(periods[1].kmPerLiter).toBe(40);
  });

  it('keeps each vehicle separate when computed per vehicle', () => {
    const all = [
      fill('2024-01-01', 1000, 10, { vehicle: 'a' }),
      fill('2024-01-01', 50000, 30, { vehicle: 'b' }),
      fill('2024-01-11', 1400, 10, { vehicle: 'a' }),
      fill('2024-01-11', 50450, 30, { vehicle: 'b' }),
    ];
    const a = computePeriods(all.filter((e) => e.vehicle_id === 'a')).periods;
    const b = computePeriods(all.filter((e) => e.vehicle_id === 'b')).periods;
    expect(a[0].kmPerLiter).toBe(40);
    expect(b[0].kmPerLiter).toBe(15);
    expect(a[0].vehicleId).toBe('a');
    expect(b[0].vehicleId).toBe('b');
  });

  it('uses the pump total when it differs from liters x price', () => {
    const { periods } = computePeriods([
      fill('2024-01-01', 1000, 10),
      fill('2024-01-11', 1400, 10, { total: 990 }),
    ]);
    expect(periods[0].cost).toBe(990);
  });
});

describe('summarize', () => {
  const { periods } = computePeriods([
    fill('2024-01-01', 1000, 10),
    fill('2024-01-11', 1400, 10), // 40 km/L
    fill('2024-02-01', 1500, 5), // 20 km/L
    fill('2024-02-15', 2000, 10), // 50 km/L
  ]);

  it('averages as total distance / total fuel (not average of averages)', () => {
    const s = summarize(periods);
    expect(s.totalDistance).toBe(1000);
    expect(s.totalFuel).toBe(25);
    expect(s.avgKmPerLiter).toBe(40); // average of averages would be 36.67
    expect(s.best?.kmPerLiter).toBe(50);
    expect(s.worst?.kmPerLiter).toBe(20);
    expect(s.lastKmPerLiter).toBe(50);
    expect(s.avgCostPerKm).toBeCloseTo(2.5);
  });

  it('groups by end-date month', () => {
    const s = summarize(periods);
    expect(s.monthly.map((m) => m.month)).toEqual(['2024-01', '2024-02']);
    expect(s.monthly[1].distance).toBe(600);
    expect(s.monthly[1].kmPerLiter).toBe(40);
  });

  it('returns zeros for no periods', () => {
    const s = summarize([]);
    expect(s.avgKmPerLiter).toBe(0);
    expect(s.best).toBeNull();
    expect(s.lastKmPerLiter).toBeNull();
  });

  it('filters periods by end date', () => {
    expect(filterPeriods(periods, '2024-02-01', '2024-02-28')).toHaveLength(2);
    expect(filterPeriods(periods, null, '2024-01-31')).toHaveLength(1);
  });
});

describe('buildVehicleReport', () => {
  it('reports month spend, last entry and today flag', () => {
    const r = buildVehicleReport(
      vehicle,
      [fill('2024-01-01', 1000, 10), fill('2024-01-11', 1400, 10)],
      ['2024-01-12'],
      { today: '2024-01-12' },
    );
    expect(r.monthSpent).toBe(2000);
    expect(r.lastEntry?.odometer).toBe(1400);
    expect(r.noRideToday).toBe(true);
    expect(r.allTimeAvgKmPerLiter).toBe(40);
  });
});

describe('compareToAverage', () => {
  it('returns percent difference', () => {
    expect(compareToAverage(42, 40)).toBeCloseTo(5);
    expect(compareToAverage(42, 0)).toBeNull();
  });
});

describe('validation', () => {
  const existing = [fill('2024-01-01', 1000, 10), fill('2024-01-11', 1400, 10)];
  const base = {
    vehicle_id: 'v1',
    liters: 10,
    price_per_liter: 100,
    total_cost: 1000,
    is_full_tank: 1,
  };

  it('blocks a lower odometer than the previous entry', () => {
    const r = checkFuelEntry({ ...base, entry_date: '2024-01-20', odometer: 1300 }, existing, {
      today: '2024-02-01',
    });
    expect(r.errors[0]).toMatch(/higher than 1,400/);
  });

  it('checks entries before AND after when inserting in the middle', () => {
    const r = checkFuelEntry({ ...base, entry_date: '2024-01-05', odometer: 1500 }, existing, {
      today: '2024-02-01',
    });
    expect(r.errors[0]).toMatch(/lower than 1,400/);
    const ok = checkFuelEntry({ ...base, entry_date: '2024-01-05', odometer: 1200 }, existing, {
      today: '2024-02-01',
    });
    expect(ok.errors).toEqual([]);
  });

  it('blocks future dates and bad numbers', () => {
    const r = checkFuelEntry(
      { ...base, entry_date: '2024-03-01', odometer: 2000, liters: 0 },
      existing,
      { today: '2024-02-01' },
    );
    expect(r.errors.join(' ')).toMatch(/future/);
    expect(r.errors.join(' ')).toMatch(/Liters/);
  });

  it('warns (not blocks) for liters over tank size and unusual km/L', () => {
    const r = checkFuelEntry({ ...base, entry_date: '2024-01-20', odometer: 2400 }, existing, {
      today: '2024-02-01',
      tankCapacity: 8,
    });
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/tank size/);
    expect(r.warnings.join(' ')).toMatch(/unusual/); // 100 km/L vs 40 average
  });

  it('allows editing an entry without comparing it to itself', () => {
    const r = checkFuelEntry(
      { ...base, id: existing[1].id, entry_date: '2024-01-11', odometer: 1410 },
      existing,
      { today: '2024-02-01' },
    );
    expect(r.errors).toEqual([]);
  });

  it('refuses a no-ride day when the meter moved that day', () => {
    expect(checkNoRideDay('2024-01-11', existing)).toMatch(/meter moved/);
    expect(checkNoRideDay('2024-01-01', existing)).toBeNull(); // first fill-up, no movement known
    expect(checkNoRideDay('2024-01-05', existing)).toBeNull();
  });

  it('validates dates and expands ranges', () => {
    expect(isValidISODate('2024-02-30')).toBe(false);
    expect(isValidISODate('2024-02-29')).toBe(true);
    expect(expandRange('2024-02-27', '2024-03-01')).toEqual([
      '2024-02-27',
      '2024-02-28',
      '2024-02-29',
      '2024-03-01',
    ]);
  });
});

describe('estimateFuelLeft', () => {
  const base = {
    lastFullOdometer: 1000,
    partialLiters: 0,
    tankCapacity: 12,
    kmPerLiter: 40,
    currentOdometer: 1200,
    dailyKm: 40,
  };

  it('estimates fuel left, range and days', () => {
    const r = estimateFuelLeft(base);
    if (!r.ok) throw new Error('expected ok');
    expect(r.fuelUsed).toBe(5); // 200 km / 40 km/L
    expect(r.fuelLeft).toBe(7);
    expect(r.rangeKm).toBe(280);
    expect(r.daysLeft).toBe(7);
    expect(r.percentLeft).toBeCloseTo(58.33);
  });

  it('adds part fills but never above a full tank', () => {
    const r = estimateFuelLeft({ ...base, partialLiters: 3 });
    expect(r.ok && r.fuelLeft).toBe(10);
    const capped = estimateFuelLeft({ ...base, partialLiters: 20 });
    expect(capped.ok && capped.fuelLeft).toBe(12);
  });

  it('shows zero and flags it when the tank should be empty', () => {
    const r = estimateFuelLeft({ ...base, currentOdometer: 2000 });
    expect(r.ok && r.fuelLeft).toBe(0);
    expect(r.ok && r.overdue).toBe(true);
  });

  it('explains when it cannot estimate', () => {
    expect(estimateFuelLeft({ ...base, tankCapacity: null })).toEqual({
      ok: false,
      reason: 'no_tank',
    });
    expect(estimateFuelLeft({ ...base, lastFullOdometer: null })).toEqual({
      ok: false,
      reason: 'no_full_fill',
    });
    expect(estimateFuelLeft({ ...base, kmPerLiter: 0 })).toEqual({
      ok: false,
      reason: 'no_average',
    });
    expect(estimateFuelLeft({ ...base, currentOdometer: 900 })).toEqual({
      ok: false,
      reason: 'reading_too_low',
    });
  });

  it('returns no days when no daily distance is known', () => {
    const r = estimateFuelLeft({ ...base, dailyKm: null });
    expect(r.ok && r.daysLeft).toBeNull();
  });
});
