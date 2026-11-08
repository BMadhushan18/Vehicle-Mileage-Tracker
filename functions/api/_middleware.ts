import type { Handler, UserRow } from '../_lib/env';
import { verifyAccessJwt } from '../_lib/access';
import { HttpError, fail } from '../_lib/http';

/**
 * Runs before every /api request:
 * 1. Reads the signed-in email that Cloudflare Access adds to the request.
 * 2. Finds or creates the user row.
 * 3. Turns thrown errors into friendly JSON.
 */
export const onRequest: Handler = async (ctx) => {
  try {
    const { ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: aud, DEV_EMAIL } = ctx.env;
    let raw: string | null = null;
    if (team && aud) {
      // Production: trust only a verified Access token, never the plain header alone.
      raw = await verifyAccessJwt(ctx.request.headers.get('Cf-Access-Jwt-Assertion'), team, aud);
    } else if (DEV_EMAIL) {
      raw = DEV_EMAIL; // local development only
    } else {
      return fail(
        503,
        'not_configured',
        'Sign-in is not set up yet. Ask the owner to finish the Cloudflare Access setup.',
      );
    }
    const email = (raw ?? '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return fail(401, 'not_signed_in', 'Please sign in to use RideLog, then reload the page.');
    }

    const db = ctx.env.DB;
    let user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
    if (!user) {
      user = await db
        .prepare(
          `INSERT INTO users (id, email) VALUES (?, ?)
           ON CONFLICT(email) DO UPDATE SET email = excluded.email RETURNING *`,
        )
        .bind(crypto.randomUUID(), email)
        .first<UserRow>();
    }
    if (!user) throw new Error('Could not create user');
    ctx.data.user = user;
    return await ctx.next();
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message, e.details);
    console.error(e);
    return fail(
      500,
      'server_error',
      'Something went wrong on our side. Please try again in a moment.',
    );
  }
};
