import type { Env } from './env';
import { json, readJson } from './http';
import { canTransition, isStatus, parseListing, type Listing, type Reservation, type Status } from './model';

type Handler = (req: Request, env: Env, id: number) => Promise<Response>;

const failedCheck = (err: unknown) => String(err).includes('CHECK constraint');

async function data(_req: Request, env: Env): Promise<Response> {
  const [listings, reservations] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM listings ORDER BY sort, id'),
    env.DB.prepare(
      `SELECT r.*, l.name AS listing_name FROM reservations r JOIN listings l ON l.id = r.listing_id
       ORDER BY r.created_at DESC, r.id DESC LIMIT 500`,
    ),
  ]);
  return json({
    listings: listings?.results as unknown as Listing[],
    reservations: reservations?.results as unknown as (Reservation & { listing_name: string })[],
  });
}

async function createListing(req: Request, env: Env): Promise<Response> {
  const parsed = parseListing(await readJson(req), true);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const keys = Object.keys(parsed.value);
  try {
    const res = await env.DB.prepare(
      `INSERT INTO listings (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
    )
      .bind(...Object.values(parsed.value))
      .run();
    return json({ ok: true, id: res.meta.last_row_id }, 201);
  } catch (err) {
    if (failedCheck(err)) return json({ error: 'Remaining must be between 0 and the total' }, 400);
    throw err;
  }
}

const updateListing: Handler = async (req, env, id) => {
  const parsed = parseListing(await readJson(req), false);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const keys = Object.keys(parsed.value);
  try {
    const res = await env.DB.prepare(`UPDATE listings SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
      .bind(...Object.values(parsed.value), id)
      .run();
    return res.meta.changes === 1 ? json({ ok: true }) : json({ error: 'Not found' }, 404);
  } catch (err) {
    if (failedCheck(err)) return json({ error: 'Remaining must be between 0 and the total' }, 400);
    throw err;
  }
};

const adjustStock: Handler = async (req, env, id) => {
  const delta = ((await readJson(req)) as { delta?: unknown } | undefined)?.delta;
  if (delta !== 1 && delta !== -1) return json({ error: 'delta must be 1 or -1' }, 400);
  const res = await env.DB.prepare(
    'UPDATE listings SET remaining = remaining + ?1 WHERE id = ?2 AND remaining + ?1 BETWEEN 0 AND total',
  )
    .bind(delta, id)
    .run();
  if (res.meta.changes === 1) return json({ ok: true });
  const exists = await env.DB.prepare('SELECT 1 FROM listings WHERE id = ?').bind(id).first();
  return exists ? json({ error: 'Stock cannot go below 0 or above the total' }, 409) : json({ error: 'Not found' }, 404);
};

const setStatus: Handler = async (req, env, id) => {
  const to = ((await readJson(req)) as { status?: unknown } | undefined)?.status;
  if (!isStatus(to)) return json({ error: 'Invalid status' }, 400);
  const row = await env.DB.prepare('SELECT status, kind, listing_id FROM reservations WHERE id = ?')
    .bind(id)
    .first<{ status: Status; kind: string; listing_id: number }>();
  if (!row) return json({ error: 'Not found' }, 404);
  if (!canTransition(row.status, to)) return json({ error: `Cannot change ${row.status} to ${to}` }, 409);
  const statements = [
    env.DB.prepare('UPDATE reservations SET status = ? WHERE id = ? AND status = ?').bind(to, id, row.status),
  ];
  if (to === 'cancelled' && row.kind === 'reservation') {
    statements.push(
      env.DB.prepare('UPDATE listings SET remaining = MIN(total, remaining + 1) WHERE id = ? AND changes() = 1').bind(row.listing_id),
    );
  }
  const [changed] = await env.DB.batch(statements);
  return changed?.meta.changes === 1 ? json({ ok: true }) : json({ error: 'Someone else changed this first' }, 409);
};

const ROUTES: [method: string, path: RegExp, handler: Handler][] = [
  ['GET', /^\/api\/admin\/data$/, data],
  ['POST', /^\/api\/admin\/listings$/, createListing],
  ['PATCH', /^\/api\/admin\/listings\/(\d+)$/, updateListing],
  ['POST', /^\/api\/admin\/listings\/(\d+)\/adjust$/, adjustStock],
  ['POST', /^\/api\/admin\/reservations\/(\d+)\/status$/, setStatus],
];

export async function handleAdmin(req: Request, env: Env): Promise<Response> {
  const path = new URL(req.url).pathname;
  for (const [method, pattern, handler] of ROUTES) {
    const match = pattern.exec(path);
    if (match && req.method === method) return handler(req, env, Number(match[1]));
  }
  return json({ error: 'Not found' }, 404);
}
