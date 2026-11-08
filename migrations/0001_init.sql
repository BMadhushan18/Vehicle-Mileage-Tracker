-- RideLog initial schema
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  currency      TEXT NOT NULL DEFAULT 'LKR',
  distance_unit TEXT NOT NULL DEFAULT 'km' CHECK (distance_unit IN ('km', 'miles')),
  date_format   TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vehicles (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  type                 TEXT NOT NULL DEFAULT 'bike' CHECK (type IN ('bike', 'scooter', 'car', 'other')),
  plate_number         TEXT,
  fuel_type            TEXT NOT NULL DEFAULT 'petrol' CHECK (fuel_type IN ('petrol', 'diesel')),
  tank_capacity_liters REAL,
  start_odometer       REAL,
  color_tag            TEXT NOT NULL DEFAULT '#3B82F6',
  is_archived          INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vehicles_user ON vehicles(user_id);

CREATE TABLE IF NOT EXISTS fuel_entries (
  id              TEXT PRIMARY KEY,
  vehicle_id      TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  entry_date      TEXT NOT NULL,
  odometer        REAL NOT NULL,
  liters          REAL NOT NULL CHECK (liters > 0),
  price_per_liter REAL NOT NULL CHECK (price_per_liter > 0),
  total_cost      REAL NOT NULL CHECK (total_cost > 0),
  is_full_tank    INTEGER NOT NULL DEFAULT 1 CHECK (is_full_tank IN (0, 1)),
  station         TEXT,
  note            TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fuel_vehicle_date ON fuel_entries(vehicle_id, entry_date);

CREATE TABLE IF NOT EXISTS no_ride_days (
  id         TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  day        TEXT NOT NULL,
  reason     TEXT CHECK (reason IS NULL OR reason IN ('rain', 'sick', 'holiday', 'repair', 'other')),
  UNIQUE (vehicle_id, day)
);
CREATE INDEX IF NOT EXISTS idx_noride_vehicle_day ON no_ride_days(vehicle_id, day);
