import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createApp } from '../src/app';
import type { Env } from '../src/env';

export const TEAM = 'farm.cloudflareaccess.com';
export const AUD = 'test-audience';

const pair = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'test-key', alg: 'RS256' };
const app = createApp(() => createLocalJWKSet({ keys: [jwk] }));

export const sent: unknown[] = [];

export function testEnv(over: Partial<Env> = {}): Env {
  const alert = { send: async (m: unknown) => void sent.push(m) } as unknown as SendEmail;
  return {
    DB: env.DB,
    ASSETS: env.ASSETS,
    ALERT: alert,
    ALERT_TO: 'alerts@example.com',
    ACCESS_TEAM_DOMAIN: TEAM,
    ACCESS_AUD: AUD,
    ...over,
  };
}

export async function signToken(opts: { aud?: string; iss?: string; key?: CryptoKey } = {}) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(opts.iss ?? `https://${TEAM}`)
    .setAudience(opts.aud ?? AUD)
    .setExpirationTime('5m')
    .sign(opts.key ?? pair.privateKey);
}

export async function call(path: string, init: RequestInit = {}, e: Env = testEnv()) {
  const ctx = createExecutionContext();
  const res = await app.fetch!(new Request('https://lonelytreefarm.com' + path, init) as never, e, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

export const post = (path: string, body: unknown, headers: Record<string, string> = {}, e?: Env) =>
  call(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }, e);

export async function adminHeaders() {
  return { 'Cf-Access-Jwt-Assertion': await signToken() };
}

export async function addListing(total: number, remaining = total, extra: Record<string, unknown> = {}) {
  const row = { name: 'The Half', sort: 0, active: 1, ...extra };
  const res = await env.DB.prepare(
    'INSERT INTO listings (name, total, remaining, sort, active) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(row.name, total, remaining, row.sort, row.active)
    .run();
  return res.meta.last_row_id;
}

export const listing = (id: number) => env.DB.prepare('SELECT * FROM listings WHERE id = ?').bind(id).first<{ remaining: number }>();
export const rows = () => env.DB.prepare('SELECT * FROM reservations ORDER BY id').all<{ id: number; kind: string; status: string }>().then((r) => r.results);

export const buyer = { name: 'Jane Smith', phone: '502 555 0142', email: 'jane@example.com', note: 'Saturdays', website: '' };
