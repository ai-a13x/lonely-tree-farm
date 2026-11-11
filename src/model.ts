export type Kind = 'reservation' | 'waitlist';
export type Status = 'open' | 'collected' | 'cancelled';

export interface Listing {
  id: number;
  name: string;
  blurb: string;
  ready: string;
  price: string;
  total: number;
  remaining: number;
  active: number;
  sort: number;
  created_at: string;
}

export interface Reservation {
  id: number;
  listing_id: number;
  kind: Kind;
  status: Status;
  name: string;
  phone: string;
  email: string;
  note: string;
  created_at: string;
}

/** The only legal status changes. Anything not listed is rejected. */
export const TRANSITIONS: Record<Status, readonly Status[]> = {
  open: ['collected', 'cancelled'],
  collected: [],
  cancelled: [],
};

export const isStatus = (v: unknown): v is Status =>
  typeof v === 'string' && Object.hasOwn(TRANSITIONS, v);

export const canTransition = (from: Status, to: Status) => TRANSITIONS[from].includes(to);

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

const oneLine = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().replace(/\s+/g, ' ');
  return s.length <= max ? s : undefined;
};

export interface ReserveInput {
  listing_id: number;
  name: string;
  phone: string;
  email: string;
  note: string;
}

export function isHoneypotHit(raw: unknown): boolean {
  const hp = (raw as { website?: unknown } | null)?.website;
  return typeof hp === 'string' && hp.trim() !== '';
}

export function parseReserve(raw: unknown): Parsed<ReserveInput> {
  if (typeof raw !== 'object' || raw === null) return fail('Invalid request');
  const b = raw as Record<string, unknown>;
  const listing_id = b.listing_id;
  if (!Number.isInteger(listing_id) || (listing_id as number) < 1) return fail('Pick a share to reserve');
  const name = oneLine(b.name, 100);
  if (!name) return fail('Please enter your name');
  const phone = oneLine(b.phone, 40);
  if (!phone || (phone.match(/\d/g)?.length ?? 0) < 7) return fail('Please enter a phone number Alex can call');
  const email = oneLine(b.email ?? '', 200);
  if (email === undefined || (email !== '' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) {
    return fail('That email address does not look right');
  }
  const noteRaw = b.note ?? '';
  const note = typeof noteRaw === 'string' ? noteRaw.trim() : undefined;
  if (note === undefined || note.length > 1000) return fail('Note is too long');
  return { ok: true, value: { listing_id: listing_id as number, name, phone, email, note } };
}

const text = (max: number) => (v: unknown) => oneLine(v, max);
const int = (min: number, max: number) => (v: unknown) =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : undefined;
const flag = (v: unknown) => (v === true || v === 1 ? 1 : v === false || v === 0 ? 0 : undefined);

const LISTING_FIELDS = {
  name: text(100),
  blurb: text(500),
  ready: text(100),
  price: text(100),
  total: int(0, 10000),
  remaining: int(0, 10000),
  active: flag,
  sort: int(-10000, 10000),
} as const;

export type ListingPatch = Partial<Record<keyof typeof LISTING_FIELDS, string | number>>;

/** Keys of the result come from LISTING_FIELDS only, so they are safe to put in SQL. */
export function parseListing(raw: unknown, create: boolean): Parsed<ListingPatch> {
  if (typeof raw !== 'object' || raw === null) return fail('Invalid request');
  const b = raw as Record<string, unknown>;
  const out: ListingPatch = {};
  for (const [key, parse] of Object.entries(LISTING_FIELDS)) {
    if (!(key in b)) continue;
    const value = parse(b[key]);
    if (value === undefined) return fail(`Invalid ${key}`);
    out[key as keyof ListingPatch] = value;
  }
  if (create) {
    if (!out.name) return fail('A listing needs a name');
    if (out.total === undefined) return fail('A listing needs a total');
    out.remaining ??= out.total;
  } else if (Object.keys(out).length === 0) {
    return fail('Nothing to change');
  }
  if (typeof out.name === 'string' && out.name === '') return fail('A listing needs a name');
  return { ok: true, value: out };
}
