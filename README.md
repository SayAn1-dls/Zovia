# Zovia

Find your space. Find your people. Zovia helps students and working professionals in India find
PGs, hostels and co-living spaces, and roommates who match how they live.

## What's inside

- **Cities** (`/cities`, `/cities/[slug]`): every tier 1 and tier 2 city (Mumbai, Delhi, Bengaluru,
  Hyderabad, Chennai, Kolkata, Pune, Ahmedabad, Gurugram, Noida, Indore, Jaipur, Lucknow, Chandigarh,
  Bhopal, Kochi, Coimbatore, Nagpur, Bhubaneswar, Dehradun, Vadodara, Surat, Visakhapatnam, Kota,
  Sonipat). Each city lists its PGs with filters for type, men / women, pure veg / non-veg, smoking,
  sharing, budget, AC, area and free beds, plus a price map.
- **PG pages** (`/properties/[slug]`): photos, about, room-wise rent and deposit, food, house rules
  (smoking, alcohol, non-veg, guests, curfew, pets), amenities, map, directions, and nearby
  restaurants, cafés, grocery stores, stations, hospitals and colleges, with a visit-request form.
- **Contact** (`/contact`): messages go to the developer's inbox with the sender as Reply-To.
- Owner portal, admin, bookings, roommate matching, messaging and an AI assistant (need Supabase).
- Installable as an app (web app manifest + service worker).

The PG catalogue lives in `src/features/catalog`. Neighbourhood coordinates and nearby places come
from OpenStreetMap (© OpenStreetMap contributors, ODbL); photos are from Wikimedia Commons (credits
on `/about#photo-credits`). Catalogue listings are marked as sample listings; owners' own listings
from the database appear alongside them.

## Run it

```bash
pnpm install
cp .env.example .env.local   # fill in at least the first three variables
pnpm dev
```

`pnpm verify` runs lint, type-check and unit tests.

## Contact form e-mail

Messages from `/contact` and PG visit requests are sent to `CONTACT_INBOX` (server-only, default
`sayanbhattacharya2024@gmail.com`) with the visitor's address as Reply-To:

1. Through Resend when `RESEND_API_KEY` and `EMAIL_FROM` are set. Until a domain is verified in
   Resend, it can only deliver to the Resend account's own address.
2. Otherwise (or if Resend fails) through [FormSubmit](https://formsubmit.co), which needs no key.
   **The very first message sends an "Activate form" e-mail to the inbox: click it once**, and
   every later message is delivered.

## Deploy (Vercel)

Import the repository in Vercel and set the environment variables from `.env.example`
(`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` at minimum).

## Handling big traffic spikes

Zovia is built so that a rush (a crowd opening the site and booking at the same moment) slows
down gracefully instead of crashing:

- **Shared state only.** In production every server instance talks to Supabase (Postgres) and,
  optionally, Upstash Redis, so you can run as many instances as you need behind a load balancer.
  The in-memory store is a local demo fallback, used only when Supabase is not configured.
- **Rate limits in layers.** nginx limits requests per IP at the edge; the app then applies a
  per-IP flood gate *before* authentication (so floods never reach the database) and per-user,
  per-route limits (`src/server/http/rate-limit.ts`; shared across instances through Upstash Redis
  or Postgres). Bookings have their own limit, plus a daily cap inside the database.
- **No double bookings.** `request_booking()` locks the bed row and unique indexes forbid two live
  bookings of one bed. Under a stampede the losers get a fast "just taken" answer (3 s lock
  timeout) instead of queueing on the database.
- **Load shedding.** Each instance works on at most `API_MAX_IN_FLIGHT` API requests at once;
  past that it answers 503 with `Retry-After` immediately, so it never runs out of memory.
- **Caching.** City and PG pages are prerendered; public search responses are cached by the CDN
  for 30 seconds.

**Vercel:** load balancing and autoscaling are built in. Set the Supabase variables and
`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (shared rate limits), and use the Supabase
connection pooler.

**Your own servers:** `deploy/` has an nginx load balancer (least-connections, passive health
checks, per-IP limits, static caching) in front of N app containers:

```bash
docker compose -f deploy/docker-compose.yml --env-file .env.production up -d --build --scale app=4
```

**Load tests:** `node loadtest/spike.mjs <url> 20000 1000` for a quick local spike, and
`k6 run -e BASE_URL=<url> loadtest/k6-spike.js` (or k6 Cloud) for large runs against a staging
deployment.

## Security

- **Developer-only admin.** Admin and moderator powers work only for the e-mails in `ADMIN_EMAILS`
  (server-only; default the developer's address), even if someone else holds a staff role.
- **Private by default.** Every account, booking, message, owner and admin API needs a signed-in
  session and the right role; every database table has row-level security, and anonymous users
  cannot write to any table. The only open endpoints are what visitors need: search, PG details,
  map data, the contact form and a bare health check (details need `HEALTH_CHECK_TOKEN` or an
  admin session).
- **Sign-in protection.** Attempts are limited per IP and per account (any IP), messages never say
  whether an e-mail has an account, and session cookies are `HttpOnly`, `SameSite=Lax` and
  `Secure` on https. The local demo store hashes passwords with scrypt and stores only hashes of
  random session tokens.
- **Browser hardening.** Strict Content Security Policy, HSTS, no framing, cross-origin isolation
  headers, cross-site request checks on every write, and `noindex` on private areas and the API.
- **No secrets in the browser.** The contact inbox, API keys and the admin list live only on the
  server.
