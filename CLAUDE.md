@AGENTS.md

# CLAUDE.md: working on Zovia

Zovia is a Next.js 16 + Supabase platform for finding PGs, hostels and co-living in Indian cities,
matching roommates, and booking beds. The README tells the product story; this file is the working
guide: how the code is organised, the rules that keep it safe, what has been done, and what is left.

## Commands

| Task | Command |
|---|---|
| Install | `pnpm install` (pnpm 12 via corepack, Node 22+) |
| Dev server | `pnpm dev` |
| Production build / run | `pnpm build && pnpm start` (add `--keepAliveTimeout 65000` behind nginx) |
| Lint + types + unit tests | `pnpm verify` (`pnpm typecheck` runs `next typegen` first, so `PageProps` types exist) |
| Local database | `pnpm db:start` (Docker), `pnpm db:reset`, `pnpm db:test` |
| E2E (installed Chrome) | `PLAYWRIGHT_BASE_URL=http://localhost:3000 PW_CHANNEL=chrome pnpm exec playwright test --project=chromium --project=mobile-chrome` |
| Load / QA | `node loadtest/spike.mjs <url> <total> <concurrency>`, `node loadtest/booking-qa.mjs <url> <property_id> <bed_id> <users>`, `k6 run loadtest/k6-spike.js` |

## Architecture in one screen

- `src/app`: routes only. Route groups: `(marketing)`, `(app)`, `(auth)`, plus `owner/`, `admin/`, `api/v1/`.
- `src/features/<domain>`: `schemas.ts` (Zod, isomorphic), `service.ts` (business rules), `repository.ts`
  (Supabase queries), `components/`. Domains: catalog, properties, bookings, roommates, messaging,
  owner, admin, assistant, locations, auth, account, moderation, notifications.
- `src/server`: server-only. `http/handler.ts` (`createHandler`: origin check, load shedding, IP flood
  gate, auth, per-route rate limit, Zod parsing, error envelope), `auth/` (session, guards, RBAC,
  developer allowlist), `supabase/` (client factories), `email/`, `security-headers.ts`, `env.ts`.
- `src/lib`: isomorphic helpers (`site.ts`, `navigation.ts`, `format.ts`, `supabase/backend.ts`).
- `supabase/migrations`: the database is the final authority (RLS on every table, `SECURITY DEFINER`
  functions for anything atomic such as `request_booking`, `admin_review_property`).
- `src/features/catalog`: the 25-city sample catalogue (deterministic generator, 218 listings,
  1,997 OpenStreetMap places baked into `nearby-data.ts`). Ids look like `catalog:<slug>`.

### Data backend switch (`src/lib/supabase/backend.ts`)

- Supabase configured (`NEXT_PUBLIC_SUPABASE_URL` + `_ANON_KEY`) → real clients. **Production must use this**:
  every instance shares Postgres, so the app scales horizontally.
- Otherwise (or `NEXT_PUBLIC_DATA_BACKEND=memory`) → `src/server/supabase/memory.ts`, a single-process
  demo store persisted to `/tmp/zovia-memory-store-v1.json` (0600). NEXT_PUBLIC values are inlined at
  build time, so switching modes needs a rebuild.

## Rules that must not be broken

1. **Every API route goes through `createHandler`** (except the Razorpay webhook, which verifies an HMAC).
   Pick the narrowest `auth` level; `"public"` only for what signed-out visitors truly need.
2. **Staff powers = role AND allowlist.** `fetchAccessRow` strips `admin`/`moderator` unless the e-mail is in
   `ADMIN_EMAILS` (`src/server/auth/developer-access.ts`). Never grant staff from any other signal.
3. **No secrets or private addresses in `NEXT_PUBLIC_*`.** The contact inbox is `CONTACT_INBOX` (server-only).
4. **Bookings only via `request_booking()`**. It locks the bed (`FOR UPDATE`, 3 s lock timeout) and unique
   indexes forbid two live bookings per bed. Don't add a second write path.
5. **RLS on every new table**, no anon write grants; add SQL tests under `supabase/tests`.
6. **The assistant may only show listings a tool returned in the same turn** (`present.ts`). The paid
   AI provider is used only for signed-in users; anonymous visitors get the rule-based mode.
7. **Rate limits**: presets live in `src/server/http/rate-limit.ts` (`auth`, `search`, `mutation`, `booking`,
   `assistant`, `contact`, `upload`, `ip_flood`). New write endpoints default to `mutation`.
8. **Commits are authored as Sayan Bhattacharya** (`git -c user.name="Sayan Bhattacharya" -c
   user.email="sayanbhatt2005@gmail.com" commit …`) with **no Co-Authored-By line**. The repo owner asked for this.

## Gotchas learned the hard way

- **Next 16 is not older Next.** Read `node_modules/next/dist/docs/` first. `cacheComponents` is on: a
  `"use cache"` function must catch its own errors, or a build prerender fails when the DB is down.
- **MapLibre's CSS beats Tailwind's**: `.maplibregl-map { position: relative }` overrode `absolute`, so maps were
  0 px tall. The container uses an inline `style` for position. MapLibre also captures the pointer on
  press, so pin taps are handled as pointerdown + pointerup (`map-view.tsx`).
- **nginx keepalive must be shorter than Node's** (`keepalive_timeout 60s` vs `KEEP_ALIVE_TIMEOUT=65000`),
  or nginx reuses closed sockets, marks every app copy dead and answers 502.
- **Responsive grids need `grid-cols-1`** at the base, or long content makes an `auto` track wider than
  the phone. City filters fold behind a button below `lg`.
- **`useSearchParams` in a client list forces client rendering**: city presets are read from `window.location`
  after hydration so the list stays server-rendered.
- **macOS caps listen backlogs at 128** (`kern.ipc.somaxconn`): single-process load tests on a Mac show
  connect timeouts that are the OS, not the app. Test through the load balancer.
- zsh here aliases `ls`/`grep`; use `command ls` / `command grep`, and quote globs.

## What has been done (chronological)

1. **PG catalogue for 25 tier 1 and tier 2 cities**: city pages with filters (type, gender, veg/non-veg,
   smoking, sharing, budget, AC, area, free beds), PG pages (photos, about, rooms and rent, food, house
   rules, amenities, map, directions, similar PGs, visit request), CC-licensed photos with credits.
2. **Nearby places**: 1,997 restaurants, cafés, groceries, stations, hospitals and colleges from OpenStreetMap,
   with walking times, shown on every PG.
3. **Contact pipeline** to the developer's inbox (Resend → FormSubmit), stored for the admin inbox.
4. **Fixed 404s and crashes** when the database is unreachable; every page connected; app-like UI; PWA install.
5. **Fully responsive** from 320 px to desktop (grid fixes, folding filters, cookie banner above the tab bar).
6. **Map fixed and upgraded**: the blank map panel; rent-spread chart; tap-a-pin preview; hover highlights.
7. **Assistant made accurate**: searches the catalogue, understands neighbourhoods, diet, smoking, sharing,
   AC, "cheapest", follow-ups; rent statistics; named-PG answers; Claude tools for the same data.
8. **Scale**: real database restored for production (Sayan's in-memory store kept as demo fallback), IP flood
   gate before auth, booking rate limit, load shedding (503 + Retry-After), lock/statement timeouts on
   bookings, CDN cache for search, Docker + nginx load balancer, spike and k6 tests.
9. **Security**: fixed demo-mode auth (any password worked; cookie was the user id; "admin" e-mails became
   admins), developer-only staff powers, per-account sign-in limit, Secure cookies, private health details,
   kit preview off in production, contact inbox server-only, extra security headers, noindex on private areas,
   user cards (name + photo) only to people with a reason to see them, so the user base cannot be listed.
10. **Repo cleanup and QA**: removed 18 unused UI components, 3 unused packages and a machine-specific script;
    moved the spec to `docs/platform-spec.md`; new README with animated assets; Playwright journeys;
    booking stampede QA (200 users / 1 bed → 1 winner); 200k-request spike through nginx with 0 errors.

## QA record (latest run)

| Check | Result |
|---|---|
| Unit tests | 713 passing |
| Playwright journeys (desktop + phone, Chrome) | 15 passing, 1 skipped by design |
| Page crawl as admin | 278 pages, 0 broken |
| Booking stampede, 200 users on one bed | 1 created, 199 × 409, 0 × 5xx |
| Booking journey and abuse cases | all correct (see README) |
| Spike: 20k requests / 1k concurrent / 4 instances | 0 errors |
| Spike: 200k requests / 2k concurrent | 99% served, 1% graceful 503, 0 errors or drops |

## Still to do

- [ ] **Deploy**: Vercel (or `deploy/`) with Supabase cloud; set `ADMIN_EMAILS`, `CONTACT_INBOX`,
      `UPSTASH_REDIS_REST_URL`/`_TOKEN`, `HEALTH_CHECK_TOKEN`; run `supabase db push` (includes
      `20261115000100_booking_contention.sql`).
- [ ] Click the one-time FormSubmit "Activate form" e-mail after the first contact message (or configure Resend
      with a verified domain).
- [ ] Run `loadtest/k6-spike.js` on k6 Cloud against staging at the target peak; size the Supabase plan and
      connection pooler from the results.
- [ ] Replace sample catalogue listings with real owner listings city by city; remove the "sample" labels then.
- [ ] Razorpay keys for online deposit payment.
- [ ] Demo mode: an unregistered allowlisted e-mail could be claimed by whoever signs up first. Use demo mode
      only locally, or pre-create the developer account.
- [ ] Remaining "zuvio" internal identifiers (CSS class `prose-zuvio`, Supabase project id, Redis key prefix)
      could be renamed to "zovia" in one careful pass.
- [ ] `AGENTS.md` is regenerated by `next dev`; keep it.
