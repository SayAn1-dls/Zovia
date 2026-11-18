# Stay booking (Zostel-style): design and contract

Goal: booking works like zostel.com (observed 2026-11-19): pick dates, pick room types with a
quantity, see a live price with tax, book, pay or reserve, get a confirmation, cancel by policy.
The look of the site does not change; only the booking behaviour does.

This replaces the long-stay "request, owner accepts, pay a deposit" flow for catalogue listings.
The old `request_booking()` flow for owner-published database listings stays until owners can set
nightly prices (phase 2, see the end).

## What Zostel does (reference)

- Search is destination plus check-in and check-out. No guest-count input: guests are the bed quantity.
- State lives in the URL: `?checkin=YYYY-MM-DD&checkout=YYYY-MM-DD&rooms=<type>@<qty>,...`.
- A property page lists room types (dorm bed, private room): per-night price, select button that
  becomes a - / qty / + stepper, several types in one cart.
- A sticky summary: dates, lines "type x qty", "unit price x nights", stay total, tax (flat 5%),
  grand total, payable now (full prepayment), a big Book now button. On mobile a sticky bottom bar
  that opens a summary sheet.
- Sold out for the dates: a 7-day mini calendar with units left and price per night, and nearby alternatives.
- Policies: cancellation timeline (no charge until 7 days before check-in, then no refund), no date
  change inside 7 days, 18+, ID at check-in, check-in 1 PM, check-out 10 AM, max group 8.
- Booking needs a login; payment is the last step.

## Our model

Listings are catalogue listings (`catalog:<slug>`, code in `src/features/catalog`). Each has up to
three room types (`sharing[]`: single, double, triple) with `rent` (per month) and `beds_left`.

- **Unit**: one bed of a room type. Guests = total units booked. Max 8 units, 1 to 30 nights per booking.
- **Nightly price per unit** = `ceil(rent / 30)`, shown as "per night" with a note that it comes from the monthly rent.
- **Inventory per night** = `beds_left` for the type minus units already booked for that night
  (bookings in status `confirmed` or a live `pending_payment` hold). A type is "Sold out" when the
  minimum over the requested nights is 0.
- **Tax**: 5% of the stay total when the nightly unit price is at most 7,500, else 18%. Whole rupees,
  rounded half up. Constants live in one place; the rate is shown on every quote.
- **Total** = stay total + tax. **Payable now** = total (full prepayment, as Zostel).
- **Dates**: check-in from today (India time) to 365 days ahead; check-out after check-in. Check-in 13:00, check-out 10:00.
- **Statuses**: `pending_payment` (held 15 minutes while paying online), `confirmed`, `cancelled`,
  `expired` (hold ran out), `completed` (after check-out). Payment mode: `online` (Razorpay, when
  keys exist) or `at_property` (no keys: the booking is confirmed and paid at check-in; the UI says so).
  The mode follows `createStayPayments().configured()` everywhere (service, /book button label).
- **Payment hold**: an online booking holds its beds for 15 minutes. A guest who closes Razorpay is not
  stuck: `/bookings/<id>` shows a countdown from `hold_expires_at`, **Pay now** (asks `POST .../pay` for
  the same open order, opens checkout, then verify-payment) and **Cancel hold**. When the countdown ends
  the page refreshes and shows the expired state.
- **Caps** (8 beds, 1 to 30 nights, 365 days ahead, units per night) are enforced in SQL by
  `book_stay()`; the TypeScript checks only give friendlier messages. The last bookable check-in is
  today + 365 (India time) in the date inputs, the URL normaliser, the service and the database.
- **Price guard**: the checkout sends `expected_total_inr` (the total on screen). The service re-quotes
  and answers 409 "The price changed. Review and confirm again." when it differs; the checkout then
  refreshes the quote. The field is optional for other API clients.
- **Guest input**: the phone is normalised to 10 digits ("98765 43210", "+91 98765 43210",
  "09876543210", "91-98765-43210" all work) before validation and storage. Control characters are
  refused in the name and in special requests (new lines are kept in requests, `\r` is dropped).
- **Cancellation**: guest may cancel until check-in. Refund = 100% of the amount paid online when
  cancelled at least 7 days before check-in, else 0%. Online refunds are issued through the payment
  provider when configured, otherwise marked `refund_due` for the team. Within 7 days dates cannot be changed.
- **Honesty**: catalogue listings are samples. The confirmation page keeps the "sample listing" notice
  and says Zovia confirms details with the property. Nothing claims a real owner has been paid.

## Database (Postgres, RLS on everything, explicit grants)

- `stay_inventory(listing_ref text, room_type text, units int, rent_per_month int, ...)`, one row per
  listing and room type, filled from the catalogue by `scripts/sync-stay-inventory.mjs` (idempotent
  upsert, service role or `supabase db query`). The database is the authority for capacity, so a
  client can never claim more beds than exist.
- `stay_bookings(id, user_id, listing_ref, check_in date, check_out date, nights, guests, status,
  payment_mode, amount_stay_inr, amount_tax_inr, amount_total_inr, guest_name, guest_phone,
  guest_email, special_requests, hold_expires_at, cancelled_at, cancel_reason, refund_inr, refund_status, ...)`
  and `stay_booking_items(booking_id, room_type, units, unit_price_inr)`.
- Nightly availability is enforced atomically: `book_stay(...)` locks the inventory rows for the
  listing (advisory lock or `FOR UPDATE`), recomputes per-night remaining units over the range, and
  inserts the booking only if every night has enough. Two people booking the last bed: exactly one wins,
  the other gets a clear "sold out for these dates" error (ZV409). Prices are recomputed in SQL from
  `stay_inventory`, never taken from the client.
- Functions (all `set search_path = ''`, executable by `authenticated` only unless stated):
  `stay_availability(listing_ref, check_in, check_out)` (anon + authenticated; per type: units_left for
  the range and a 7-night strip of units and price), `book_stay(...)`, `cancel_stay(id, reason)`,
  `expire_stay_holds()` (service role, run by pg_cron every minute), `mark_stay_paid(...)` (service role,
  called by the verified payment webhook or checkout verification).
- Owners and staff: staff read all; no owner role yet for catalogue listings.
- Tests (pgTAP): a user sees only their own bookings; capacity is never exceeded under concurrent
  attempts; overlapping and adjacent ranges (check-out day is free for the next check-in); price recomputed
  in SQL; cancel refund by policy; holds expire; a suspended user cannot book.

## API (`createHandler`, envelope `{ ok, data } | { ok:false, error }`, snake_case)

- `GET /api/v1/stays/availability?listing=<slug>&checkin=&checkout=` (public, CDN cache
  `s-maxage=15, stale-while-revalidate=30`). When a room type is sold out the response also has
  `alternatives`: up to 3 similar places in the same city that have beds (`similarCatalogListings`).
- `POST /api/v1/stays/quote` body `{ listing, checkin, checkout, rooms:[{ room_type, qty }] }` (public):
  returns nights, lines, stay_total, tax_rate, tax, grand_total, payable_now, per-type availability, policy.
- `POST /api/v1/stays/bookings` (user, preset `booking`): quote body plus
  `{ guest:{ name, phone, email }, special_requests?, accept_policy:true }`. Returns the booking and the
  payment instruction (`online` order data, or `at_property`).
- `POST /api/v1/stays/bookings/[id]/pay` (user, preset `booking`, no body): the payment instruction for
  the caller's own `pending_payment` booking, re-using the open order. 404 for someone else's booking,
  409 when it is not waiting for payment or the hold ended.
- `POST /api/v1/stays/bookings/[id]/cancel` (user). `GET /api/v1/stays/bookings` and `/[id]` (user: own).
- Payment: reuse the Razorpay provider in `src/features/bookings/payment-*.ts`; amount = grand total in paise.
- Notifications: on cancel and on creation of a pay-at-property booking (already confirmed), plus when an
  online payment is captured (sent by the payment side, not by `createBooking`: an unpaid hold is not
  announced). E-mail the team inbox (`deliverToTeam`, Reply-To the guest) with the
  full booking summary; notify the guest by e-mail only when a sender that can reach arbitrary addresses is
  configured (Resend with a verified domain), otherwise on-screen plus a WhatsApp link.
- WhatsApp: after booking, a "Send details on WhatsApp" button opens `https://wa.me/<NEXT_PUBLIC_WHATSAPP_NUMBER>?text=<booking summary>`;
  hidden when the number is unset. A "Share" link (no number) always works.

## Screens (keep the existing look, components and copy tone: short, narrative)

- Listing page (catalogue), right column: date range (two date inputs, nights shown), room-type cards with
  per-night price, "Select bed" that becomes a stepper, sold-out cards with the 7-night strip, then the
  sticky summary and **Book now**. Mobile: sticky bottom bar and a summary sheet. State in the URL.
  "Request a visit" stays below as "Ask a question".
- Sold-out room cards also list "Similar places nearby that have beds" (up to 3 links, once under the
  first sold-out card, keeping the chosen dates).
- A shared link with stale or invalid dates is not silently changed: a dismissible "Your dates were
  updated to ..." notice (`role="status"`) shows on the listing panel and on /book.
- `/book/<slug>?checkin=&checkout=&rooms=`: sign-in required (return here after), guest details
  (prefilled), special requests, policy accepted, summary, **Confirm and pay** or **Confirm booking**
  (pay at the property when online payment is not configured).
- `/bookings/<id>`: confirmation and manage page: status, dates, lines, totals, cancellation timeline,
  Cancel button (Cancel hold while unpaid), Pay now with the hold countdown, a Receipt link
  (`/bookings/<id>/invoice`, confirmed and cancelled bookings), WhatsApp and Share buttons. `/bookings` lists stay bookings and the old kind together.

## Onboarding does not block booking

`/book` and `/bookings` are exempt from the "not onboarded" redirect in `src/server/auth/route-access.ts`
(`ONBOARDING_EXEMPT_PREFIXES`): a new account can book at once, guest details are asked at checkout.
Every other private area still sends a not-onboarded account to `/onboarding`.

## Phase 2 (not in this build)

Owner-published database listings with owner-set nightly prices and room types feed the same
`stay_inventory`; owner inbox for stay bookings; owner-side blocked dates; per-night price calendar;
coupons; add-ons.

## Price vectors (SQL and TypeScript must both reproduce these exactly)

| rent per month | units | nights | unit price per night | stay total | tax | grand total |
|---|---|---|---|---|---|---|
| 9,000 | 2 | 3 | 300 | 1,800 | 5% = 90 | 1,890 |
| 6,500 | 1 | 1 | 217 (216.67 rounds up) | 217 | 5% = 10.85, rounds to 11 | 228 |
| 12,000 | 3 | 2 | 400 | 2,400 | 5% = 120 | 2,520 |
| 250,000 | 1 | 2 | 8,334 (above 7,500: 18%) | 16,668 | 18% = 3,000.24, rounds to 3,000 | 19,668 |

Mixed types in one booking: each line is priced with its own unit price, the tax percent comes from
the highest unit price in the booking (one rate per booking), and tax is rounded once on the stay total.

## Refund vectors

Check-in 13:00 India time on day D. Cancelled before D-7 13:00 (at least 7 full days ahead): refund 100%
of the amount paid online. Cancelled at or after D-7 13:00, or after check-in: 0%. A booking paid at the
property has nothing to refund; it simply becomes cancelled and frees the beds.
