import { describe, expect, it, vi } from 'vitest';
import { buildAlert } from '../src/email';
import { addListing, buyer, call, listing, post, rows, sent, testEnv } from './helpers';

describe('reserving', () => {
  it('takes one share, stores a reservation and emails Alex', async () => {
    const id = await addListing(4);
    sent.length = 0;
    const res = await post('/api/reserve', { ...buyer, listing_id: id });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, kind: 'reservation' });
    expect((await listing(id))?.remaining).toBe(3);
    expect(await rows()).toMatchObject([{ kind: 'reservation', status: 'open' }]);
    expect(sent).toHaveLength(1);
  });

  it('never lets two buyers take the last share', async () => {
    const id = await addListing(4, 1);
    const results = await Promise.all([
      post('/api/reserve', { ...buyer, name: 'A', listing_id: id }),
      post('/api/reserve', { ...buyer, name: 'B', listing_id: id }),
    ]);
    const kinds = (await Promise.all(results.map((r) => r.json() as Promise<{ kind: string }>))).map((b) => b.kind).sort();
    expect(kinds).toEqual(['reservation', 'waitlist']);
    expect((await rows()).map((r) => r.kind).sort()).toEqual(['reservation', 'waitlist']);
    expect((await listing(id))?.remaining).toBe(0);
  });

  it('puts a buyer on the waiting list when sold out, without touching stock', async () => {
    const id = await addListing(4, 0);
    const res = await post('/api/reserve', { ...buyer, listing_id: id });
    expect(await res.json()).toEqual({ ok: true, kind: 'waitlist' });
    expect((await listing(id))?.remaining).toBe(0);
    expect(await rows()).toMatchObject([{ kind: 'waitlist' }]);
  });

  it('pretends to succeed on a honeypot hit and stores nothing', async () => {
    const id = await addListing(4);
    sent.length = 0;
    const res = await post('/api/reserve', { ...buyer, website: 'http://spam.example', listing_id: id });
    expect(res.status).toBe(200);
    expect(await rows()).toEqual([]);
    expect((await listing(id))?.remaining).toBe(4);
    expect(sent).toEqual([]);
  });

  it('rejects a missing phone number with 400', async () => {
    const id = await addListing(4);
    const res = await post('/api/reserve', { ...buyer, phone: '  ', listing_id: id });
    expect(res.status).toBe(400);
    expect(await rows()).toEqual([]);
    expect((await listing(id))?.remaining).toBe(4);
  });

  it('refuses a hidden or unknown listing', async () => {
    const hidden = await addListing(4, 4, { active: 0 });
    expect((await post('/api/reserve', { ...buyer, listing_id: hidden })).status).toBe(404);
    expect((await post('/api/reserve', { ...buyer, listing_id: 99999 })).status).toBe(404);
    expect(await rows()).toEqual([]);
  });

  it('keeps the reservation when the alert email fails', async () => {
    const id = await addListing(4);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = testEnv({ ALERT: { send: async () => { throw new Error('smtp down'); } } as unknown as SendEmail });
    const res = await post('/api/reserve', { ...buyer, listing_id: id }, {}, failing);
    expect(res.status).toBe(200);
    expect(await rows()).toHaveLength(1);
    expect(log).toHaveBeenCalledWith('Alert email failed', expect.stringContaining('smtp down'));
    log.mockRestore();
  });
});

describe('GET /api/listings', () => {
  it('shows only active listings, in order', async () => {
    await addListing(4, 4, { name: 'Second', sort: 2 });
    await addListing(4, 4, { name: 'Hidden', active: 0 });
    await addListing(4, 4, { name: 'First', sort: 1 });
    const list = (await (await call('/api/listings')).json()) as { name: string }[];
    expect(list.map((l) => l.name)).toEqual(['First', 'Second']);
  });
});

describe('alert email', () => {
  it('names the share and buyer and says what is left', () => {
    const raw = buildAlert('a@example.com', { ...buyer, listing_id: 1 }, 'reservation', { name: 'The Half', remaining: 3, total: 4 }).asRaw();
    const subject = /^Subject: (.*)$/m.exec(raw)?.[1] ?? '';
    const readable = subject.startsWith('=?utf-8?B?') ? atob(subject.slice(10, -2)) : subject;
    expect(readable).toBe('New reservation: The Half (Jane Smith)');
    expect(raw).toContain('Phone: 502 555 0142');
    expect(raw).toContain('Left on this listing: 3 of 4');
  });
});
