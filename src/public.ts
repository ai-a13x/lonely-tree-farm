import type { Env } from './env';
import { json, readJson } from './http';
import { isHoneypotHit, parseReserve, type Kind, type ReserveInput } from './model';
import { sendAlert } from './email';

export async function listActive(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    'SELECT id, name, blurb, ready, price, total, remaining FROM listings WHERE active = 1 ORDER BY sort, id',
  ).all();
  return json(results);
}

const COLUMNS = '(listing_id, kind, name, phone, email, note)';

/**
 * Takes one share and records the reservation in a single D1 batch (one transaction).
 * D1 runs it on a single thread, so the UPDATE's `remaining > 0` guard means two buyers
 * can never both take the last share; the INSERT only fires if the UPDATE changed a row.
 * Falls back to a waitlist row. Returns null when the listing does not exist or is hidden.
 */
export async function store(db: D1Database, i: ReserveInput): Promise<Kind | null> {
  const [, inserted] = await db.batch([
    db.prepare('UPDATE listings SET remaining = remaining - 1 WHERE id = ? AND active = 1 AND remaining > 0').bind(i.listing_id),
    db
      .prepare(`INSERT INTO reservations ${COLUMNS} SELECT ?, 'reservation', ?, ?, ?, ? WHERE changes() = 1`)
      .bind(i.listing_id, i.name, i.phone, i.email, i.note),
  ]);
  if (inserted?.meta.changes === 1) return 'reservation';
  const waited = await db
    .prepare(`INSERT INTO reservations ${COLUMNS} SELECT id, 'waitlist', ?, ?, ?, ? FROM listings WHERE id = ? AND active = 1`)
    .bind(i.name, i.phone, i.email, i.note, i.listing_id)
    .run();
  return waited.meta.changes === 1 ? 'waitlist' : null;
}

export async function reserve(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const raw = await readJson(req);
  if (raw === undefined) return json({ error: 'Invalid request' }, 400);
  if (isHoneypotHit(raw)) return json({ ok: true, kind: 'reservation' });
  const parsed = parseReserve(raw);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const kind = await store(env.DB, parsed.value);
  if (!kind) return json({ error: 'That share is no longer available' }, 404);
  ctx.waitUntil(sendAlert(env, parsed.value, kind));
  return json({ ok: true, kind });
}
