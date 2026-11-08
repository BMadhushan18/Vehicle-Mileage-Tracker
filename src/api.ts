import type {
  ExportData,
  FuelEntry,
  GpsDay,
  NoRideDay,
  NoRideReason,
  SaveFuelResult,
  Settings,
  Vehicle,
  VehicleReport,
  VehicleWithStats,
} from '../shared/types';
import type { FuelCandidate, VehicleInput } from '../shared/validate';

/**
 * Web: same origin (''). Android app: the live site, set by VITE_API_BASE in .env.android.
 */
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method,
      credentials: API_BASE ? 'omit' : 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'offline', 'Could not reach RideLog. Check your internet and try again.');
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Cloudflare Access sends an HTML login page when the sign-in has expired.
    throw new ApiError(401, 'signed_out', 'Your sign-in has expired. Please reload the page.');
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)
      ?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'error',
      err?.message ?? 'Something went wrong. Please try again.',
      err?.details,
    );
  }
  return data as T;
}

const qs = (p: Record<string, string | null | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) s.set(k, v);
  const out = s.toString();
  return out ? `?${out}` : '';
};

export type FuelInput = Omit<FuelCandidate, 'id' | 'vehicle_id'> & { vehicle_id?: string };

export const api = {
  me: () => request<Settings>('GET', '/me'),
  saveMe: (s: Partial<Settings>) => request<Settings>('PUT', '/me', s),

  vehicles: () => request<VehicleWithStats[]>('GET', '/vehicles'),
  createVehicle: (v: VehicleInput) => request<Vehicle>('POST', '/vehicles', v),
  updateVehicle: (id: string, v: Partial<VehicleInput>) =>
    request<Vehicle>('PUT', `/vehicles/${id}`, v),
  deleteVehicle: (id: string) => request<{ ok: true }>('DELETE', `/vehicles/${id}?confirm=yes`),

  fuelList: (vehicleId: string, from?: string, to?: string) =>
    request<FuelEntry[]>('GET', `/vehicles/${vehicleId}/fuel${qs({ from, to })}`),
  allFuel: () => request<FuelEntry[]>('GET', '/fuel'),
  getFuel: (id: string) => request<FuelEntry>('GET', `/fuel/${id}`),
  createFuel: (vehicleId: string, f: FuelInput) =>
    request<SaveFuelResult>('POST', `/vehicles/${vehicleId}/fuel`, f),
  updateFuel: (id: string, f: FuelInput) => request<SaveFuelResult>('PUT', `/fuel/${id}`, f),
  deleteFuel: (id: string) => request<{ ok: true }>('DELETE', `/fuel/${id}`),

  noRide: (vehicleId: string, from?: string, to?: string) =>
    request<NoRideDay[]>('GET', `/vehicles/${vehicleId}/no-ride${qs({ from, to })}`),
  addNoRide: (vehicleId: string, from: string, to?: string, reason?: NoRideReason | null) =>
    request<{ added: string[]; skipped: { day: string; message: string }[] }>(
      'POST',
      `/vehicles/${vehicleId}/no-ride`,
      { from, to, reason },
    ),
  removeNoRide: (vehicleId: string, from: string, to?: string) =>
    request<{ removed: number }>('DELETE', `/vehicles/${vehicleId}/no-ride${qs({ from, to })}`),

  report: (vehicleId: string, p: { from?: string; to?: string; today?: string }) =>
    request<VehicleReport>('GET', `/vehicles/${vehicleId}/report${qs(p)}`),
  summary: (p: { from?: string; to?: string; today?: string }) =>
    request<{ reports: VehicleReport[] }>('GET', `/summary${qs(p)}`),

  gpsDays: (vehicleId: string, from?: string, to?: string) =>
    request<GpsDay[]>('GET', `/vehicles/${vehicleId}/gps${qs({ from, to })}`),
  saveGpsDays: (vehicleId: string, days: GpsDay[]) =>
    request<{ saved: number }>('POST', `/vehicles/${vehicleId}/gps`, { days }),

  exportAll: () => request<ExportData>('GET', '/export'),
  importAll: (data: unknown, replace: boolean) =>
    request<{ vehicles: number; fuel_entries: number; no_ride_days: number }>(
      'POST',
      `/import${replace ? '?mode=replace' : ''}`,
      data,
    ),
};
