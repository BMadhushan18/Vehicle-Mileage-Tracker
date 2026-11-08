export interface Env {
  DB: D1Database;
  /** Only for local dev (set in .dev.vars). Never set this in production. */
  DEV_EMAIL?: string;
}

export interface UserRow {
  id: string;
  email: string;
  currency: string;
  distance_unit: 'km' | 'miles';
  date_format: string;
  created_at: string;
}

export interface Data extends Record<string, unknown> {
  user: UserRow;
}

export type Handler<P extends string = string> = PagesFunction<Env, P, Data>;
