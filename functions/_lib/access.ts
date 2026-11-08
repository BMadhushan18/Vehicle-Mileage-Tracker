/**
 * Verifies the Cloudflare Access JWT (Cf-Access-Jwt-Assertion) so the email header
 * cannot be faked by calling the *.pages.dev URL directly.
 */
interface Jwk extends JsonWebKey {
  kid: string;
}

let certCache: { team: string; keys: Jwk[]; at: number } | null = null;

async function getKeys(team: string): Promise<Jwk[]> {
  if (certCache && certCache.team === team && Date.now() - certCache.at < 3600_000) {
    return certCache.keys;
  }
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('Could not load Access certs');
  const { keys } = (await res.json()) as { keys: Jwk[] };
  certCache = { team, keys, at: Date.now() };
  return keys;
}

function b64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

/** Returns the verified email, or null if the token is missing or invalid. */
export async function verifyAccessJwt(
  token: string | null,
  team: string,
  aud: string,
): Promise<string | null> {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(b64url(parts[0]))) as {
      kid?: string;
      alg?: string;
    };
    if (header.alg !== 'RS256') return null;
    const jwk = (await getKeys(team)).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      b64url(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(b64url(parts[1]))) as {
      email?: string;
      aud?: string | string[];
      exp?: number;
      iss?: string;
    };
    const auds = Array.isArray(p.aud) ? p.aud : [p.aud];
    if (!auds.includes(aud)) return null;
    if (!p.exp || p.exp * 1000 < Date.now()) return null;
    if (p.iss !== `https://${team}`) return null;
    return p.email ?? null;
  } catch {
    return null;
  }
}
