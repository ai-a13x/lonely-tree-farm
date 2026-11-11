import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Env } from './env';

export type KeySource = (teamDomain: string) => JWTVerifyGetKey;

const remote = new Map<string, JWTVerifyGetKey>();
export const cloudflareKeys: KeySource = (team) => {
  let keys = remote.get(team);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`));
    remote.set(team, keys);
  }
  return keys;
};

/** True only for a valid Cloudflare Access token for this app. Unset config fails closed. */
export async function hasValidAccessToken(req: Request, env: Env, keys: KeySource): Promise<boolean> {
  const team = env.ACCESS_TEAM_DOMAIN;
  const aud = env.ACCESS_AUD;
  const token = req.headers.get('Cf-Access-Jwt-Assertion');
  if (!team || !aud || !token) return false;
  try {
    await jwtVerify(token, keys(team), { issuer: `https://${team}`, audience: aud, algorithms: ['RS256'] });
    return true;
  } catch (err) {
    console.warn('Access token rejected', String(err));
    return false;
  }
}
