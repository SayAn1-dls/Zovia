# ZUVIO Platform — Design Spec

Date: 2026-11-11
Status: engineering contract derived from the product brief. The brief says "do not stop at the planning stage", so this spec is written to be built from directly; decisions here are final unless the product owner overrides them.

Tagline: **Find your space. Find your people.**

---

## 1. What we are building

One connected web application with one data architecture, serving three primary experiences:

1. **Find a Home** — discover PGs, hostels, co-living, rooms and flats.
2. **Find a Roommate** — discover compatible people by budget, location and lifestyle.
3. **List Your Property** — owners publish and manage accommodation.

Personas: property seeker (student / working professional), roommate seeker, person who already has a place and needs a roommate, property owner / PG operator, admin / moderator.

Success means: a student finds a PG near college; a professional finds a flat near the office; two compatible people discover each other and chat; an owner manages vacancies; an admin runs the platform; the AI assistant recommends only real, available listings.

Explicit non-goals for this version: payments or bookings (a match or an enquiry is never a booking), native mobile apps, automated image classification, microservices, Kubernetes.

## 2. Principles (apply to every line of code)

1. **The database is the security boundary.** RLS is enabled on every table. Anything that crosses users or needs privilege happens inside a `SECURITY DEFINER` Postgres function that re-derives identity from `auth.uid()` and enforces every rule itself. The Next.js server validates and orchestrates but is never the only enforcer of a security rule.
2. **Core flows need only the public (publishable/anon) key.** The service-role key is optional at runtime and used only by trusted background paths (reference-data ingestion, e-mail recipient lookup, Postgres rate limiter for anonymous traffic). When it is absent those paths degrade visibly; nothing fakes success.
3. **No fabricated data.** No invented listings, availability, prices, distances or owner details — in seeds for production, in the UI, or in AI output. Production starts with reference data only (amenities, cities, questionnaire). Demo listings exist only in the local development seed.
4. **Optional integrations sit behind provider interfaces and are env-gated** (AI, maps, e-mail, Redis, analytics, Google sign-in, phone OTP, WhatsApp). Missing configuration hides or degrades the feature and reports its status through `/api/v1/health`.
5. **Never trust the client** for user id, role, ownership, price, status or permission.
6. **Less content, better experience.** Crisp pages, three primary actions, friendly short copy.
7. **YAGNI.** No queues or extra services; Postgres (`pg_cron`) runs scheduled jobs.

## 3. Stack

Next.js 16 (App Router, Turbopack, `src/`), React 19, TypeScript strict (+ `noUncheckedIndexedAccess`), Tailwind CSS 4, shadcn/ui, `motion` (Framer Motion), React Hook Form + Zod 4, TanStack Query 5, `nuqs` for URL state, lucide icons.
Supabase: Postgres 17 + PostGIS, Auth, Storage, Realtime. `@supabase/ssr` cookie sessions.
Vercel hosting. Optional: Upstash Redis (rate limiting), Resend (e-mail), Google Maps Platform (else OpenStreetMap services), AI provider (Anthropic Claude by default; rule-based mode when unconfigured).
Tooling: pnpm, ESLint, Prettier, Vitest (unit + integration), Playwright (Chromium + WebKit, desktop + mobile), Supabase CLI local stack in Docker, GitHub Actions.

## 4. Repository layout

```
src/
  app/                      routing only (pages, layouts, route handlers); thin
    (marketing)/            /, /about, /contact, /privacy, /terms, /safety, /list-your-property
    (auth)/                 /sign-in, /sign-up, /verify-email, /forgot-password, /reset-password
    auth/                   /auth/callback, /auth/confirm (route handlers)
    onboarding/
    (app)/                  /search, /properties/[slug], /saved, /roommates/**, /messages/**,
                            /assistant, /notifications, /settings/**, /account/suspended
    owner/                  owner portal
    admin/                  admin dashboard
    api/v1/**               REST route handlers
  features/<domain>/        vertical slices (see §9)
    schemas.ts              Zod schemas + inferred types (isomorphic)
    repository.ts           server-only; the only place that calls supabase.from()/rpc() for the domain
    service.ts              server-only business logic; takes a ServiceContext
    actions.ts              "use server" actions: validate -> service
    queries.ts              client hooks (TanStack Query) calling /api/v1
    components/
  server/                   cross-cutting server infrastructure (all `import "server-only"`)
    env.ts                  Zod-validated environment access
    supabase/               server.ts (user-scoped), public.ts (cookieless anon), admin.ts (service role, optional), proxy.ts
    auth/                   session.ts, guards.ts (requireUser/requireRole/requireStaff), rbac.ts
    http/                   handler.ts (createHandler), response.ts, errors.ts, pagination.ts, rate-limit.ts, origin.ts
    logger.ts
  lib/                      isomorphic utilities (cn, formatting, pricing, constants, database.types.ts, supabase/browser.ts)
  components/ui/            shadcn primitives
  components/               shared composites (layout, brand, feedback states)
  proxy.ts                  Next 16 request proxy (session refresh + route guards)
supabase/
  config.toml  migrations/  tests/ (pgTAP)  README.md
scripts/                    heavy.sh, seed-dev.ts, grant-admin.sql, backup scripts
tests/
  integration/              Vitest against the local Supabase stack
  e2e/                      Playwright journeys A–E + smoke + a11y/mobile checks
docs/                       architecture, database, API, permission matrix, deployment, backup & recovery
```

### Layering rules

- Pages and route handlers never talk to Supabase directly: page -> `service` -> `repository` -> Supabase. UI components never contain queries, business rules or auth checks.
- A repository receives a Supabase client; it never creates one. Services receive `ServiceContext = { supabase, user, requestId }` built by `server/auth` + `server/supabase`.
- The browser Supabase client (`lib/supabase/browser.ts`) is used only for: auth session state in the header, Realtime subscriptions, and Storage uploads/downloads. All data reads/writes go through server code.
- Public pages (home, search, property detail, static pages) must stay cacheable: they fetch with the cookieless `public.ts` client and never read cookies on the server; per-user bits (saved state, header avatar) load on the client.
- Data shape: database-derived fields stay `snake_case` end to end (rows, DTOs, JSON API) — no mapping layer. Functions, variables and props are camelCase. Repositories select explicit columns; never return private columns to another user.
- Money is integer INR. Timestamps are `timestamptz` (ISO strings in JSON). IDs are UUIDs.

## 5. Authentication, roles and account state

- Supabase Auth: e-mail + password. E-mail verification is OFF by product-owner decision (2026-11-12) until real e-mail delivery is configured; the app supports both settings (sign-up either signs in at once or sends the link). Also password reset, Google OAuth (shown only when `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=true`), phone OTP (shown only when `NEXT_PUBLIC_ENABLE_PHONE_AUTH=true`). PKCE flow; `/auth/callback` exchanges codes, `/auth/confirm` verifies e-mail token hashes. `next` redirect parameters are validated as same-origin relative paths.
- Roles live in `user_roles` (`seeker` default, `owner`, `moderator`, `admin`). Roles are never read from JWT `user_metadata` or from the client. SQL helpers: `has_role(role)`, `is_admin()`, `is_staff()` (admin or moderator).
- Becoming an owner is self-serve (`become_owner()` creates `property_owners` and grants `owner`). Admin/moderator are granted only by an admin (`admin_set_role`) or by the bootstrap script `scripts/grant-admin.sql`.
- Account status on `users.status`: `active`, `restricted`, `suspended`, `deleted`. Suspended users can sign in only to `/account/suspended` (reason + appeal). Restrictions (`user_restrictions`) are scoped: `messaging`, `matching`, `listing`, `all`.
- `src/proxy.ts` refreshes the session cookie and gates: `(app)` private routes -> signed-in; `/owner/**` -> owner; `/admin/**` -> staff; not-onboarded users -> `/onboarding`. Every server entry point re-checks with `requireUser()/requireRole()/requireStaff()`; the proxy is convenience, not security.
- Onboarding (short): intent (find home / find roommate / have a place, need a roommate / list a property) -> basics (student: college, course, year, preferred locality; professional: work location, optional company + industry, work schedule) -> routed by intent.
- Account deletion: `request_account_deletion()` anonymises the profile, pauses listings and the roommate profile, ends matches, marks the user `deleted`; a daily `pg_cron` job hard-deletes the auth user after 30 days.
- `user_sessions` from the brief is intentionally not created: Supabase Auth owns sessions (`auth.sessions`).

## 6. Data model (Postgres, schema `public`)

Conventions: `id uuid primary key default gen_random_uuid()` unless stated; `created_at`/`updated_at timestamptz not null default now()` with a shared `set_updated_at()` trigger; soft delete via `deleted_at` on users, properties, rooms, messages, reviews; enums as Postgres enum types; all foreign keys indexed; every function `set search_path = ''`; RLS enabled on every table (not forced, so SECURITY DEFINER functions keep working); default privileges revoked so nothing is exposed by accident.

RPC error contract: functions raise with custom SQLSTATE `ZV400` bad_request, `ZV401` unauthenticated, `ZV403` forbidden, `ZV404` not_found, `ZV409` conflict, `ZV422` validation_failed, `ZV423` restricted, `ZV429` rate_limited and a human message; `server/http/errors.ts` maps them to API errors.

### 6.1 Users
- `users` (id = auth.users.id, email, phone, phone_verified_at, date_of_birth, status, intent, onboarding_completed_at, last_seen_at, deleted_at) — private: self + staff. Created by trigger on `auth.users` together with profile, preferences and the `seeker` role.
- `user_profiles` (user_id PK, display_name, avatar_path, gender, occupation, college_name, course, academic_year, work_location, company, industry, work_schedule, home_city, bio) — readable by self, staff, and people who share a conversation with the user.
- View `public_user_cards` (user_id, display_name, avatar_path) — safe public card for reviews and chat headers.
- `user_preferences` (user_id PK, preferred_city, preferred_localities[], budget_min, budget_max, move_in_date, property_types[], occupancy_prefs[], email_notifications, marketing_opt_in).
- `user_roles` (user_id, role, granted_by, granted_at; PK(user_id, role)) — no client writes.
- `user_blocks` (blocker_id, blocked_id), `user_restrictions` (user_id, kind, reason, moderation_action_id, starts_at, ends_at, lifted_at), `user_violations` (user_id, kind, conversation_id, detected jsonb, created_at).

### 6.2 Property marketplace
Property, room and bed are separate entities: a property has many rooms; a room has many beds.

- `property_owners` (user_id PK, owner_type, business_name, contact_phone, contact_email, whatsapp_number, about, verification_status, verified_at, verified_by, phone_verified_at). Contact details are never selectable directly by other users; they are released only through `reveal_owner_contact()` and to the other party of an enquiry.
- View `property_owner_cards` (user_id, display name/business name, owner_type, verification_status, verified_at, member_since).
- `properties` (owner_id, slug unique, title, description, property_type, listing_mode `per_bed|entire_unit`, tenant_gender, furnishing, address_line, locality, city, state, pincode, landmark, `location geography(Point,4326)`; pricing: monthly_rent, security_deposit (entire unit), maintenance_monthly, electricity_billing `included|fixed|metered`, electricity_monthly_estimate, water_billing, water_monthly_estimate, food_available, food_included, food_monthly_charge, meal flags; lifecycle: status `draft|pending_review|published|paused|rejected|archived`, rejection_reason, submitted_at, approved_at, published_at, last_confirmed_at; denormalised for search (trigger-maintained): min_rent, max_rent, total_beds, available_beds, occupancy_options[], amenity_codes[], has_ac, has_attached_bathroom, cover_media_path, rating_avg, rating_count, search_tsv).
- `rooms` (property_id, name, room_type `private|shared`, capacity, rent_per_bed, security_deposit, has_attached_bathroom, has_ac, has_balcony, floor, area_sqft, description, position).
- `beds` (room_id, property_id, label, status `available|reserved|occupied|blocked`, available_from, rent_override). Beds per room cannot exceed capacity.
- `amenities` (code PK, name, category, icon, position) reference data; `property_amenities` (property_id, amenity_code).
- `property_media` (property_id, room_id?, storage_path, kind, alt_text, width, height, size_bytes, position, is_cover — one cover per property).
- `property_rules` (property_id, rule_code, allowed, value, note); `property_charges` (property_id, label, amount, frequency `monthly|one_time|yearly`, is_mandatory) for other additional costs.
- `property_availability` (property_id PK, status `available|limited|fully_occupied|coming_soon|unavailable`, available_from, min_stay_months, notice_period_days, last_confirmed_at, confirmed_by). **Property availability is its own statement.** For `entire_unit` listings the owner sets it. For `per_bed` listings it is derived by trigger from bed statuses, and the UI always shows bed counts separately ("3 of 8 beds available") — never conflated.
- `saved_properties` (user_id, property_id), `property_inquiries` (property_id, seeker_id, room_id?, bed_id?, message, move_in_date, occupants, status `new|responded|closed|spam`, conversation_id, owner_responded_at), `contact_reveals` (user_id, property_id).
- `property_verifications` (property_id, kind `authorisation|listing_confirmation|site_visit`, status, verified_at, verified_by, expires_at, record_id, notes; unique(property_id, kind)).
- `property_stats_daily` (property_id, day, views, saves, inquiries, contact_reveals) for owner listing performance.
- `cities` reference data (slug, name, state, location, is_active). `places` (kind, name, city, location, source, source_ref) and `property_nearby_places` (property_id, place_id, straight_line_m, route_distance_m?, travel_time_s?, travel_mode?) — written only by the trusted server path.

Three independent trust signals, never merged: **Owner verified** (`property_owners.verification_status`, identity documents reviewed by staff), **Property authorisation verified** (`property_verifications` kind `authorisation`), **Listing recently confirmed** (`properties.last_confirmed_at` within `listing_fresh_days`, default 30). Phone verification is recorded but is never treated as proof of ownership.

Listing lifecycle (enforced by trigger, not by the client): owner `draft -> pending_review` (via `submit_property_for_review`, which validates completeness), `published <-> paused`, `rejected -> pending_review`, any -> `archived`; staff `pending_review -> published|rejected`, `published -> rejected`. Only `published` listings are publicly visible.

Estimated monthly expense = rent (bed/room or entire unit) + maintenance + electricity estimate (if not included) + water estimate (if not included) + food charge (if available and not included) + mandatory monthly `property_charges`. One pure function in `lib/pricing.ts`, unit-tested, mirrored by SQL only where sorting needs it; one-time costs (deposit, one-time charges) are shown separately as move-in cost.

Search: SQL function `search_properties(...)` (SECURITY INVOKER, so RLS applies) with filters for city, locality, pincode, text, point + radius (PostGIS), budget, property types, occupancy, tenant gender, food, amenity codes (Wi-Fi, AC, parking, laundry, attached bathroom ...), furnishing, move-in date, available-only; sort by relevance/price/distance/newest; keyset or page pagination with total count. Indexes: GiST on `location`, GIN on `search_tsv` and `amenity_codes`, trigram on `locality`/`city`, partial B-trees on published listings. Distance in results is straight-line and labelled so.

### 6.3 Roommate matching
- `roommate_profiles` (user_id PK, status `draft|active|paused`, headline, about, age, gender, occupation, occupation_detail, city, preferred_localities[], location, budget_min, budget_max, move_in_date, has_place, last_active_at); `roommate_profile_photos` (user_id, storage_path, position).
- `roommate_places` (user_id PK, property_id?, title, description, property_type, locality, city, location, rent_share, deposit_share, vacancies, available_from, furnishing) — for "I already have a place and need a roommate".
- `roommate_preferences` (user_id PK, preferred_genders[], age_min, age_max, occupation_prefs[]).
- `lifestyle_questions` (code PK, factor, prompt, kind, options jsonb, position, is_active) reference data covering: food habits, smoking, drinking, sleep schedule, cleanliness, social habits, guests, music & noise, pets, cooking, personal space, study/work schedule, chores, rent payment habits. `roommate_lifestyle_answers` (user_id, question_code, value).
- `roommate_deal_breakers` (user_id, code).
- `roommate_likes` (liker_id, liked_id, action `like|pass`), `roommate_matches` (user_a < user_b unique pair, status `active|unmatched|blocked`, matched_at, ended_at, ended_by, conversation_id).
- `compatibility_weights` (factor PK, weight) admin-editable; defaults: budget 0.20, cleanliness 0.15, sleep 0.15, food 0.10, smoking_drinking 0.10, lifestyle 0.10, schedule 0.10, guests 0.05, location 0.05.
- `compatibility_results` (viewer_id, candidate_id, score, breakdown jsonb, shared[], conflicts[], algorithm_version, computed_at) per-viewer cache.

Matching: `roommate_candidates(limit)` returns the caller's candidate pool (active profiles in the same city, mutual gender preference satisfied, not blocked either way, not already swiped, not self). The **compatibility engine is a pure TypeScript module** (`features/roommates/compatibility.ts`): apply deal-breakers first (either direction excludes), score each factor 0..1, renormalise weights over answered factors, return percentage, shared preferences, potential conflicts and a short explanation. Weights come from `compatibility_weights`. `roommate_swipe(target, action)` records the swipe; a mutual like atomically creates exactly one match plus its conversation and notifies both (unique pair constraint + `ON CONFLICT` makes duplicates impossible). `roommate_unmatch`, `block_user`, `unblock_user`, `submit_report` complete the set. A match is never presented as a booking.

### 6.4 Messaging
- `conversations` (kind `roommate_match|property_inquiry`, match_id unique?, inquiry_id unique?, property_id?, status `active|closed`, last_message_at, last_message_preview), `conversation_members` (conversation_id, user_id, role, last_read_at, muted, left_at).
- `messages` (conversation_id, sender_id?, kind `text|image|system`, body, moderation `clean|flagged|blocked`, created_at, edited_at, deleted_at), `message_attachments` (message_id, storage_path, mime_type, size_bytes, width, height, moderation), `message_reports` (message_id, reporter_id, reason, details, snapshot jsonb, status).
- There is **no INSERT/UPDATE/DELETE grant on `messages` for clients**. All sends go through `send_message(conversation_id, body, attachment?)`, which checks membership, conversation state, blocks, restrictions and a per-minute cap, and — for `roommate_match` conversations only — runs `detect_contact_info(body)` (phone numbers incl. spaced/spelled digits, e-mail addresses incl. common obfuscation, WhatsApp/Telegram/Instagram/Snapchat links and handles). A detected message is not delivered; a `user_violations` row is recorded and the sender gets a warning. Escalation thresholds live in `platform_settings`: first violation = warning; repeated violations in 30 days = temporary messaging restriction (system `moderation_actions` row, appealable); suspension is always a staff decision. Detection is conservative (amounts, dates, pincodes and "do you use WhatsApp?" must not trigger). Owner enquiry conversations are exempt: owner contact stays available through the marketplace workflow.
- Realtime: `messages`, `conversation_members`, `conversations`, `notifications` are in the `supabase_realtime` publication (RLS filters what each subscriber receives). Typing indicators use a private Broadcast channel `conversation:<id>` authorised by RLS on `realtime.messages`. Read receipts are `conversation_members.last_read_at` via `mark_conversation_read()`.

### 6.5 Reviews and moderation
- `property_reviews` (property_id, author_id, rating 1–5, title, body, status `published|hidden|removed`; one per author per property; author must have an enquiry with the property), `owner_replies` (review_id PK, owner_id, body). Rating aggregates maintained by trigger.
- `reports` (reporter_id, target_type `user|property|roommate_profile|review|message`, target_id, reason_code, details, status `open|in_review|resolved|dismissed`, resolution fields), `moderation_actions` (actor_id? null = system, target_user_id, action, reason, report links, expires_at), `appeals` (user_id, moderation_action_id unique, statement, status, decided_by, decision_note).

### 6.6 Platform
- `notifications` (user_id, type, title, body, link_path, data, read_at) — created by DB functions/triggers, delivered live via Realtime.
- `verification_records` (subject_type `owner|property`, subject_id, submitted_by, kind, document_path in the private bucket, status, reviewed_by, reviewed_at, review_note).
- `admin_audit_logs` (actor_id, action, entity_type, entity_id, details jsonb, created_at) — append-only; written inside every admin function.
- `search_history` (user_id, source `web|assistant`, query_text, filters, result_count), `ai_usage_logs` (user_id, provider, model, feature, input_tokens, output_tokens, tool_calls, latency_ms, status, error_code).
- `contact_messages` (name, email, phone?, subject, message, user_id?, status) via `submit_contact_message()`.
- `platform_settings` (key, value jsonb) for thresholds and limits; `rate_limits` + `check_rate_limit()` (service role only) and `consume_rate_limit(action, max, window_seconds)` (per signed-in user, used inside RPCs and by the server).

### 6.7 Admin functions (all require staff, all write `admin_audit_logs`)
`admin_review_property`, `admin_review_verification`, `admin_resolve_report`, `admin_resolve_message_report`, `admin_moderate_user` (warning / restrict / suspend / unsuspend), `admin_decide_appeal`, `admin_set_review_status`, `admin_set_role` (admin only), `admin_dashboard_stats`, `admin_find_duplicate_listings` (same owner phone, pins within ~30 m, trigram-similar titles), `admin_stale_listings(days)`, `admin_update_compatibility_weights`, `admin_update_setting`.

### 6.8 Storage buckets
| Bucket | Visibility | Path | Who writes | Who reads | Limits |
|---|---|---|---|---|---|
| `property-media` | public | `<property_id>/<uuid>.<ext>` | the property's owner | everyone | 8 MB; jpeg/png/webp |
| `avatars` | public | `<user_id>/<uuid>.<ext>` | the user | everyone | 3 MB; jpeg/png/webp |
| `roommate-photos` | private | `<user_id>/<uuid>.<ext>` | the user | signed-in users with an active roommate profile (signed URLs) | 5 MB; images |
| `verification-documents` | private | `<user_id>/<uuid>.<ext>` | the user | the user + staff | 10 MB; images + PDF |
| `chat-attachments` | private | `<conversation_id>/<user_id>/<uuid>.<ext>` | conversation members | conversation members | 5 MB; images |

Type and size limits are enforced by the bucket configuration (server side) and validated again in the client and service. Images are resized/compressed to WebP in the browser before upload and served through `next/image`.

### 6.9 Scheduled jobs (`pg_cron`)
Hard-delete accounts 30 days after deletion; prune `rate_limits`; notify owners whose listings have not been confirmed within `listing_fresh_days`.

## 7. API (`/api/v1`)

Every handler is built with `createHandler({ auth, role, rateLimit, query, body }, fn)` which: assigns a request id, enforces same-origin on mutating methods (`Origin`/`Sec-Fetch-Site`), authenticates, authorises, rate-limits, validates with Zod, maps errors, and logs failures without sensitive data.

Envelope: success `{ ok: true, data, meta? }` (`meta` = `{ page, limit, total, has_more }` or `{ next_cursor }`); failure `{ ok: false, error: { code, message, details?, request_id } }` with codes `bad_request`(400) `unauthenticated`(401) `forbidden`(403) `restricted`(403) `not_found`(404) `conflict`(409) `validation_failed`(422) `rate_limited`(429) `unavailable`(503) `internal`(500).

Resources: `auth/*`, `me/*` (profile, preferences, onboarding, notifications, saved-properties, inquiries, blocks, appeals, delete), `properties/*` (search, detail, availability, reviews, inquiries, contact, save, nearby), `owner/*` (register, profile, properties, rooms, beds, media, inquiries, stats, verification, review replies), `roommates/*` (profile, questions, answers, candidates, swipes, matches, compatibility), `conversations/*` + `messages/*` (list, history, send, read, attachments, report), `reports`, `locations/*` (autocomplete, geocode), `assistant/*` (chat, status), `admin/*` (stats, users, owners, properties, verifications, reports, message-reports, reviews, appeals, duplicates, stale-listings, ai-usage, audit-logs, contact-messages, settings), `contact`, `health`, `openapi.json`. OpenAPI 3.1 is generated from the Zod schemas and rendered at `/docs/api`.

Security headers on every response: CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'`.

## 8. Integrations (all optional, all behind interfaces)

| Capability | Interface | Configured provider | Fallback when unconfigured |
|---|---|---|---|
| AI assistant | `AIProvider` | Anthropic Claude with tool calling | Rule-based requirement parser over the same real database tools, labelled "basic mode" |
| Geocoding / autocomplete / nearby places | `LocationProvider` | Google Maps Platform | OpenStreetMap services (Photon/Nominatim, Overpass) with caching |
| Route distance / travel time | `RoutingProvider` | Google Routes | Not shown; straight-line distance only, labelled as such |
| Map display | — | MapLibre GL with keyless vector tiles | — |
| Rate limiting | `RateLimiter` | Upstash Redis | Postgres limiter (needs service role) -> per-instance memory limiter |
| Transactional e-mail | `EmailProvider` | Resend | In-app notifications only; e-mail skipped and logged |
| Analytics | — | Google Analytics 4 behind a consent banner | Not loaded |
| WhatsApp support button | — | `NEXT_PUBLIC_WHATSAPP_NUMBER` | Hidden (share-to-WhatsApp on listings always works) |

AI assistant rules: tools are `search_properties`, `get_property`, `compare_properties`, `estimate_monthly_cost`, `find_nearby_places`, `geocode_place`, `suggest_roommates` (signed-in only). The UI renders property cards **only from tool results** (database rows); model text is commentary. The final answer is a structured `present_results` payload whose property ids are validated server-side against ids returned by tools in the same turn; unknown ids are dropped. No exact matches -> clearly labelled alternatives. Signed-in only, per-user quota, every call logged to `ai_usage_logs`. API keys live only in server env.

## 9. Feature modules and file ownership (parallel work never overlaps)

| Module | Owns |
|---|---|
| foundation | `src/server/**`, `src/lib/**`, `src/components/**`, `src/proxy.ts`, `src/app/layout.tsx`, global error/not-found/loading, `src/app/(marketing)/**`, `src/app/api/v1/{health,contact,openapi.json}/**`, config files |
| auth + account | `src/features/auth/**`, `src/features/account/**`, `src/app/(auth)/**`, `src/app/auth/**`, `src/app/onboarding/**`, `src/app/(app)/settings/**`, `src/app/(app)/account/**`, `src/app/api/v1/{auth,me}/**` |
| properties | `src/features/properties/**`, `src/app/(app)/{search,properties,saved}/**`, `src/app/api/v1/properties/**` |
| owner | `src/features/owner/**`, `src/app/owner/**`, `src/app/api/v1/owner/**` |
| locations | `src/features/locations/**`, `src/app/api/v1/locations/**` |
| roommates | `src/features/roommates/**`, `src/app/(app)/roommates/**`, `src/app/api/v1/roommates/**` |
| messaging | `src/features/messaging/**`, `src/app/(app)/messages/**`, `src/app/api/v1/{conversations,messages}/**` |
| moderation + notifications | `src/features/{moderation,notifications}/**`, `src/app/(app)/notifications/**`, `src/app/api/v1/reports/**` |
| assistant | `src/features/assistant/**`, `src/app/(app)/assistant/**`, `src/app/api/v1/assistant/**` |
| admin | `src/features/admin/**`, `src/app/admin/**`, `src/app/api/v1/admin/**` |
| database | `supabase/**`, `docs/database.md`, `docs/security/permission-matrix.md` |

Navigation lives in one config (`src/lib/navigation.ts`, foundation-owned) that already lists every route above, so feature work never edits shared chrome. A module may import another module's `service.ts` and `schemas.ts`, never its repository or components' internals.

## 10. Design system

Premium Gen-Z startup; not a legacy property portal. References for feel only (Airbnb discovery, Linear consistency, Spotify personality, Tinder swipe, Notion simplicity) — nothing copied.

- Colour tokens (CSS variables, Tailwind 4 theme): deep navy ink `#0B1026`, charcoal `#14182B`, electric violet primary `#6D4AFF` paired with electric blue `#4F7CFF` for gradients, soft lavender surfaces `#EEEAFE`, off-white background `#FAFAF7`, fresh green accent `#19C37D` (verified / available / success), amber warning, red danger. Single light theme with deliberately dark navy hero and footer bands; AA contrast everywhere.
- Type: display "Bricolage Grotesque", text "Geist" (both via `next/font`, self-hosted). Large confident headings, short sentences.
- Shape and motion: rounded-2xl cards, pill primary buttons, soft layered shadows, subtle 150–250 ms micro-interactions with `motion`, swipe deck with drag physics plus button and keyboard equivalents; respects `prefers-reduced-motion`.
- Every page has designed loading (skeleton), empty and error states. Mobile-first; touch targets >= 44 px; bottom tab bar on mobile for the app area.
- Shared composites (foundation-owned): `Logo`, `SiteHeader`, `SiteFooter`, `MobileTabBar`, `PageHeader`, `EmptyState`, `ErrorState`, `Money`, `RatingStars`, `VerifiedBadge`, `StatusBadge`, `ConfirmDialog`, `ImageUploader`, `Pagination`, `FormField` helpers.
- Home stays crisp: hero with the three primary actions and a search bar, a three-step "how it works", trust signals, city shortcuts, footer. No long paragraphs.

## 11. Environment variables (only what the code reads)

Public: `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH`, `NEXT_PUBLIC_ENABLE_PHONE_AUTH`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `NEXT_PUBLIC_WHATSAPP_NUMBER`, `NEXT_PUBLIC_SUPPORT_EMAIL`.
Server: `SUPABASE_SERVICE_ROLE_KEY`, `AI_PROVIDER`, `AI_PROVIDER_API_KEY`, `AI_MODEL`, `GOOGLE_MAPS_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `GOOGLE_SITE_VERIFICATION`.
`src/server/env.ts` validates them with Zod at first use; only the first three public ones are required. Secrets never reach client bundles (`server-only` + lint rule).

## 12. Testing

- **Unit (Vitest, jsdom):** utilities, pricing, compatibility engine, Zod schemas, permission/guard logic, assistant requirement parser, error mapping.
- **Database (pgTAP via `supabase test db`):** RLS per table and role, lifecycle triggers, `send_message`/contact detection vectors, swipe/match atomicity and uniqueness, rate limits, admin function guards.
- **Integration (Vitest, node, real local stack):** auth, property creation, search, roommate matching, mutual match, messaging permissions, owner access, admin permissions — exercised through services/route handlers with real sessions.
- **End-to-end (Playwright, Chromium + WebKit, desktop + mobile):** Journey A seeker (register -> search -> filter -> view -> save -> contact owner); B property first, roommate later; C already has a place; D owner (register -> verify -> add property -> rooms -> photos -> enquiries); E admin (review listing -> approve/reject -> manage reports); plus empty/loading/error states, invalid input, permission violations, link checker, axe accessibility smoke.
- Every bug found gets a failing test first, then the fix.

## 13. Environments, CI/CD, operations

- Local: Docker Supabase stack + `pnpm dev`; `scripts/seed-dev.ts` creates clearly fake demo data for local use only.
- Production: Vercel project + one Supabase project (Mumbai). Migrations are the only way schema changes reach production; they must apply cleanly to an empty database.
- CI (GitHub Actions): install -> lint -> typecheck -> unit -> build; then local Supabase stack -> database tests -> integration -> Playwright. Deploys via Vercel (Git integration when available, otherwise direct deployment).
- Operations: `/api/v1/health` (app + database + integration status), structured JSON logs with request ids, `instrumentation.ts` request-error hook, documented backup and recovery (scheduled logical dumps), migration and rollback strategy.

## 14. Product-owner changes (2026-11-12)

These override earlier sections where they conflict.

1. **E-mail verification off** until real e-mail delivery is configured (see section 5). Sign-up signs the person in at once.
2. **Bookings and payments are now in scope** (reverses the section 1 non-goal). Flow: seeker requests a specific bed (per-bed listing) or the unit (entire-unit listing) with a move-in date and stay length -> owner accepts or declines within a deadline -> on acceptance the seeker pays the **booking amount** (security deposit or first month, as the listing states) through **Razorpay** -> payment verified server-side (signature check + webhook) -> booking `confirmed`, the bed becomes `reserved`. Cancellation and refund rules are set per listing and enforced in SQL. Provider behind a `PaymentProvider` interface, env-gated: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (server only; the public key id reaches the browser in the order response). Recording/confirming payments uses the service-role client after signature verification (`src/features/bookings/payment-repository.ts`). Without keys the booking request flow still works and payment shows "online payment not configured"; nothing fakes a successful payment. Amounts are integer paise in payment records, integer INR elsewhere. A new module `bookings` owns `src/features/bookings/**`, `src/app/(app)/bookings/**`, `src/app/api/v1/{bookings,payments}/**`.
3. **Listing sources:** (a) owner-published listings (the only source of price, rooms, beds and availability); (b) a clearly separate "PGs and hostels on Google Maps" discovery section from the Google Places API (name, address, rating, Google photos with attributions, link to Maps), labelled that price and vacancy are unknown. Places content is fetched live per request (no long-term storage beyond `place_id`, per Google's terms). Needs `GOOGLE_MAPS_API_KEY`; hidden without it. No scraping of other listing sites.
4. **Imagery:** real photographs only. Marketing surfaces (home, city tiles, about) use free-licence real photos stored in `public/images/` with photographer credit in `public/images/CREDITS.md`. A listing shows only its owner's uploads or, for Google Places entries, Google photos. Stock photos are never shown as a specific property.
5. **Design references:** Airbnb (discovery, listing page, booking card) and Mobbin patterns for feel; nothing copied.
