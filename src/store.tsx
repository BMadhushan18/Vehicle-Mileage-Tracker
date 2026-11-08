import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { Settings, VehicleWithStats } from '../shared/types';
import { ApiError, api } from './api';
import { defaultSettings } from './format';

export interface ToastOptions {
  kind?: 'info' | 'success' | 'error';
  action?: { label: string; onClick: () => void };
  duration?: number;
}
interface Toast extends ToastOptions {
  id: number;
  message: string;
}

interface AppState {
  settings: Settings;
  setSettings: (s: Settings) => void;
  vehicles: VehicleWithStats[] | null;
  activeVehicles: VehicleWithStats[];
  loadError: string | null;
  reloadVehicles: () => Promise<void>;
  /** 'all' or a vehicle id. */
  selected: string;
  setSelected: (id: string) => void;
  /** Bumped after any change so screens refetch. */
  dataVersion: number;
  bump: () => void;
  toast: (message: string, opts?: ToastOptions) => void;
}

const Ctx = createContext<AppState | null>(null);
const SELECTED_KEY = 'ridelog.selected';

function readSelected(): string {
  try {
    return localStorage.getItem(SELECTED_KEY) || 'all';
  } catch {
    return 'all';
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [vehicles, setVehicles] = useState<VehicleWithStats[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelectedState] = useState(readSelected);
  const [dataVersion, setDataVersion] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const toast = useCallback((message: string, opts: ToastOptions = {}) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, message, ...opts }]);
    setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== id)),
      opts.duration ?? (opts.action ? 5000 : 3500),
    );
  }, []);

  const reloadVehicles = useCallback(async () => {
    try {
      const list = await api.vehicles();
      setVehicles(list);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : 'Could not load your vehicles.');
    }
  }, []);

  useEffect(() => {
    api
      .me()
      .then(setSettings)
      .catch(() => {});
    reloadVehicles();
  }, [reloadVehicles]);

  const setSelected = useCallback((id: string) => {
    setSelectedState(id);
    try {
      localStorage.setItem(SELECTED_KEY, id);
    } catch {
      /* private mode */
    }
  }, []);

  const activeVehicles = useMemo(() => (vehicles ?? []).filter((v) => !v.is_archived), [vehicles]);

  // If the saved vehicle was deleted or archived, fall back to "all".
  useEffect(() => {
    if (vehicles && selected !== 'all' && !activeVehicles.some((v) => v.id === selected)) {
      setSelected('all');
    }
  }, [vehicles, activeVehicles, selected, setSelected]);

  const bump = useCallback(() => {
    setDataVersion((v) => v + 1);
    reloadVehicles();
  }, [reloadVehicles]);

  const value: AppState = {
    settings,
    setSettings,
    vehicles,
    activeVehicles,
    loadError,
    reloadVehicles,
    selected,
    setSelected,
    dataVersion,
    bump,
    toast,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind ?? 'info'}`}>
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  t.action!.onClick();
                  setToasts((list) => list.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}

export function errorText(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Something went wrong. Please try again.';
}
