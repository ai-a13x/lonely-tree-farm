# Lonely Tree Farm

Website for lonelytreefarm.com. Buyers reserve a half or quarter cow online. No payment happens on the site: Alex calls to agree price, cuts and collection. One Cloudflare Worker serves the static site, a small JSON API and the admin page, with a D1 database.

## How the admin works

Alex opens `/admin`, signed in through Cloudflare Access. From there he can:

- Tap - or + to change how many shares are left on a listing.
- Edit a listing (name, description, ready date, price, totals, order), hide or show it, or add a new one. An empty price shows "Ask Alex" on the site.
- See every reservation with the buyer's phone (tap to call), email and note, then mark it collected or cancel it. Cancelling a reservation puts the share back on sale. Waiting list entries never change stock.

Each new reservation or waiting list sign-up also emails an alert to `ALERT_TO`.

## Run locally

```sh
npm install
npm run db:migrate:local
npm run dev        # http://localhost:8787
npm test
npm run typecheck
```

Locally the `/api/admin/*` routes answer 403, because no Access token exists. The tests cover them with a locally signed token. Local alert emails are written to `.wrangler/tmp/email/`.

## Deploy

1. `npx wrangler d1 create lonely-tree-farm`, then put the returned id in `database_id` in `wrangler.jsonc`.
2. `npm run db:migrate:remote`
3. Set `ACCESS_TEAM_DOMAIN` (for example `yourteam.cloudflareaccess.com`, no `https://`) and `ACCESS_AUD` (the Access application's audience tag) in `wrangler.jsonc`. While either is empty, every admin API call is refused.
4. Add a Cloudflare Access application covering `lonelytreefarm.com/admin` and `lonelytreefarm.com/api/admin`.
5. Turn on Email Routing for the domain and verify the destination address. `ALERT_TO` must match `destination_address` in the `send_email` block.
6. `npm run deploy`

The Worker checks the Access token on every admin API request as well, so the API stays closed even if the Access rule is misconfigured. The static `/admin` page itself is only protected by the Access rule.

## Layout

- `src/` Worker: `app.ts` routing, `public.ts` listings and reserve, `admin.ts` admin API, `access.ts` token check, `email.ts` alerts, `model.ts` types, status transitions and input parsing.
- `migrations/` D1 schema.
- `public/` the site (`index.html`, `site.css`, `site.js`), `admin/index.html`, and photos in `img/`.
- `test/` Vitest tests that run in the Workers runtime against a real local D1.
