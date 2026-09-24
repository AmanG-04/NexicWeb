# Nexic Lounge

Single-page landing site with a Cloudflare Worker and D1-backed launch-interest form. No account or payment is required. The form stores a name, normalized WhatsApp number, campaign plan, session preference and anticipated arrival; it does not send WhatsApp messages. Duplicate phone numbers are rejected, and the first 50 unique stored numbers receive the launch discount.

## Cloudflare setup

The production D1 database `nexicweb-leads` has been created. Its ID and the Worker name `nexicweb` are configured in `wrangler.jsonc`.

1. Install the Wrangler CLI if needed: `npm install --global wrangler` (or use an existing installation).
2. Log in: `wrangler login`.
3. The initial schema migration has already been applied to the remote database. For future migrations, run `wrangler d1 migrations apply nexicweb-leads --remote` before deployment.
4. Deploy the Worker and assets from the repository root using your existing Git integration / Cloudflare deploy workflow. The project uses `src/worker.js` as its entrypoint and serves `public/index.html` as a static asset. The `/api/leads` route writes to the `DB` D1 binding.

No production deployment is performed by this repository change.

## Local development

Run `wrangler d1 migrations apply nexicweb-leads --local`, then `wrangler dev` and visit `http://localhost:8787`. Opening the HTML file directly or serving it through a static-only HTTP server will show the design, but the form needs the Worker and D1 binding to save registrations.

To view leads in Cloudflare: **Workers & Pages → D1 → nexicweb-leads → Console**, then run:

```sql
SELECT pass_id, name, phone, campaign, slot, arrival, discount_eligible, created_at
FROM leads ORDER BY id DESC;
```

The release countdown uses Rockstar's published 19 November 2026 release **date**, with midnight India time as a display marker; it does not claim an official unlock hour. GTA VI photos and video posters link to Rockstar's official pages.
