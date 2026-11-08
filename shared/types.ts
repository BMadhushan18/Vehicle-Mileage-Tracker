export type VehicleType = 'bike' | 'scooter' | 'car' | 'other';
export type FuelType = 'petrol' | 'diesel';
export type NoRideReason = 'rain' | 'sick' | 'holiday' | 'repair' | 'other';
export type DistanceUnit = 'km' | 'miles';
export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';

export const VEHICLE_TYPES: VehicleType[] = ['bike', 'scooter', 'car', 'other'];
export const FUEL_TYPES: FuelType[] = ['petrol', 'diesel'];
export const NO_RIDE_REASONS: NoRideReason[] = ['rain', 'sick', 'holiday', 'repair', 'other'];
export const DATE_FORMATS: DateFormat[] = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];

export interface Settings {
  email: string;
  currency: string;
  distance_unit: DistanceUnit;
  date_format: DateFormat;
}

export interface Vehicle {
  id: string;
  name: string;
  type: VehicleType;
  plate_number: string | null;
  fuel_type: FuelType;
  tank_capacity_liters: number | null;
  start_odometer: number | null;
  color_tag: string;
  is_archived: number;
  created_at: string;
}

export interface VehicleWithStats extends Vehicle {
  avgKmPerLiter: number;
  periodCount: number;
  entryCount: number;
  lastOdometer: number | null;
  lastPrice: number | null;
}

export interface FuelEntry {
  id: string;
  vehicle_id: string;
  entry_date: string; // YYYY-MM-DD
  odometer: number;
  liters: number;
  price_per_liter: number;
  total_cost: number;
  is_full_tank: number; // 1 = full, 0 = partial
  station: string | null;
  note: string | null;
  created_at?: string;
}

export interface NoRideDay {
  id: string;
  vehicle_id: string;
  day: string;
  reason: NoRideReason | null;
}

/** One full-tank-to-full-tank period. */
export interface Period {
  vehicleId: string;
  startEntryId: string;
  endEntryId: string;
  startDate: string;
  endDate: string;
  startOdometer: number;
  endOdometer: number;
  distance: number;
  fuelUsed: number;
  cost: number;
  partialFills: number;
  kmPerLiter: number;
  costPerKm: number;
  calendarDays: number;
  noRideDays: number;
  ridingDays: number;
  kmPerRidingDay: number;
  costPerRidingDay: number;
  fuelPerRidingDay: number;
}

/** Partial fills after the last full tank, waiting for the next full tank. */
export interface PendingPeriod {
  startDate: string;
  startOdometer: number;
  partialFills: number;
  liters: number;
  cost: number;
  lastDate: string;
}

export interface MonthlyRow {
  month: string; // YYYY-MM
  periods: number;
  distance: number;
  fuel: number;
  cost: number;
  kmPerLiter: number;
  costPerKm: number;
  ridingDays: number;
  noRideDays: number;
}

export interface Summary {
  periodCount: number;
  totalDistance: number;
  totalFuel: number;
  totalCost: number;
  avgKmPerLiter: number;
  avgCostPerKm: number;
  avgKmPerRidingDay: number;
  avgCostPerRidingDay: number;
  best: Period | null;
  worst: Period | null;
  lastKmPerLiter: number | null;
  ridingDays: number;
  noRideDays: number;
  monthly: MonthlyRow[];
}

export interface VehicleReport {
  vehicle: Vehicle;
  periods: Period[];
  pending: PendingPeriod | null;
  summary: Summary;
  allTimeAvgKmPerLiter: number;
  lastEntry: FuelEntry | null;
  entryCount: number;
  monthSpent: number;
  noRideToday: boolean;
}

export interface SaveFuelResult {
  entry: FuelEntry;
  warnings: string[];
  period: Period | null;
  avgKmPerLiter: number | null;
  pending: PendingPeriod | null;
}

export interface ExportData {
  app: 'ridelog';
  version: 1;
  exportedAt: string;
  settings: Omit<Settings, 'email'>;
  vehicles: Vehicle[];
  fuel_entries: FuelEntry[];
  no_ride_days: NoRideDay[];
}
