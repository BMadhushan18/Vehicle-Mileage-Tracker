-- Distance measured by phone GPS, one total per vehicle per day (raw GPS points never leave the phone).
CREATE TABLE IF NOT EXISTS gps_days (
  id          TEXT PRIMARY KEY,
  vehicle_id  TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  day         TEXT NOT NULL,
  distance_km REAL NOT NULL CHECK (distance_km >= 0),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (vehicle_id, day)
);
CREATE INDEX IF NOT EXISTS idx_gps_vehicle_day ON gps_days(vehicle_id, day);
