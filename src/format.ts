import type { DateFormat, DistanceUnit, Settings } from '../shared/types';

const SYMBOLS: Record<string, string> = {
  LKR: 'Rs. ',
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AUD: 'A$',
  CAD: 'C$',
  SGD: 'S$',
  AED: 'AED ',
  JPY: '¥',
  PKR: 'Rs. ',
  BDT: '৳',
};
export const CURRENCIES = Object.keys(SYMBOLS);

export function money(n: number | null | undefined, currency = 'LKR'): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '–';
  const sym = SYMBOLS[currency] ?? `${currency} `;
  return `${n < 0 ? '-' : ''}${sym}${Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function num(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '–';
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

export function fixed(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '–';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export const unitLabel = (u: DistanceUnit) => (u === 'miles' ? 'mi' : 'km');
export const perLiter = (u: DistanceUnit) => `${unitLabel(u)}/L`;

export function formatDate(iso: string | null | undefined, fmt: DateFormat = 'DD/MM/YYYY'): string {
  if (!iso) return '–';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (fmt === 'YYYY-MM-DD') return `${y}-${m}-${d}`;
  if (fmt === 'MM/DD/YYYY') return `${m}/${d}/${y}`;
  return `${d}/${m}/${y}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function monthLabel(ym: string, long = false): string {
  const [y, m] = ym.split('-').map(Number);
  return `${(long ? MONTHS_LONG : MONTHS)[m - 1]} ${y}`;
}

export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** Local "today" as YYYY-MM-DD. */
export function todayISO(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return todayISO(new Date(y, m - 1, d + days));
}

export function addMonths(iso: string, months: number): string {
  const [y, m] = iso.split('-').map(Number);
  return todayISO(new Date(y, m - 1 + months, 1));
}

export function lastDayOfMonth(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return todayISO(new Date(y, m, 0));
}

export function percentText(pct: number | null): string {
  if (pct === null) return '';
  const r = Math.round(Math.abs(pct));
  if (r === 0) return 'same as your average';
  return `${r}% ${pct > 0 ? 'better' : 'worse'} than your average`;
}

export const defaultSettings: Settings = {
  email: '',
  currency: 'LKR',
  distance_unit: 'km',
  date_format: 'DD/MM/YYYY',
};

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
