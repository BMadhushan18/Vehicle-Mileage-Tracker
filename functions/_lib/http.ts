export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export function fail(status: number, code: string, message: string, details?: unknown): Response {
  return json({ error: { code, message, details } }, status);
}

export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  const len = Number(request.headers.get('content-length') ?? 0);
  if (len > 5_000_000)
    throw new HttpError(413, 'too_large', 'That file is too big. Please use a smaller one.');
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object') throw new Error('not an object');
    return body as T;
  } catch {
    throw new HttpError(400, 'bad_json', 'We could not read that data. Please try again.');
  }
}

export function notFound(what = 'That item'): HttpError {
  return new HttpError(404, 'not_found', `${what} was not found. It may have been deleted.`);
}

export function param(p: string | string[] | undefined): string {
  return Array.isArray(p) ? p[0] : (p ?? '');
}

/** Turn "", null, undefined into null; otherwise a number (NaN if not numeric). */
export function optNumber(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null;
  return typeof v === 'number' ? v : Number(v);
}

export function optText(v: unknown, max = 200): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

/** "Today" on the server in UTC. */
export function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}
