export interface Env {
  DB: D1Database;
  /** Only for local dev (set in .dev.vars). Never set this in production. */
  DEV_EMAIL?: string;
  /** Your Zero Trust team domain, e.g. "myteam.cloudflareaccess.com". */
  ACCESS_TEAM_DOMAIN?: string;
  /** The "Application Audience (AUD) Tag" of the Access application. */
  ACCESS_AUD?: string;
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
