/**
 * GPS ride tracker.
 * - Android app (Capacitor): background-geolocation plugin runs a foreground service,
 *   so tracking continues with the screen off.
 * - Browser: navigator.geolocation (works only while the page is open and the screen is on).
 *
 * Raw points never leave the phone. Only each day's total km is stored and synced.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import type {
  BackgroundGeolocationPlugin,
  Location,
} from '@capacitor-community/background-geolocation';
import type { GpsDay } from '../../shared/types';
import { api } from '../api';
import { todayISO } from '../format';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

export const isNativeApp = Capacitor.isNativePlatform();
export const gpsSupported =
  isNativeApp || (typeof navigator !== 'undefined' && 'geolocation' in navigator);

/** Ignore fixes worse than this (metres). */
const MAX_ACCURACY_M = 30;
/** Ignore tiny moves (GPS jitter while standing still). */
const MIN_STEP_M = 8;
/** Faster than this between two fixes is a GPS jump, not real riding (~200 km/h). */
const MAX_SPEED_MS = 55;
/** A gap this long means we lost signal; start a new segment instead of drawing a straight line. */
const MAX_GAP_MS = 5 * 60_000;
const SYNC_EVERY_MS = 5 * 60_000;
const STORE_KEY = 'ridelog.gps.v1';

interface Point {
  lat: number;
  lon: number;
  t: number;
}

export interface TrackerState {
  active: boolean;
  vehicleId: string | null;
  /** vehicleId -> day -> km */
  days: Record<string, Record<string, number>>;
  /** vehicleId -> days changed since last successful sync */
  dirty: Record<string, string[]>;
  last: Point | null;
  startedAt: number | null;
  sessionKm: number;
  error: string | null;
}

const empty = (): TrackerState => ({
  active: false,
  vehicleId: null,
  days: {},
  dirty: {},
  last: null,
  startedAt: null,
  sessionKm: 0,
  error: null,
});

function load(): TrackerState {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? { ...empty(), ...JSON.parse(raw), error: null } : empty();
  } catch {
    return empty();
  }
}

let state: TrackerState = load();
let watcherId: string | null = null;
let webWatchId: number | null = null;
let wakeLock: { release: () => Promise<void> } | null = null;
let syncTimer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<(s: TrackerState) => void>();

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...state, error: null }));
  } catch {
    /* storage full or private mode */
  }
  listeners.forEach((l) => l(state));
}

export function subscribe(fn: (s: TrackerState) => void): () => void {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

export function getState(): TrackerState {
  return state;
}

/** Great-circle distance in metres. */
export function haversine(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6_371_000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function addPoint(lat: number, lon: number, accuracy: number, t: number) {
  if (!state.active || !state.vehicleId) return;
  if (!(accuracy <= MAX_ACCURACY_M)) return;
  if (state.error) state.error = null; // a good fix means GPS is working again
  const p: Point = { lat, lon, t };
  const prev = state.last;
  if (!prev || t - prev.t > MAX_GAP_MS || t <= prev.t) {
    state.last = p;
    save();
    return;
  }
  const d = haversine(prev, p);
  if (d < MIN_STEP_M) return; // keep the old anchor so slow jitter doesn't add up
  if (d / ((t - prev.t) / 1000) > MAX_SPEED_MS) {
    state.last = p; // jump: re-anchor, don't count
    save();
    return;
  }
  const day = todayISO(new Date(t));
  const v = state.vehicleId;
  const km = d / 1000;
  state.days[v] = { ...(state.days[v] ?? {}), [day]: (state.days[v]?.[day] ?? 0) + km };
  state.dirty[v] = [...new Set([...(state.dirty[v] ?? []), day])];
  state.sessionKm += km;
  state.last = p;
  save();
}

async function askNotificationPermission() {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const p = await LocalNotifications.checkPermissions();
    if (p.display !== 'granted') await LocalNotifications.requestPermissions();
  } catch {
    /* tracking still works; only the status notification may be hidden */
  }
}

async function attach() {
  if (isNativeApp) {
    await askNotificationPermission();
    watcherId = await BackgroundGeolocation.addWatcher(
      {
        backgroundTitle: 'RideLog is tracking your ride',
        backgroundMessage: 'Distance is being measured. Open RideLog to stop.',
        requestPermissions: true,
        stale: false,
        distanceFilter: 10,
      },
      (loc?: Location, err?: { code?: string; message?: string }) => {
        if (err) {
          state.error =
            err.code === 'NOT_AUTHORIZED'
              ? 'Location permission is off. Allow "Location" for RideLog in phone settings.'
              : 'GPS error. Make sure Location is turned on.';
          if (err.code === 'NOT_AUTHORIZED') {
            if (
              window.confirm(
                'RideLog needs location access to measure your rides. Open settings now?',
              )
            ) {
              BackgroundGeolocation.openSettings();
            }
          }
          listeners.forEach((l) => l(state));
          return;
        }
        if (loc) addPoint(loc.latitude, loc.longitude, loc.accuracy, loc.time ?? Date.now());
      },
    );
  } else {
    webWatchId = navigator.geolocation.watchPosition(
      (pos) =>
        addPoint(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, pos.timestamp),
      (e) => {
        if (e.code === e.TIMEOUT) return; // just no new fix yet; keep waiting
        state.error =
          e.code === e.PERMISSION_DENIED
            ? 'Location permission was denied. Allow location for this site to track rides.'
            : 'Could not get a GPS signal. Try going outside.';
        listeners.forEach((l) => l(state));
      },
      { enableHighAccuracy: true, maximumAge: 0 },
    );
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> };
      };
      wakeLock = (await nav.wakeLock?.request('screen')) ?? null;
    } catch {
      wakeLock = null;
    }
  }
  if (!syncTimer) syncTimer = setInterval(() => void syncGps(), SYNC_EVERY_MS);
}

async function detach() {
  if (watcherId) {
    await BackgroundGeolocation.removeWatcher({ id: watcherId }).catch(() => {});
    watcherId = null;
  }
  if (webWatchId !== null) {
    navigator.geolocation.clearWatch(webWatchId);
    webWatchId = null;
  }
  await wakeLock?.release().catch(() => {});
  wakeLock = null;
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

export async function startTracking(vehicleId: string) {
  if (state.active) await stopTracking();
  state = {
    ...state,
    active: true,
    vehicleId,
    last: null,
    startedAt: Date.now(),
    sessionKm: 0,
    error: null,
  };
  save();
  try {
    await attach();
  } catch {
    state.active = false;
    state.error = 'Could not start GPS. Check that Location is on and allowed for RideLog.';
    save();
  }
}

export async function stopTracking() {
  await detach();
  state = { ...state, active: false, last: null, startedAt: null };
  save();
  await syncGps();
}

/** Send changed days to the server. Safe to call often. */
export async function syncGps(): Promise<boolean> {
  let ok = true;
  for (const [vehicleId, days] of Object.entries(state.dirty)) {
    if (!days.length) continue;
    const payload: GpsDay[] = days.map((day) => ({
      day,
      distance_km: state.days[vehicleId]?.[day] ?? 0,
    }));
    try {
      await api.saveGpsDays(vehicleId, payload);
      const still = (state.dirty[vehicleId] ?? []).filter(
        (d) => !days.includes(d) || d === todayISO(), // today keeps growing; resend later
      );
      state.dirty[vehicleId] = still;
    } catch {
      ok = false;
    }
  }
  pruneOldDays();
  save();
  return ok;
}

/** Keep only ~60 days on the phone; the server keeps the history. */
function pruneOldDays() {
  const cutoff = todayISO(new Date(Date.now() - 60 * 86_400_000));
  for (const v of Object.keys(state.days)) {
    for (const d of Object.keys(state.days[v])) {
      if (d < cutoff && !(state.dirty[v] ?? []).includes(d)) delete state.days[v][d];
    }
  }
}

/** Resume after the app was killed while tracking (native keeps the flag). */
export async function resumeIfNeeded() {
  if (state.active && state.vehicleId && !watcherId && webWatchId === null) {
    if (isNativeApp) {
      await attach().catch(() => {});
    } else {
      // Browsers need a user tap to start GPS again.
      state.active = false;
      save();
    }
  }
  void syncGps();
}

export function todayKm(vehicleId: string): number {
  return state.days[vehicleId]?.[todayISO()] ?? 0;
}
