import { generateKeyPair } from 'jose';
import { describe, expect, it } from 'vitest';
import { addListing, adminHeaders, buyer, call, listing, post, rows, signToken, testEnv } from './helpers';

const patch = async (path: string, body: unknown) =>
  call(path, { method: 'PATCH', headers: { 'content-type': 'application/json', ...(await adminHeaders()) }, body: JSON.stringify(body) });
const adminPost = async (path: string, body: unknown) => post(path, body, await adminHeaders());

describe('admin access', () => {
  it('rejects requests with no token', async () => {
    expect((await call('/api/admin/data')).status).toBe(403);
  });

  it('rejects tokens signed with the wrong key, audience or issuer', async () => {
    const other = await generateKeyPair('RS256');
    for (const token of [
      await signToken({ key: other.privateKey }),
      await signToken({ aud: 'someone-else' }),
      await signToken({ iss: 'https://evil.example.com' }),
      'not-a-jwt',
    ]) {
      expect((await call('/api/admin/data', { headers: { 'Cf-Access-Jwt-Assertion': token } })).status).toBe(403);
    }
  });

  it('fails closed when the Access vars are unset, even with a good token', async () => {
    const headers = await adminHeaders();
    expect((await call('/api/admin/data', { headers }, testEnv({ ACCESS_TEAM_DOMAIN: '' }))).status).toBe(403);
    expect((await call('/api/admin/data', { headers }, testEnv({ ACCESS_AUD: '' }))).status).toBe(403);
  });

  it('lets a valid token through', async () => {
    const res = await call('/api/admin/data', { headers: await adminHeaders() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ listings: [], reservations: [] });
  });
});

describe('reservation status', () => {
  const reserveOne = async (total: number, remaining: number) => {
    const id = await addListing(total, remaining);
    await post('/api/reserve', { ...buyer, listing_id: id });
    return { id, row: (await rows())[0]! };
  };

  it('cancelling a reservation returns the share', async () => {
    const { id, row } = await reserveOne(4, 4);
    expect((await listing(id))?.remaining).toBe(3);
    expect((await adminPost(`/api/admin/reservations/${row.id}/status`, { status: 'cancelled' })).status).toBe(200);
    expect((await listing(id))?.remaining).toBe(4);
    expect((await rows())[0]?.status).toBe('cancelled');
  });

  it('cancelling a waiting list entry does not touch stock', async () => {
    const { id, row } = await reserveOne(4, 0);
    expect(row.kind).toBe('waitlist');
    await adminPost(`/api/admin/reservations/${row.id}/status`, { status: 'cancelled' });
    expect((await listing(id))?.remaining).toBe(0);
  });

  it('marks collected without touching stock', async () => {
    const { id, row } = await reserveOne(4, 4);
    expect((await adminPost(`/api/admin/reservations/${row.id}/status`, { status: 'collected' })).status).toBe(200);
    expect((await listing(id))?.remaining).toBe(3);
  });

  it('rejects illegal transitions from collected', async () => {
    const { id, row } = await reserveOne(4, 4);
    const url = `/api/admin/reservations/${row.id}/status`;
    await adminPost(url, { status: 'collected' });
    expect((await adminPost(url, { status: 'open' })).status).toBe(409);
    expect((await adminPost(url, { status: 'cancelled' })).status).toBe(409);
    expect((await rows())[0]?.status).toBe('collected');
    expect((await listing(id))?.remaining).toBe(3);
  });

  it('never returns the same share twice', async () => {
    const { id, row } = await reserveOne(4, 4);
    const url = `/api/admin/reservations/${row.id}/status`;
    expect((await adminPost(url, { status: 'cancelled' })).status).toBe(200);
    expect((await adminPost(url, { status: 'cancelled' })).status).toBe(409);
    expect((await listing(id))?.remaining).toBe(4);
  });

  it('rejects an unknown status and an unknown reservation', async () => {
    const { row } = await reserveOne(4, 4);
    expect((await adminPost(`/api/admin/reservations/${row.id}/status`, { status: 'eaten' })).status).toBe(400);
    expect((await adminPost('/api/admin/reservations/99999/status', { status: 'collected' })).status).toBe(404);
  });
});

describe('listings', () => {
  it('creates a listing with remaining defaulting to total', async () => {
    const res = await adminPost('/api/admin/listings', { name: 'The Quarter', total: 6, price: '$900' });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: number };
    expect(await listing(id)).toMatchObject({ remaining: 6, total: 6, price: '$900', active: 1 });
  });

  it('keeps remaining within 0 and total', async () => {
    const id = await addListing(4, 2);
    expect((await patch(`/api/admin/listings/${id}`, { remaining: 5 })).status).toBe(400);
    expect((await patch(`/api/admin/listings/${id}`, { total: 1 })).status).toBe(400);
    expect((await adminPost('/api/admin/listings', { name: 'X', total: 2, remaining: 3 })).status).toBe(400);
    expect((await patch(`/api/admin/listings/${id}`, { total: 6, remaining: 5, price: '$1' })).status).toBe(200);
    expect(await listing(id)).toMatchObject({ total: 6, remaining: 5 });
  });

  it('hides and shows a listing', async () => {
    const id = await addListing(4);
    await patch(`/api/admin/listings/${id}`, { active: false });
    expect(await (await call('/api/listings')).json()).toEqual([]);
    await patch(`/api/admin/listings/${id}`, { active: true });
    expect(await (await call('/api/listings')).json()).toHaveLength(1);
  });

  it('adjusts stock by one and stops at the limits', async () => {
    const id = await addListing(2, 1);
    const adjust = (delta: number) => adminPost(`/api/admin/listings/${id}/adjust`, { delta });
    expect((await adjust(1)).status).toBe(200);
    expect((await adjust(1)).status).toBe(409);
    expect((await adjust(-1)).status).toBe(200);
    expect((await adjust(-1)).status).toBe(200);
    expect((await adjust(-1)).status).toBe(409);
    expect((await adjust(5)).status).toBe(400);
    expect((await listing(id))?.remaining).toBe(0);
  });
});
