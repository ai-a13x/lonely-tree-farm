import { EmailMessage } from 'cloudflare:email';
import { createMimeMessage } from 'mimetext/browser';
import type { Env } from './env';
import type { Kind, ReserveInput } from './model';

const FROM = 'reservations@lonelytreefarm.com';

interface ListingStock {
  name: string;
  remaining: number;
  total: number;
}

export function buildAlert(to: string, input: ReserveInput, kind: Kind, listing: ListingStock | null) {
  const what = listing?.name ?? `Listing ${input.listing_id}`;
  const label = kind === 'reservation' ? 'New reservation' : 'New waiting list sign-up';
  const msg = createMimeMessage();
  msg.setSender({ name: 'Lonely Tree Farm', addr: FROM });
  msg.setRecipient(to);
  msg.setSubject(`${label}: ${what} (${input.name})`);
  msg.addMessage({
    contentType: 'text/plain',
    data: [
      `${label}: ${what}`,
      '',
      `Name: ${input.name}`,
      `Phone: ${input.phone}`,
      `Email: ${input.email || '(none)'}`,
      `Note: ${input.note || '(none)'}`,
      '',
      listing ? `Left on this listing: ${listing.remaining} of ${listing.total}` : '',
    ].join('\n'),
  });
  return msg;
}

/** Never throws: an email problem must not lose the reservation. */
export async function sendAlert(env: Env, input: ReserveInput, kind: Kind): Promise<void> {
  try {
    if (!env.ALERT_TO) throw new Error('ALERT_TO is not set');
    const listing = await env.DB.prepare('SELECT name, remaining, total FROM listings WHERE id = ?')
      .bind(input.listing_id)
      .first<ListingStock>();
    const msg = buildAlert(env.ALERT_TO, input, kind, listing);
    await env.ALERT.send(new EmailMessage(FROM, env.ALERT_TO, msg.asRaw()));
  } catch (err) {
    console.error('Alert email failed', String(err));
  }
}
